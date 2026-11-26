"""Single-call scenario proposals. Only the returned design can be accepted by the editor."""
import asyncio
from copy import deepcopy
from time import monotonic
from typing import Any, Literal
from unicodedata import normalize
from uuid import UUID, uuid4, uuid5

from jsonschema import Draft202012Validator
from pydantic import BaseModel, ConfigDict, Field

from .contracts import (ProjectSnapshot, ReferenceIssue, Run, definition, entity_ids, load_unique_json,
                        prepared_state_entities, reference_domains, schema_location)
from .narrative import GenerationRejected
from .provider import GenerationReply, GenerationRequest, ProviderError, StructuredProvider, record_provider_usage
from .scenario_validation import Finding, approved_source, reference_finding, validate_graph
from .scenario_wire import scenario_format
from .settings import Settings


class ScenarioInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    project: ProjectSnapshot
    settings: dict[str, Any]


class RevisionInput(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    project: ProjectSnapshot
    targetId: str = Field(pattern=r"^[a-z][a-z0-9-]{0,95}$")
    instructions: str = Field(min_length=1, max_length=1200)


class ScenarioRejected(GenerationRejected):
    def __init__(self, code: str, run: Run, field: str | None = None, findings: list[Finding] | None = None,
                 recovery: dict | None = None):
        super().__init__(code, run, field)
        self.findings = findings or []
        self.recovery = recovery


class InvalidDeclaration(ValueError):
    """Contains only a server-generated pointer to an invalid declaration."""


GROUPS = ("nodes", "edges", "quests", "endings")
ADDITIONS = ("characters", "factions", "stateEntities")
PROSE_FIELDS = {"nodes": "description", "edges": "label", "quests": "objective", "endings": "consequence",
               "chapters": "summary", "locations": "purpose"}


def revision_target(design: dict, identifier: str) -> tuple[dict, str] | None:
    for group, field in PROSE_FIELDS.items():
        records = design.get(group, design["scenario"].get(group, []))
        for row in records:
            if row["id"] == identifier:
                return row, field
    if design["scenario"]["id"] == identifier:
        return design["scenario"], "summary"
    return None


class MissingProseReference(ValueError):
    def __init__(self, owner: str, path: str, key: str, expected: str):
        super().__init__(path)
        self.owner = owner
        self.issue: ReferenceIssue = {"fieldPath": path, "referenceId": key, "expectedType": expected}

    def finding(self, project: dict, raw: dict) -> Finding:
        _, known, _ = reference_domains(project)
        for group, kind in (("chapters", "chapter"), ("nodes", "node"), ("quests", "quest"),
                            ("characters", "character"), ("factions", "faction"), ("locations", "location")):
            known.update((row["id"], kind) for row in raw[group])
        known.update((row["id"], row["kind"]) for row in raw["stateEntities"])
        found = known.get(self.issue["referenceId"])
        if found:
            self.issue["actualType"] = found
        return reference_finding(self.owner, self.issue)


def expand_scenario(raw: dict) -> None:
    """Expand a schema-checked, request-local reply before allocating portable IDs."""
    chapters = {row["id"]: row for row in raw["chapters"]}
    nodes = {row["id"]: row for row in raw["nodes"]}
    quest_at = {row["nodeId"]: row for row in raw["quests"]}
    ending_at = {row["nodeId"]: row for row in raw["endings"]}
    for group, kind in (("quests", "quest"), ("endings", "ending")):
        for index, row in enumerate(raw[group]):
            target = nodes.get(row["nodeId"])
            if not target or target["kind"] != kind:
                raise MissingProseReference(row.get("id", row["nodeId"]), f"/{group}/{index}/nodeId", row["nodeId"], kind + " node")
    for quest in raw["quests"]:
        if quest["title"] is None:
            quest["title"] = quest["objective"]
        if quest["reward"] is None:
            del quest["reward"]
        node = nodes[quest["nodeId"]]
        quest.update(quest.pop("participants") or {
            "characterIds": node["characterIds"], "factionIds": node["factionIds"], "locationIds": [node["locationId"]],
        })
        quest.update(quest.pop("rules") or {"prerequisiteIds": [], "completion": [], "failure": []})
    for index, node in enumerate(raw["nodes"]):
        chapter = chapters.get(node["chapterId"])
        if chapter is None:
            raise MissingProseReference(node["id"], f"/nodes/{index}/chapterId", node["chapterId"], "chapter")
        prose = node.pop("prose")
        if prose is not None:
            node.update(prose)
        elif node["kind"] == "chapter":
            node.update(title=chapter["title"], description=chapter["summary"])
        elif node["kind"] == "quest" and node["id"] in quest_at:
            quest = quest_at[node["id"]]
            node.update(title=quest["title"], description=quest["description"], outcome=quest["outcome"])
        elif node["kind"] == "ending" and node["id"] in ending_at:
            consequence = ending_at[node["id"]]["consequence"]
            node.update(title=consequence, description=consequence)
        else:
            raise ValueError("missing_node_prose")
        if node.get("purpose") is None:
            node["purpose"] = chapter["purpose"]
        if node.get("outcome") is None:
            node["outcome"] = node["description"]
    for row in [*raw["nodes"], *raw["edges"]]:
        row.update(row.pop("rules") or {"requiresVisited": [], "conditions": [], "consequences": []})


def allocate_design(raw: dict, project: dict, settings: dict, state_entities: list[dict], namespace: UUID) -> tuple[dict, dict]:
    # Allocate local aliases once, rewriting only ID-bearing fields. Prose can equal an alias.
    aliases = {}
    reserved = set(entity_ids(project)) | {row["id"] for row in state_entities}
    def name_key(group: str, row: dict) -> tuple[str, str]:
        return (row["kind"] if group == "stateEntities" else group, normalize("NFC", row["name"]).strip().lower())

    places = [*project.get("world", {}).get("locations", []), *project.get("scenario", {}).get("locations", [])]
    existing = {"locations": places, "characters": project["characters"], "factions": project["factions"],
                "stateEntities": state_entities}
    names = {name_key(group, row) for group, rows in existing.items() for row in rows}
    for group in ("chapters", "locations", "nodes", "quests", *ADDITIONS):
        for index, row in enumerate(raw[group]):
            alias = row["id"]
            if alias in aliases or alias in reserved:
                raise InvalidDeclaration(f"/{group}/{index}/id")
            if group in existing:
                key = name_key(group, row)
                if not key[1] or key in names:
                    raise InvalidDeclaration(f"/{group}/{index}/name")
                names.add(key)
            aliases[alias] = f"{group.lower()}-{uuid5(namespace, alias).hex}"
    single = {"id", "from", "to", "via", "chapterId", "nodeId", "locationId", "factionId"}
    lists = {"requiresVisited", "prerequisiteIds", "locationIds", "characterIds", "factionIds"}

    def resolve(row: dict) -> dict:
        resolved = dict(row)
        for field in row.keys() & single:
            if row[field] is None:
                del resolved[field]
            else:
                resolved[field] = aliases.get(row[field], row[field])
        for field in row.keys() & lists:
            resolved[field] = [aliases.get(key, key) for key in row[field]]
        for field in row.keys() & {"conditions", "consequences", "completion", "failure"}:
            resolved[field] = [{**term, "key": aliases.get(term["key"], term["key"])} for term in row[field]]
        return resolved

    scenario = {
        "id": f"scenario-{uuid4().hex}", "title": raw["title"], "summary": raw["summary"],
        "approved": False, "settings": settings, "sourceNarrativeId": project["narrative"]["id"],
        "chapters": [resolve(row) for row in raw["chapters"]],
        "locations": [*project.get("scenario", {}).get("locations", []), *(resolve(row) for row in raw["locations"])],
        "geography": [resolve(row) for row in raw["geography"]],
        "factIds": [row["id"] for row in project["canonicalFacts"]], "contentIds": [row["id"] for row in project["userContent"]],
        "layout": [],
    }
    design = {"scenario": scenario, **{group: [resolve(row) for row in raw[group]] for group in GROUPS}}
    for group in ("edges", "endings"):
        for row in design[group]:
            row["id"] = f"{group}-{uuid4().hex}"
    return design, {group: [resolve(row) for row in raw[group]] for group in ADDITIONS}


async def propose(body: ScenarioInput | RevisionInput, adapter: StructuredProvider, config: Settings) -> dict:
    started = monotonic()
    project: dict[str, Any] = body.project.root
    run_uuid = uuid4()
    run: Run = {
        "id": f"run-{run_uuid.hex}", "stage": "scenario", "mode": config.mode, "status": "failed",
        "baseRevision": project["revision"], "calls": 0, "repairAttempts": 0, "receipts": [
            {"tool": "provider_config", "outcome": "passed", "detail": f"provider={config.provider} model={config.model}"}],
    }
    def failure(code, tool, field=None, findings=None, recovery=None):
        run["durationMs"] = round((monotonic() - started) * 1000)
        run["receipts"].append({"tool": tool, "outcome": "failed", "detail": code})
        return ScenarioRejected(code, run, field, findings, recovery)

    if not approved_source(project):
        raise failure("scenario_source", "check_input")
    context = {key: project[key] for key in ("narrative", "userContent", "canonicalFacts", "characters", "factions")}
    old_scenario = project.get("scenario", {})
    context["locations"] = [
        {key: row[key] for key in ("id", "name", "kind")} for row in
        [*project.get("world", {}).get("locations", []), *old_scenario.get("locations", [])]
    ]
    task: Literal["scenario", "revision"]
    additions = {group: [] for group in ADDITIONS}
    registry = {}
    if isinstance(body, RevisionInput):
        task = "revision"
        if not old_scenario or not body.instructions.strip():
            raise failure("revision_target", "check_input")
        if project["basis"].get("scenario") != {key: project["versions"][key] for key in ("content", "narrative")}:
            raise failure("scenario_source", "check_input")
        design = deepcopy({key: project[key] for key in ("scenario", *GROUPS)})
        target = revision_target(design, body.targetId)
        if target is None:
            raise failure("revision_target", "check_input")
        record, field = target
        selected = {record["id"], record.get("nodeId"), record.get("from"), record.get("to")}
        selected.update(n["id"] for n in design["nodes"] if record["id"] in {n.get("chapterId"), n.get("locationId")})
        adjacent = {edge[key] for edge in design["edges"] if edge["from"] in selected or edge["to"] in selected for key in ("from", "to")}
        nearby = [node for node in design["nodes"] if node["id"] in selected | adjacent]
        context["neighbors"] = [{key: row[key] for key in ("id", "kind", "title", "description")} for row in nearby if row["id"] != record["id"]]
        involved = [record, *nearby]
        for group, ids in (("locations", "locationIds"), ("characters", "characterIds"), ("factions", "factionIds")):
            used = {identifier for row in involved for identifier in row.get(ids, [])}
            if group == "locations":
                used.update(row.get("locationId") for row in involved)
            context[group] = [row for row in context[group] if row["id"] in used]
        context["userContent"] = [row for row in context["userContent"] if row["treatment"] != "optional"]
        excerpt = {k: v for k, v in record.items() if k not in {"chapters", "locations", "geography", "layout", "settings"}}
        context.update(target=excerpt, field=field, instructions=body.instructions)
    else:
        task = "scenario"
        issue = next(definition("ScenarioSettings").iter_errors(body.settings), None)
        if issue:
            raise failure("invalid_settings", "check_input", schema_location(issue, "settings"))
        context["narrative"] = {"story": project["narrative"]["story"]}
        context["settings"] = body.settings
        state_entities = prepared_state_entities(project)
        registry = {"stateEntities": state_entities}
        context["inventory"] = {
            **{group: context.pop(group) for group in ("characters", "factions", "locations")},
            "quests": [{"id": row["id"], "objective": row["objective"]} for row in project["quests"]],
            **{kind + "s": [{"id": row["id"], "name": row["name"]} for row in state_entities if row["kind"] == kind]
               for kind in ("item", "decision", "flag")},
        }

    request = GenerationRequest(config.model, (), (), task, deepcopy(context))
    run["calls"] = 1
    try:
        raw = await asyncio.wait_for(adapter.generate(request), timeout=config.timeout_seconds)
    except ProviderError as exc:
        run["calls"] = int(exc.attempted)
        record_provider_usage(run, exc.usage, exc.model)
        raise failure(exc.code, "generate_structured", exc.field) from None
    except TimeoutError:
        raise failure("provider_timeout", "generate_structured") from None
    except Exception:
        raise failure("provider_error", "generate_structured") from None
    if isinstance(raw, GenerationReply):
        record_provider_usage(run, raw.usage, raw.model)
        raw = raw.text
    run["receipts"].append({"tool": "generate_structured", "outcome": "passed", "detail": "Response received"})
    try:
        if not isinstance(raw, str) or len(raw) > 256_000:
            raise ValueError
        decoded = load_unique_json(raw)
        schema = scenario_format(task)[1]["schema"]
        issue = next(Draft202012Validator(schema).iter_errors(decoded), None)
        if issue:
            raise failure("invalid_scenario_response", "check_scenario", schema_location(issue))
        if decoded["factConflicts"]:
            if not set(decoded["factConflicts"]) <= {fact["id"] for fact in project["canonicalFacts"]}:
                raise ValueError
            raise failure("fact_conflict", "check_scenario")
        if isinstance(body, RevisionInput):
            if not decoded["text"].strip():
                raise ValueError
            record[field] = decoded["text"]
            design["scenario"]["approved"] = False
        else:
            if len(decoded["chapters"]) != body.settings["chapterCount"]:
                raise failure("invalid_scenario_response", "check_scenario", "/chapters")
            ending_count = len(decoded["endings"])
            if (body.settings["endings"] == "single" and ending_count != 1) or (body.settings["endings"] == "multiple" and ending_count < 2):
                raise failure("invalid_scenario_response", "check_scenario", "/endings")
            has_side_quest = any(quest["kind"] == "side" for quest in decoded["quests"])
            if has_side_quest != (body.settings["sideQuests"] == "some"):
                raise failure("invalid_scenario_response", "check_scenario", "/quests")
            expand_scenario(decoded)
            design, additions = allocate_design(decoded, project, body.settings, state_entities, run_uuid)
            registry = {group: [*registry.get(group, project.get(group, [])), *rows] for group, rows in additions.items()}
    except MissingProseReference as exc:
        raise failure("invalid_scenario_response", "check_scenario", field=exc.issue["fieldPath"], findings=[exc.finding(project, decoded)]) from None
    except InvalidDeclaration as exc:
        raise failure("invalid_scenario_response", "check_scenario", str(exc)) from None
    except (ValueError, RecursionError):
        raise failure("invalid_scenario_response", "check_scenario") from None
    basis = {**project["basis"], "scenario": {key: project["versions"][key] for key in ("content", "narrative")}}
    projected = {**project, **design, **registry, "basis": basis,
                 "findings": [{**row, "status": "superseded"} for row in project["findings"]]}
    check = validate_graph(projected)
    proposal = {"baseRevision": project["revision"], "design": design}
    if isinstance(body, ScenarioInput):
        proposal["additions"] = additions
    if not check["valid"]:
        findings = check["findings"]
        affiliations = {f"/characters/{i}/factionId" for i in range(len(project["characters"]), len(projected["characters"]))}
        reference_only = findings and all(
            f["rule"] == "reference" and (f.get("fieldPath", "").startswith(("/nodes/", "/edges/", "/quests/", "/endings/"))
                                          or f.get("fieldPath") in affiliations) for f in findings
        )
        # Only a fully decoded draft can enter the detached graph editor. Reference repair
        # has its narrower allowlist because its draft can still contain unresolved IDs.
        progression = not any(f["rule"] in {
            "structure", "reference", "duplicate_id", "project_reference", "narrative_source", "source_coverage",
        } for f in findings)
        repairable = isinstance(body, ScenarioInput) and (reference_only or progression)
        raise failure("invalid_scenario", "check_scenario", findings=findings, recovery=proposal if repairable else None)
    run["status"] = "proposed"
    run["receipts"].append({"tool": "check_scenario", "outcome": "passed", "detail": f'{check["statesExplored"]} feasible states checked'})
    run["durationMs"] = round((monotonic() - started) * 1000)
    return {**proposal, "run": run}
