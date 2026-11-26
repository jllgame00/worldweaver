import json
import os
import subprocess
import sys
from http.client import HTTPException
from unittest.mock import MagicMock

import pytest


KEY = "synthetic-chatkhu-key"
MODEL = "gpt-6.1-sol"
ESTIMATE = ["estimate", "--model", MODEL, "--input-tokens", "1100", "--output-tokens", "333"]


def test_module_requires_an_environment_key():
    process = subprocess.run(
        [sys.executable, "-m", "scripts.chatkhu", "models"],
        env={**os.environ, "CHATKHU_API_KEY": ""},
        capture_output=True,
        text=True,
        check=False,
    )

    assert process.returncode == 1
    assert process.stdout == ""
    assert process.stderr == "Set CHATKHU_API_KEY in the local environment.\n"


@pytest.fixture
def gateway(monkeypatch):
    from scripts import chatkhu

    connection = MagicMock()
    response = connection.getresponse.return_value.__enter__.return_value
    response.status = 200
    connect = MagicMock(return_value=connection)
    monkeypatch.setattr(chatkhu, "HTTPSConnection", connect)
    monkeypatch.setenv("CHATKHU_API_KEY", KEY)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("HTTPS_PROXY", "http://example.invalid:8080")
    monkeypatch.setenv("CHATKHU_BASE_URL", "https://example.invalid")
    return chatkhu.main, connect, response


def model_response(*models: tuple[str, str]) -> bytes:
    return json.dumps({
        "object": "list",
        "data": [{"id": model, "type": kind, "unrelated": KEY} for model, kind in models],
        "unrelated": KEY,
    }).encode()


def test_models_only_prints_safe_authorized_llm_ids(gateway, capsys):
    main, connect, response = gateway
    response.read.return_value = model_response(
        (MODEL, "llm"), (MODEL, "llm"), ("google/gemma-4-31B-it", "llm"), ("image-model", "image"),
        ("bad\nmodel", "llm"), (f"reflected-{KEY}", "llm"),
    )

    assert main(["models"]) == 0

    output = capsys.readouterr()
    assert json.loads(output.out) == {"modelIds": ["google/gemma-4-31B-it", MODEL]}
    assert not output.err
    connect.assert_called_once_with("factchat-cloud.mindlogic.ai", timeout=5)
    connect.return_value.request.assert_called_once_with(
        "GET", "/v1/gateway/models/?type=llm",
        headers={"Authorization": f"Bearer {KEY}", "Accept": "application/json", "User-Agent": "WORLDWEAVER-ChatKHU/1"},
    )
    connect.return_value.close.assert_called_once_with()


def test_credits_only_prints_the_total_remaining_balance(gateway, capsys):
    main, connect, response = gateway
    response.read.return_value = json.dumps({
        "object": "credit_balance", "total": {"remaining": 123.4567, "unrelated": KEY}, "unrelated": KEY,
    }).encode()

    assert main(["credits"]) == 0

    assert json.loads(capsys.readouterr().out) == {"remainingCredits": "123.4567"}
    assert connect.return_value.request.call_args.args == ("GET", "/v1/gateway/credits/")


def test_estimate_uses_published_credits_per_thousand_tokens(gateway, capsys):
    main, connect, response = gateway
    response.read.return_value = model_response((MODEL, "llm"))

    assert main(ESTIMATE) == 0

    result = json.loads(capsys.readouterr().out)
    assert result["model"] == MODEL
    assert result["estimatedCredits"] == "5.530"
    assert result["pricingSource"] == "BAZE published model rates (2026-10-27)"
    assert "account" in result["limitations"]
    assert connect.return_value.request.call_count == 1
    assert connect.return_value.request.call_args.args == ("GET", "/v1/gateway/models/?type=llm")


@pytest.mark.parametrize("requested,authorized", [(MODEL, "another-model"), ("another-model", "another-model")])
def test_estimate_fails_without_entitlement_or_pricing(gateway, capsys, requested, authorized):
    main, _, response = gateway
    response.read.return_value = model_response((authorized, "llm"))

    assert main([*ESTIMATE[:2], requested, *ESTIMATE[3:]]) == 1

    output = capsys.readouterr()
    assert not output.out
    assert output.err.startswith("ChatKHU ") and authorized not in output.err


@pytest.mark.parametrize(("status", "message"), [
    (302, "ChatKHU request failed."),
    (401, "ChatKHU authentication failed (HTTP 401). Check the gateway key."),
    (403, "ChatKHU denied access (HTTP 403). Check gateway permissions."),
    (429, "ChatKHU rate limited the request (HTTP 429). Wait before retrying."),
    (503, "ChatKHU request failed."),
])
def test_http_failures_do_not_follow_redirects_or_read_error_payloads(gateway, capsys, status, message):
    main, connect, response = gateway
    response.status = status
    response.read.side_effect = AssertionError("HTTP errors must not read the body")

    assert main(["models"]) == 1

    output = capsys.readouterr()
    assert not output.out
    assert output.err == message + "\n"
    connect.return_value.request.assert_called_once()


def test_transport_errors_do_not_print_exception_contents(gateway, capsys):
    main, connect, _ = gateway
    connect.return_value.request.side_effect = HTTPException(KEY)

    assert main(["credits"]) == 1

    assert capsys.readouterr().err == "ChatKHU request failed.\n"


def test_cli_does_not_send_a_shared_openai_credential(gateway, monkeypatch, capsys):
    main, connect, response = gateway
    monkeypatch.setenv("OPENAI_API_KEY", KEY)
    response.read.return_value = model_response((MODEL, "llm"))
    assert main(["models"]) == 1
    assert capsys.readouterr().err == "Configure a separate ChatKHU gateway key.\n"
    connect.assert_not_called()


@pytest.mark.parametrize("body", [
    pytest.param(b"{}", id="missing-fields"),
    pytest.param(b"not JSON", id="invalid-json"),
    pytest.param(b'{"object":"credit_balance","total":{"remaining":true}}', id="non-numeric-balance"),
    pytest.param(b" " * (1024 * 1024 + 1), id="oversized-body"),
])
def test_invalid_balances_do_not_print_the_raw_response(gateway, capsys, body):
    main, _, response = gateway
    response.read.return_value = body

    assert main(["credits"]) == 1

    output = capsys.readouterr()
    assert not output.out
    assert output.err == "ChatKHU returned an invalid response.\n"


def test_cli_argument_errors_do_not_echo_argv_or_connect(gateway, capsys):
    main, connect, _ = gateway

    with pytest.raises(SystemExit) as exit_info:
        main([*ESTIMATE[:-1], KEY])

    assert exit_info.value.code == 2
    assert KEY not in capsys.readouterr().err
    connect.assert_not_called()
