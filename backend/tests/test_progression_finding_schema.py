from backend.app.contracts import definition

def test_finding_can_reopen_with_exact_blocked_guard_and_cascade():
    finding = dict(id="f", rule="scenario.dead_end", origin="deterministic", severity="error",
                   entityIds=["gate"], explanation="Blocked gate", suggestedRepair="Review the evidence",
                   status="open", checkedRevision=5, runId="r", causeNodeId="gate",
                   blockedTransitions=[dict(edgeId="path", targetId="ending", fieldPath="/edges/0/conditions/0",
                       kind="quest", key="ledger", actual=None, required="completed", producerIds=["archive"])])
    validator = definition("ValidationFinding")
    assert validator.is_valid(finding)
    finding["blockedTransitions"][0]["producerIds"] = "archive"
    assert not validator.is_valid(finding)
