from importlib import import_module, util
from unittest.mock import Mock

import pytest


NEW, OLD = "a"*40, "b"*40
IMAGE = "docker.io/example/world@sha256:" + "1"*64


@pytest.fixture
def release():
    assert util.find_spec("scripts.render_release"), "Missing digest rollout and rollback controller"
    return import_module("scripts.render_release")


def service(previous=True):
    api = Mock()
    api.live.return_value = {"id": "dep-old", "image": {"sha": "sha256:" + "2"*64}} if previous else None
    api.latest.side_effect = [api.live.return_value, {"id": "dep-new", "status": "live"}]
    api.deploy.return_value = "dep-new"
    api.rollback.return_value = "dep-back"
    api.verify.side_effect = lambda sha: sha or OLD
    return api


def test_success_checks_previous_and_new_health_and_exact_digest(release):
    api = service()
    release.rollout(api, IMAGE, NEW)
    api.deploy.assert_called_once_with(IMAGE)
    api.wait.assert_called_once_with("dep-new", IMAGE.split("@")[1])
    assert [c.args for c in api.verify.call_args_list] == [(None,), (NEW,)]
    api.rollback.assert_not_called()


def test_wrong_new_sha_restores_previous_sha_but_release_fails(release):
    api = service()
    api.verify.side_effect = [OLD, RuntimeError("wrong commit"), OLD]
    with pytest.raises(RuntimeError, match="previous release verified"):
        release.rollout(api, IMAGE, NEW)
    api.rollback.assert_called_once_with("dep-old")
    assert api.wait.call_args.args == ("dep-back", "sha256:"+"2"*64)
    assert api.verify.call_args.args == (OLD,)


def test_first_release_failure_reports_no_rollback(release):
    api = service(False)
    api.wait.side_effect = RuntimeError("deploy failed")
    with pytest.raises(RuntimeError, match="no previous"):
        release.rollout(api, IMAGE, NEW)
    api.rollback.assert_not_called()


def test_does_not_replace_an_intervening_deployment(release):
    api = service()
    api.latest.side_effect = [api.live.return_value, {"id": "dep-other", "status": "live"}]
    api.verify.side_effect = [OLD, RuntimeError("wrong release")]
    with pytest.raises(RuntimeError, match="another deploy"):
        release.rollout(api, IMAGE, NEW)
    api.rollback.assert_not_called()


def test_refuses_unverified_previous_release_before_post(release):
    api = service()
    api.verify.side_effect = RuntimeError("old health unavailable")
    with pytest.raises(RuntimeError):
        release.rollout(api, IMAGE, NEW)
    api.deploy.assert_not_called()


def test_probe_rejects_healthy_wrong_commit_before_asset_fetch(release, monkeypatch):
    import json
    health = {"status": "ok", "backendReady": True, "frontendReady": True, "executionMode": "public-demo",
              "liveEnabled": False, "commit": OLD}
    get = Mock(return_value=("application/json", json.dumps(health).encode()))
    monkeypatch.setattr(release, "fetch", get)
    with pytest.raises(RuntimeError, match="commit mismatch"):
        release.probe("https://example.invalid", NEW)
    get.assert_called_once()


def test_controller_rejects_a_health_url_for_a_different_service(release, monkeypatch):
    monkeypatch.setattr(release.Render, "request", lambda *args: {"serviceDetails": {"url": "https://right.onrender.com"}})
    with pytest.raises(ValueError, match="origin"):
        release.Render("https://wrong.onrender.com", "srv-test", "dummy")


def test_refuses_simultaneous_deploy_before_creating_another(release):
    api = service()
    api.latest.side_effect = [{"id": "dep-other", "status": "update_in_progress"}]
    with pytest.raises(RuntimeError, match="preflight"):
        release.rollout(api, IMAGE, NEW)
    api.deploy.assert_not_called()


def test_failed_rollback_verification_never_claims_recovery(release):
    api = service()
    api.verify.side_effect = [OLD, RuntimeError("bad new SHA"), RuntimeError("recovery unverified")]
    with pytest.raises(RuntimeError, match="recovery unverified"):
        release.rollout(api, IMAGE, NEW)
