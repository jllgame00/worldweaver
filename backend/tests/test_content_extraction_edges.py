import json
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi.testclient import TestClient
from jsonschema import Draft202012Validator

from backend.app import main
from backend.app.content_extraction import FORMAT
from backend.app.main import create_app
from backend.app.provider import ProviderError, StructuredProvider
from backend.app.settings import Settings


SOURCE = "🌙 물은 기억한다.\n물은 기억한다.\n"
INPUT = {"projectId": "project-intake", "baseRevision": 3, "sourceText": SOURCE}
PROPOSAL = {"fragments": [{
    "category": "theme", "treatment": "excluded", "text": "물은 기억한다.",
    "evidence": {"quote": "물은 기억한다.", "occurrence": 2},
}]}
HEADERS = {"x-worldweaver-generation": "live:test-model", "x-worldweaver-content-budget": "1:320"}


def live_client(provider):
    config = Settings(model="test-model", provider="openai", max_output_tokens=320)
    return TestClient(create_app(config, provider=provider), client=("127.0.0.1", 2000),
                      base_url="http://127.0.0.1")


def test_live_extraction_requires_current_confirmation_before_dispatch():
    provider = AsyncMock(spec=StructuredProvider)
    provider.generate.return_value = json.dumps(PROPOSAL)
    client = live_client(provider)

    blocked = client.post("/api/content/extract", headers={**HEADERS, "x-worldweaver-content-budget": "1:321"}, json=INPUT)
    assert blocked.status_code == 409
    provider.generate.assert_not_awaited()

    response = client.post("/api/content/extract", headers=HEADERS, json=INPUT)
    assert response.status_code == 200
    assert response.headers["Cache-Control"] == "no-store"
    provider.generate.assert_awaited_once()
    request = provider.generate.await_args.args[0]
    assert request.model == "test-model"
    assert request.task == "content"
    assert request.context == {"sourceText": SOURCE}
    assert request.content == request.canonical_facts == ()
    assert response.json()["fragments"] == PROPOSAL["fragments"]
    assert {key: response.json()["operation"][key] for key in ("mode", "dispatches", "responses")} == {
        "mode": "live", "dispatches": 1, "responses": 1,
    }


@pytest.mark.parametrize(("error", "status", "code", "dispatches", "responses"), [
    (TimeoutError(), 504, "provider_timeout", 1, 0),
    (ProviderError("provider_authentication"), 503, "provider_authentication", 1, 0),
    (ProviderError("invalid_provider_response"), 502, "invalid_provider_response", 1, 1),
    (ProviderError("generation_input_too_large", attempted=False), 413, "generation_input_too_large", 0, 0),
])
def test_attempt_receipts_distinguish_failure_and_response_without_retry(error, status, code, dispatches, responses):
    provider = AsyncMock(spec=StructuredProvider)
    provider.generate.side_effect = error
    response = live_client(provider).post("/api/content/extract", headers=HEADERS, json=INPUT)

    assert response.status_code == status
    provider.generate.assert_awaited_once()
    result = response.json()["error"]
    assert result["code"] == code
    assert result["operation"]["dispatches"] == dispatches
    assert result["operation"]["responses"] == responses


@pytest.mark.parametrize("patch", [
    {"treatment": "locked"},
    {"sourceContentId": "content-private"},
    {"evidence": {"quote": "Invented evidence.", "occurrence": 1}},
])
def test_invalid_extraction_fragment_is_rejected_after_provider_response(patch):
    provider = AsyncMock(spec=StructuredProvider)
    provider.generate.return_value = json.dumps({"fragments": [{**PROPOSAL["fragments"][0], **patch}]})
    response = live_client(provider).post("/api/content/extract", headers=HEADERS, json=INPUT)

    assert response.status_code == 502
    assert response.json()["error"]["operation"]["responses"] == 1
    assert "fragments" not in response.json()


def test_development_mock_proposes_one_grounded_idea():
    response = TestClient(create_app(Settings(provider="mock"))).post("/api/content/extract", json=INPUT)

    assert response.status_code == 200
    assert response.json()["operation"]["mode"] == "mock"
    assert response.json()["fragments"] == [{
        "category": "idea", "treatment": "optional", "text": "🌙 물은 기억한다.",
        "evidence": {"quote": "🌙 물은 기억한다.", "occurrence": 1},
    }]


def test_extraction_wire_uses_strict_closed_schema():
    schema = FORMAT["schema"]
    Draft202012Validator.check_schema(schema)
    wire = Draft202012Validator(schema)
    assert wire.is_valid(PROPOSAL)
    assert not wire.is_valid({"fragments": [{**PROPOSAL["fragments"][0], "canonicalFacts": []}]})
    assert not wire.is_valid({"fragments": [{**PROPOSAL["fragments"][0], "treatment": "locked"}]})


@pytest.mark.parametrize(("provider", "api", "path"), [
    ("openai", "responses", "/v1/responses"),
    ("chatkhu", "responses", "/v1/gateway/responses/"),
    ("chatkhu", "chat_completions", "/v1/gateway/chat/completions/"),
])
def test_adapters_use_the_confirmed_extraction_schema_and_budget_without_network(monkeypatch, provider, api, path):
    requests = []
    output = json.dumps(PROPOSAL, ensure_ascii=False)

    def reply(request):
        requests.append(request)
        if api == "chat_completions":
            return httpx.Response(200, json={
                "id": "mock-completion", "object": "chat.completion", "created": 1, "model": "test-model",
                "choices": [{"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": output}}],
            })
        return httpx.Response(200, json={
            "id": "mock-response", "object": "response", "created_at": 1, "model": "test-model",
            "status": "completed", "output": [{"type": "message", "role": "assistant", "id": "message-1",
                "status": "completed", "content": [{"type": "output_text", "text": output, "annotations": []}]}],
        })

    monkeypatch.setattr(main, "DefaultAsyncHttpxClient", lambda **_: httpx.AsyncClient(transport=httpx.MockTransport(reply)))
    config = Settings(provider=provider, model="test-model", api_key="synthetic", max_output_tokens=320, chatkhu_api=api)
    with TestClient(create_app(config), client=("127.0.0.1", 2000), base_url="http://127.0.0.1") as client:
        response = client.post("/api/content/extract",
                               headers={**HEADERS, "x-worldweaver-generation": config.generation_intent}, json=INPUT)

    assert response.status_code == 200, response.json()
    assert len(requests) == 1
    assert requests[0].url.path == path
    payload = json.loads(requests[0].content)
    if api == "chat_completions":
        assert payload["max_tokens"] == 320
        assert payload["response_format"]["json_schema"] == FORMAT
        assert json.loads(payload["messages"][1]["content"]) == {"sourceText": SOURCE}
    else:
        assert payload["max_output_tokens"] == 320
        assert payload["text"]["format"] == {"type": "json_schema", **FORMAT}
        assert json.loads(payload["input"]) == {"sourceText": SOURCE}
