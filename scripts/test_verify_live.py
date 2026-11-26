import json
import os
import subprocess
import sys
from unittest.mock import MagicMock

import pytest


@pytest.fixture
def loopback(monkeypatch):
    from scripts import verify_live

    posts: list[str] = []
    limits = {"maxAttempts": 1, "maxInputBytes": 4096, "maxOutputTokens": 1000}
    model_report: list[dict[str, str]] = []

    def request(_port: int, path: str, body: bytes | None = None) -> tuple[int, dict]:
        if path == "/api/generation":
            return 200, {"mode": "live", "available": True, "provider": "openai", "model": "gpt-6.2-sol", "limits": limits}

        assert path == "/api/candidates" and body is not None
        project = json.loads(body)
        posts.append(project["id"])
        candidates = [
            {
                "id": f"candidate-{index}",
                "story": {
                    **dict.fromkeys(("genre", "tone", "premise", "conflict", "motivation", "opposition", "background"), "PRIVATE_RESPONSE"),
                    "title": f"Direction {index}",
                    "progression": ["An action"],
                    "possibleEndings": ["Its consequence"],
                },
                "coverage": [
                    {"contentId": item["id"], "disposition": "excluded" if item["treatment"] == "excluded" else "incorporated", "reason": "PRIVATE_RESPONSE"}
                    for item in project["userContent"]
                ],
            }
            for index in range(3)
        ]
        return 200, {
            "baseRevision": project["revision"],
            "candidates": candidates,
            "run": {
                "id": "run-test", "stage": "candidates", "baseRevision": project["revision"], "mode": "live",
                "status": "proposed", "calls": 1, "repairAttempts": 0, "tokens": 2000, "durationMs": 237,
                "receipts": [
                    {"tool": "provider_config", "outcome": "passed", "detail": "provider=openai model=gpt-6.2-sol"},
                    {"tool": "provider_usage", "outcome": "passed", "detail": "inputTokens=1000 cachedInputTokens=100 outputTokens=1000"},
                    {"tool": "check_candidates", "outcome": "passed", "detail": "3 candidates passed"},
                    *model_report,
                ],
            },
        }

    monkeypatch.setattr(verify_live, "request_json", request)
    monkeypatch.setenv("WORLDWEAVER_LIVE_VERIFY_MAX_CALLS", "3")
    monkeypatch.setenv("WORLDWEAVER_LIVE_VERIFY_BUDGET_USD", "0.40")
    return verify_live.main, limits, posts, model_report


def test_dry_run_validates_three_synthetic_cases_without_network(monkeypatch, capsys):
    from scripts import verify_live

    def unexpected_request(*_args: object) -> None:
        pytest.fail("Dry run must not contact an app.")

    monkeypatch.setattr(verify_live, "request_json", unexpected_request)
    assert verify_live.main(["--dry-run"]) == 0
    assert json.loads(capsys.readouterr().out) == {"projects": 3, "fragments": 12, "pinnedFacts": 3, "exclusions": 3, "liveCalls": 0}


def test_execute_posts_once_per_case_and_reports_only_safe_metrics(loopback, capsys):
    main, _, posts, _ = loopback
    assert main(["--execute"]) == 0
    assert len(posts) == len(set(posts)) == 3
    result = capsys.readouterr()
    assert "PRIVATE_RESPONSE" not in result.out + result.err
    records = [json.loads(line) for line in result.out.splitlines()]
    case_results = [record for record in records if "case" in record]
    assert len(case_results) == 3
    for record in case_results:
        assert record["structure"] == "passed"
        assert record["editorial"] == "pending"
        assert record["tokens"] == 2000 and record["durationMs"] == 237
        assert record["estimatedStandardTokenCostUsd"] == "0.011810"


def test_candidate_post_carries_explicit_live_generation_opt_in(monkeypatch):
    from scripts import verify_live

    connection = MagicMock()
    response = connection.getresponse.return_value.__enter__.return_value
    response.status = 200
    response.read.return_value = b"{}"
    monkeypatch.setattr(verify_live, "HTTPConnection", lambda *_args, **_kwargs: connection)

    verify_live.request_json(8000, "/api/candidates", b"{}")

    assert connection.request.call_args.args == ("POST", "/api/candidates")
    assert connection.request.call_args.kwargs["headers"].get("X-Worldweaver-Generation") == "live:gpt-6.2-sol"


@pytest.mark.parametrize("blocker", ["unset-budget", "insufficient-budget", "retries-enabled"])
def test_execute_refuses_to_post_on_missing_campaign_guards(loopback, monkeypatch, blocker):
    main, limits, posts, _ = loopback
    if blocker == "unset-budget":
        monkeypatch.delenv("WORLDWEAVER_LIVE_VERIFY_BUDGET_USD")
    elif blocker == "insufficient-budget":
        monkeypatch.setenv("WORLDWEAVER_LIVE_VERIFY_BUDGET_USD", "0.30")
    else:
        limits["maxAttempts"] = 2
    assert main(["--execute"]) != 0
    assert posts == []


def test_execute_stops_when_provider_reports_an_unpriced_model(loopback, capsys):
    main, _, posts, model_report = loopback
    model_report.append({"tool": "provider_model", "outcome": "passed", "detail": "model=unpriced-model"})
    assert main(["--execute"]) != 0
    assert len(posts) == 1
    output = capsys.readouterr()
    assert "estimatedStandardTokenCostUsd" not in output.out
    assert "unpriced-model" not in output.out + output.err


def test_help_renders_in_a_windows_terminal():
    result = subprocess.run(
        [sys.executable, "-m", "scripts.verify_live", "--help"],
        env={**os.environ, "PYTHONIOENCODING": "cp949"},
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0
    assert b"--dry-run" in result.stdout and b"--execute" in result.stdout
