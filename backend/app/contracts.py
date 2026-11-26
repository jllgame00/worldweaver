import json
from collections.abc import Iterator
from pathlib import Path
from typing import Literal, NotRequired, Self, TypedDict, cast

from jsonschema import Draft4Validator
from jsonschema.exceptions import ValidationError as SchemaError
from pydantic import JsonValue, RootModel, model_validator
from pydantic_core import PydanticCustomError


SCHEMA = json.loads((Path(__file__).resolve().parents[2] / "docs/project-v1.schema.json").read_bytes())


def definition(name: str) -> Draft4Validator:
    return Draft4Validator({**SCHEMA, "$ref": f"#/definitions/{name}"})


PROJECT_VALIDATOR = Draft4Validator(SCHEMA)
CANDIDATE_VALIDATOR = definition("StoryCandidate")


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
    stage: Literal["candidates"]
    baseRevision: int
    mode: Literal["mock", "live"]
    status: Literal["proposed", "failed"]
    repairAttempts: int
    calls: int
    receipts: list[Receipt]


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


def valid_project_references(data: dict[str, JsonValue], identifiers: set[str]) -> bool:
    def records(group: dict[str, JsonValue], field: str) -> list[dict[str, JsonValue]]:
        return cast(list[dict[str, JsonValue]], group.get(field, []))

    def ids(rows: list[dict[str, JsonValue]]) -> set[str]:
        return {cast(str, row["id"]) for row in rows}

    world = cast(dict[str, JsonValue], data.get("world", {}))
    characters = records(data, "characters")
    nodes = records(data, "nodes")
    edges = records(data, "edges")
    locations = records(world, "locations")
    faction_ids = ids(records(data, "factions"))
    region_ids = ids(records(world, "regions"))
    location_ids = ids(locations)
    node_ids = ids(nodes)
    run_ids = ids(records(data, "runs"))
    single_refs = (
        (characters, "factionId", faction_ids),
        (nodes, "locationId", location_ids),
        (edges, "from", node_ids),
        (edges, "to", node_ids),
        (records(data, "quests"), "nodeId", ids([node for node in nodes if node["kind"] == "quest"])),
        (records(data, "endings"), "nodeId", ids([node for node in nodes if node["kind"] == "ending"])),
        (records(world, "regions"), "controllerId", faction_ids),
        (locations, "regionId", region_ids),
        (records(world, "routes"), "from", location_ids),
        (records(world, "routes"), "to", location_ids),
        (records(data, "findings"), "runId", run_ids),
    )
    list_refs = (
        (nodes, "characterIds", ids(characters)),
        (nodes + edges, "requiresVisited", node_ids),
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

        if (
            len(identifiers) != len(set(identifiers))
            or not valid_project_references(data, set(identifiers))
            or any("sourceContentId" in fact and fact["sourceContentId"] not in content_ids for fact in facts)
            or (narrative is not None and narrative["sourceCandidateId"] not in candidate_ids)
            or bool(candidates) != bool(candidate_basis)
            or bool(narrative) != bool(narrative_basis)
            or any(source > versions[field] for stage in (candidate_basis, narrative_basis) for field, source in stage.items())
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
