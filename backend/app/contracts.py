import json
from collections import Counter, defaultdict
from collections.abc import Iterator
from pathlib import Path
from typing import Any, Literal, NotRequired, Self, TypedDict, cast

from jsonschema import Draft4Validator
from jsonschema.exceptions import ValidationError as SchemaError
from pydantic import JsonValue, RootModel, model_validator
from pydantic_core import PydanticCustomError


SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "docs/project-v1.schema.json").read_bytes())


def definition(name: str) -> Draft4Validator:
    return Draft4Validator({**SCHEMA, "$ref": f"#/definitions/{name}"})


PROJECT_VALIDATOR = Draft4Validator(SCHEMA)
CANDIDATE_VALIDATOR = definition("StoryCandidate")


def load_unique_json(text: str) -> JsonValue:
    def object_with_unique_members(pairs: list[tuple[str, JsonValue]]) -> dict[str, JsonValue]:
        fields = dict(pairs)
        if len(fields) != len(pairs):
            raise ValueError("Duplicate JSON member")
        return fields

    return json.loads(text, object_pairs_hook=object_with_unique_members)


def schema_location(error: SchemaError, *prefix: str) -> str:
    parts = [*prefix, *(str(part) for part in error.absolute_path)]
    if error.validator == "required" and isinstance(error.instance, dict):
        part = next((field for field in error.validator_value if field not in error.instance), None)
        if part is not None:
            parts.append(part)
    return "/" + "/".join(parts)


class Content(TypedDict):
    id: str
    category: str
    treatment: Literal["mandatory", "optional", "excluded"]
    text: str


class Fact(TypedDict):
    id: str
    statement: str
    sourceContentId: NotRequired[str]


class Coverage(TypedDict):
    contentId: str
    disposition: Literal["incorporated", "unused", "conflict", "excluded"]
    reason: str


class Candidate(TypedDict):
    id: str
    story: dict[str, str | list[str]]
    coverage: list[Coverage]


class Receipt(TypedDict):
    tool: str
    outcome: Literal["passed", "failed"]
    detail: str


class Run(TypedDict):
    id: str
    stage: Literal["candidates", "scenario"]
    baseRevision: int
    mode: Literal["mock", "live"]
    status: Literal["proposed", "failed"]
    repairAttempts: int
    calls: int
    receipts: list[Receipt]
    tokens: NotRequired[int]
    durationMs: NotRequired[int]


class ProjectData(TypedDict):
    revision: int
    userContent: list[Content]
    canonicalFacts: list[Fact]


def entity_ids(value: JsonValue) -> Iterator[str]:
    if isinstance(value, dict):
        identifier = value.get("id")
        if isinstance(identifier, str):
            yield identifier
        for item in value.values():
            yield from entity_ids(item)
    elif isinstance(value, list):
        for item in value:
            yield from entity_ids(item)


def valid_coverage(candidates: list[Candidate], content: list[Content], *, fresh: bool) -> bool:
    allowed = {
        "mandatory": {"incorporated", "conflict"},
        "optional": {"incorporated", "unused", "conflict"},
        "excluded": {"excluded"},
    }
    treatments = {entry["id"]: entry["treatment"] for entry in content}
    for candidate in candidates:
        coverage = candidate["coverage"]
        refs = {entry["contentId"] for entry in coverage}
        if (
            len(refs) != len(coverage)
            or not refs <= treatments.keys()
            or any(not entry["reason"].strip() for entry in coverage)
            or any(
                not text.strip()
                for part in candidate["story"].values()
                for text in ([part] if isinstance(part, str) else part)
            )
        ):
            return False
        if fresh and (
            refs != treatments.keys()
            or any(entry["disposition"] not in allowed[treatments[entry["contentId"]]] for entry in coverage)
        ):
            return False
    return True


class StateEntity(TypedDict):
    id: str
    kind: Literal["item", "decision", "flag"]
    name: str


def state_terms(project: dict[str, Any]) -> Iterator[tuple[str, str, dict]]:
    for group, fields in (("nodes", ("conditions", "consequences")), ("edges", ("conditions", "consequences")),
                          ("quests", ("completion", "failure"))):
        for index, row in enumerate(project[group]):
            for field in fields:
                for offset, term in enumerate(row.get(field, [])):
                    yield row["id"], f"/{group}/{index}/{field}/{offset}/key", term


def effective_state_entities(project: dict[str, Any]) -> list[StateEntity]:
    if "stateEntities" in project:
        return project["stateEntities"]
    # Earlier v1 projects stored these three namespaces only in their state terms.
    keys = {(term["kind"], term["key"]) for _, _, term in state_terms(project)
            if term["kind"] in ("item", "decision", "flag")}
    return [{"id": key, "kind": kind, "name": key} for kind, key in sorted(keys)]


def prepared_state_entities(project: dict[str, Any]) -> list[StateEntity]:
    rows = effective_state_entities(project)
    if "stateEntities" in project:
        return rows
    existing = set(entity_ids(project))
    counts = Counter(row["id"] for row in rows)
    reserved = existing | counts.keys()
    prepared = []
    for row in rows:
        key = row["id"]
        if key in existing or counts[key] > 1:
            base = f'{row["kind"]}-{key}'
            key = base[:96]
            suffix = 2
            while key in reserved:
                tail = f"-{suffix}"
                key = base[:96 - len(tail)] + tail
                suffix += 1
            reserved.add(key)
        prepared.append(StateEntity(id=key, kind=row["kind"], name=row["name"]))
    return prepared


class ReferenceIssue(TypedDict):
    fieldPath: str
    referenceId: str
    expectedType: str
    actualType: NotRequired[str]


def reference_domains(project: dict[str, Any]) -> tuple[dict[str, set[str]], dict[str, str], dict[str, str]]:
    """Index canonical references by expected type, including legacy state namespaces."""
    scenario = project.get("scenario", {})
    world = project.get("world", {})
    by_type: dict[str, set[str]] = defaultdict(set)
    actual: dict[str, str] = {}
    for record, kind in ((project, "project"), (project.get("narrative"), "narrative"),
                         (world, "world"), (scenario, "scenario")):
        if record:
            actual[record["id"]] = kind
            by_type[kind].add(record["id"])
    for container, groups in (
        (project, {"nodes": "node", "quests": "quest", "characters": "character", "factions": "faction",
                   "canonicalFacts": "fact", "userContent": "content", "storyCandidates": "candidate",
                   "edges": "edge", "endings": "ending", "runs": "run", "findings": "finding"}),
        (scenario, {"chapters": "chapter", "locations": "location"}),
        (world, {"locations": "location", "regions": "region", "features": "terrain feature", "routes": "route"}),
    ):
        for group, kind in groups.items():
            for row in container.get(group, []):
                actual[row["id"]] = kind
                by_type[kind].add(row["id"])
    for state in effective_state_entities(project):
        # A legacy state key may also name a different entity.
        actual.setdefault(state["id"], state["kind"])
        by_type[state["kind"]].add(state["id"])
    node_kinds = {row["id"]: row["kind"] + " node" for row in project["nodes"]}
    for key, kind in node_kinds.items():
        by_type[kind].add(key)

    return by_type, actual, node_kinds


def scenario_references(project: dict[str, Any], *, historical: bool = False) -> Iterator[tuple[str, ReferenceIssue]]:
    scenario = project.get("scenario", {})
    by_type, actual, node_kinds = reference_domains(project)

    def check(owner: str, path: str, key: str, expected: str) -> Iterator[tuple[str, ReferenceIssue]]:
        if key not in by_type[expected]:
            issue: ReferenceIssue = {"fieldPath": path, "referenceId": key, "expectedType": expected}
            found = node_kinds.get(key) if expected.endswith(" node") else None
            found = found or actual.get(key)
            if found:
                issue["actualType"] = found
            yield owner, issue

    def fields(owner: str, path: str, row: dict, targets: dict[str, str]) -> Iterator[tuple[str, ReferenceIssue]]:
        for field, expected in targets.items():
            value = row.get(field, [])
            if isinstance(value, str):
                yield from check(owner, f"{path}/{field}", value, expected)
            else:
                for offset, key in enumerate(value):
                    yield from check(owner, f"{path}/{field}/{offset}", key, expected)

    if scenario:
        basis = project["basis"].get("scenario", {})
        if not historical or basis.get("narrative") == project["versions"]["narrative"]:
            yield from fields(scenario["id"], "/scenario", scenario, {"sourceNarrativeId": "narrative"})
        if not historical or basis.get("content") == project["versions"]["content"]:
            yield from fields(scenario["id"], "/scenario", scenario, {"factIds": "fact", "contentIds": "content"})
        for i, geo in enumerate(scenario["geography"]):
            yield from fields(scenario["id"], f"/scenario/geography/{i}", geo, dict.fromkeys(("from", "to", "via"), "location"))
        for i, point in enumerate(scenario["layout"]):
            yield from fields(scenario["id"], f"/scenario/layout/{i}", point, {"nodeId": "node"})
    for group, targets in (
        ("characters", {"factionId": "faction"}),
        ("nodes", {"chapterId": "chapter", "locationId": "location", "characterIds": "character",
                   "factionIds": "faction", "requiresVisited": "node"}),
        ("edges", dict.fromkeys(("from", "to", "requiresVisited"), "node")),
        ("quests", {"nodeId": "quest node", "prerequisiteIds": "quest", "locationIds": "location",
                    "characterIds": "character", "factionIds": "faction"}),
        ("endings", {"nodeId": "ending node"}),
    ):
        for i, row in enumerate(project[group]):
            yield from fields(row["id"], f"/{group}/{i}", row, targets)
    for owner, path, term in state_terms(project):
        expected = "faction" if term["kind"] == "relationship" else term["kind"]
        yield from check(owner, path, term["key"], expected)


def valid_project_references(data: dict[str, JsonValue], identifiers: set[str]) -> bool:
    def records(group: dict[str, JsonValue], field: str) -> list[dict[str, JsonValue]]:
        return cast(list[dict[str, JsonValue]], group.get(field, []))

    def ids(rows: list[dict[str, JsonValue]]) -> set[str]:
        return {cast(str, row["id"]) for row in rows}

    world = cast(dict[str, JsonValue], data.get("world", {}))
    locations = records(world, "locations")
    faction_ids = ids(records(data, "factions"))
    region_ids = ids(records(world, "regions"))
    location_ids = ids(locations)
    run_ids = ids(records(data, "runs"))
    single_refs = (
        (records(world, "regions"), "controllerId", faction_ids),
        (locations, "regionId", region_ids),
        (records(world, "routes"), "from", location_ids),
        (records(world, "routes"), "to", location_ids),
        (records(data, "findings"), "runId", run_ids),
    )
    list_refs = (
        ([row for row in records(data, "findings") if row["status"] != "superseded"], "entityIds", identifiers),
    )
    approval = cast(dict[str, JsonValue], data.get("approval", {}))
    return (
        (not approval or cast(str, approval["runId"]) in run_ids)
        and all(field not in row or cast(str, row[field]) in target for rows, field, target in single_refs for row in rows)
        and all(set(cast(list[str], row[field])) <= target for rows, field, target in list_refs for row in rows)
    )


class ProjectSnapshot(RootModel[dict[str, JsonValue]]):
    @model_validator(mode="after")
    def check_project(self) -> Self:
        data = self.root
        error = next(PROJECT_VALIDATOR.iter_errors(data), None)
        if error is not None:
            raise PydanticCustomError("project_schema", "Project schema mismatch", {"field": schema_location(error)})

        identifiers = list(entity_ids(data))
        content = cast(list[Content], data["userContent"])
        candidates = cast(list[Candidate], data["storyCandidates"])
        content_ids = {item["id"] for item in content}
        candidate_ids = {item["id"] for item in candidates}
        facts = cast(list[Fact], data["canonicalFacts"])
        narrative = cast(dict[str, JsonValue] | None, data.get("narrative"))
        basis = cast(dict[str, dict[str, int]], data["basis"])
        versions = cast(dict[str, int], data["versions"])
        candidate_basis = basis.get("candidates", {})
        narrative_basis = basis.get("narrative", {})
        fresh = candidate_basis.get("content") == versions["content"]

        invalid = next(scenario_references(data, historical=True), None)
        if invalid:
            raise PydanticCustomError("project_references", "Project reference mismatch", {"field": invalid[1]["fieldPath"]})
        if (
            ("scenario" in data and not basis.get("scenario"))
            or len(identifiers) != len(set(identifiers))
            or not valid_project_references(data, set(identifiers))
            or any("sourceContentId" in fact and fact["sourceContentId"] not in content_ids for fact in facts)
            or (narrative is not None and narrative["sourceCandidateId"] not in candidate_ids)
            or bool(candidates) != bool(candidate_basis)
            or bool(narrative) != bool(narrative_basis)
            or any(source > versions[field] for stage in (candidate_basis, narrative_basis, basis.get("scenario", {})) for field, source in stage.items())
            or not valid_coverage(candidates, content, fresh=fresh)
        ):
            raise ValueError("project_references")
        if narrative and narrative["approved"] and fresh and narrative_basis == {
            "content": versions["content"], "candidates": versions["candidates"],
        }:
            source = next(candidate for candidate in candidates if candidate["id"] == narrative["sourceCandidateId"])
            mandatory_ids = {item["id"] for item in content if item["treatment"] == "mandatory"}
            if any(entry["disposition"] == "conflict" and entry["contentId"] in mandatory_ids for entry in source["coverage"]):
                raise ValueError("project_references")
        return self

    @property
    def narrative_data(self) -> ProjectData:
        return cast(ProjectData, self.root)
