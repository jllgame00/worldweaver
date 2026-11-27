import json
from copy import deepcopy

import pytest
import httpx
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.main import create_app
from backend.app.provider import GenerationReply, ProviderError, ProviderUsage
from backend.app.settings import Settings


RECORDS = [
    {"kind": "node", "id": "council", "text": "The council unveils the witness ledger."},
    {"kind": "fact", "id": "witness-rule", "text": "Witness names remain sealed."},
]
BODY = {"projectId": "salt", "baseRevision": 7, "mode": "targeted", "targetId": "council", "records": RECORDS}
CONFIG = Settings(provider="openai", model="adapter-test", live_max_attempts=2)
HEADERS = {"x-worldweaver-generation": CONFIG.generation_intent, "x-worldweaver-semantic-budget": "1:1600"}
ADVICE = {
    "category": "creative-suggestion", "severity": "warning", "uncertainty": "The ledger might be redacted.",
    "explanation": "The council's reveal could use a visible choice.", "suggestedRepair": "Consider showing the redaction.",
    "evidence": [{"kind": "node", "id": "council", "excerpt": "unveils the witness ledger"},
                 {"kind": "fact", "id": "witness-rule", "excerpt": "names remain sealed"}],
}


class Spy:
    def __init__(self, reply):
        self.reply = reply
        self.calls = []

    async def generate(self, request):
        self.calls.append(request)
        if isinstance(self.reply, Exception):
            raise self.reply
        return GenerationReply(json.dumps(self.reply), ProviderUsage(15, 9, None))


def post(adapter, body=BODY, headers=HEADERS, host="127.0.0.1", config=CONFIG):
    with TestClient(create_app(config, adapter), base_url="http://127.0.0.1", client=(host, 1234)) as client:
        return client.post("/api/verify/semantic", json=body, headers=headers)


def test_semantic_review_returns_checked_evidence_and_measured_usage():
    adapter = Spy({"findings": [ADVICE]})
    response = post(adapter)
    assert response.status_code == 200, response.text
    result = response.json()
    assert len(adapter.calls) == 1
    assert adapter.calls[0].context == {"mode": "targeted", "targetId": "council", "records": RECORDS}
    run = result["run"]
    assert (run["stage"], run["mode"], run["status"], run["calls"], run["tokens"]) == ("verify", "live", "proposed", 1, 24)
    assert result["findings"][0]["category"] == "creative-suggestion"
    assert result["findings"][0]["evidence"] == ADVICE["evidence"]


def test_explicit_proposed_relationship_survives_only_when_both_ends_have_cited_evidence():
    edge = {"fromId": "council", "toId": "witness-rule", "label": "May test the sealing rule"}
    response = post(Spy({"findings": [{**ADVICE, "suggestedRelationship": edge}]}))
    assert response.status_code == 200
    assert response.json()["findings"][0]["suggestedRelationship"] == edge
    for change in ({"toId": "missing"}, {"toId": "council"}, {"label": "  "}, {"label": "a" * 121}):
        response = post(Spy({"findings": [{**ADVICE, "suggestedRelationship": {**edge, **change}}]}))
        assert response.status_code == 502
    response = post(Spy({"findings": [{**ADVICE, "evidence": ADVICE["evidence"][:1], "suggestedRelationship": edge}]}))
    assert response.status_code == 502


@pytest.mark.parametrize(("field", "value"), [("id", "unknown"), ("kind", "fact"), ("excerpt", "A made-up quote")])
def test_semantic_review_rejects_unfounded_evidence_without_retry(field, value):
    finding = deepcopy(ADVICE)
    finding["evidence"][0][field] = value
    adapter = Spy({"findings": [ADVICE, finding]})
    response = post(adapter)
    assert response.status_code == 502
    assert response.json()["error"]["run"]["tokens"] == 24
    assert len(adapter.calls) == 1 and "findings" not in response.json()["error"]


@pytest.mark.parametrize(("headers", "host", "status"), [
    ({}, "127.0.0.1", 409), (HEADERS, "192.0.2.1", 403),
    ({**HEADERS, "origin": "https://foreign.example"}, "127.0.0.1", 403),
    ({**HEADERS, "x-worldweaver-semantic-budget": "2:1600"}, "127.0.0.1", 409),
])
def test_semantic_review_requires_local_consent(headers, host, status):
    adapter = Spy({})
    assert post(adapter, headers=headers, host=host).status_code == status
    assert not adapter.calls


@pytest.mark.parametrize("failure,status", [(ProviderError("provider_unavailable"), 503),
                                           (ProviderError("provider_quota"), 429), (TimeoutError(), 504)])
def test_semantic_review_quota_or_transient_failure_never_retries(failure, status):
    adapter = Spy(failure)
    response = post(adapter)
    assert response.status_code == status and len(adapter.calls) == 1
    assert response.json()["error"]["run"]["calls"] == 1


@pytest.mark.parametrize("provider,path", [("chatkhu", "/v1/gateway/responses/"), ("openai", "/v1/responses")])
def test_semantic_review_runs_configured_responses_adapter_with_no_network(monkeypatch, provider, path):
    config = Settings(provider=provider, model="reviewer", api_key="placeholder", max_output_tokens=300)
    requests = []
    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={
            "id": "resp-1", "object": "response", "created_at": 1, "model": "reviewer", "status": "completed",
            "parallel_tool_calls": False, "tool_choice": "auto", "tools": [],
            "output": [{"type": "message", "id": "msg-1", "status": "completed", "role": "assistant", "content": [
                {"type": "output_text", "text": json.dumps({"findings": [{**ADVICE, "suggestedRelationship": None}]}), "annotations": []}]}],
            "usage": {"input_tokens": 19, "output_tokens": 20, "total_tokens": 39,
                      "input_tokens_details": {"cached_tokens": 0}, "output_tokens_details": {"reasoning_tokens": 3}},
        })
    monkeypatch.setattr(main, "DefaultAsyncHttpxClient", lambda **kw: httpx.AsyncClient(transport=httpx.MockTransport(respond), **kw))
    headers = {"x-worldweaver-generation": config.generation_intent, "x-worldweaver-semantic-budget": "1:300"}
    response = post(None, config=config, headers=headers)
    assert response.status_code == 200, response.text
    assert len(requests) == 1 and requests[0].url.path == path
    payload = json.loads(requests[0].content)
    assert payload["text"]["format"]["name"] == "worldweaver_semantic_review_v1"
    assert payload["text"]["format"]["strict"] is True and payload["store"] is False
    assert "suggestedRelationship" in payload["text"]["format"]["schema"]["$defs"]["EditorialFinding"]["required"]
    assert payload["max_output_tokens"] == 300
    assert json.loads(payload["input"]) == {"mode": "targeted", "targetId": "council", "records": RECORDS}
    result = response.json()
    assert result["findings"][0]["severity"] == "info"
    assert "suggestedRelationship" not in result["findings"][0]
    assert result["run"]["tokens"] == 39
    assert "witness ledger" not in json.dumps(result["run"])


@pytest.mark.parametrize("body", [
    {**BODY, "targetId": "missing"}, {**BODY, "mode": "quick"}, {**BODY, "records": RECORDS * 2},
    {**BODY, "records": [{**RECORDS[0], "tiles": ["unneeded"]}]},
    {**BODY, "records": [{**RECORDS[0], "text": "x" * 2049}]},
])
def test_invalid_or_overbroad_context_never_dispatches(body):
    adapter = Spy({})
    assert post(adapter, body=body).status_code == 422
    assert not adapter.calls
