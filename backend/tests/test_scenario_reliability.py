"""Exercise the owner's gateway settings through the local HTTP boundary, with intercepted transport."""
import json
from pathlib import Path

import httpx
import pytest

from backend.app.main import create_app
from backend.tests.test_chatkhu_provider import install_transport, loopback, reply
from backend.tests.test_scenario import SETTINGS


@pytest.fixture
def gateway(monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "chatkhu")
    monkeypatch.setenv("CHATKHU_API_KEY", "synthetic-gateway-key")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("CHATKHU_API", "responses")
    monkeypatch.setenv("CHATKHU_MODEL", "gpt-6.2-sol")
    monkeypatch.setenv("WORLDWEAVER_TIMEOUT_SECONDS", "120")
    monkeypatch.setenv("WORLDWEAVER_MAX_OUTPUT_TOKENS", "6000")
    monkeypatch.setenv("WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS", "16000")


def test_disabled_status_identifies_the_invalid_setting(gateway, monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_MAX_OUTPUT_TOKENS", "16000")
    monkeypatch.setenv("WORLDWEAVER_TIMEOUT_SECONDS", "180")
    with loopback(create_app()) as client:
        status = client.get("/api/generation").json()
        assert status["available"] is False
        assert "WORLDWEAVER_TIMEOUT_SECONDS" in status["message"] and "120" in status["message"]
        error = client.post("/api/scenario", json={}).json()["error"]
        assert error["message"] == status["message"]
        assert "synthetic-gateway-key" not in str(status)


def test_changed_displayed_scenario_cap_stops_before_provider(gateway, monkeypatch):
    install_transport(monkeypatch, lambda _request: pytest.fail("Budget mismatch must not reach gateway"))
    with loopback(create_app()) as client:
        response = client.post("/api/scenario", json={}, headers={
            "X-Worldweaver-Generation":"chatkhu:responses:gpt-6.2-sol",
            "X-Worldweaver-Scenario-Output-Limit":"6000",
        })
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "generation_configuration_changed"


@pytest.mark.parametrize("failure,expected", [
    ("unauthorized", "provider_authentication"), ("max_output_tokens", "provider_output_limit"),
    ("content_filter", "provider_content_filter"), ("unspecified", "provider_incomplete"),
])
def test_local_scenario_failure_guidance(gateway, monkeypatch, failure, expected):
    project = json.loads((Path(__file__).resolve().parents[2] / "docs/examples/salt-census.json").read_bytes())
    sent = []
    def respond(request):
        sent.append(json.loads(request.content))
        if failure == "unauthorized":
            return httpx.Response(401, json={"error": {"message": "private gateway detail"}})
        body = reply(project, "responses", text="private partial story")
        body.update(status="incomplete", incomplete_details=None if failure=="unspecified" else {"reason": failure})
        body["usage"]["output_tokens_details"]["reasoning_tokens"] = 20
        return httpx.Response(200, json=body)

    install_transport(monkeypatch, respond)
    with loopback(create_app()) as client:
        status = client.get("/api/generation").json()
        response = client.post("/api/scenario", json={"project":project,"settings":SETTINGS},
                               headers={"X-Worldweaver-Generation":"chatkhu:responses:gpt-6.2-sol"})
    error = response.json()["error"]
    assert error["code"] == expected
    if failure == "unauthorized":
        assert "preflight" in error["message"] and "401" in error["message"]
    elif failure == "max_output_tokens":
        assert "16000" in error["message"] and "reasoning" in error["message"]
    elif failure == "unspecified":
        assert "reason" in error["message"].lower()
    assert "design" not in response.json() and error["run"]["status"] == "failed"
    assert "private" not in response.text and "synthetic-gateway-key" not in response.text
    assert len(sent) == 1 and sent[0]["max_output_tokens"] == 16000
    assert status["limits"]["scenarioMaxOutputTokens"] == 16000
    assert status["limits"]["maxOutputTokens"] == 6000

