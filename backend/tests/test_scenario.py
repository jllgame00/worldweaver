import json
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.provider import ProviderUnavailable
from backend.app.settings import Settings


SETTINGS = {
    "scale": "short", "chapterCount": 2, "branching": "branching", "mainQuests": "strong",
    "sideQuests": "some", "endings": "multiple", "instructions": "Include an optional investigation.",
}


@pytest.fixture
def project():
    return json.loads((Path(__file__).resolve().parents[2] / "docs/examples/salt-census.json").read_bytes())


@pytest.fixture
def client():
    return TestClient(create_app(Settings()))


def validate(client, project):
    response = client.post("/api/scenario/validate", json=project)
    assert response.status_code == 200
    return response.json()


@pytest.mark.parametrize("problem", ["reference", "cycle", "history", "mandatory", "ending"])
def test_deterministic_failures(client, project, problem):
    if problem == "reference":
        project["edges"][0]["to"] = project["characters"][0]["id"]
    elif problem == "cycle":
        project["nodes"] += [dict(project["nodes"][1], id="x"), dict(project["nodes"][1], id="y")]
        project["edges"] += [dict(project["edges"][1], id="xy", **{"from": "x", "to": "y"}),
                             dict(project["edges"][1], id="yx", **{"from": "y", "to": "x"})]
    elif problem == "history":
        project["edges"][1]["requiresVisited"] = ["n-private"]
    elif problem == "mandatory":
        project["edges"].pop(1)
    else:
        project["edges"] = project["edges"][:-2]
    result = validate(client, project)
    expected = {"reference": "reference", "cycle": "cycle", "history": "dead_end",
                "mandatory": "mandatory_unreachable", "ending": "no_reachable_ending"}[problem]
    assert not result["valid"]
    issue = next(f for f in result["findings"] if f["rule"] == expected)
    assert issue["entityIds"] and issue["suggestedRepair"]
    if problem == "history":
        assert issue["witnessPath"] == ["n-start", "n-gate"]
        assert "n-private" in issue["explanation"]


@pytest.mark.parametrize("change,rule", [("no-start", "prologue"), ("duplicate", "duplicate_id"), ("loop", "self_edge")])
def test_graph_entry_identity_and_self_loop(client, project, change, rule):
    if change == "no-start":
        project["nodes"][0]["kind"] = "event"
    elif change == "duplicate":
        project["nodes"].append(deepcopy(project["nodes"][0]))
    else:
        project["edges"][0]["to"] = project["edges"][0]["from"]
    result = validate(client, project)
    assert not result["valid"] and any(issue["rule"] == rule for issue in result["findings"])


def test_non_playable_reference_to_prologue_does_not_create_progression_cycle(client, project):
    project["edges"].append({**project["edges"][0], "id": "read-backstory", "from": "n-public", "to": "n-start", "kind": "reference"})
    result = validate(client, project)
    assert result["valid"] and result["complete"] and len(result["paths"]) == 2


def test_validation_traces_both_endings(client, project):
    result = validate(client, project)
    assert result["valid"] and result["complete"]
    assert {path["nodeIds"][-1] for path in result["paths"]} == {"n-public", "n-private"}


def test_structured_conditions_check_state_after_effects(client, project):
    key = {"kind": "flag", "key": "seal-broken", "value": "true"}
    project["edges"][1]["conditions"] = [key]
    result = validate(client, project)
    assert any(issue["rule"] == "dead_end" for issue in result["findings"])
    project["nodes"][1]["consequences"] = [key]
    assert validate(client, project)["valid"]


def test_generation_scope_and_revision_preview(client, project):
    original = deepcopy(project)
    response = client.post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == 200, response.text
    proposal = response.json()
    assert proposal["baseRevision"] == project["revision"]
    assert proposal["run"]["mode"] == "mock" and proposal["run"]["calls"] == 1
    design = proposal["design"]
    assert set(design) == {"scenario", "nodes", "edges", "quests", "endings"}
    assert len(design["scenario"]["chapters"]) == 2
    assert design["scenario"]["sourceNarrativeId"] == project["narrative"]["id"]
    draft = {**project, **design}
    assert validate(client, draft)["valid"]
    target = design["nodes"][1]
    revised = client.post("/api/scenario/revise", json={
        "project": draft, "targetId": target["id"], "instructions": "Show the missing witness.",
    })
    assert revised.status_code == 200, revised.text
    result = revised.json()["design"]
    assert result["nodes"][1]["description"] != target["description"]
    result["nodes"][1] = target
    assert result == design
    assert project == original


def test_approval_and_transport_guard(client, project):
    project["narrative"]["approved"] = False
    response = client.post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == 422 and response.json()["error"]["run"]["calls"] == 0
    project["narrative"]["approved"] = True
    project["versions"]["content"] += 1
    response = client.post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == 422 and response.json()["error"]["run"]["calls"] == 0


def test_provider_failure_no_retry_or_leak(project):
    class Offline:
        calls = 0

        async def generate(self, request):
            self.calls += 1
            raise ProviderUnavailable()

    provider = Offline()
    client = TestClient(create_app(Settings(), provider))
    result = client.post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert result.status_code == 503
    assert result.json()["error"]["run"]["calls"] == provider.calls == 1


@pytest.mark.parametrize(("fault", "code"), [
    ("limit", "provider_output_limit"), ("incomplete", "provider_incomplete"),
    ("filter", "provider_content_filter"), ("refusal", "provider_refused"),
    ("timeout", "provider_timeout"), ("malformed", "invalid_provider_response"),
])
def test_failed_live_response_preserves_valid_scenario(project, fault, code):
    import asyncio
    import httpx
    from openai import AsyncOpenAI

    from backend.app.chatkhu_provider import ChatKHUProvider
    from backend.app.mock_provider import MockProvider
    from backend.app.scenario import ScenarioInput, ScenarioRejected, propose
    from backend.tests.test_chatkhu_provider import reply

    calls = []
    config = Settings(provider="chatkhu", model="gpt-6.1-sol")

    def respond(request):
        calls.append(request.url.path)
        if fault == "timeout":
            raise httpx.ReadTimeout("PRIVATE_RESPONSE", request=request)
        payload = reply(project, "responses", text='{"title":"PRIVATE_RESPONSE"')
        if fault in {"limit", "filter", "incomplete"}:
            reason = {"limit": "max_output_tokens", "filter": "content_filter"}.get(fault, "PRIVATE_REASON")
            payload.update(status="incomplete", incomplete_details={"reason": reason})
        if fault == "refusal":
            payload["output"][0]["content"] = [{"type": "refusal", "refusal": "PRIVATE_RESPONSE"}]
        del payload["usage"]["input_tokens_details"]
        payload["usage"]["output_tokens_details"]["reasoning_tokens"] = 19
        return httpx.Response(200, json=payload)

    async def exercise():
        body = ScenarioInput(project=project, settings=SETTINGS)
        valid = await propose(body, MockProvider(), Settings())
        current = ScenarioInput(project={**project, **valid["design"]}, settings=SETTINGS)
        before = deepcopy(current.project.root)
        async with AsyncOpenAI(api_key="test-placeholder", max_retries=0, http_client=httpx.AsyncClient(
            transport=httpx.MockTransport(respond),
        )) as sdk:
            adapter = ChatKHUProvider(sdk, api="responses", max_output_tokens=6000, max_input_bytes=32768)
            with pytest.raises(ScenarioRejected) as failure:
                await propose(current, adapter, config)
        assert current.project.root == before
        error = failure.value
        assert error.code == code
        assert error.run["status"] == "failed" and error.run["calls"] == len(calls) == 1
        assert "PRIVATE_" not in json.dumps(error.run)
        if fault == "timeout":
            assert "tokens" not in error.run
        else:
            assert error.run["tokens"] == 75
            assert {"tool": "provider_usage", "outcome": "passed", "detail": "inputTokens=30 outputTokens=45"} in error.run["receipts"]
            assert {"tool": "provider_reasoning", "outcome": "passed", "detail": "reasoningTokens=19"} in error.run["receipts"]

    asyncio.run(exercise())


def test_live_guard_applies_to_scenario(project):
    class Guard:
        async def generate(self, request):
            pytest.fail("untrusted client reached provider")

    client = TestClient(create_app(Settings(provider="chatkhu", model="test"), Guard()))
    assert client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).status_code == 403

@pytest.mark.parametrize("case,rule", [("parallel", "duplicate_edge"), ("term", "contradictory_condition"),
                                       ("stale", "narrative_source"), ("quest", "mandatory_unreachable")])
def test_additional_design_checks(client, project, case, rule):
    if case == "parallel":
        project["edges"].append(dict(project["edges"][0], id="e-copy"))
    elif case == "term":
        project["nodes"][1]["conditions"] = [
            {"kind": "flag", "key": "gate", "value": value} for value in ("open", "closed")]
    elif case == "stale":
        project["versions"]["content"] += 1
    else:
        project["quests"][0]["prerequisiteIds"] = [project["quests"][0]["id"]]
    report = validate(client, project)
    assert rule in {issue["rule"] for issue in report["findings"]}

@pytest.mark.parametrize("operation", ["bad_json", "mutate", "dangling", "facts"])
def test_invalid_output_is_atomic(project, operation):
    from backend.app.mock_provider import MockProvider

    class Broken:
        async def generate(self, request):
            raw = await MockProvider().generate(request)
            if operation == "bad_json":
                return "private-invalid-output"
            data = json.loads(raw)
            if operation == "mutate":
                data["canonicalFacts"] = []
            elif operation == "dangling":
                data["edges"][0]["to"] = "missing-node"
            else:
                data["factConflicts"] = [project["canonicalFacts"][0]["id"]]
            return json.dumps(data)

    response = TestClient(create_app(Settings(), Broken())).post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == (422 if operation == "facts" else 502)
    assert "design" not in response.json() and response.json()["error"]["run"]["calls"] == 1
    if operation == "dangling":
        assert response.json()["error"]["findings"][0]["rule"] == "reference"
    assert "private-invalid-output" not in response.text


@pytest.mark.parametrize("field,requested,ignored", [("endings", "single", "multiple"), ("sideQuests", "none", "some")])
def test_provider_must_respect_explicit_scope(project, field, requested, ignored):
    from backend.app.mock_provider import MockProvider

    class IgnoredScope:
        async def generate(self, request):
            request.context["settings"][field] = ignored
            return await MockProvider().generate(request)

    response = TestClient(create_app(Settings(), IgnoredScope())).post("/api/scenario", json={
        "project": project, "settings": {**SETTINGS, field: requested},
    })
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_scenario_response"


def test_regenerate_preserves_history_with_findings_on_replaced_nodes(client, project):
    original = client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).json()
    project.update(original["design"])
    project["runs"].append(original["run"])
    project["findings"].append({
        "id": "finding-old", "runId": original["run"]["id"], "rule": "scenario.optional_unreachable",
        "origin": "deterministic", "severity": "warning", "status": "open",
        "entityIds": [project["nodes"][0]["id"]], "explanation": "Previous review.",
        "suggestedRepair": "Review the previous scene.", "checkedRevision": project["revision"],
    })
    replacement = client.post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert replacement.status_code == 200
    assert project["findings"][0]["status"] == "open"


def test_bounded_traversal_reports_incomplete(project):
    from backend.app.scenario_validation import validate_graph
    result = validate_graph(project, budget=1)
    assert not result["valid"] and not result["complete"] and result["statesExplored"] == 1

def test_scoped_revision_rejects_reported_fact_conflict(client, project):
    design = client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).json()["design"]
    project.update(design)

    class Conflict:
        async def generate(self, request):
            return json.dumps({"text": "Replace the objective.", "factConflicts": [project["canonicalFacts"][0]["id"]]})

    result = TestClient(create_app(Settings(), Conflict())).post("/api/scenario/revise", json={
        "project": project, "targetId": design["quests"][0]["id"], "instructions": "Expand the objective.",
    })
    assert result.status_code == 422 and result.json()["error"]["code"] == "fact_conflict"


def test_unreachable_ending_is_error_with_other_reachable_ending(client, project):
    project["edges"].pop()
    report = validate(client, project)
    assert not report["valid"] and report["paths"]
    assert any(f["rule"] == "ending_unreachable" and f["severity"] == "error" for f in report["findings"])


def test_stale_source_can_be_replaced_and_typed_refs_rejected(client, project):
    design = client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).json()["design"]
    project.update(design)
    project["versions"]["narrative"] += 1
    project["scenario"]["sourceNarrativeId"] = "historical"
    assert client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).status_code == 200
    project["nodes"][0]["conditions"] = [{"kind": "relationship", "key": "no-faction", "value": "allied"}]
    issues = validate(client, project)["findings"]
    assert any(f["rule"] == "reference" and "no-faction" in f["entityIds"] for f in issues)


@pytest.mark.parametrize("api", ["responses", "chat_completions"])
def test_scenario_gateway_schema_with_mock_http(project, api, monkeypatch):
    import httpx
    from jsonschema import Draft202012Validator
    from backend.app import main
    from backend.app.mock_scenario import mock_scenario
    from backend.tests.test_chatkhu_provider import reply, loopback

    observed = []
    def respond(request):
        body = json.loads(request.content)
        assert body["store"] is False
        if api == "responses":
            fmt = body["text"]["format"]
            creative = json.loads(body["input"])
        else:
            fmt = body["response_format"]["json_schema"]
            creative = json.loads(body["messages"][1]["content"])
        assert fmt["strict"] is True and fmt["name"] == "worldweaver_scenario"
        result = mock_scenario(creative)
        Draft202012Validator(fmt["schema"]).validate(result)
        observed.append(request.url.path)
        return httpx.Response(200, json=reply(project, api, text=json.dumps(result)))

    def transport(**kwargs):
        return httpx.AsyncClient(transport=httpx.MockTransport(respond), **kwargs)

    monkeypatch.setattr(main, "DefaultAsyncHttpxClient", transport)
    config = Settings(provider="chatkhu", api_key="synthetic", model="gpt-6.1-sol", chatkhu_api=api)
    with loopback(create_app(config)) as gateway:
        response = gateway.post("/api/scenario", json={"project": project, "settings": SETTINGS},
                                headers={"x-worldweaver-generation": config.generation_intent})
    assert response.status_code == 200 and response.json()["run"]["tokens"] == 75
    assert len(observed) == 1

def test_oversize_graph_rejected_before_alias_or_graph_checks(project):
    from backend.app.mock_provider import MockProvider

    class Bloated:
        async def generate(self, request):
            obj = json.loads(await MockProvider().generate(request))
            obj["nodes"] = [dict(obj["nodes"][0], id=f"extra-{i}") for i in range(33)]
            return json.dumps(obj)

    response = TestClient(create_app(Settings(), Bloated())).post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.json()["error"]["code"] == "invalid_scenario_response"
    assert "/nodes" in response.json()["error"]["message"]


def test_revision_context_contains_only_related_cast_places_and_inputs(client, project):
    from backend.app.mock_provider import MockProvider
    design = client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).json()["design"]
    project.update(design)
    project["characters"].append({"id": "unrelated-cast", "name": "Unused", "role": "Unused"})
    project["userContent"].append({"id": "optional-private", "text": "unused", "category": "idea", "treatment": "optional"})
    for candidate in project["storyCandidates"]:
        candidate["coverage"].append({"contentId": "optional-private", "disposition": "unused", "reason": "Not selected"})
    project["scenario"]["contentIds"].append("optional-private")
    seen = []
    class Review:
        async def generate(self, request):
            seen.append(request.context)
            return await MockProvider().generate(request)

    response = TestClient(create_app(Settings(), Review())).post("/api/scenario/revise", json={
        "project": project, "targetId": design["nodes"][1]["id"], "instructions": "Add a sensory detail.",
    })
    assert response.status_code == 200
    assert seen[0]["neighbors"] and seen[0]["canonicalFacts"] == project["canonicalFacts"]
    assert not any(row["id"] == "unrelated-cast" for row in seen[0]["characters"])
    assert not any(row["id"] == "optional-private" for row in seen[0]["userContent"])

def test_wrong_base_reference_reported_by_validator(client, project):
    project["canonicalFacts"][0]["sourceContentId"] = "missing-source"
    report = validate(client, project)
    assert not report["valid"] and report["findings"]


def test_structural_pass_identifies_pending_geography(client, project):
    report = validate(client, project)
    assert report["valid"] and any(f["severity"] == "info" and f["rule"] == "geography_pending" for f in report["findings"])


def test_unfinished_quest_cannot_unlock_followup(client, project):
    first = project["quests"][0]
    first["completion"] = [{"kind": "flag", "key": "has-proof", "value": "yes"}]
    extra = dict(project["nodes"][2], id="followup")
    project["nodes"].append(extra)
    project["quests"].append(dict(first, id="followup-quest", nodeId="followup", prerequisiteIds=[first["id"]], completion=[]))
    project["edges"][2]["to"] = extra["id"]
    project["edges"].append(dict(project["edges"][2], id="e-followup", **{"from": extra["id"], "to": "n-choose"}))
    report = validate(client, project)
    assert not report["valid"] and any(f["rule"] == "dead_end" for f in report["findings"])
    project["nodes"][2]["consequences"] = first["completion"]
    assert validate(client, project)["valid"]


def test_rejoining_branches_keep_independent_condition_histories(client, project):
    condition = {"kind": "flag", "key": "has-proof", "value": "yes"}
    project["nodes"][2]["consequences"] = [condition]
    project["edges"].append(dict(project["edges"][2], id="e-skip", **{"from": "n-gate", "to": "n-choose"}))
    for edge in project["edges"][3:5]:
        edge["conditions"] = [condition]
        edge["requiresVisited"] = []
    report = validate(client, project)
    assert len(report["paths"]) == 2
    assert next(f for f in report["findings"] if f["rule"] == "dead_end")["witnessPath"] == ["n-start", "n-gate", "n-choose"]


def test_approval_needs_chapter_assignment(client, project):
    design = client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).json()["design"]
    project.update(design)
    del project["nodes"][0]["chapterId"]
    report = validate(client, project)
    assert not report["valid"] and any(f["rule"] == "chapter_required" for f in report["findings"])


def test_separating_geography_needs_third_location_and_resolves_alias(client, project):
    from backend.app.mock_provider import MockProvider

    class Barrier:
        async def generate(self, request):
            obj = json.loads(await MockProvider().generate(request))
            obj["locations"].append({"id": "local-forest", "name": "Forest", "kind": "landmark", "purpose": "Travel barrier"})
            obj["geography"][0].update(relation="separates", via="local-forest")
            return json.dumps(obj)

    response = TestClient(create_app(Settings(), Barrier())).post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == 200, response.text
    design = response.json()["design"]
    geography = design["scenario"]["geography"][0]
    assert geography["via"] == design["scenario"]["locations"][0]["id"] != "local-forest"
    project.update(design)
    del geography["via"]
    assert any(f["rule"] == "geography_separates" for f in validate(client, project)["findings"])


def test_world_route_requires_world_location_and_scenario_requires_basis(client, project):
    from pydantic import ValidationError
    from backend.app.contracts import ProjectSnapshot
    design = client.post("/api/scenario", json={"project": project, "settings": SETTINGS}).json()["design"]
    project.update(design)
    project["scenario"]["locations"].append({"id": "proposed-only", "name": "Pass", "kind": "landmark", "purpose": "Retreat"})
    project["world"]["routes"][0]["from"] = "proposed-only"
    with pytest.raises(ValidationError):
        ProjectSnapshot.model_validate(project)
    project["world"]["routes"] = []
    project["basis"].pop("scenario")
    with pytest.raises(ValidationError):
        ProjectSnapshot.model_validate(project)


def test_korean_scenario_uses_named_location_fragment_and_local_labels(client, project):
    project.pop("world")
    project.update(nodes=[], edges=[], quests=[], endings=[], findings=[])
    story = project["narrative"]["story"]
    story.update(title="물의 기록", premise="인물이 섬의 문서를 되찾는다.", motivation="마을을 지킨다.",
                 progression=["기록을 찾는다.", "문을 연다."], possibleEndings=["마을은 증언을 공개한다."])
    entry = {"id": "supplied-port", "category": "location", "treatment": "mandatory", "text": "동백 항구"}
    project["userContent"].append(entry)
    for candidate in project["storyCandidates"]:
        candidate["coverage"].append({"contentId": entry["id"], "disposition": "incorporated", "reason": "Setting"})
    proposal = client.post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert proposal.status_code == 200, proposal.text
    design = proposal.json()["design"]
    assert any(place["name"] == "동백 항구" for place in design["scenario"]["locations"])
    assert any(edge["label"] == "행동을 결정하기" for edge in design["edges"])


def standard_project(project, language):
    if language == "ko":
        project["narrative"]["story"] = {
            "title": "사라진 구역", "genre": "도시 미스터리", "tone": "차분하고 사려 깊은 분위기",
            "premise": "측량사 이벤은 소금에 절은 장부에서 주민들이 살고 있는 구역의 기록이 긁혀 나간 것을 발견한다.",
            "conflict": "명부를 복원해 주민의 권리를 되찾을지, 신원 공개를 두려워하는 증인들을 보호할지 결정해야 한다.",
            "motivation": "이벤은 다음 홍수 전에 사라진 구역의 주민들이 증언할 기회를 마련하겠다고 약속했다.",
            "opposition": "소금 회관의 서기들은 지원 물자를 나누기 전에 주민들의 실명을 공개하라고 요구한다.",
            "background": "각 구역의 의회는 마지막 인구 조사 결과에 따라 소금과 마른 대피소를 배분한다.",
            "progression": ["갈대 방앗간에서 장부를 되찾는다.", "수문에서 홍수 흔적을 대조한다.", "주민을 공식적으로 인정할 조건을 정한다."],
            "possibleEndings": ["소금 회관에 주민 명부를 복원한다.", "봉수대에서 익명의 증인 명부를 보관한다."],
        }
    return project


@pytest.mark.parametrize("language", ["en", "ko"])
def test_standard_compact_proposal(project, language):
    from backend.app.mock_provider import MockProvider

    project = standard_project(project, language)
    observed = []

    class Sample:
        async def generate(self, request):
            raw = await MockProvider().generate(request)
            observed.append(json.loads(raw))
            return raw

    response = TestClient(create_app(Settings(), Sample())).post("/api/scenario", json={
        "project": project, "settings": {**SETTINGS, "scale": "standard", "chapterCount": 3},
    })
    assert response.status_code == 200, response.text
    assert len(observed) == response.json()["run"]["calls"] == 1
    wire = observed[0]
    assert "id" not in wire["edges"][0]  # Only the editor needs a stable edge ID.
    size = len(json.dumps(wire, ensure_ascii=False, separators=(",", ":")).encode("utf-8"))
    old_size = {"en": 12737, "ko": 15907}[language]
    assert size < old_size
    print(f"{language} mock compact JSON UTF-8 bytes: {old_size} -> {size}")
    design = response.json()["design"]
    assert len(design["scenario"]["chapters"]) == 3
    assert len(design["endings"]) == 2
    assert {q["kind"] for q in design["quests"]} == {"main", "side"}
    assert all(edge["id"] for edge in design["edges"])
    assert all(quest["reward"] is None for quest in wire["quests"])
    assert all("reward" not in quest for quest in design["quests"])


def test_compact_branch_rules_survive_expansion(client, project):
    response = client.post("/api/scenario", json={
        "project": project, "settings": {**SETTINGS, "scale": "standard", "chapterCount": 3},
    })
    assert response.status_code == 200
    design = response.json()["design"]
    first, second, third = [q for q in design["quests"] if q["kind"] == "main"]
    assert second["prerequisiteIds"] == [first["id"]]
    assert third["prerequisiteIds"] == [second["id"]]
    side = next(q for q in design["quests"] if q["kind"] == "side")
    clue = side["completion"]
    assert clue and clue == next(n["consequences"] for n in design["nodes"] if n["id"] == side["nodeId"])
    unlock = next(e for e in design["edges"] if e["from"] == side["nodeId"])
    assert unlock["conditions"] == [{"kind": "quest", "key": side["id"], "value": "completed"}]
    assert unlock["requiresVisited"] == [side["nodeId"]]
    assert unlock["consequences"] and len(validate(client, {**project, **design})["paths"]) == 2


def test_explicit_prose_participants_and_failure_conditions_survive(project):
    from backend.app.mock_provider import MockProvider

    cast = project["characters"][0]["id"]
    faction = project["factions"][0]["id"]
    places = [p["id"] for p in project["world"]["locations"][:2]]
    failure = [{"kind": "relationship", "key": faction, "value": "hostile"}]
    participants = {"characterIds": [cast], "factionIds": [faction], "locationIds": places}

    class Authored:
        async def generate(self, request):
            data = json.loads(await MockProvider().generate(request))
            q = data["quests"][0]
            q.update(title="The missing witness", reward="A ferry pass", participants=participants,
                     rules={"prerequisiteIds": [], "completion": [], "failure": failure})
            node = next(n for n in data["nodes"] if n["id"] == q["nodeId"])
            node["prose"] = {"title": "Last crossing", "description": "The ferryman weighs anchor.",
                            "purpose": "Find the witness before the tide.", "outcome": "The ferry leaves."}
            return json.dumps(data)

    response = TestClient(create_app(Settings(), Authored())).post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == 200, response.text
    design = response.json()["design"]
    quest = design["quests"][0]
    node = next(n for n in design["nodes"] if n["id"] == quest["nodeId"])
    assert (quest["title"], quest["reward"], quest["failure"]) == ("The missing witness", "A ferry pass", failure)
    assert {k: quest[k] for k in participants} == participants
    assert (node["title"], node["purpose"], node["outcome"]) == (
        "Last crossing", "Find the witness before the tide.", "The ferry leaves.",
    )


@pytest.mark.parametrize("case", ["missing_text", "unresolved_chapter", "unresolved_quest", "missing_rule_field"])
def test_invalid_compact_links_and_rules_are_atomic(project, case):
    from backend.app.mock_provider import MockProvider

    original = deepcopy(project)

    class Incomplete:
        async def generate(self, request):
            data = json.loads(await MockProvider().generate(request))
            if case == "missing_text":
                data["nodes"][0]["prose"] = None
            elif case == "unresolved_chapter":
                data["nodes"][0]["chapterId"] = "missing"
            elif case == "unresolved_quest":
                data["quests"][0]["nodeId"] = "missing"
            else:
                data["edges"][0]["rules"] = {"conditions": []}
            return json.dumps(data)

    response = TestClient(create_app(Settings(), Incomplete())).post("/api/scenario", json={"project": project, "settings": SETTINGS})
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_scenario_response"
    assert "design" not in response.json() and response.json()["error"]["run"]["calls"] == 1
    assert project == original
