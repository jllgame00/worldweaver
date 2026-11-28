"""Temporary HW6 assertion for the owner-approved protected-main exercise."""

import json
import os
from pathlib import Path
import subprocess


EXERCISE_REPOSITORY = "jllgame00/worldweaver"
BASELINE_COMMIT = "33abe573d3378a7471344d30eb31d0e3d2e13a19"


def test_controlled_deployment_gate() -> None:
    if (
        os.getenv("GITHUB_ACTIONS") != "true"
        or os.getenv("GITHUB_REPOSITORY") != EXERCISE_REPOSITORY
        or os.getenv("GITHUB_REF") != "refs/heads/main"
        or os.getenv("GITHUB_EVENT_NAME") != "push"
        or os.getenv("GITHUB_ACTOR") != "jllgame00"
    ):
        return

    event_path = os.getenv("GITHUB_EVENT_PATH")
    sha = os.getenv("GITHUB_SHA")
    if not event_path or not sha:
        return

    event = json.loads(Path(event_path).read_text(encoding="utf-8"))
    if (
        event.get("before") != BASELINE_COMMIT
        or event.get("after") != sha
        or event.get("forced") is not False
    ):
        return

    # Raw commit headers retain parent IDs in Actions' shallow checkout.
    commit = subprocess.check_output(["git", "cat-file", "commit", sha], text=True, encoding="utf-8")
    headers, _, message = commit.partition("\n\n")
    parents = [line.removeprefix("parent ") for line in headers.splitlines() if line.startswith("parent ")]
    if len(parents) != 2 or parents[0] != BASELINE_COMMIT:
        return

    authorized = f"HW6-Controlled-Failure: approve-merge {parents[1]}" in message.splitlines()
    assert not authorized, "HW6 controlled deployment-gate demonstration: owner-approved pytest failure"
