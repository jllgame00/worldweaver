"""Regression checks for the release dependencies and opt-in conditions in test.yml."""
from pathlib import Path
import re


WORKFLOW = Path(__file__).resolve().parents[1] / ".github/workflows/test.yml"


def job(name):
    match = re.search(r"^  " + name + r":\n(.*?)(?=^  [\w-]+:\n|\Z)", WORKFLOW.read_text(encoding="utf8"), re.M | re.S)
    assert match, f"Missing release job: {name}"
    return match.group(1)


def test_image_and_release_have_an_unbroken_success_chain():
    for name, previous in (("container", "required"), ("publish", "container"), ("deploy", "publish")):
        body = job(name)
        assert f"needs: {previous}\n" in body
        assert "always()" not in body and "continue-on-error" not in body
    assert 'test == build == "success"' in job("required")
    assert "render_release.py smoke" in job("container")


def test_only_enabled_main_releases_receive_registry_or_render_secrets():
    for name, switch in (("publish", "PUBLICATION_ENABLED"), ("deploy", "DEPLOYMENT_ENABLED")):
        body = job(name)
        assert "github.ref == 'refs/heads/main'" in body and "github.event_name != 'pull_request'" in body
        assert f"vars.{switch} == 'true'" in body
        assert "environment: production" in body
    assert "RENDER_API_KEY" not in job("publish")
    assert "secrets." not in job("container") and "secrets." not in job("test")
    assert "cancel-in-progress: false" in job("deploy")


def test_required_check_refuses_every_incomplete_result():
    import os
    import subprocess
    import sys
    import textwrap

    gate = textwrap.dedent(job("required").split("run: |", 1)[1]).strip()
    for test, build in (("success", "success"), ("failure", "skipped"), ("cancelled", "success"),
                        ("success", "failure"), ("success", "cancelled"), ("success", "skipped")):
        result = subprocess.run([sys.executable, "-c", gate], capture_output=True,
                                env={**os.environ, "TEST_RESULT": test, "BUILD_RESULT": build})
        assert (result.returncode == 0) == (test == build == "success")
