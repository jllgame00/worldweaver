import asyncio
from copy import deepcopy
import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from openai import AsyncOpenAI
import pytest

from backend.app import main as app_module
from backend.app.contracts import definition
from backend.app.main import Settings, create_app
from backend.app.narrative import GenerationRejected, generate
from backend.app.openai_provider import OpenAIProvider


@pytest.fixture
def project():
    root = Path(__file__).resolve().parents[2]
    return json.loads((root / "docs/examples/salt-census.json").read_bytes())


def response_for(project, *, status="completed", text=None, refusal=False):
    if text is None:
        text = json.dumps({"candidates": project["storyCandidates"], "factConflicts": []})
    content = {"type": "refusal", "refusal": "PRIVATE_PROVIDER_DETAILS"} if refusal else {
        "type": "output_text", "text": text, "annotations": [], "logprobs": [],
    }
    return {
        "id": "resp-test", "object": "response", "created_at": 1, "model": "gpt-6.2-sol",
        "status": status, "parallel_tool_calls": False, "tool_choice": "auto", "tools": [],
        "incomplete_details": {"reason": "max_output_tokens"} if status == "incomplete" else None,
        "output": [{"type": "message", "id": "msg-test", "status": status, "role": "assistant", "content": [content]}],
        "usage": {
            "input_tokens": 33, "output_tokens": 55, "total_tokens": 88,
            "input_tokens_details": {"cached_tokens": 4}, "output_tokens_details": {"reasoning_tokens": 12},
        },
    }


def sdk(transport):
    return AsyncOpenAI(api_key="test-placeholder", max_retries=0, http_client=httpx.AsyncClient(transport=transport))


def test_live_uses_responses_schema_and_preserves_facts(project):
    project["canonicalFacts"][0]["statement"] = "밤 동안에는 물길을 열 수 없다. The rule is fixed."
    original = deepcopy(project)
    requests = []

    async def respond(request):
        requests.append(json.loads(request.content))
        assert request.url.path == "/v1/responses"
        return httpx.Response(200, json=response_for(project))

    async def run():
        async with sdk(httpx.MockTransport(respond)) as client:
            return await generate(project, OpenAIProvider(client), mode="live", model="gpt-6.2-sol")

    proposal = asyncio.run(run())
    assert project == original
    assert len(requests) == 1
    payload = requests[0]
    assert payload["model"] == "gpt-6.2-sol"
    assert payload["store"] is False
    assert payload["max_output_tokens"] == 6000
    schema = payload["text"]["format"]["schema"]
    assert payload["text"]["format"]["strict"] is True
    assert schema["type"] == "object" and schema["additionalProperties"] is False
    assert "$schema" not in schema and "definitions" not in schema
    sent = json.loads(payload["input"])
    assert sent == {"userContent": original["userContent"], "canonicalFacts": original["canonicalFacts"]}
    assert len(proposal.candidates) == 3
    assert proposal.run["mode"] == "live"
    assert proposal.run["tokens"] == 88
    assert isinstance(proposal.run["durationMs"], int)
    assert any(entry["tool"] == "provider_usage" and entry["detail"] == "inputTokens=33 cachedInputTokens=4 outputTokens=55"
               for entry in proposal.run["receipts"])
    assert any(entry["tool"] == "provider_config" and "model=gpt-6.2-sol" in entry["detail"]
               for entry in proposal.run["receipts"])


@pytest.mark.parametrize(("scenario", "code", "tokens"), [
    ("auth", "provider_authentication", None),
    ("rate", "provider_rate_limit", None),
    ("quota", "provider_quota", None),
    ("timeout", "provider_timeout", None),
    ("outage", "provider_unavailable", None),
    ("incomplete", "provider_output_limit", 88),
    ("refusal", "provider_refused", 88),
    ("malformed", "invalid_provider_response", 88),
    ("invalid_http_json", "invalid_provider_response", None),
    ("missing_field", "invalid_provider_response", 88),
    ("whitespace_story", "invalid_provider_response", 88),
    ("bad_reference", "invalid_coverage", 88),
    ("fact_conflict", "fact_conflict", 88),
    ("too_large", "generation_input_too_large", None),
])
def test_live_errors_are_safe_and_nonmutating(project, scenario, code, tokens):
    original = deepcopy(project)
    calls = 0

    async def respond(request):
        nonlocal calls
        calls += 1
        if scenario == "timeout":
            raise httpx.ReadTimeout("PRIVATE_PROVIDER_DETAILS", request=request)
        if scenario == "invalid_http_json":
            return httpx.Response(200, content='{"PRIVATE_PROVIDER_DETAILS"', headers={"Content-Type": "application/json"})
        if scenario in ("auth", "rate", "quota", "outage"):
            status = {"auth": 401, "rate": 429, "quota": 429, "outage": 503}[scenario]
            error = {"message": "PRIVATE_PROVIDER_DETAILS", "code": "insufficient_quota" if scenario == "quota" else None}
            return httpx.Response(status, json={"error": error})
        candidates = deepcopy(project["storyCandidates"])
        conflicts = []
        if scenario == "bad_reference":
            candidates[0]["coverage"][0]["contentId"] = "unknown-fragment"
        if scenario == "missing_field":
            del candidates[0]["story"]["conflict"]
        if scenario == "whitespace_story":
            candidates[0]["story"]["title"] = ""
        if scenario == "fact_conflict":
            conflicts.append({"candidateId": candidates[0]["id"], "factId": project["canonicalFacts"][0]["id"]})
        text = "{ not JSON" if scenario == "malformed" else json.dumps({"candidates": candidates, "factConflicts": conflicts})
        return httpx.Response(200, json=response_for(project, status="incomplete" if scenario == "incomplete" else "completed",
                                                     text=text, refusal=scenario == "refusal"))

    async def run():
        async with sdk(httpx.MockTransport(respond)) as client:
            adapter = OpenAIProvider(client, max_input_bytes=1 if scenario == "too_large" else 32768)
            return await generate(project, adapter, mode="live", model="gpt-6.2-sol")

    with pytest.raises(GenerationRejected) as caught:
        asyncio.run(run())
    assert caught.value.code == code
    assert caught.value.run.get("tokens") == tokens
    assert project == original
    assert calls == (0 if scenario == "too_large" else 1)
    assert "PRIVATE_PROVIDER_DETAILS" not in str(caught.value)
    assert "PRIVATE_PROVIDER_DETAILS" not in json.dumps(caught.value.run)


def test_live_missing_credentials_keeps_health_available_without_mock(monkeypatch, project):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "openai")
    monkeypatch.delenv("WORLDWEAVER_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    settings = Settings.from_environment()
    assert settings.model == "gpt-6.2-sol"
    with TestClient(create_app(settings), base_url="http://127.0.0.1", client=("127.0.0.1", 54321)) as client:
        assert client.get("/health").status_code == 200
        config = client.get("/api/generation").json()
        assert config["mode"] == "live" and config["available"] is False
        response = client.post("/api/candidates", json=project)
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "provider_not_configured"


def test_mock_never_requires_openai_credentials(monkeypatch, project):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "mock")
    monkeypatch.delenv("WORLDWEAVER_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with TestClient(create_app()) as client:
        config = client.get("/api/generation").json()
        assert config["mode"] == "mock" and config["available"] is True
        assert client.post("/api/candidates", json=project).json()["run"]["mode"] == "mock"


def test_live_invalid_configuration_keeps_health_and_reports_unavailable(monkeypatch, project):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "openai")
    monkeypatch.setenv("WORLDWEAVER_MAX_OUTPUT_TOKENS", "invalid")
    with TestClient(create_app(), base_url="http://127.0.0.1", client=("127.0.0.1", 54321)) as client:
        assert client.get("/health").status_code == 200
        status = client.get("/api/generation").json()
        assert status["mode"] == "live" and status["available"] is False
        assert client.post("/api/candidates", json=project).json()["error"]["code"] == "provider_configuration_invalid"


def test_mock_ignores_invalid_live_only_limits(monkeypatch, project):
    monkeypatch.setenv("WORLDWEAVER_MAX_OUTPUT_TOKENS", "invalid")
    with TestClient(create_app()) as client:
        assert client.get("/api/generation").json()["available"] is True
        assert client.post("/api/candidates", json=project).status_code == 200


def test_live_endpoint_rejects_public_callers_even_when_configured(monkeypatch, project):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "test-placeholder")
    with TestClient(create_app(), base_url="http://127.0.0.1", client=("203.0.113.1", 54321)) as client:
        assert client.get("/api/generation").json()["available"] is False
        response = client.post("/api/candidates", json=project)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "live_local_only"


@pytest.mark.parametrize("headers", [
    {"host": "public.example"},
    {"origin": "https://public.example"},
    {"host": "localhost:5173", "origin": "http://127.0.0.1:5173"},
    {"host": "127.0.0.1:5173", "origin": "http://127.0.0.1:8000"},
    {"forwarded": "for=203.0.113.1"},
    {"x-forwarded-for": "203.0.113.1"},
    {"x-forwarded-for": "127.0.0.1"},
])
def test_live_rejects_nonlocal_host_origin_or_proxy(headers, project):
    class NeverCalled:
        async def generate(self, request):
            pytest.fail("Rejected traffic must not invoke a provider")

    app = create_app(Settings(provider="openai"), provider=NeverCalled())
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 54321)) as client:
        result = client.post("/api/candidates", json=project, headers=headers)
    assert result.status_code == 403
    assert result.json()["error"]["code"] == "live_local_only"


@pytest.mark.parametrize("host", ["localhost", "127.0.0.1"])
def test_live_allows_same_origin_local_proxy_host(host, project):
    calls = []

    class LocalProvider:
        async def generate(self, request):
            calls.append(request.model)
            return json.dumps({"candidates": project["storyCandidates"], "factConflicts": []})

    origin = f"http://{host}:5173"
    app = create_app(Settings(model="gpt-6.2-sol", provider="openai"), provider=LocalProvider())
    with TestClient(app, base_url=origin, client=("127.0.0.1", 54321)) as client:
        result = client.post("/api/candidates", json=project, headers={
            "Origin": origin, "X-Worldweaver-Generation": "live:gpt-6.2-sol",
        })
    assert result.status_code == 200
    assert calls == ["gpt-6.2-sol"]
    assert len(result.json()["candidates"]) == 3


@pytest.mark.parametrize("header", [None, "mock:worldweaver-mock-v1", "live:another-model"])
def test_live_requires_expected_generation_mode_and_model(header, project):
    calls = 0

    class UnexpectedProvider:
        async def generate(self, request):
            nonlocal calls
            calls += 1
            return "{}"

    app = create_app(Settings(model="gpt-6.2-sol", provider="openai"), provider=UnexpectedProvider())
    headers = {"X-Worldweaver-Generation": header} if header else {}
    with TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 54321)) as client:
        result = client.post("/api/candidates", json=project, headers=headers)
    assert result.status_code == 409
    assert result.json()["error"]["code"] == "generation_configuration_changed"
    assert calls == 0


def test_live_api_returns_canonical_receipts_and_blocks_concurrent_and_duplicate_requests(project, monkeypatch):
    clock = [0.0]
    monkeypatch.setattr(app_module, "monotonic", lambda: clock[0])

    async def exercise():
        started, release = asyncio.Event(), asyncio.Event()
        calls = 0

        async def respond(request):
            nonlocal calls
            calls += 1
            started.set()
            await release.wait()
            clock[0] += 4
            return httpx.Response(200, json=response_for(project))

        async with sdk(httpx.MockTransport(respond)) as provider_client:
            app = create_app(
                Settings(model="gpt-6.2-sol", provider="openai"), provider=OpenAIProvider(provider_client),
            )
            transport = httpx.ASGITransport(app=app, client=("127.0.0.1", 54321))
            async with httpx.AsyncClient(
                transport=transport, base_url="http://127.0.0.1",
                headers={"X-Worldweaver-Generation": "live:gpt-6.2-sol"},
            ) as client:
                assert (await client.get("/api/generation")).json()["available"] is True
                assert (await client.post("/api/candidates", content=b"{}")).status_code == 415
                first = asyncio.create_task(client.post("/api/candidates", json=project))
                try:
                    await asyncio.wait_for(started.wait(), timeout=1)
                    concurrent = await client.post("/api/candidates", json=project)
                    assert concurrent.status_code == 409
                    assert concurrent.json()["error"]["code"] == "generation_in_progress"
                finally:
                    release.set()
                    finished = await first
                assert finished.status_code == 200
                result = finished.json()
                assert result["baseRevision"] == project["revision"] and len(result["candidates"]) == 3
                assert result["run"]["tokens"] == 88 and result["run"]["mode"] == "live"
                definition("AgentRun").validate(result["run"])
                duplicate = await client.post("/api/candidates", json=project)
                assert duplicate.status_code == 409
                assert duplicate.json()["error"]["code"] == "duplicate_generation"
                assert calls == 1

    asyncio.run(exercise())


def test_owned_openai_client_disables_redirects_and_environment_proxies(monkeypatch):
    options = {}

    class Client:
        def __init__(self, **kwargs):
            options.update(kwargs)

        async def close(self):
            if "http_client" in options:
                await options["http_client"].aclose()

    monkeypatch.setattr(app_module, "AsyncOpenAI", Client)
    app = create_app(Settings(model="gpt-6.2-sol", provider="openai", api_key="test-placeholder"))
    with TestClient(app):
        assert options["base_url"] == "https://api.openai.com/v1"
        assert options["max_retries"] == 0
        assert options["http_client"].follow_redirects is False
        assert options["http_client"].trust_env is False


def test_invalid_provider_usage_and_model_metadata_are_not_persisted(project):
    async def run():
        def respond(request):
            payload = response_for(project)
            payload["model"] = "sk-redacted-test-value"
            payload["usage"]["output_tokens"] = -55
            payload["usage"]["input_tokens_details"]["cached_tokens"] = 200
            return httpx.Response(200, json=payload)

        async with sdk(httpx.MockTransport(respond)) as client:
            return await generate(project, OpenAIProvider(client), mode="live", model="gpt-6.2-sol")

    result = asyncio.run(run())
    assert "tokens" not in result.run
    assert len(result.candidates) == 3
    assert "sk-redacted-test-value" not in json.dumps(result.run)
    assert any(receipt["detail"] == "model=unrecognized" for receipt in result.run["receipts"])


def test_truncation_retains_reported_output_counts_when_input_usage_is_absent(project):
    def respond(request):
        payload = response_for(project, status="incomplete", text='{"private":"PRIVATE_PARTIAL"')
        payload["usage"] = {"output_tokens": 55, "output_tokens_details": {"reasoning_tokens": 12}}
        return httpx.Response(200, json=payload)

    async def run():
        async with sdk(httpx.MockTransport(respond)) as client:
            with pytest.raises(GenerationRejected) as caught:
                await generate(project, OpenAIProvider(client), mode="live", model="gpt-6.2-sol")
            return caught.value

    error = asyncio.run(run())
    assert error.code == "provider_output_limit"
    assert "tokens" not in error.run
    details = [receipt["detail"] for receipt in error.run["receipts"]]
    assert "outputTokens=55" in details and "reasoningTokens=12" in details
    assert "PRIVATE_PARTIAL" not in str(error.run)


def test_live_disconnect_cancels_the_provider_task(project):
    async def exercise():
        started = asyncio.Event()
        stopped = asyncio.Event()

        class SlowProvider:
            async def generate(self, request):
                started.set()
                try:
                    await asyncio.Future()
                finally:
                    stopped.set()

        app = create_app(Settings(model="gpt-6.2-sol", provider="openai"), provider=SlowProvider())
        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "scheme": "http",
            "method": "POST", "path": "/api/candidates", "query_string": b"",
            "client": ("127.0.0.1", 54321), "server": ("127.0.0.1", 8000),
            "headers": [
                (b"host", b"127.0.0.1:8000"), (b"content-type", b"application/json"),
                (b"x-worldweaver-generation", b"live:gpt-6.2-sol"),
            ],
        }
        incoming = asyncio.Queue()
        incoming.put_nowait({"type": "http.request", "body": json.dumps(project).encode()})
        outgoing = []

        async def send(message):
            outgoing.append(message)

        request = asyncio.create_task(app(scope, incoming.get, send))
        await asyncio.wait_for(started.wait(), timeout=2)
        incoming.put_nowait({"type": "http.disconnect"})
        await asyncio.wait_for(request, timeout=2)
        assert stopped.is_set()
        assert outgoing[0]["status"] == 499

    asyncio.run(exercise())
