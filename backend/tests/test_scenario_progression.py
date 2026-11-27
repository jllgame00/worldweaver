import json
from pathlib import Path

import pytest

from backend.app.scenario_validation import validate_graph


@pytest.fixture
def project():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/examples/salt-census.json").read_bytes())


proof = {"kind": "item", "key": "proof", "value": "found"}
finished = {"kind": "quest", "key": "q-rubbing", "value": "completed"}


def finding(check, rule):
    return next(f for f in check["findings"] if f["rule"] == rule)


def test_prologue_requiring_later_quest_and_ending_blocks_every_route(project):
    start = next(n for n in project["nodes"] if n["kind"] == "prologue")
    start["requiresVisited"] = [project["quests"][0]["nodeId"], project["endings"][0]["nodeId"]]
    check = validate_graph(project)
    assert check["complete"] and not check["valid"]
    assert check["statesExplored"] == 0 and check["paths"] == []
    guards = finding(check, "blocked_start")["blockedTransitions"]
    assert [(g["kind"], g["key"], g["actual"]) for g in guards] == [
        ("visited", node_id, None) for node_id in start["requiresVisited"]
    ]
    start["requiresVisited"] = []
    repaired = validate_graph(project)
    assert repaired["valid"] and len(repaired["paths"]) == len(project["endings"])


@pytest.mark.parametrize("where", ["node", "edge"])
def test_active_quest_completes_after_later_effect(project, where):
    project["quests"][0]["completion"] = [proof]
    project["edges"][2]["conditions"] = [{**finished, "value": "active"}]
    if where == "edge":
        project["edges"][2]["consequences"] = [proof]
        project["nodes"][3]["conditions"] = [finished]
    else:
        project["nodes"][3]["consequences"] = [proof]
    project["edges"][3]["conditions"] = [finished]
    project["edges"][4]["conditions"] = [finished]
    assert validate_graph(project)["valid"]


def test_failure_wins_on_one_branch_even_when_completion_also_matches(project):
    bad = {"kind": "flag", "key": "spoiled", "value": "yes"}
    quest = project["quests"][0]
    quest.update(completion=[proof], failure=[bad])
    project["edges"][3]["consequences"] = [proof]
    project["edges"][4]["consequences"] = [proof, bad]
    project["nodes"][4]["conditions"] = [finished]
    project["nodes"][5]["conditions"] = [{**finished, "value": "failed"}]
    assert validate_graph(project)["valid"]


def test_never_feasible_exit_reports_precise_producer_and_witness(project):
    project["edges"][4]["conditions"] = [proof]
    project["nodes"][4]["consequences"] = [proof]
    check = validate_graph(project)
    issue = finding(check, "progression_blocked")
    assert issue["witnessPath"][-1] == "n-choose"
    assert issue["blockedTransitions"] == [{
        "edgeId": "e-5", "targetId": "n-private", "kind": "item", "key": "proof",
        "fieldPath": "/edges/4/conditions/0/value", "actual": None, "required": "found",
        "producerIds": ["n-public"],
    }]
    assert project["nodes"][3]["title"] in issue["explanation"]


def test_failed_quest_guard_includes_unsatisfied_objective(project):
    project["quests"][0].update(title="Survey records", completion=[proof])
    project["edges"][2]["conditions"] = [finished]
    project["nodes"][3]["consequences"] = [proof]
    result = validate_graph(project)
    issue = finding(result, "dead_end")
    assert issue["witnessPath"] == ["n-start", "n-gate", "n-witness"]
    assert {(b["fieldPath"], b["actual"], b["required"], tuple(b["producerIds"])) for b in issue["blockedTransitions"]} == {
        ("/edges/2/conditions/0/value", "active", "completed", ("n-witness",)),
        ("/quests/0/completion/0/value", None, "found", ("n-choose",)),
    }
    assert "Survey records" in issue["explanation"]
    assert finding(result, "mandatory_unreachable")["causeNodeId"] == "n-witness"


@pytest.mark.parametrize("where", ["node", "edge"])
def test_cannot_complete_quest_before_visiting_it(project, where):
    row = project["nodes" if where == "node" else "edges"][0]
    row["consequences"] = [finished]
    issue = finding(validate_graph(project), "quest_transition")
    assert issue["blockedTransitions"][0]["actual"] is None
    assert issue["blockedTransitions"][0]["required"] == "completed"


def test_unknown_quest_value_is_actionable(project):
    project["edges"][2]["conditions"] = [{**finished, "value": "done"}]
    assert finding(validate_graph(project), "quest_state_value")["fieldPath"] == "/edges/2/conditions/0/value"


def test_independent_unreachable_convergence_has_no_single_cause(project):
    project["edges"][0]["conditions"] = [proof]
    project["edges"].append({**project["edges"][1], "id": "disconnected", "from": "n-choose", "to": "n-private"})
    project["nodes"].append({**project["nodes"][1], "id": "island"})
    project["edges"].append({**project["edges"][1], "id": "island-to-choose", "from": "island", "to": "n-choose"})
    check = validate_graph(project)
    assert all("causeNodeId" not in f for f in check["findings"] if f["entityIds"][0:1] in (["n-private"], ["n-choose"]))


def test_side_quests_cannot_be_the_only_way_to_progress(project):
    project["quests"][0]["kind"] = "side"
    project["nodes"][2]["mandatory"] = False
    result = validate_graph(project)
    assert finding(result, "side_quest_required")["severity"] == "error"
    project["edges"].append({**project["edges"][1], "id": "skip", "to": "n-choose"})
    project["edges"][3]["requiresVisited"] = []
    assert validate_graph(project)["valid"]


def test_active_quest_cannot_complete_from_its_own_completion(project):
    project["quests"][0]["completion"] = [finished]
    issue = finding(validate_graph(project), "quest_completion_unreachable")
    assert issue["blockedTransitions"][0]["fieldPath"] == "/quests/0/completion/0/value"


def test_explicit_quest_completion_respects_authored_objective(project):
    project["quests"][0]["completion"] = [proof]
    project["edges"][2]["consequences"] = [finished]
    issue = finding(validate_graph(project), "quest_transition")
    assert {b["fieldPath"] for b in issue["blockedTransitions"]} == {
        "/edges/2/consequences/0/value", "/quests/0/completion/0/value",
    }
    project["edges"][2]["consequences"].append(proof)
    assert validate_graph(project)["valid"]


def test_terminal_quest_cannot_reopen_or_change_outcome(project):
    project["edges"][2]["consequences"] = [{**finished, "value": "failed"}]
    issue = finding(validate_graph(project), "quest_transition")
    assert issue["blockedTransitions"][0]["actual"] == "completed"


def test_mutual_prerequisites_have_a_field_and_preserve_traversal_evidence(project):
    project["quests"][0]["prerequisiteIds"] = ["second"]
    project["nodes"][1]["kind"] = "quest"
    project["quests"].append({**project["quests"][0], "id": "second", "nodeId": "n-gate", "prerequisiteIds": ["q-rubbing"]})
    result = validate_graph(project)
    issue = finding(result, "quest_prerequisite_cycle")
    assert set(issue["entityIds"]) == {"q-rubbing", "second"}
    assert issue["fieldPath"] in {"/quests/0/prerequisiteIds/0", "/quests/1/prerequisiteIds/0"}
    assert finding(result, "dead_end")["witnessPath"] == ["n-start"]


def test_mutually_exclusive_mandatory_scenes_can_each_have_a_witness(project):
    project["nodes"][1]["mandatory"] = project["nodes"][2]["mandatory"] = True
    project["edges"][1].update({"from": "n-start", "to": "n-witness"})
    project["edges"][3]["requiresVisited"] = []
    project["edges"][4]["requiresVisited"] = []
    project["edges"].append({**project["edges"][2], "id": "from-gate", "from": "n-gate"})
    assert validate_graph(project)["valid"]


def test_independent_blockers_on_two_routes_do_not_share_cascade(project):
    project["edges"][1].update({"from": "n-start", "to": "n-witness"})
    project["edges"][2]["conditions"] = [proof]
    project["edges"].append({**project["edges"][2], "id": "from-gate", "from": "n-gate",
                             "conditions": [{"kind": "flag", "key": "gate-open", "value": "yes"}]})
    check = validate_graph(project)
    assert {f["entityIds"][0] for f in check["findings"] if f["rule"] == "dead_end"} == {"n-witness", "n-gate"}
    assert all("causeNodeId" not in f for f in check["findings"])


def test_distinct_problems_at_one_node_cannot_identify_one_cause_by_node_id(project):
    project["quests"][0]["completion"] = [proof]
    project["edges"][2]["conditions"] = [{"kind": "flag", "key": "gate-open", "value": "yes"}]
    check = validate_graph(project)
    assert finding(check, "dead_end")["entityIds"][0] == "n-witness"
    assert finding(check, "quest_completion_unreachable")["entityIds"][0] == "n-witness"
    assert all("causeNodeId" not in f for f in check["findings"])


def test_invalid_explicit_write_has_one_root_at_its_node(project):
    project["edges"][0]["consequences"] = [finished]
    check = validate_graph(project)
    assert [f["rule"] for f in check["findings"] if f.get("blockedTransitions")] == ["quest_transition"]
    assert finding(check, "mandatory_unreachable")["causeNodeId"] == "n-start"
