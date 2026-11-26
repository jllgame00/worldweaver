from copy import deepcopy

from backend.tests.test_scenario import project
from backend.tests.test_scenario_entities import korean_reply, submit


def test_unplayable_but_resolvable_draft_can_be_edited_without_dispatching_again(project, korean_reply):
    original = deepcopy(project)
    # Without the recovery action the ledger never exists on this branch.
    korean_reply["nodes"][1]["rules"]["consequences"] = []
    result, _, client = submit(project, korean_reply)
    assert result.status_code == 502
    error = result.json()["error"]
    assert any(f["rule"] == "dead_end" for f in error["findings"])
    assert "recovery" in error, "The owner needs the normalized rejected graph"
    assert set(error["recovery"]) == {"baseRevision", "design", "additions"}
    draft = error["recovery"]["design"]
    assert draft["scenario"]["approved"] is False and error["run"]["calls"] == 1
    assert result.headers["cache-control"] == "no-store"
    original_draft = deepcopy(draft)
    corrected = deepcopy(draft)
    evidence = corrected["quests"][0]["completion"][0]
    corrected["nodes"][1]["consequences"].append(evidence)
    additions = error["recovery"]["additions"]
    effective = {**project, **corrected, **{k: [*project.get(k, []), *v] for k,v in additions.items()}}
    check = client.post("/api/scenario/validate", json=effective).json()
    assert check["valid"] and check["complete"] and len(check["paths"]) == 2
    assert original_draft == draft and project == original
