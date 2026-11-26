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


@pytest.mark.parametrize("override", ["", "   ", "invalid token", "invalid\nkey", "키"])
def test_backend_and_cli_both_reject_unusable_process_key(dotenv_file, monkeypatch, capsys, override):
    monkeypatch.setenv("CHATKHU_API_KEY", override)
    monkeypatch.setattr(chatkhu, "read_gateway", lambda *_: pytest.fail("unexpected gateway request"))
    assert Settings.from_environment().api_key is None
    assert chatkhu.main(["models"]) == 1
    output = capsys.readouterr()
    assert output.out == ""
    assert output.err == "Set CHATKHU_API_KEY in the local environment.\n"


@pytest.mark.parametrize(("name", "value", "guidance"), [
    ("WORLDWEAVER_TIMEOUT_SECONDS", "nan", "120"),
    ("WORLDWEAVER_TIMEOUT_SECONDS", "121", "120"),
    ("WORLDWEAVER_MAX_OUTPUT_TOKENS", "private-nonnumeric", "16000"),
    ("WORLDWEAVER_MAX_OUTPUT_TOKENS", "16001", "16000"),
    ("WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS", "16001", "16000"),
    ("WORLDWEAVER_MAX_INPUT_BYTES", "65537", "65536"),
    ("WORLDWEAVER_LIVE_MAX_ATTEMPTS", "3", "2"),
    ("CHATKHU_API", "private-endpoint", "chat_completions"),
    ("CHATKHU_MODEL", "sk-private-model", "model ID"),
    ("OPENAI_API_KEY", "synthetic-dotenv-token#test", "separate"),
])
def test_safe_configuration_error_identifies_field_and_fix(dotenv_file, monkeypatch, name, value, guidance):
    monkeypatch.setenv(name, value)
    settings = Settings.from_environment()
    message = settings.configuration_error
    assert isinstance(message, str) and name in message and guidance in message
    assert "private" not in message and "synthetic" not in message
    assert settings.api_key is None


def test_offline_check_reports_only_conflicting_known_names(dotenv_file, monkeypatch, capsys):
    with dotenv_file.open("a", encoding="utf-8") as stream:
        stream.write("UNRELATED_OWNER_SETTING=file-value\n")
    monkeypatch.setenv("UNRELATED_OWNER_SETTING", "process-value")
    monkeypatch.setenv("CHATKHU_API_KEY", "synthetic-process-key")
    monkeypatch.setenv("CHATKHU_API", "responses")
    monkeypatch.setattr(chatkhu, "read_gateway", lambda *_: pytest.fail("offline check made a request"))
    assert chatkhu.main(["check"]) == 0
    output = capsys.readouterr()
    assert '"model": "gpt-6.2-sol"' in output.out and '"api": "responses"' in output.out
    assert "process overrides the root .env for CHATKHU_API_KEY." in output.err
    assert "UNRELATED_OWNER_SETTING" not in output.err
    assert "synthetic" not in output.out + output.err


def test_offline_check_rejects_invalid_effective_configuration(dotenv_file, monkeypatch, capsys):
    monkeypatch.setenv("WORLDWEAVER_MAX_OUTPUT_TOKENS", "private-value")
    assert chatkhu.main(["check"]) == 1
    output = capsys.readouterr()
    assert "WORLDWEAVER_MAX_OUTPUT_TOKENS" in output.err and "16000" in output.err
    assert "private-value" not in output.err


def test_full_scenario_output_limit_is_independent_and_optional(dotenv_file, monkeypatch):
    monkeypatch.setenv("WORLDWEAVER_MAX_OUTPUT_TOKENS", "5000")
    monkeypatch.delenv("WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS", raising=False)
    assert Settings.from_environment().scenario_max_output_tokens is None
    monkeypatch.setenv("WORLDWEAVER_SCENARIO_MAX_OUTPUT_TOKENS", "12000")
    settings = Settings.from_environment()
    assert settings.max_output_tokens == 5000 and settings.scenario_max_output_tokens == 12000
