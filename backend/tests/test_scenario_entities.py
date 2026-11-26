"""Synthetic Korean provider replies at the full scenario boundary."""
import json
from copy import deepcopy
from unicodedata import normalize

import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from backend.app.settings import Settings
from backend.tests.test_scenario import SETTINGS, project, standard_project


@pytest.fixture
def korean_reply():
    chapters = [
        {"id": key, "title": name, "purpose": purpose, "summary": summary}
        for key, name, purpose, summary in [
            ("mill", "갈대 방앗간", "삭제된 행을 확인한다.", "장부의 흔적에서 지난 홍수의 날짜를 찾는다."),
            ("levee", "수문의 증인", "물자의 배급 기록을 대조한다.", "수위 표시와 야간 배급량이 일치한다."),
            ("council", "의회의 표결", "증인의 공개 범위를 정한다.", "이름을 밝힐 때와 봉인할 때의 비용을 비교한다."),
        ]
    ]
    nodes, edges, quests = [], [], []
    cast, factions = ["ch-iven", "witness"], ["f-wards", "relief"]
    def node(key, kind, chapter, place, title=None, description=None, optional=False):
        prose = None if title is None else dict(title=title, description=description, purpose=None, outcome=None)
        nodes.append(dict(id=key, kind=kind, chapterId=chapter, locationId=place, mandatory=not optional,
                          characterIds=cast, factionIds=factions, prose=prose, rules=None))

    def rules(*, conditions=(), consequences=(), visited=()):
        return dict(conditions=list(conditions), consequences=list(consequences), requiresVisited=list(visited))

    def term(kind, key, value):
        return dict(kind=kind, key=key, value=value)

    def edge(start, end, label, traversal=None):
        edges.append({"from": start, "to": end, "kind": "progression", "label": label, "travel": "none", "rules": traversal})

    item, heard = term("item", "ledger", "복원됨"), term("flag", "testified", "증언함")
    ally, person = term("relationship", "relief", "협력"), term("character", "witness", "동의")
    place = term("location", "archive", "개방")
    decision = term("decision", "disclosure", "봉인")
    node("start", "prologue", "mill", "l-mill", "긁힌 줄", "이벤이 물에 젖은 장부를 펼친다.")
    node("recover", "quest", "mill", "l-mill")
    nodes[-1]["rules"] = rules(consequences=[item])
    node("flood", "chapter", "levee", "l-gate")
    node("listen", "quest", "levee", "l-gate", optional=True)
    nodes[-1]["rules"] = rules(consequences=[heard, ally, person, place])
    node("vote", "choice", "council", "archive", "누구의 이름을 남길까?", "구호회는 증인의 동의가 있어야 명부를 봉인한다.")
    node("public", "ending", "council", "l-hall", optional=True)
    node("sealed", "ending", "council", "archive", optional=True)
    edge("start", "recover", "방앗간 장부를 조사한다.")
    edge("recover", "flood", "수문으로 이동한다.", rules(conditions=[item, term("quest", "salvage", "completed")]))
    edge("flood", "vote", "기록만 가지고 의회로 간다.")
    edge("flood", "listen", "수문지기를 만나 공개 범위를 논의한다.")
    edge("listen", "vote", "증인의 동의서를 지참한다.", rules(conditions=[ally, person, place], consequences=[decision]))
    edge("vote", "public", "실명을 공개하고 배급권을 되찾는다.")
    edge("vote", "sealed", "신원을 봉인하고 익명 배급을 확보한다.", rules(conditions=[heard, decision], visited=["listen"]))
    quests.append(dict(id="salvage", nodeId="recover", kind="main", objective="배급 명부를 복원한다.",
                       description="종이를 말려 지워진 이름을 읽는다.", outcome="주민 수가 드러난다.", title=None,
                       reward=None, participants=None, rules=dict(prerequisiteIds=[], completion=[item], failure=[])))
    quests.append(dict(id="consent", nodeId="listen", kind="side", objective="수문지기의 증언을 확보한다.",
                       description="누가 열람할지 설명하고 서명을 받는다.", outcome="봉인 명부를 제출할 수 있다.", title=None,
                       reward=None, participants=dict(characterIds=cast, factionIds=factions, locationIds=["l-gate", "archive"]),
                       rules=dict(prerequisiteIds=["salvage"], completion=[heard], failure=[term("character", "witness", "거부")])))
    return dict(title="사라진 구역", summary="배급 명부를 복원하고 증인의 신원을 어디까지 밝힐지 정한다.",
                chapters=chapters, characters=[dict(id="witness", name="연주", role="수문지기", factionId="relief")],
                factions=[dict(id="relief", name="야간 구호회", aim="홍수 전 모든 구역에 배급을 마친다.")],
                locations=[dict(id="archive", name="봉인 문서고", kind="landmark", purpose="증인의 이름을 따로 보관한다.")],
                stateEntities=[dict(id=key, kind=kind, name=name) for key, kind, name in
                               [("ledger", "item", "배급 장부"), ("disclosure", "decision", "공개 범위"), ("testified", "flag", "증언 확보")]],
                geography=[{"from": "l-gate", "to": "archive", "relation": "travel", "description": "수문에서 문서고로 향한다."}],
                nodes=nodes, edges=edges, quests=quests,
                endings=[dict(nodeId="public", consequence="명부가 복원되지만 증인의 이름도 공개된다."),
                         dict(nodeId="sealed", consequence="증인을 보호하고 다음 배급 때 익명 감사를 받는다.")], factConflicts=[])


def submit(project, reply):
    class Provider:
        async def generate(self, request):
            self.context = request.context
            return json.dumps(reply, ensure_ascii=False)

    adapter = Provider()
    client = TestClient(create_app(Settings(), adapter))
    response = client.post("/api/scenario", json=dict(project=project, settings={**SETTINGS, "chapterCount": 3, "scale": "standard"}))
    return response, adapter.context, client


def test_korean_branch_resolves_every_typed_alias(project, korean_reply):
    project = standard_project(project, "ko")
    original = deepcopy(project)
    response, context, client = submit(project, korean_reply)
    assert response.status_code == 200, response.text
    proposal = response.json()
    assert proposal["run"]["calls"] == 1
    design, additions = proposal["design"], proposal["additions"]
    assert project == original
    witness, faction = additions["characters"][0], additions["factions"][0]
    assert witness["factionId"] == faction["id"] != "relief"
    assert design["nodes"][0]["characterIds"] == ["ch-iven", witness["id"]]
    assert design["quests"][1]["factionIds"] == ["f-wards", faction["id"]]
    state_ids = {s["kind"]: s["id"] for s in additions["stateEntities"]}
    place = design["scenario"]["locations"][0]["id"]
    assert design["quests"][1]["locationIds"] == ["l-gate", place]
    assert design["scenario"]["geography"][0]["to"] == place
    keys = {t["kind"]: t["key"] for row in [*design["nodes"], *design["edges"], *design["quests"]]
            for field in ("conditions", "consequences", "completion", "failure") for t in row.get(field, [])}
    assert keys == {**state_ids, "character": witness["id"], "relationship": faction["id"],
                    "location": place, "quest": design["quests"][0]["id"]}
    assert set(keys.values()).isdisjoint({"witness", "relief", "archive", "salvage", "ledger", "disclosure", "testified"})
    assert design["quests"][1]["prerequisiteIds"] == [design["quests"][0]["id"]]
    effective = {**project, **design, **{k: [*project.get(k, []), *rows] for k, rows in additions.items()}}
    result = client.post("/api/scenario/validate", json=effective).json()
    assert result["valid"] and result["complete"] and len(result["paths"]) == 2
    assert len(design["scenario"]["chapters"]) == 3
    assert set(context["inventory"]) >= {"characters", "factions", "locations", "quests", "items", "decisions", "flags"}


@pytest.mark.parametrize("problem", ["wrong-kind", "undeclared", "old-quest", "alias-collision", "overwrite", "same-name"])
def test_invalid_entity_proposal_has_no_accepted_design(project, korean_reply, problem):
    if problem == "wrong-kind":
        korean_reply["nodes"][1]["rules"]["consequences"][0]["key"] = "testified"
    elif problem == "undeclared":
        korean_reply["nodes"][1]["rules"]["consequences"][0]["key"] = "orphan"
    elif problem == "old-quest":
        korean_reply["quests"][1]["rules"]["prerequisiteIds"] = [project["quests"][0]["id"]]
    elif problem == "alias-collision":
        korean_reply["characters"][0]["id"] = "relief"
    elif problem == "overwrite":
        korean_reply["characters"][0]["id"] = project["characters"][0]["id"]
    else:
        korean_reply["characters"][0]["name"] = "unused-alias"
        korean_reply["nodes"][0]["characterIds"] = ["unused-alias"]
    original = deepcopy(project)
    response, _, _ = submit(project, korean_reply)
    assert response.status_code == 502
    assert "design" not in response.json() and response.json()["error"]["run"]["calls"] == 1
    if problem not in {"alias-collision", "overwrite"}:
        assert response.json()["error"]["code"] == "invalid_scenario"
        assert any(f["rule"] == "reference" for f in response.json()["error"]["findings"])
    assert project == original


@pytest.mark.parametrize("group", ["characters", "factions", "locations", "stateEntities"])
@pytest.mark.parametrize("existing", [False, True])
def test_duplicate_declarations_require_review(project, korean_reply, group, existing):
    row = korean_reply[group][0]
    if existing:
        if group == "locations":
            row["name"] = project["world"]["locations"][0]["name"]
        elif group == "stateEntities":
            project[group] = [{**row, "id": "existing-ledger"}]
        else:
            row["name"] = project[group][0]["name"]
    else:
        korean_reply[group].append({**row, "id": "second-declaration"})
    response, _, _ = submit(project, korean_reply)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "invalid_scenario_response"
    assert "recovery" not in response.json()["error"]


def test_legacy_state_available_by_exact_id_and_kept_out_of_additions(project, korean_reply):
    old = dict(kind="item", key="existing-ledger", value="복원됨")
    project["nodes"][0]["consequences"] = [old]
    korean_reply["stateEntities"].pop(0)
    korean_reply["nodes"][1]["rules"]["consequences"] = [old]
    korean_reply["edges"][1]["rules"]["conditions"][0] = old
    korean_reply["quests"][0]["rules"]["completion"] = [old]
    response, context, _ = submit(project, korean_reply)
    assert response.status_code == 200, response.text
    assert {"id": "existing-ledger", "name": "existing-ledger"} in context["inventory"]["items"]
    assert all(row["id"] != "existing-ledger" for row in response.json()["additions"]["stateEntities"])
    assert response.json()["design"]["quests"][0]["completion"] == [old]
    assert "stateEntities" not in project


def test_normalized_korean_duplicate_is_refused_with_its_field(project, korean_reply):
    witness = korean_reply["characters"][0]
    korean_reply["characters"].append({**witness, "id": "another", "name": " " + normalize("NFD", witness["name"])})
    response, _, _ = submit(project, korean_reply)
    assert response.status_code == 502
    assert "/characters/1/name" in response.json()["error"]["message"]


def test_korean_missing_participants_guards_and_effects_are_recoverable(project, korean_reply):
    original = deepcopy(project)
    korean_reply["nodes"][0]["characterIds"] = ["absent-witness"]
    korean_reply["quests"][1]["participants"]["factionIds"] = ["absent-relief"]
    missing_ledger = dict(kind="item", key="absent-ledger", value="복원됨")
    korean_reply["nodes"][1]["rules"]["consequences"][0] = missing_ledger
    korean_reply["edges"][1]["rules"]["conditions"][0] = missing_ledger
    response, _, _ = submit(project, korean_reply)
    assert response.status_code == 502
    error = response.json()["error"]
    assert error["run"]["calls"] == 1 and error["run"]["status"] == "failed"
    assert [(f["fieldPath"], f["referenceId"], f["expectedType"]) for f in error["findings"]] == [
        ("/nodes/0/characterIds/0", "absent-witness", "character"),
        ("/quests/1/factionIds/0", "absent-relief", "faction"),
        ("/nodes/1/consequences/0/key", "absent-ledger", "item"),
        ("/edges/1/conditions/0/key", "absent-ledger", "item"),
    ]
    recovery = error["recovery"]
    assert set(recovery) == {"baseRevision", "design", "additions"}
    assert recovery["baseRevision"] == original["revision"] and not recovery["design"]["scenario"]["approved"]
    assert set(recovery["additions"]) == {"characters", "factions", "stateEntities"}
    assert project == original


def test_geographic_reference_failure_has_no_editable_recovery(project, korean_reply):
    korean_reply["geography"][0]["to"] = "missing-place"
    response, _, _ = submit(project, korean_reply)
    assert response.status_code == 502
    assert "recovery" not in response.json()["error"]
