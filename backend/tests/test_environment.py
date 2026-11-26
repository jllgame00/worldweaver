from decimal import Decimal
import os
from pathlib import Path
from uuid import uuid4

import pytest

from backend.app import environment
from backend.app.settings import Settings
from scripts import chatkhu, verify_live


@pytest.fixture
def dotenv_file(monkeypatch):
    root = Path(__file__).resolve().parents[2]
    scratch = root / ".scratch"
    scratch.mkdir(exist_ok=True)
    path = scratch / f"test-env-{uuid4().hex}"
    path.write_text(
        'WORLDWEAVER_PROVIDER=chatkhu\nCHATKHU_MODEL=gpt-6.2-sol\n'
        'CHATKHU_API=responses\nCHATKHU_API_KEY="synthetic-dotenv-token#test" # fixture only\n'
        'WORLDWEAVER_TIMEOUT_SECONDS=25\nWORLDWEAVER_LIVE_VERIFY_MAX_CALLS=2\n'
        'WORLDWEAVER_LIVE_VERIFY_BUDGET_USD=0.50\n',
        encoding="utf-8-sig",
    )
    monkeypatch.setattr(environment, "ROOT_ENV_FILE", path)
    monkeypatch.chdir(root / "frontend")
    for name in (
        "WORLDWEAVER_PROVIDER", "CHATKHU_MODEL", "CHATKHU_API", "CHATKHU_API_KEY",
        "WORLDWEAVER_TIMEOUT_SECONDS", "WORLDWEAVER_LIVE_VERIFY_MAX_CALLS", "WORLDWEAVER_LIVE_VERIFY_BUDGET_USD",
    ):
        monkeypatch.delenv(name, raising=False)
    try:
        yield path
    finally:
        path.unlink()


def test_backend_settings_load_root_dotenv_from_a_different_working_directory(dotenv_file, monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_TIMEOUT_SECONDS", "20")
    settings = Settings.from_environment()
    assert settings.provider == "chatkhu"
    assert settings.model == "gpt-6.2-sol"
    assert settings.api_key == "synthetic-dotenv-token#test"
    assert settings.timeout_seconds == 20
    assert "CHATKHU_API_KEY" not in os.environ


def test_chatkhu_cli_loads_root_dotenv_with_process_precedence(dotenv_file, monkeypatch, capsys):
    used = []

    def read_gateway(path, key):
        used.append((path, key))
        return {"object": "list", "data": [{"id": "gpt-6.2-sol", "type": "llm"}]}

    monkeypatch.setattr(chatkhu, "read_gateway", read_gateway)
    assert chatkhu.main(["models"]) == 0
    monkeypatch.setenv("CHATKHU_API_KEY", "synthetic-process-token")
    assert chatkhu.main(["models"]) == 0
    monkeypatch.setenv("CHATKHU_API_KEY", "")
    assert chatkhu.main(["models"]) == 1
    assert used == [
        ("/models/?type=llm", "synthetic-dotenv-token#test"),
        ("/models/?type=llm", "synthetic-process-token"),
    ]
    output = capsys.readouterr()
    assert "synthetic" not in output.out + output.err
    assert "gpt-6.2-sol" in output.out


def test_verification_cli_reads_budget_without_overriding_process(dotenv_file, monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_LIVE_VERIFY_BUDGET_USD", "0.30")
    assert verify_live.configured_budget() == (2, Decimal("0.30"))
