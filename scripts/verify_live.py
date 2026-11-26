"""Validate the synthetic Phase 1.5 cases or run an approved loopback campaign."""

import argparse
from decimal import Decimal, InvalidOperation
from http.client import HTTPConnection, HTTPException
import json
import re
import sys
from time import monotonic
from typing import cast

from pydantic import JsonValue, ValidationError

from backend.app.contracts import Content, ProjectSnapshot, Run, definition
from backend.app.environment import load_environment
from backend.app.narrative import CandidateResponseError, parse_candidates


MODEL = "gpt-6.2-sol"
AGENT_RUN = definition("AgentRun")
MAX_RESPONSE_BYTES = 1024 * 1024
# shortcut: byte-based estimate with a framing allowance, revisit after prompt or schema growth.
INPUT_FRAMING_ALLOWANCE = 16_384
SHORT_CONTEXT_TOKENS = 272_000
PER_MILLION = Decimal(1_000_000)
# Standard short-context token prices. https://developers.openai.com/api/docs/models/gpt-6.2-sol
INPUT_RATE, CACHE_READ_RATE, OUTPUT_RATE = Decimal("2"), Decimal("0.10"), Decimal("10")
RESERVE_INPUT_RATE = Decimal("5")  # Includes the listed 12-hour cache-write tariff.
RUBRIC = (
    "Editorial review is manual. Compare the central decision and resulting consequence for every candidate pair. "
    "Read each story against mandatory material, pinned facts and exclusions. "
    "Check optional omissions, coherent motivation and world logic, and whether a direction is worth editing."
)


class CampaignBlocked(Exception):
    """A fixed, safe diagnostic for an incomplete campaign."""


def project(identifier: str, title: str, content: list[Content], fact: str) -> ProjectSnapshot:
    return ProjectSnapshot.model_validate({
        "id": identifier,
        "schemaVersion": "1.0.0",
        "title": title,
        "synthetic": True,
        "revision": 1,
        "versions": {"content": 1, "candidates": 0, "narrative": 0, "scenario": 0, "world": 0},
        "basis": {},
        "userContent": content,
        "canonicalFacts": [{"id": "fact-pinned", "statement": fact, "sourceContentId": "content-rule"}],
        **{field: [] for field in ("storyCandidates", "characters", "factions", "nodes", "edges", "quests", "endings", "findings", "runs")},
    })


def campaign_projects() -> tuple[ProjectSnapshot, ...]:
    return (
        project(
            "dark-fantasy", "매듭의 저녁",
            [
                {"id": "content-genre", "category": "genre", "treatment": "mandatory", "text": "다크 판타지 액션 RPG. 폐허가 된 계단 도시에서 실패한 장례를 수습하는 도공이 주인공이다."},
                {"id": "content-rule", "category": "mechanic", "treatment": "mandatory", "text": "점토 가면을 깨뜨리면 도시의 한 구역에서 그 안에 남은 목소리가 한 번 들린다. 한 번 깨뜨린 가면은 다시 붙여도 목소리를 잃는다."},
                {"id": "content-optional", "category": "character", "treatment": "optional", "text": "어린 안내인이 손상된 계단을 소리로 찾아낸다."},
                {"id": "content-exclusion", "category": "ending", "treatment": "excluded", "text": "죽은 인물이 실제로 부활하는 결말."},
            ],
            "한 번 깨뜨린 가면은 다시 붙여도 목소리를 잃는다.",
        ),
        project(
            "sf-exploration", "The Drift Ledger",
            [
                {"id": "content-genre", "category": "genre", "treatment": "mandatory", "text": "An SF exploration game about mapping an abandoned current observatory inside a gas giant."},
                {"id": "content-rule", "category": "constraint", "treatment": "mandatory", "text": "Probe teams have to decide which observations to send through a narrow acoustic relay. The relay has one transmission window per planetary rotation."},
                {"id": "content-optional", "category": "item", "treatment": "optional", "text": "A previous expedition left behind a mechanical chart with no scale."},
                {"id": "content-exclusion", "category": "faction", "treatment": "excluded", "text": "An armed alien faction waiting inside the observatory."},
            ],
            "The relay has one transmission window per planetary rotation.",
        ),
        project(
            "contemporary-mystery", "목요일의 분실물",
            [
                {"id": "content-genre", "category": "genre", "treatment": "mandatory", "text": "현대 인물 중심 미스터리. 폐점하는 심야 세탁소의 단골들이 같은 코트를 자기 것이라고 주장한다. The former apprentice returns to help their estranged aunt close the shop."},
                {"id": "content-rule", "category": "constraint", "treatment": "mandatory", "text": "세탁소 영수증은 전부 날짜를 적지 않는 일련번호 방식으로 발행되었다."},
                {"id": "content-optional", "category": "location", "treatment": "optional", "text": "근처 합주실의 폐기 예정 사물함."},
                {"id": "content-exclusion", "category": "idea", "treatment": "excluded", "text": "A secret twin as the explanation for the conflicting claims."},
            ],
            "세탁소 영수증은 전부 날짜를 적지 않는 일련번호 방식으로 발행되었다.",
        ),
    )


def request_json(port: int, path: str, body: bytes | None = None) -> tuple[int, dict[str, JsonValue]]:
    # The literal loopback connection bypasses proxies, DNS and automatic redirects.
    connection = HTTPConnection("127.0.0.1", port, timeout=125 if body is not None else 5)
    try:
        if body is None:
            connection.request("GET", path)
        else:
            connection.request("POST", path, body=body, headers={
                "Content-Type": "application/json",
                "X-Worldweaver-Generation": f"live:{MODEL}",
            })
        with connection.getresponse() as response:
            raw = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw) > MAX_RESPONSE_BYTES:
                raise CampaignBlocked("The loopback response exceeded the evidence size limit.")
            payload = json.loads(raw)
            if not isinstance(payload, dict):
                raise CampaignBlocked("The loopback app did not return a JSON object.")
            return response.status, payload
    except (HTTPException, OSError, ValueError, RecursionError):
        raise CampaignBlocked("The loopback request failed. A submitted call may still incur usage.") from None
    finally:
        connection.close()


def configured_budget() -> tuple[int, Decimal]:
    environment = load_environment()
    calls = environment.get("WORLDWEAVER_LIVE_VERIFY_MAX_CALLS", "")
    try:
        budget = Decimal(environment.get("WORLDWEAVER_LIVE_VERIFY_BUDGET_USD", "0"))
    except InvalidOperation:
        budget = Decimal(0)
    if calls not in {"1", "2", "3"} or not budget.is_finite() or budget <= 0:
        raise CampaignBlocked("Execution requires an approved positive USD estimate budget and an explicit call count from 1 to 3.")
    return int(calls), budget


def live_limits(port: int) -> tuple[int, int]:
    status, config = request_json(port, "/api/generation")
    limits = config.get("limits")
    if (
        status != 200 or config.get("mode") != "live" or config.get("available") is not True
        or config.get("provider") != "openai" or config.get("model") != MODEL
        or not isinstance(limits, dict) or type(limits.get("maxAttempts")) is not int or limits["maxAttempts"] != 1
    ):
        raise CampaignBlocked(f"The app must report available OpenAI live mode, {MODEL}, and one provider attempt.")
    input_bytes = limits.get("maxInputBytes")
    output_tokens = limits.get("maxOutputTokens")
    if (
        type(input_bytes) is not int or not 0 < input_bytes <= SHORT_CONTEXT_TOKENS - INPUT_FRAMING_ALLOWANCE
        or type(output_tokens) is not int or not 0 < output_tokens <= 128_000
    ):
        raise CampaignBlocked("The app limits are missing or outside the supported short-context estimate.")
    return input_bytes + INPUT_FRAMING_ALLOWANCE, output_tokens


def receipt_details(run: Run, tool: str) -> list[str]:
    return [receipt["detail"] for receipt in run["receipts"] if receipt["tool"] == tool and receipt["outcome"] == "passed"]


def inspect_response(
    project: ProjectSnapshot, status: int, result: dict[str, JsonValue], input_limit: int, output_limit: int,
) -> tuple[dict[str, JsonValue], bool]:
    summary: dict[str, JsonValue] = {
        "case": project.root["id"], "httpStatus": status, "structure": "unverified", "editorial": "unavailable",
    }
    error = result.get("error")
    raw_run = result.get("run") if status == 200 else None
    if isinstance(error, dict) and status != 200:
        raw_run = error.get("run")
    if not AGENT_RUN.is_valid(raw_run):
        return summary, False
    run = cast(Run, raw_run)
    summary["calls"] = run["calls"]
    if (
        run["calls"] != 1 or run["mode"] != "live" or run["stage"] != "candidates"
        or run["baseRevision"] != project.narrative_data["revision"] or run["repairAttempts"] != 0
        or receipt_details(run, "provider_config") != [f"provider=openai model={MODEL}"]
        or run["status"] != ("proposed" if status == 200 else "failed")
    ):
        return summary, False
    if "durationMs" in run:
        summary["durationMs"] = run["durationMs"]
    if "tokens" in run:
        summary["tokens"] = run["tokens"]
    resolved_models = receipt_details(run, "provider_model")
    priced_model = not resolved_models or resolved_models == [f"model={MODEL}"]
    if not priced_model:
        summary["pricing"] = "unpriced_model"
        if len(resolved_models) == 1 and re.fullmatch(r"model=gpt-6\.2-sol-[0-9]{4}-[0-9]{2}-[0-9]{2}", resolved_models[0]):
            summary["resolvedModel"] = resolved_models[0].removeprefix("model=")
    usage = receipt_details(run, "provider_usage")
    if usage or "tokens" in run:
        counts = re.fullmatch(
            r"inputTokens=([0-9]{1,7}) cachedInputTokens=([0-9]{1,7}) outputTokens=([0-9]{1,7})", usage[0],
        ) if len(usage) == 1 else None
        if counts is None:
            return summary, False
        input_tokens, cached_tokens, output_tokens = map(int, counts.groups())
        if cached_tokens > input_tokens or run.get("tokens") != input_tokens + output_tokens:
            return summary, False
        summary.update(inputTokens=input_tokens, cachedInputTokens=cached_tokens, outputTokens=output_tokens)
        if input_tokens > input_limit or output_tokens > output_limit:
            return summary, False
        if priced_model:
            estimated = (
                (input_tokens - cached_tokens) * INPUT_RATE + cached_tokens * CACHE_READ_RATE + output_tokens * OUTPUT_RATE
            ) / PER_MILLION
            summary["estimatedStandardTokenCostUsd"] = f"{estimated:.6f}"
    if status != 200:
        if any(receipt["tool"] == "check_candidates" and receipt["outcome"] == "failed" for receipt in run["receipts"]):
            summary["structure"] = "failed"
        return summary, priced_model and status in {422, 502} and summary["structure"] == "failed"
    try:
        candidates = parse_candidates(
            json.dumps({"candidates": result.get("candidates"), "factConflicts": []}, ensure_ascii=False),
            project.narrative_data,
        )
    except CandidateResponseError:
        summary["structure"] = "failed"
        return summary, False
    if result.get("baseRevision") != run["baseRevision"] or not receipt_details(run, "check_candidates"):
        return summary, False
    summary.update(candidates=len(candidates), structure="passed", editorial="pending")
    return summary, priced_model and bool(usage)


def execute(port: int, projects: tuple[ProjectSnapshot, ...]) -> int:
    count, budget = configured_budget()
    input_limit, output_limit = live_limits(port)
    reserve_per_call = (input_limit * RESERVE_INPUT_RATE + output_limit * OUTPUT_RATE) / PER_MILLION
    if budget < count * reserve_per_call:
        raise CampaignBlocked(f"The campaign needs a conservative estimated reserve of USD {count * reserve_per_call:.6f}.")
    print(json.dumps({"model": MODEL, "plannedCases": count, "estimatedReservePerCallUsd": f"{reserve_per_call:.6f}"}), flush=True)
    passed = 0
    for index, case in enumerate(projects[:count], start=1):
        if budget < index * reserve_per_call:
            raise CampaignBlocked("The remaining estimated campaign budget cannot reserve a call.")
        started = monotonic()
        try:
            status, response = request_json(port, "/api/candidates", case.model_dump_json().encode())
        except CampaignBlocked:
            print(json.dumps({
                "case": case.root["id"], "structure": "unverified", "editorial": "unavailable",
                "loopbackElapsedMs": round((monotonic() - started) * 1000),
            }), flush=True)
            raise
        loopback_elapsed_ms = round((monotonic() - started) * 1000)
        summary, proceed = inspect_response(case, status, response, input_limit, output_limit)
        summary["loopbackElapsedMs"] = loopback_elapsed_ms
        print(json.dumps(summary), flush=True)
        passed += summary["structure"] == "passed"
        if not proceed:
            raise CampaignBlocked("The run failed or exceeded its safe evidence assumptions. The campaign stopped without retrying.")
    return 0 if passed == count else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        allow_abbrev=False,
        description=__doc__,
        epilog=(
            f"{RUBRIC} Execution requires owner approval and WORLDWEAVER_LIVE_VERIFY_MAX_CALLS (1-3) plus "
            "WORLDWEAVER_LIVE_VERIFY_BUDGET_USD. The reserve uses the configured input byte ceiling, a fixed framing "
            "allowance and the output token ceiling. This is a Standard-tier estimate with uncertain token framing "
            "and billing adjustments."
        ),
    )
    actions = parser.add_mutually_exclusive_group(required=True)
    actions.add_argument("--dry-run", action="store_true", help="Validate synthetic inputs offline and print counts.")
    actions.add_argument("--execute", action="store_true", help="Send one request per selected synthetic case to an approved live app.")
    parser.add_argument("--port", type=int, default=8000, help="Loopback app port (default 8000).")
    args = parser.parse_args(argv)
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535.")
    try:
        projects = campaign_projects()
    except ValidationError:
        print("A synthetic case failed canonical project validation.", file=sys.stderr)
        return 1
    if args.dry_run:
        data = [case.narrative_data for case in projects]
        print(json.dumps({
            "projects": len(data),
            "fragments": sum(len(case["userContent"]) for case in data),
            "pinnedFacts": sum(len(case["canonicalFacts"]) for case in data),
            "exclusions": sum(entry["treatment"] == "excluded" for case in data for entry in case["userContent"]),
            "liveCalls": 0,
        }))
        return 0
    try:
        return execute(args.port, projects)
    except CampaignBlocked as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
