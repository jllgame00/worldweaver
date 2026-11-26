"""Check ChatKHU text-model access, remaining credits, or indicative token cost."""

import argparse
from decimal import Decimal, DecimalException
from http.client import HTTPSConnection, HTTPException
import json
import re
import sys
from typing import NoReturn
from urllib.parse import urlsplit

from backend.app.chatkhu_config import CHATKHU_BASE_URL, get_chatkhu_key, shares_openai_key
from backend.app.environment import load_environment


GATEWAY = urlsplit(CHATKHU_BASE_URL)
MODELS_PATH = "/models/?type=llm"
CREDITS_PATH = "/credits/"
MAX_RESPONSE_BYTES = 1024 * 1024
MODEL_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/-]{0,127}")
INVALID_RESPONSE = "ChatKHU returned an invalid response."
REQUEST_FAILED = "ChatKHU request failed."
HTTP_ERRORS = {
    401: "ChatKHU authentication failed (HTTP 401). Check the gateway key.",
    403: "ChatKHU denied access (HTTP 403). Check gateway permissions.",
    429: "ChatKHU rate limited the request (HTTP 429). Wait before retrying.",
}

# shortcut: published BAZE rates only, until Gateway text pricing fields and units are documented.
# https://docs.mindlogic.ai/docs/khu/baze/product/model-credits
PUBLISHED_MODEL = "gpt-6.1-sol"
INPUT_CREDITS_PER_1K = 2
OUTPUT_CREDITS_PER_1K = 10


class DiagnosticError(Exception):
    """A fixed message safe to display in the terminal."""


class DiagnosticParser(argparse.ArgumentParser):
    def error(self, message: str) -> NoReturn:
        super().error("Invalid arguments. See --help for usage.")


def read_gateway(path: str, key: str) -> dict[str, object]:
    connection = HTTPSConnection(GATEWAY.netloc, timeout=5)
    try:
        connection.request("GET", GATEWAY.path.rstrip("/") + path, headers={
            "Authorization": f"Bearer {key}", "Accept": "application/json",
            "User-Agent": "WORLDWEAVER-ChatKHU/1",
        })
        with connection.getresponse() as response:
            if response.status != 200:
                raise DiagnosticError(HTTP_ERRORS.get(response.status, REQUEST_FAILED))
            raw = response.read(MAX_RESPONSE_BYTES + 1)
    except (HTTPException, OSError, ValueError):
        raise DiagnosticError(REQUEST_FAILED) from None
    finally:
        connection.close()

    if len(raw) > MAX_RESPONSE_BYTES:
        raise DiagnosticError(INVALID_RESPONSE)
    try:
        payload = json.loads(raw, parse_float=Decimal, parse_int=Decimal)
    except (ValueError, DecimalException, RecursionError):
        raise DiagnosticError(INVALID_RESPONSE) from None
    if not isinstance(payload, dict):
        raise DiagnosticError(INVALID_RESPONSE)
    return payload


def authorized_models(payload: dict[str, object], key: str) -> set[str]:
    data = payload.get("data")
    if payload.get("object") != "list" or not isinstance(data, list):
        raise DiagnosticError(INVALID_RESPONSE)
    models: set[str] = set()
    for entry in data:
        if not isinstance(entry, dict) or entry.get("type") != "llm":
            continue
        model = entry.get("id")
        if isinstance(model, str) and MODEL_ID.fullmatch(model) and key not in model:
            models.add(model)
    return models


def remaining_credits(payload: dict[str, object], key: str) -> str:
    total = payload.get("total")
    remaining = total.get("remaining") if isinstance(total, dict) else None
    if payload.get("object") != "credit_balance" or not isinstance(remaining, Decimal) or not remaining.is_finite():
        raise DiagnosticError(INVALID_RESPONSE)
    balance = str(remaining)
    if key in balance:
        raise DiagnosticError(INVALID_RESPONSE)
    return balance


def estimate_credits(model: str, models: set[str], input_tokens: int, output_tokens: int) -> dict[str, str]:
    if model not in models:
        raise DiagnosticError("ChatKHU did not list the requested model for this key.")
    if model != PUBLISHED_MODEL:
        raise DiagnosticError("ChatKHU text pricing is unavailable for the requested model.")
    whole, fraction = divmod(input_tokens * INPUT_CREDITS_PER_1K + output_tokens * OUTPUT_CREDITS_PER_1K, 1000)
    return {
        "model": model,
        "estimatedCredits": f"{whole}.{fraction:03d}",
        "pricingSource": "BAZE published model rates (2026-10-27)",
        "limitations": "Indicative text-token estimate. Actual Gateway charges depend on account rates, caching, and tool usage.",
    }


def token_count(value: str) -> int:
    count = int(value)
    if count < 0:
        raise ValueError
    return count


def main(argv: list[str] | None = None) -> int:
    parser = DiagnosticParser(prog="python -m scripts.chatkhu", description=__doc__, allow_abbrev=False)
    actions = parser.add_subparsers(dest="command", required=True)
    actions.add_parser("models", help="List authorized text model IDs.", allow_abbrev=False)
    actions.add_parser("credits", help="Show total remaining credits.", allow_abbrev=False)
    estimate = actions.add_parser("estimate", help="Estimate token credits using published BAZE rates.", allow_abbrev=False)
    estimate.add_argument("--model", required=True)
    estimate.add_argument("--input-tokens", required=True, type=token_count, help="Total uncached input tokens.")
    estimate.add_argument("--output-tokens", required=True, type=token_count, help="Total billable output tokens including reasoning.")
    args = parser.parse_args(argv)

    environment = load_environment()
    key = get_chatkhu_key(environment)
    if key is None:
        print("Set CHATKHU_API_KEY in the local environment.", file=sys.stderr)
        return 1
    if shares_openai_key(key, environment):
        print("Configure a separate ChatKHU gateway key.", file=sys.stderr)
        return 1
    try:
        if args.command == "credits":
            print(json.dumps({"remainingCredits": remaining_credits(read_gateway(CREDITS_PATH, key), key)}))
        else:
            models = authorized_models(read_gateway(MODELS_PATH, key), key)
            if args.command == "models":
                print(json.dumps({"modelIds": sorted(models)}))
            else:
                print(json.dumps(estimate_credits(args.model, models, args.input_tokens, args.output_tokens)))
    except DiagnosticError as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
