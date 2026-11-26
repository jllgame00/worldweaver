import json
from pathlib import Path

import pytest
from pydantic import ValidationError
from fastapi.testclient import TestClient

from backend.app import contracts
from backend.app.main import create_app
from backend.app.scenario_validation import validate_graph


@pytest.fixture
def project():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/examples/salt-census.json").read_bytes())


@pytest.mark.parametrize(("kind", "group", "expected"), [
    ("quest", "quests", "quest"), ("relationship", "factions", "faction"),
    ("location", "locations", "location"), ("character", "characters", "character"),
    ("item", "stateEntities", "item"), ("decision", "stateEntities", "decision"),
    ("flag", "stateEntities", "flag"),
])
def test_each_state_domain_requires_its_declared_identity(project, kind, group, expected):
    project["stateEntities"] = [{"kind": kind, "id": "declared", "name": "Key"}] if group == "stateEntities" else []
    rows = project["world"]["locations"] if group == "locations" else project[group]
    term = {"kind": kind, "key": rows[0]["id"], "value": "private-value"}
    project["nodes"][0]["consequences"] = [term]
    contracts.ProjectSnapshot.model_validate(project)
    for key, actual in [(project["nodes"][1]["id"], "node"), ("unknown-id", None)]:
        term["key"] = key
        with pytest.raises(ValidationError):
            contracts.ProjectSnapshot.model_validate(project)
        report = validate_graph(project)
        issue, = report["findings"]
        assert issue["rule"] == "reference"
        assert issue["fieldPath"] == "/nodes/0/consequences/0/key"
        assert issue["referenceId"] == key and issue["expectedType"] == expected
        assert issue.get("actualType") == actual
        assert ("actualType" in issue) == (actual is not None)
        assert project["nodes"][0]["id"] in issue["entityIds"] and issue["suggestedRepair"]
        assert "private-value" not in json.dumps(report)


def test_legacy_state_promotion_keeps_every_domain_and_avoids_collisions(project):
    existing = project["characters"][0]["id"]
    old_keys = [("item", existing), ("flag", "shared"), ("decision", "shared"), ("flag", "flag-shared")]
    project["edges"][0]["consequences"] = [{"kind": k, "key": v, "value": "yes"} for k, v in old_keys]
    contracts.ProjectSnapshot.model_validate(project)
    inferred = contracts.effective_state_entities(project)
    assert {(e["kind"], e["id"]) for e in inferred} == set(old_keys)
    prepared = contracts.prepared_state_entities(project)
    assert {e["kind"]: e["id"] for e in prepared if e["name"] == "shared"} == {
        "decision": "decision-shared", "flag": "flag-shared-2",
    }
    assert {e["id"] for e in prepared} == {"decision-shared", "flag-shared-2", "flag-shared", f"item-{existing}"}
    assert project["edges"][0]["consequences"][0]["key"] == existing and "stateEntities" not in project


def test_graph_reports_each_broken_affiliation_and_quest_condition(project):
    foreign = project["characters"][0]["id"]
    project["characters"][0]["factionId"] = foreign
    project["quests"][0]["failure"] = [{"kind": "relationship", "key": foreign, "value": "no"}] * 2
    findings = validate_graph(project)["findings"]
    assert {f.get("fieldPath") for f in findings} == {
        "/characters/0/factionId", "/quests/0/failure/0/key", "/quests/0/failure/1/key",
    }
    assert all(f["actualType"] == "character" and f["expectedType"] == "faction" for f in findings)


def test_invalid_snapshot_and_validation_api_identify_reference_field(project):
    term = {"kind": "relationship", "key": project["characters"][0]["id"], "value": "private-note"}
    project["edges"][0]["conditions"] = [term]
    client = TestClient(create_app())
    path = "/edges/0/conditions/0/key"
    rejected = client.post("/api/candidates", json=project)
    assert rejected.status_code == 422 and path in rejected.json()["error"]["message"]
    assert "private-note" not in rejected.text
    check = client.post("/api/scenario/validate", json=project)
    assert check.status_code == 200 and not check.json()["valid"]
    issue, = check.json()["findings"]
    assert (issue["fieldPath"], issue["referenceId"], issue["actualType"], issue["expectedType"]) == (
        path, term["key"], "character", "faction",
    )
    assert "private-note" not in check.text
