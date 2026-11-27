import json
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.settings import Settings


def test_verification_records_only_feasible_transitions_even_with_stale_sources():
    project = json.loads((Path(__file__).resolve().parents[2] / "docs/examples/salt-census.json").read_bytes())
    project["narrative"]["approved"] = False
    project["edges"][-1]["requiresVisited"] = ["n-private"]
    project["edges"].append({**project["edges"][0], "id": "reference", "kind": "reference"})
    with TestClient(create_app(Settings())) as client:
        result = client.post("/api/scenario/validate?verification=true", json=project).json()
    assert result["statesExplored"] > 0
    assert result["feasibleEdgeIds"] == ["e-1", "e-2", "e-3", "e-4"]
    assert [path["endingId"] for path in result["paths"]] == ["end-public"]
