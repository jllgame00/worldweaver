import json

import pytest
from pathlib import Path
from copy import deepcopy

from backend.app.contracts import PROJECT_VALIDATOR
from backend.tests.test_scenario import project
from backend.tests.test_scenario_entities import korean_reply, submit


def test_undeclared_cast_reproduces_four_field_errors_and_offers_detached_repair(project, korean_reply):
    korean_reply["characters"] = []
    korean_reply["factions"] = []
    response, _, _ = submit(project, korean_reply)
    assert response.status_code == 502
    error = response.json()["error"]
    assert error["code"] == "invalid_scenario"
    paths = [f["fieldPath"] for f in error["findings"]]
    for field in ("conditions", "consequences", "characterIds", "factionIds"):
        assert any(f"/{field}/" in path for path in paths)
    assert set(error["recovery"]) == {"baseRevision", "design", "additions"}
    assert error["run"]["status"] == "failed" and error["run"]["calls"] == 1
    assert "project" not in error["recovery"] and "run" not in error["recovery"]
    assert "design" not in response.json()



def test_approved_prose_only_project_prepares_its_first_inventory_in_the_single_request(project, korean_reply):
    # Phase 1 stores approved prose without any graph or registered cast.
    world = project.pop("world")
    for group in ("characters", "factions", "nodes", "edges", "quests", "endings"):
        project[group] = []
    for stage in ("scenario", "world"):
        del project["basis"][stage]
        project["versions"][stage] = 0
    original = deepcopy(project)
    korean_reply["characters"].append({"id": "ch-iven", "name": "이벤", "role": "명부 조사관", "factionId": "f-wards"})
    korean_reply["factions"].append({"id": "f-wards", "name": "배급 위원회", "aim": "주민들의 식량 확보"})
    for place in world["locations"]:
        korean_reply["locations"].append({**{k: place[k] for k in ("id", "name", "kind")}, "purpose": "배급 경로 확인"})
    response, context, _ = submit(project, korean_reply)
    assert response.status_code == 200, response.json().get("error", {}).get("message")
    assert context["inventory"]["characters"] == context["inventory"]["factions"] == []
    assert response.json()["run"]["calls"] == 1
    delta = response.json()["additions"]
    assert len(delta["characters"]) == len(delta["factions"]) == 2
    assert project == original and project["narrative"]["approved"] is True


@pytest.mark.parametrize(("group","field","wrong_group","expected"), [
    ("nodes","chapterId","factions","chapter"), ("quests","nodeId","locations","quest node"),
])
def test_missing_prose_dependency_reports_typed_wire_path(project, korean_reply, group, field, wrong_group, expected):
    target = korean_reply[group][0]
    foreign = korean_reply[wrong_group][0]["id"]
    target[field] = foreign
    response, _, _ = submit(project, korean_reply)
    error = response.json()["error"]
    assert response.status_code == 502 and "recovery" not in error
    finding = next(f for f in error["findings"] if f["fieldPath"] == f"/{group}/0/{field}")
    assert finding["referenceId"] == foreign and finding["expectedType"] == expected
    assert target["id"] in finding["entityIds"] and finding["actualType"] in {"faction","location"}


def test_phase1_project_and_optional_typed_state_declarations():
    project = json.loads(Path("docs/examples/salt-census.json").read_bytes())
    assert PROJECT_VALIDATOR.is_valid(project)
    project["stateEntities"] = [{"id":"salt-seal", "name":"인장", "kind":"item"}]
    assert PROJECT_VALIDATOR.is_valid(project)
    project["stateEntities"][0]["kind"] = "character"
    assert not PROJECT_VALIDATOR.is_valid(project)
