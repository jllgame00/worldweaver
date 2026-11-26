import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
from uuid import uuid4

import pytest


ROOT = Path(__file__).resolve().parents[1]
pytestmark = pytest.mark.skipif(sys.platform != "win32", reason="Windows PowerShell entry points")


def run_script(script: Path, cwd: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["powershell.exe", "-NoProfile", "-NonInteractive", "-File", str(script)],
        cwd=cwd, env={**os.environ, "WORLDWEAVER_PROVIDER": "mock"},
        capture_output=True, text=True, errors="replace", timeout=30, check=False,
    )


def test_start_refuses_occupied_port_from_other_directory():
    with socket.socket() as listener:
        try:
            listener.bind(("127.0.0.1", 8000))
            listener.listen()
        except OSError as exc:
            if exc.winerror != 10048:
                raise
        result = run_script(ROOT / "scripts/start-dev.ps1", ROOT / "frontend")
        assert result.returncode != 0
        assert "8000" in result.stderr and "already in use" in result.stderr


def test_setup_preserves_unrecognized_venv_and_existing_dotenv():
    scratch = ROOT / ".scratch"
    scratch.mkdir(exist_ok=True)
    repo = scratch / f"dev-setup-{uuid4().hex}"
    repo.mkdir()
    try:
        (repo / "scripts").mkdir()
        script = repo / "scripts/setup.ps1"
        shutil.copyfile(ROOT / "scripts/setup.ps1", script)
        (repo / ".venv").mkdir()
        marker = repo / ".venv/personal-file"
        marker.write_bytes(b"keep")
        dotenv = repo / ".env"
        dotenv.write_bytes(b"owner-file")
        result = run_script(script, ROOT / "frontend")
        assert result.returncode != 0
        assert "existing .venv" in result.stderr
        assert marker.read_bytes() == b"keep"
        assert dotenv.read_bytes() == b"owner-file"
    finally:
        assert repo.resolve().parent == scratch.resolve()
        shutil.rmtree(repo)
