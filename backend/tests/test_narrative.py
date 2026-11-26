import asyncio
from copy import deepcopy
import json
from pathlib import Path

import pytest

from backend.app.narrative import GenerationRejected, generate
from backend.app.provider import GenerationRequest, ProviderQuota, ProviderUnavailable


class Provider:
    def __init__(self, output):
        self.output = output
        self.requests: list[GenerationRequest] = []

    async def generate(self, request: GenerationRequest) -> str:
        self.requests.append(request)
        if isinstance(self.output, Exception):
            raise self.output
        return self.output if isinstance(self.output, str) else json.dumps(self.output)


@pytest.fixture
def project():
    root = Path(__file__).resolve().parents[2]
    return json.loads((root / "docs/examples/salt-census.json").read_bytes())


@pytest.fixture
def response(project):
    return {"candidates": deepcopy(project["storyCandidates"]), "factConflicts": []}


def assert_rejected(project, provider, code, calls=1):
    original = deepcopy(project)
    with pytest.raises(GenerationRejected) as caught:
        asyncio.run(generate(project, provider))
    assert caught.value.code == code
    assert caught.value.run["status"] == "failed"
    assert caught.value.run["baseRevision"] == project["revision"]
    assert caught.value.run["calls"] == calls
    assert project == original


@pytest.mark.parametrize("count", [2, 4])
def test_n1_rejects_wrong_candidate_count(project, response, count):
    response["candidates"] = (response["candidates"] * 2)[:count]
    assert_rejected(project, Provider(response), "candidate_count")


def test_n1_returns_three_valid_candidates_as_a_proposal(project, response):
    original = deepcopy(project)
    result = asyncio.run(generate(project, Provider(response)))
    assert len(result.candidates) == 3
    assert [entry["story"] for entry in result.candidates] == [
        entry["story"] for entry in response["candidates"]
    ]
    assert result.base_revision == project["revision"]
    assert result.run["status"] == "proposed"
    assert result.run["mode"] == "mock"
    assert result.run["calls"] == 1
    assert result.run["receipts"][-1]["outcome"] == "passed"
    assert not ({c["id"] for c in result.candidates} & {c["id"] for c in original["storyCandidates"]})
    assert project == original


def test_n1_rejects_identical_stories_even_with_distinct_ids(project, response):
    for candidate in response["candidates"][1:]:
        candidate["story"] = deepcopy(response["candidates"][0]["story"])
    assert_rejected(project, Provider(response), "duplicate_directions")


def test_n2_sends_canonical_facts_as_read_only_generation_inputs(project, response):
    project["canonicalFacts"][0]["statement"] = "수문은 해질 때만 열립니다. The date is fixed."
    original = deepcopy(project)
    provider = Provider(response)
    asyncio.run(generate(project, provider))
    assert provider.requests[0].canonical_facts == tuple(original["canonicalFacts"])
    assert project["canonicalFacts"] == original["canonicalFacts"]
    assert project["narrative"] == original["narrative"]


@pytest.mark.parametrize("change", ["missing_mandatory", "incorporated_exclusion"])
def test_n2_rejects_invalid_coverage_for_treatment(project, response, change):
    coverage = response["candidates"][0]["coverage"]
    if change == "missing_mandatory":
        mandatory = next(c["id"] for c in project["userContent"] if c["treatment"] == "mandatory")
        coverage[:] = [entry for entry in coverage if entry["contentId"] != mandatory]
    else:
        excluded = next(c["id"] for c in project["userContent"] if c["treatment"] == "excluded")
        next(entry for entry in coverage if entry["contentId"] == excluded)["disposition"] = "incorporated"
    assert_rejected(project, Provider(response), "invalid_coverage")


def test_n2_provider_reported_fact_conflict_cannot_become_a_proposal(project, response):
    response["factConflicts"] = [{
        "candidateId": response["candidates"][0]["id"],
        "factId": project["canonicalFacts"][0]["id"],
    }]
    assert_rejected(project, Provider(response), "fact_conflict")


def test_n2_exact_include_exclude_conflict_needs_user_resolution(project, response):
    mandatory = next(c for c in project["userContent"] if c["treatment"] == "mandatory")
    excluded = next(c for c in project["userContent"] if c["treatment"] == "excluded")
    excluded["text"] = mandatory["text"]
    excluded["category"] = mandatory["category"]
    assert_rejected(project, Provider(response), "conflicting_input", calls=0)


def test_n2_same_label_in_different_categories_can_generate(project, response):
    mandatory = next(c for c in project["userContent"] if c["treatment"] == "mandatory")
    excluded = next(c for c in project["userContent"] if c["treatment"] == "excluded")
    mandatory.update(category="location", text="Shelter")
    excluded.update(category="mechanic", text="Shelter")
    assert len(asyncio.run(generate(project, Provider(response))).candidates) == 3


@pytest.mark.parametrize("defect,code", [
    ("malformed", "invalid_provider_response"),
    ("unknown_property", "invalid_provider_response"),
    ("unknown_reference", "invalid_coverage"),
    ("missing_field", "invalid_provider_response"),
    ("fact_override", "invalid_provider_response"),
    ("quota", "provider_quota"),
])
def test_n3_bad_responses_preserve_existing_design(project, response, defect, code):
    if defect == "malformed":
        response = '{"candidates":'
    elif defect == "unknown_property":
        response["candidates"][0]["story"]["arbitrary"] = "unexpected"
    elif defect == "unknown_reference":
        response["candidates"][0]["coverage"][0]["contentId"] = "fragment-unknown"
    elif defect == "missing_field":
        del response["candidates"][0]["story"]["conflict"]
    elif defect == "fact_override":
        response["canonicalFacts"] = []
    elif defect == "quota":
        response = ProviderQuota()
    assert_rejected(project, Provider(response), code)


def test_n4_retries_unavailable_only_once(project):
    assert_rejected(project, Provider(ProviderUnavailable()), "provider_unavailable", calls=2)


def test_n4_records_transient_attempt_on_recovered_proposal(project, response):
    class RecoveringProvider(Provider):
        async def generate(self, request: GenerationRequest) -> str:
            if not self.requests:
                self.requests.append(request)
                raise ProviderUnavailable()
            return await super().generate(request)

    result = asyncio.run(generate(project, RecoveringProvider(response)))
    assert result.run["calls"] == 2
    assert [item["outcome"] for item in result.run["receipts"]] == ["failed", "passed", "passed"]
    assert len(result.candidates) == 3


def test_n4_times_out_without_overwriting(project):
    class SlowProvider:
        async def generate(self, request: GenerationRequest) -> str:
            await asyncio.sleep(10)
            return ""

    async def run():
        with pytest.raises(GenerationRejected) as caught:
            await generate(project, SlowProvider(), timeout=0.001)
        return caught.value

    original = deepcopy(project)
    result = asyncio.run(run())
    assert result.code == "provider_timeout"
    assert result.run["calls"] == 2
    assert project == original
