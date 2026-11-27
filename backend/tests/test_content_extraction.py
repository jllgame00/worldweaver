import json
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
import pytest

from backend.app.main import create_app
from backend.app.provider import StructuredProvider
from backend.app.settings import Settings


SOURCE = "  🌙 물은 기억한다.\n\nThe eastern gate is sealed.\n물은 기억한다.\n"


def extraction_reply(category: str = "theme", occurrence: int = 2) -> dict:
    return {
        "fragments": [{
            "category": category,
            "text": "물은 기억한다.",
            "evidence": {"quote": "물은 기억한다.", "occurrence": occurrence},
        }],
    }


def request_extraction(provider_output: str):
    provider = AsyncMock(spec=StructuredProvider)
    provider.generate.return_value = provider_output
    client = TestClient(create_app(Settings(provider="mock"), provider=provider))
    response = client.post(
        "/api/content/extract",
        json={"projectId": "project-content-intake", "baseRevision": 12, "sourceText": SOURCE},
    )
    return response, provider.generate


def test_content_extraction_returns_a_detached_proposal_with_the_second_exact_citation():
    result = extraction_reply()
    response, generate = request_extraction(json.dumps(result, ensure_ascii=False))

    assert response.status_code == 200, response.json()
    generate.assert_awaited_once()
    proposal = response.json()
    assert proposal["baseRevision"] == 12
    assert len(proposal["fragments"]) == 1
    fragment = proposal["fragments"][0]
    assert fragment["category"] == "theme"
    assert fragment["text"] == "물은 기억한다."
    assert fragment["evidence"] == {"quote": "물은 기억한다.", "occurrence": 2}
    assert {"project", "userContent", "canonicalFacts"}.isdisjoint(proposal)


@pytest.mark.parametrize(
    "provider_output",
    [
        "truncated JSON {",
        json.dumps(extraction_reply(category="lockedFact")),
        json.dumps(extraction_reply(occurrence=3)),
    ],
    ids=["malformed-json", "invalid-category", "nonexistent-citation-occurrence"],
)
def test_content_extraction_rejects_invalid_provider_output_without_a_proposal(provider_output):
    response, generate = request_extraction(provider_output)

    assert response.status_code == 502, response.json()
    generate.assert_awaited_once()
    error = response.json()
    assert error["error"]["code"] == "invalid_provider_response"
    assert {"fragments", "project", "userContent", "canonicalFacts"}.isdisjoint(error)
    assert "The eastern gate is sealed." not in response.text
