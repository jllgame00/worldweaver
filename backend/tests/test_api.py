from copy import deepcopy
import json
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from pydantic import ValidationError

from backend.app.contracts import ProjectSnapshot
from backend.app.main import create_app


@pytest.fixture
def project():
    root = Path(__file__).resolve().parents[2]
    return json.loads((root / "docs/examples/salt-census.json").read_bytes())


def test_project_serialization_uses_canonical_contract(project):
    snapshot = ProjectSnapshot.model_validate(project)
    assert ProjectSnapshot.model_validate_json(snapshot.model_dump_json()).root == project


@pytest.mark.parametrize("problem", ["version", "duplicate_id", "fact_reference", "source_reference", "route_reference"])
def test_invalid_project_contract(project, problem):
    if problem == "version":
        project["schemaVersion"] = "9.0.0"
    elif problem == "duplicate_id":
        project["canonicalFacts"][0]["id"] = project["userContent"][0]["id"]
    elif problem == "fact_reference":
        project["canonicalFacts"][0]["sourceContentId"] = "missing"
    elif problem == "source_reference":
        project["narrative"]["sourceCandidateId"] = "missing"
    elif problem == "route_reference":
        project["world"]["routes"][0]["from"] = "missing"
    with pytest.raises(ValidationError):
        ProjectSnapshot.model_validate(project)


def test_health_does_not_call_the_provider():
    class Unavailable:
        async def generate(self, request):
            pytest.fail("Health must not invoke the provider.")

    client = TestClient(create_app(provider=Unavailable()))
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_candidates_api_returns_mock_proposal(project):
    original = deepcopy(project)
    client = TestClient(create_app())
    response = client.post("/api/candidates", json=project)
    assert response.status_code == 200
    result = response.json()
    assert result["baseRevision"] == original["revision"]
    assert result["run"]["mode"] == "mock"
    assert len(result["candidates"]) == 3
    assert len({candidate["story"]["conflict"] for candidate in result["candidates"]}) == 3
    assert project == original
    replacement = deepcopy(project)
    del replacement["narrative"]
    del replacement["basis"]["narrative"]
    replacement["basis"]["candidates"] = {"content": replacement["versions"]["content"]}
    replacement["versions"]["candidates"] += 1
    replacement["versions"]["narrative"] += 1
    replacement["revision"] += 1
    replacement["storyCandidates"] = result["candidates"]
    replacement["runs"].append(result["run"])
    assert ProjectSnapshot.model_validate(replacement).root == replacement


def test_invalid_provider_output_returns_structured_error(project):
    class BadProvider:
        async def generate(self, request):
            return "not-json"

    client = TestClient(create_app(provider=BadProvider()))
    response = client.post("/api/candidates", json=project)
    assert response.status_code == 502
    error = response.json()["error"]
    assert error["code"] == "invalid_provider_response"
    assert error["message"]
    assert error["run"]["status"] == "failed"
    assert error["run"]["baseRevision"] == project["revision"]
    assert "candidates" not in response.json()
    assert "not-json" not in response.text


def test_provider_schema_error_identifies_the_field_without_echoing_data(project):
    class MissingFieldProvider:
        async def generate(self, request):
            candidates = deepcopy(project["storyCandidates"])
            candidates[0]["story"]["title"] = "PRIVATE_SYNTHETIC_VALUE"
            del candidates[0]["story"]["conflict"]
            return json.dumps({"candidates": candidates, "factConflicts": []})

    response = TestClient(create_app(provider=MissingFieldProvider())).post("/api/candidates", json=project)
    assert response.status_code == 502
    assert "/candidates/0/story/conflict" in response.json()["error"]["message"]
    assert "PRIVATE_SYNTHETIC_VALUE" not in response.text


def test_invalid_request_and_unknown_api_have_structured_errors(project):
    client = TestClient(create_app())
    project["unknown"] = "private synthetic value"
    response = client.post("/api/candidates", json=project)
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "invalid_project"
    assert "private synthetic value" not in response.text
    missing = client.get("/api/missing")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "not_found"


def test_project_schema_error_identifies_the_field(project):
    del project["title"]
    response = TestClient(create_app()).post("/api/candidates", json=project)
    assert response.status_code == 422
    assert "/title" in response.json()["error"]["message"]


def test_large_request_is_rejected_before_json_parsing():
    response = TestClient(create_app()).post("/api/candidates", content=b" " * (1024 * 1024 + 1))
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "project_too_large"
