import asyncio
from copy import deepcopy
from dataclasses import dataclass
import json
from time import monotonic
from typing import Literal, cast
from uuid import uuid4

from .contracts import CANDIDATE_VALIDATOR, Candidate, ProjectData, Run, load_unique_json, schema_location, valid_coverage
from .provider import GenerationReply, GenerationRequest, ProviderError, StructuredProvider, record_provider_usage


@dataclass(frozen=True)
class Proposal:
    base_revision: int
    candidates: list[Candidate]
    run: Run


class GenerationRejected(Exception):
    def __init__(self, code: str, run: Run, field: str | None = None):
        super().__init__(code)
        self.code = code
        self.run = run
        self.field = field


class CandidateResponseError(Exception):
    def __init__(self, code: str, field: str | None = None):
        super().__init__(code)
        self.code = code
        self.field = field


def parse_candidates(raw: str, project: ProjectData) -> list[Candidate]:
    if not isinstance(raw, str) or len(raw) > 256_000:
        raise CandidateResponseError("invalid_provider_response")
    try:
        response = load_unique_json(raw)
    except (ValueError, RecursionError):
        raise CandidateResponseError("invalid_provider_response") from None
    if (
        not isinstance(response, dict)
        or response.keys() != {"candidates", "factConflicts"}
        or not isinstance(response["candidates"], list)
        or not isinstance(response["factConflicts"], list)
    ):
        raise CandidateResponseError("invalid_provider_response")

    if len(response["candidates"]) != 3:
        raise CandidateResponseError("candidate_count", "/candidates")
    for index, candidate in enumerate(response["candidates"]):
        error = next(CANDIDATE_VALIDATOR.iter_errors(candidate), None)
        if error is not None:
            raise CandidateResponseError("invalid_provider_response", schema_location(error, "candidates", str(index)))

    candidates = cast(list[Candidate], response["candidates"])
    candidate_ids = {candidate["id"] for candidate in candidates}
    fact_ids = {fact["id"] for fact in project["canonicalFacts"]}
    if len(candidate_ids) != 3:
        raise CandidateResponseError("invalid_provider_response", "/candidates")
    for conflict in response["factConflicts"]:
        if (
            not isinstance(conflict, dict)
            or conflict.keys() != {"candidateId", "factId"}
            or not isinstance(conflict["candidateId"], str)
            or not isinstance(conflict["factId"], str)
            or conflict["candidateId"] not in candidate_ids
            or conflict["factId"] not in fact_ids
        ):
            raise CandidateResponseError("invalid_provider_response", "/factConflicts")

    if response["factConflicts"]:
        raise CandidateResponseError("fact_conflict", "/factConflicts")
    if not valid_coverage(candidates, project["userContent"], fresh=True):
        raise CandidateResponseError("invalid_coverage", "/candidates")
    if len({json.dumps(candidate["story"], sort_keys=True) for candidate in candidates}) != 3:
        raise CandidateResponseError("duplicate_directions", "/candidates")
    return [{**candidate, "id": f"candidate-{uuid4().hex}"} for candidate in candidates]


async def generate(
    project: ProjectData,
    provider: StructuredProvider,
    *,
    mode: Literal["mock", "live"] = "mock",
    model: str = "worldweaver-mock-v1",
    timeout: float = 5,
    max_attempts: int | None = None,
    provider_name: str | None = None,
) -> Proposal:
    started = monotonic()
    attempts = max_attempts if max_attempts is not None else (1 if mode == "live" else 2)
    run: Run = {
        "id": f"run-{uuid4().hex}",
        "stage": "candidates",
        "baseRevision": project["revision"],
        "mode": mode,
        "status": "failed",
        "repairAttempts": 0,
        "calls": 0,
        "receipts": [],
    }

    if provider_name is not None or mode == "live":
        run["receipts"].append({"tool": "provider_config", "outcome": "passed", "detail": f"provider={provider_name or mode} model={model}"})

    def failure(code: str, tool: str, field: str | None = None) -> GenerationRejected:
        run["receipts"].append({"tool": tool, "outcome": "failed", "detail": code})
        run["durationMs"] = round((monotonic() - started) * 1000)
        return GenerationRejected(code, run, field)

    if not project["userContent"]:
        raise failure("empty_content", "check_input")
    required = {(item["category"], item["text"].strip()) for item in project["userContent"] if item["treatment"] == "mandatory"}
    excluded = {(item["category"], item["text"].strip()) for item in project["userContent"] if item["treatment"] == "excluded"}
    if required & excluded:
        raise failure("conflicting_input", "check_input")
    for attempt in range(attempts):
        request = GenerationRequest(model, tuple(deepcopy(project["userContent"])), tuple(deepcopy(project["canonicalFacts"])))
        run["calls"] += 1
        try:
            raw = await asyncio.wait_for(provider.generate(request), timeout=timeout / attempts)
            break
        except (TimeoutError, ProviderError) as exc:
            field = None
            if isinstance(exc, ProviderError):
                code, field = exc.code, exc.field
                record_provider_usage(run, exc.usage, exc.model)
                if not exc.attempted:
                    run["calls"] -= 1
            else:
                code = "provider_timeout"
            if code not in {"provider_timeout", "provider_unavailable"} or attempt == attempts - 1:
                raise failure(code, "generate_structured", field) from None
            run["receipts"].append({"tool": "generate_structured", "outcome": "failed", "detail": code})
        except Exception:
            raise failure("provider_error", "generate_structured") from None

    if isinstance(raw, GenerationReply):
        record_provider_usage(run, raw.usage, raw.model)
        raw = raw.text
    run["receipts"].append({"tool": "generate_structured", "outcome": "passed", "detail": "Response received"})
    try:
        candidates = parse_candidates(raw, project)
    except CandidateResponseError as exc:
        raise failure(exc.code, "check_candidates", exc.field) from None
    run["receipts"].append({"tool": "check_candidates", "outcome": "passed", "detail": "3 candidates passed structure and coverage checks"})
    run["status"] = "proposed"
    run["durationMs"] = round((monotonic() - started) * 1000)
    return Proposal(project["revision"], candidates, run)
