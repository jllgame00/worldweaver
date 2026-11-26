from copy import deepcopy
import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
import pytest

from backend.app import main as app_module
from backend.app.main import create_app


GATEWAY_HOST = "factchat-cloud.mindlogic.ai"
MODEL = "gpt-6.1-sol"
GATEWAY_TEST_KEY = "gateway-placeholder"
DIRECT_TEST_KEY = "direct-placeholder"


@pytest.fixture
def project():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/examples/salt-census.json").read_bytes())


@pytest.fixture
def gateway_env(monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "chatkhu")
    monkeypatch.setenv("CHATKHU_API_KEY", GATEWAY_TEST_KEY)
    monkeypatch.setenv("CHATKHU_MODEL", MODEL)
    monkeypatch.setenv("OPENAI_API_KEY", DIRECT_TEST_KEY)
    monkeypatch.setenv("OPENAI_ORG_ID", "direct-org")
    monkeypatch.setenv("OPENAI_PROJECT_ID", "direct-project")
    monkeypatch.setenv("OPENAI_BASE_URL", "https://example.invalid/v1")
    monkeypatch.delenv("CHATKHU_API", raising=False)


def loopback(app):
    return TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50200))


def install_transport(monkeypatch, responder):
    def client(**options):
        assert options["follow_redirects"] is False and options["trust_env"] is False
        return httpx.AsyncClient(transport=httpx.MockTransport(responder), **options)

    monkeypatch.setattr(app_module, "DefaultAsyncHttpxClient", client)


def reply(project, api, *, text=None):
    if text is None:
        text = json.dumps({"candidates": project["storyCandidates"], "factConflicts": []})
    if api == "chat_completions":
        return {
            "id": "chat-test", "object": "chat.completion", "created": 1, "model": MODEL,
            "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": text}}],
            "usage": {"prompt_tokens": 30, "completion_tokens": 45, "total_tokens": 75},
        }
    return {
        "id": "resp-test", "object": "response", "created_at": 1, "model": MODEL, "status": "completed",
        "parallel_tool_calls": False, "tool_choice": "auto", "tools": [],
        "output": [{"type": "message", "id": "msg-test", "status": "completed", "role": "assistant", "content": [
            {"type": "output_text", "text": text, "annotations": [], "logprobs": []},
        ]}],
        "usage": {
            "input_tokens": 30, "output_tokens": 45, "total_tokens": 75,
            "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 0},
        },
    }


@pytest.mark.parametrize("api", ["responses", "chat_completions"])
def test_chatkhu_gateway_uses_only_its_key_and_configured_structured_endpoint(monkeypatch, gateway_env, project, api):
    monkeypatch.setenv("CHATKHU_API", api)
    original = deepcopy(project)
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(200, json=reply(project, api))

    install_transport(monkeypatch, respond)
    with loopback(create_app()) as client:
        status = client.get("/api/generation").json()
        assert status["provider"] == "chatkhu" and status["mode"] == "live" and status["available"] is True
        assert status["api"] == api and status["model"] == MODEL
        result = client.post("/api/candidates", json=project, headers={"X-Worldweaver-Generation": f"chatkhu:{api}:{MODEL}"})
    assert result.status_code == 200
    assert len(seen) == 1 and seen[0].url.host == GATEWAY_HOST
    request = seen[0]
    assert request.headers["authorization"] == f"Bearer {GATEWAY_TEST_KEY}"
    assert not request.headers.get("OpenAI-Organization") and not request.headers.get("OpenAI-Project")
    assert DIRECT_TEST_KEY not in request.content.decode()
    body = json.loads(request.content)
    assert body["model"] == MODEL
    if api == "responses":
        assert request.url.path == "/v1/gateway/responses/"
        assert body["text"]["format"]["type"] == "json_schema"
        assert body["text"]["format"]["strict"] is True and body["store"] is False
        assert body["max_output_tokens"] == 6000
        inputs = json.loads(body["input"])
    else:
        assert request.url.path == "/v1/gateway/chat/completions/"
        assert body["response_format"]["json_schema"]["strict"] is True
        assert body["max_tokens"] == 6000
        inputs = json.loads(body["messages"][-1]["content"])
    assert inputs == {"userContent": original["userContent"], "canonicalFacts": original["canonicalFacts"]}
    assert project == original
    proposal = result.json()
    assert len(proposal["candidates"]) == 3 and proposal["run"]["tokens"] == 75
    assert any(r["detail"] == f"provider=chatkhu model={MODEL}" for r in proposal["run"]["receipts"])


@pytest.mark.parametrize(("missing", "code"), [
    ("CHATKHU_API_KEY", "provider_not_configured"),
    ("CHATKHU_MODEL", "provider_configuration_invalid"),
])
def test_chatkhu_configuration_keeps_health_and_never_uses_direct_key(monkeypatch, gateway_env, project, missing, code):
    monkeypatch.delenv(missing)
    seen = []
    install_transport(monkeypatch, lambda request: seen.append(request))
    with loopback(create_app()) as client:
        assert client.get("/health").status_code == 200
        status = client.get("/api/generation").json()
        assert status["provider"] == "chatkhu" and not status["available"]
        assert client.post("/api/candidates", json=project).json()["error"]["code"] == code
    assert not seen


@pytest.mark.parametrize(("status", "code", "http_status"), [
    (401, "provider_authentication", 503), (402, "provider_insufficient_credits", 402),
    (403, "provider_access_denied", 403), (429, "provider_rate_limit", 429),
    (307, "provider_request_rejected", 502), (200, "invalid_provider_response", 502),
    (201, "invalid_coverage", 502),
])
def test_chatkhu_failure_never_falls_back_or_changes_project(monkeypatch, gateway_env, project, status, code, http_status):
    monkeypatch.setenv("WORLDWEAVER_LIVE_MAX_ATTEMPTS", "2")
    original = deepcopy(project)
    seen = []

    def respond(request):
        seen.append(request.url.host)
        if status == 200:
            return httpx.Response(status, json=reply(project, "responses", text='{"candidates": [] , "factConflicts": [], "extra": true}'))
        if status == 201:
            candidates = deepcopy(project["storyCandidates"])
            candidates[0]["coverage"][0]["contentId"] = "fragment-unknown"
            return httpx.Response(200, json=reply(project, "responses", text=json.dumps({"candidates": candidates, "factConflicts": []})))
        return httpx.Response(status, json={"detail": {"message": "PRIVATE_GATEWAY_DETAILS"}},
                              headers={"Location": "https://api.openai.com/v1/responses"} if status == 307 else {})

    install_transport(monkeypatch, respond)
    with loopback(create_app()) as client:
        result = client.post("/api/candidates", json=project, headers={"X-Worldweaver-Generation": f"chatkhu:responses:{MODEL}"})
    assert result.status_code == http_status and result.json()["error"]["code"] == code
    assert "PRIVATE_GATEWAY_DETAILS" not in result.text
    assert project == original and seen == [GATEWAY_HOST]
    assert "candidates" not in result.json()


def test_direct_intent_cannot_authorize_gateway_for_same_model(monkeypatch, gateway_env, project):
    seen = []
    install_transport(monkeypatch, lambda request: seen.append(request))
    with loopback(create_app()) as client:
        result = client.post("/api/candidates", json=project, headers={"X-Worldweaver-Generation": f"live:{MODEL}"})
    assert result.status_code == 409 and result.json()["error"]["code"] == "generation_configuration_changed"
    assert not seen


def test_responses_accepts_gateway_usage_without_total_or_cache_details(monkeypatch, gateway_env, project):
    def respond(request):
        payload = reply(project, "responses")
        del payload["usage"]["total_tokens"]
        del payload["usage"]["input_tokens_details"]
        return httpx.Response(200, json=payload)

    install_transport(monkeypatch, respond)
    with loopback(create_app()) as client:
        result = client.post("/api/candidates", json=project, headers={"X-Worldweaver-Generation": f"chatkhu:responses:{MODEL}"})
    assert result.status_code == 200
    run = result.json()["run"]
    assert run["tokens"] == 75
    assert any(receipt["detail"] == "inputTokens=30 outputTokens=45" for receipt in run["receipts"])


def test_duplicate_json_member_cannot_hide_a_reported_fact_conflict(monkeypatch, gateway_env, project):
    def respond(request):
        text = json.dumps({
            "candidates": project["storyCandidates"],
            "factConflicts": [{
                "candidateId": project["storyCandidates"][0]["id"],
                "factId": project["canonicalFacts"][0]["id"],
            }],
        })
        ambiguous = text[:-1] + ', "factConflicts": []}'
        return httpx.Response(200, json=reply(project, "responses", text=ambiguous))

    install_transport(monkeypatch, respond)
    with loopback(create_app()) as client:
        result = client.post("/api/candidates", json=project, headers={"X-Worldweaver-Generation": f"chatkhu:responses:{MODEL}"})
    assert result.status_code == 502
    assert result.json()["error"]["code"] == "invalid_provider_response"


def test_direct_openai_keeps_its_host_and_credential_with_both_keys(monkeypatch, gateway_env, project):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "openai")
    monkeypatch.setenv("WORLDWEAVER_MODEL", MODEL)
    seen = []

    def respond(request):
        seen.append(request)
        return httpx.Response(200, json=reply(project, "responses"))

    install_transport(monkeypatch, respond)
    with loopback(create_app()) as client:
        result = client.post("/api/candidates", json=project, headers={"X-Worldweaver-Generation": f"live:{MODEL}"})
    assert result.status_code == 200
    assert len(seen) == 1 and seen[0].url.host == "api.openai.com"
    assert seen[0].headers["authorization"] == f"Bearer {DIRECT_TEST_KEY}"


@pytest.mark.parametrize("provider", ["chatkhu", "openai"])
def test_shared_credential_is_rejected_in_either_live_provider(monkeypatch, gateway_env, project, provider):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", provider)
    monkeypatch.setenv("OPENAI_API_KEY", GATEWAY_TEST_KEY)
    seen = []
    install_transport(monkeypatch, lambda request: seen.append(request))
    with loopback(create_app()) as client:
        configuration = client.get("/api/generation").json()
        assert configuration["provider"] == provider and not configuration["available"]
        response = client.post("/api/candidates", json=project)
        assert response.status_code == 503 and response.json()["error"]["code"] == "provider_configuration_invalid"
    assert not seen
