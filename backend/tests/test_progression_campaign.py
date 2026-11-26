"""Synthetic provider-boundary cases. No owner response or live provider is used."""
import json
from collections import Counter
from copy import deepcopy

import pytest

from backend.app.scenario_wire import scenario_format
from backend.tests.test_scenario import SETTINGS, client, project, standard_project, validate
from backend.tests.test_scenario_entities import korean_reply, submit


def test_provider_gets_an_executable_quest_producer_and_guard_example():
    instructions, response_format = scenario_format("scenario")
    assert response_format["strict"]
    start = instructions.find("```json")
    assert start >= 0, "Supply actual wire fields for an earned quest completion and its consumer"
    example = json.loads(instructions[start + len("```json"):].split("```", 1)[0])
    quest = example["quests"][0]
    completion = quest["rules"]["completion"]
    assert completion and completion == example["nodes"][0]["rules"]["consequences"]
    assert example["edges"][0]["rules"]["conditions"] == [
        {"kind": "quest", "key": quest["id"], "value": "completed"},
    ]
    assert "active" in instructions and "failed" in instructions


@pytest.fixture
def gate_reply(korean_reply):
    """Two reached nodes, six mandatory and two optional downstream scenes, three endings."""
    wire = korean_reply
    nodes = {node["id"]: node for node in wire["nodes"]}
    edges = {(edge["from"], edge["to"]): edge for edge in wire["edges"]}
    permit = {"kind": "flag", "key": "permit", "value": "날인"}
    wire["stateEntities"].append({"id": "permit", "name": "문서 반출 허가", "kind": "flag"})

    def scene(key, template, kind, title, description, mandatory=True):
        node = {**nodes[template], "id": key, "kind": kind, "mandatory": mandatory, "rules": None,
                "prose": {"title": title, "description": description, "purpose": None, "outcome": None}}
        wire["nodes"].append(node)
        return node

    def link(source, target, label, kind="progression"):
        wire["edges"].append({"from": source, "to": target, "kind": kind, "label": label,
                              "rules": None, "travel": "none"})

    desk = scene("desk", "start", "quest", "반출 허가", "서기가 날인한 허가서를 장부에 끼워 준다.")
    desk["rules"] = {"consequences": [permit], "conditions": [], "requiresVisited": []}
    wire["quests"].append({"id": "get-permit", "nodeId": "desk", "kind": "main", "title": None,
                           "description": "장부를 꺼내기 전에 서기에게 반출을 승인받는다.", "objective": "반출 허가서에 도장을 받는다.",
                           "outcome": "장부를 건조대로 가져갈 수 있다.", "reward": None, "participants": None,
                           "rules": {"prerequisiteIds": [], "completion": [dict(permit)], "failure": []}})
    edges["start", "recover"].update({"from": "desk", "rules": {
        "conditions": [{"kind": "quest", "key": "get-permit", "value": "completed"}],
        "consequences": [], "requiresVisited": []}})
    link("start", "desk", "서기에게 반출 사유를 밝힌다.")

    dry = scene("dry", "recover", "event", "마른 장부", "낱장을 펴서 말리자 지워진 배급 기록을 읽을 수 있다.")
    dry["rules"] = nodes["recover"]["rules"]
    nodes["recover"]["rules"] = None
    edges["recover", "flood"].update({"from": "dry", "travel": "required"})
    link("recover", "dry", "장부를 건조대에 펼친다.")

    scene("compare", "flood", "event", "배급표 대조", "배급표 수량과 수문 통과 기록을 대조한다.")
    scene("court", "vote", "event", "공청회", "조사 결과를 제시하고 주민 대표의 질문을 받는다.")
    edges["flood", "vote"]["to"] = "compare"
    edges["listen", "vote"]["to"] = "compare"
    link("compare", "court", "조사서를 공청회에 제출한다.")
    link("court", "vote", "공개 범위를 표결에 부친다.")
    scene("copy", "flood", "event", "주민 보관본", "훼손에 대비해 주민이 보관할 사본을 만든다.", mandatory=False)
    link("flood", "copy", "사본을 남긴다.", kind="optional")
    link("copy", "compare", "사본을 주민 대표에게 맡긴다.")
    edges["flood", "listen"]["kind"] = "optional"
    wire["nodes"].append({**nodes["public"], "id": "defer"})
    wire["endings"].append({"nodeId": "defer", "consequence": "재조사를 의결해 익명은 보장되지만 이번 배급을 놓친다."})
    link("vote", "defer", "차기 회기로 결정을 미룬다.")
    return wire


INCIDENT_COUNTS = {"dead_end": 1, "mandatory_unreachable": 6, "optional_unreachable": 2,
                   "ending_unreachable": 3, "no_reachable_ending": 1}


def actionable(findings):
    return Counter(row["rule"] for row in findings if row["severity"] != "info")


def projected(project, proposal):
    return {**project, **proposal["design"], **{
        key: [*project.get(key, []), *rows] for key, rows in proposal["additions"].items()}}


def test_korean_gate_pair_one_omitted_effect_explains_downstream_counts(project, gate_reply):
    project = standard_project(project, "ko")
    original = deepcopy(project)
    missing = deepcopy(gate_reply)
    desk = next(n for n in missing["nodes"] if n["id"] == "desk")
    desk["rules"]["consequences"] = []
    response, _, _ = submit(project, missing)
    assert response.status_code == 502
    error = response.json()["error"]
    assert error["run"]["calls"] == 1 and error["run"]["repairAttempts"] == 0
    assert actionable(error["findings"]) == INCIDENT_COUNTS
    root = next(row for row in error["findings"] if row["rule"] == "dead_end")
    assert len(root["witnessPath"]) == 2 and root["witnessPath"][-1] == root["entityIds"][0]
    gate, objective = root["blockedTransitions"]
    assert (gate["kind"], gate["actual"], gate["required"]) == ("quest", "active", "completed")
    assert (objective["kind"], objective["actual"], objective["required"], objective["producerIds"]) == (
        "flag", None, "날인", [])
    assert "문서 반출 허가" in root["suggestedRepair"] and "날인" in root["suggestedRepair"]
    downstream = [row for row in error["findings"] if row["rule"] in INCIDENT_COUNTS and row != root]
    assert all(row["causeNodeId"] == root["entityIds"][0] for row in downstream)

    success, _, api = submit(project, gate_reply)
    assert success.status_code == 200, "An item earned at the drying rack must complete the earlier salvage quest"
    proposal = success.json()
    assert proposal["run"]["calls"] == 1 and proposal["run"]["repairAttempts"] == 0
    check = validate(api, projected(project, proposal))
    assert check["valid"] and check["complete"] and len(check["paths"]) == 3
    assert actionable(check["findings"]) == {}
    assert project == original


@pytest.mark.parametrize(("chapters", "branching", "side", "endings", "expected_quests", "expected_endings"), [
    (1, "linear", "none", "single", 1, 1),
    (2, "branching", "none", "multiple", 2, 2),
    (4, "branching", "some", "multiple", 5, 2),
])
def test_valid_campaign_briefs(client, project, chapters, branching, side, endings, expected_quests, expected_endings):
    settings = {**SETTINGS, "scale": "standard", "chapterCount": chapters, "branching": branching,
                "sideQuests": side, "endings": endings, "instructions": ""}
    response = client.post("/api/scenario", json={"project": standard_project(project, "ko"), "settings": settings})
    assert response.status_code == 200
    proposal = response.json()
    assert proposal["run"]["calls"] == 1 and len(proposal["design"]["quests"]) == expected_quests
    check = validate(client, projected(project, proposal))
    assert check["valid"] and check["complete"]
    assert actionable(check["findings"]) == {} and len(check["paths"]) == expected_endings


@pytest.mark.parametrize(("defect", "expected"), [
    ("cycle", {"cycle": 1}),
    ("wrong-value", INCIDENT_COUNTS),
    ("bad-reference", {"reference": 1}),
    ("convergence", {"dead_end": 1, "side_quest_required": 1}),
])
def test_adversarial_campaign_provider_replies(project, gate_reply, defect, expected):
    nodes = {row["id"]: row for row in gate_reply["nodes"]}
    if defect == "cycle":
        gate_reply["edges"].append({"from": "court", "to": "compare", "kind": "progression",
                                    "label": "공청회를 처음부터 되풀이한다.", "travel": "none", "rules": None})
    elif defect == "wrong-value":
        nodes["desk"]["rules"]["consequences"][0]["value"] = "미날인"
    elif defect == "bad-reference":
        nodes["desk"]["rules"]["consequences"][0]["key"] = "absent-permit"
    else:
        for edge in gate_reply["edges"]:
            if edge["from"] == "vote" and edge["rules"] is None:
                edge["rules"] = {"requiresVisited": ["listen"], "conditions": [], "consequences": []}
    original = deepcopy(project)
    response, _, _ = submit(project, gate_reply)
    assert response.status_code == 502
    error = response.json()["error"]
    assert actionable(error["findings"]) == expected
    assert error["run"]["calls"] == 1 and project == original
    if defect == "convergence":
        witness = next(row["witnessPath"] for row in error["findings"] if row["rule"] == "dead_end")
        assert len(witness) == 8


def test_campaign_required_travel_needs_both_endpoint_locations(project, korean_reply):
    edge = next(row for row in korean_reply["edges"] if row["from"] == "recover" and row["to"] == "flood")
    edge["travel"] = "required"
    response, _, api = submit(project, korean_reply)
    assert response.status_code == 200
    current = projected(project, response.json())
    check = validate(api, current)
    assert actionable(check["findings"]) == {} and len(check["paths"]) == 2
    assert "geography_pending" in {row["rule"] for row in check["findings"]}
    journey = next(row for row in current["edges"] if row["travel"] == "required")
    del next(node for node in current["nodes"] if node["id"] == journey["to"])["locationId"]
    check = validate(api, current)
    assert actionable(check["findings"]) == {"travel_location": 1}
    assert next(row for row in check["findings"] if row["rule"] == "travel_location")["entityIds"] == [journey["id"]]
