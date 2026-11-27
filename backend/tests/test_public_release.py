from pathlib import Path
import shutil
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import main
from backend.app.settings import Settings


SHA = "ab" * 20


@pytest.fixture
def image(monkeypatch):
    tmp_path = Path(__file__).resolve().parents[2] / '.scratch' / ('public-release-' + uuid4().hex)
    dist = tmp_path / "dist"
    for folder in ("assets", "examples"):
        (dist / folder).mkdir(parents=True)
    (dist / "index.html").write_text('<script type="module" src="/assets/app-abc12345.js"></script>')
    (dist / "assets/app-abc12345.js").write_text("export {};")
    (dist / "examples/salt-census.json").write_text('{"synthetic":true}')
    (dist / "examples/salt-census.svg").write_text("<svg/>")
    marker = tmp_path / "release-sha"
    marker.write_text(SHA)
    monkeypatch.setattr(main, "DIST", dist)
    monkeypatch.setattr(main, "BUILD_REVISION", marker, raising=False)
    monkeypatch.setenv("WORLDWEAVER_EXECUTION_MODE", "public-demo")
    monkeypatch.setenv("GITHUB_SHA", "f" * 40)
    try:
        yield dist, marker
    finally:
        shutil.rmtree(tmp_path)


def test_image_health_reports_baked_identity_and_missing_assets(image):
    dist, _ = image
    client = TestClient(main.create_app())
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["commit"] == SHA
    assert data["version"] and data["backendReady"] and data["frontendReady"]
    assert data["executionMode"] == "public-demo" and data["liveEnabled"] is False
    assert data["persistence"] == "browser-indexeddb"
    (dist / "assets/app-abc12345.js").unlink()
    assert client.get("/health").status_code == 503


def test_public_image_blocks_all_generation_even_with_provider_configuration(image, monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_PROVIDER", "chatkhu")
    def forbidden(*args, **kwargs):
        pytest.fail("Public image must not initialize a provider")
    monkeypatch.setattr(main, "AsyncOpenAI", forbidden)
    monkeypatch.setattr(main, "MockProvider", forbidden)
    client = TestClient(main.create_app(Settings(provider="chatkhu", api_key="test-only")))
    status = client.get("/api/generation").json()
    assert status["available"] is False and status["deploymentMode"] == "public-demo"
    for route in ("candidates", "content/extract", "scenario", "scenario/revise", "verify/semantic"):
        result = client.post("/api/" + route, json={})
        assert result.status_code == 403 and result.json()["error"]["code"] == "public_demo"
    example = Path(__file__).resolve().parents[2] / "frontend/public/examples/salt-census.json"
    checked = client.post("/api/scenario/validate", content=example.read_bytes(), headers={"content-type": "application/json"})
    assert checked.status_code == 200 and checked.json()["valid"] and checked.json()["complete"]


def test_built_image_cannot_enter_local_mode_and_rejects_invalid_sha(image, monkeypatch):
    _, marker = image
    monkeypatch.setenv("WORLDWEAVER_EXECUTION_MODE", "local")
    with pytest.raises(ValueError):
        main.create_app()
    monkeypatch.setenv("WORLDWEAVER_EXECUTION_MODE", "public-demo")
    marker.write_text("main")
    with pytest.raises(ValueError):
        main.create_app()


def test_static_routing_serves_public_example_and_keeps_missing_files_out_of_spa(image):
    client = TestClient(main.create_app())
    assert client.get("/examples/salt-census.json").json()["synthetic"]
    assert "immutable" in client.get("/assets/app-abc12345.js").headers["cache-control"]
    assert client.get("/studio/narrative").headers["cache-control"] == "no-cache"
    for path in ("/missing.svg", "/assets/missing", "/examples/missing.json", "/api/missing", "/.env"):
        assert client.get(path).status_code == 404
