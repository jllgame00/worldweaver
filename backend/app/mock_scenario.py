import re
from typing import Any


def mock_scenario(data: dict[str, Any]) -> dict:
    story = data["narrative"]["story"]
    settings = data["settings"]
    korean = bool(re.search(r"[가-힣]", story["title"] + story["premise"]))
    def phrase(english: str, hangul: str) -> str:
        return hangul if korean else english

    chapters = []
    nodes = []
    edges = []
    quests = []
    endings = []
    inventory = data["inventory"]
    places = inventory["locations"]
    locations = []
    names = iter(row["text"] for row in data["userContent"] if row["category"] == "location" and row["treatment"] != "excluded")
    for index, (name, purpose) in enumerate([
        (phrase("Meeting place", "만남의 장소"), story["background"]),
        (phrase("Decision site", "결정의 장소"), story["conflict"]),
    ]):
        if len(places) + len(locations) <= index:
            locations.append({"id": f"place-{index}", "name": next(names, name), "purpose": purpose, "kind": "landmark"})
    place_ids = [place["id"] for place in [*places, *locations]]
    cast = [row["id"] for row in inventory["characters"][:2]]
    factions = [row["id"] for row in inventory["factions"][:1]]
    testimony_name = phrase("Witness testimony", "증인의 증언")
    testimony = next((row["id"] for row in inventory["flags"] if row["name"] == testimony_name), None)
    state_entities = []
    if settings["sideQuests"] == "some" and testimony is None:
        reserved = {row["id"] for rows in inventory.values() for row in rows}
        testimony = "testimony"
        while testimony in reserved:
            testimony += "-new"
        state_entities.append({"id": testimony, "kind": "flag", "name": testimony_name})
    for i in range(settings["chapterCount"]):
        beat = story["progression"][min(i, len(story["progression"]) - 1)]
        chapters.append({"id": f"act-{i}", "title": beat, "summary": beat, "purpose": story["motivation"]})

    def node(kind, chapter, title=None, description=None, *, mandatory=True, rules=None):
        key = f"scene-{len(nodes)}"
        prose = None if title is None else {
            "title": title, "description": description, "purpose": None, "outcome": None,
        }
        nodes.append({"id": key, "kind": kind, "prose": prose,
                      "chapterId": chapters[chapter]["id"], "locationId": place_ids[chapter % len(place_ids)],
                      "mandatory": mandatory, "characterIds": cast, "factionIds": factions,
                      "rules": rules})
        return key

    def edge(start, end, label, kind="progression", rules=None):
        edges.append({"from": start, "to": end, "label": label, "kind": kind, "travel": "none", "rules": rules})

    def quest(chapter, kind, objective, outcome):
        prior = [quests[-1]["id"]] if quests and kind == "main" else []
        clue = [{"kind": "flag", "key": testimony, "value": "heard"}] if kind == "side" else []
        key = node("quest", chapter, mandatory=kind == "main",
                   rules={"requiresVisited": [], "conditions": [], "consequences": clue} if clue else None)
        quests.append({"id": f"task-{len(quests)}", "nodeId": key, "kind": kind, "objective": objective,
                       "outcome": outcome, "title": None, "description": story["conflict"], "reward": None,
                       "participants": None, "rules": {"prerequisiteIds": prior, "completion": clue, "failure": []}
                       if prior or clue else None})
        return key

    last = node("prologue", 0, story["title"], story["premise"])
    for i, chapter in enumerate(chapters):
        arrival = node("chapter", i)
        edge(last, arrival, chapter["title"])
        last = arrival
        if i == 0 or settings["mainQuests"] == "strong":
            main = quest(i, "main", chapter["title"], story["progression"][(i + 1) % len(story["progression"])])
            edge(last, main, chapter["title"])
            last = main
        if settings["scale"] == "standard":
            encounter = node("encounter", i, story["opposition"], story["conflict"])
            edge(last, encounter, phrase("Confront the opposition", "반대 세력과 맞서기"))
            last = encounter
    final = len(chapters) - 1
    choice = node("choice", final, story["conflict"], story["motivation"])
    edge(last, choice, phrase("Decide how to act", "행동을 결정하기"))
    reviewed = {"kind": "flag", "key": testimony, "value": "reviewed"}
    if settings["sideQuests"] == "some":
        side = quest(final, "side", phrase("Seek a second account", "다른 증언 찾기"), story["background"])
        edge(last, side, phrase("Investigate first", "먼저 조사하기"), "optional")
        edge(side, choice, phrase("Return with evidence", "증거를 가지고 돌아가기"), rules={
            "requiresVisited": [side], "conditions": [{"kind": "quest", "key": quests[-1]["id"], "value": "completed"}],
            "consequences": [reviewed],
        })
    if settings["branching"] == "branching":
        detour = node("dialogue", final, story["opposition"], story["conflict"], mandatory=False)
        edge(last, detour, phrase("Hear the opposition", "반대 측의 입장 듣기"), "optional")
        edge(detour, choice, phrase("Weigh the testimony", "증언을 비교하기"))
    outcomes = story["possibleEndings"]
    count = 2 if settings["endings"] == "multiple" else 1
    for i in range(count):
        outcome = outcomes[i] if i < len(outcomes) else story["conflict"]
        end = node("ending", final, mandatory=False)
        gated = i > 0 and settings["sideQuests"] == "some"
        edge(choice, end, outcome, rules={"requiresVisited": [], "conditions": [reviewed], "consequences": []}
             if gated else None)
        endings.append({"nodeId": end, "consequence": outcome})
    return {"title": story["title"], "summary": story["premise"], "chapters": chapters,
            "characters": [], "factions": [], "stateEntities": state_entities,
            "locations": locations, "geography": [{"from": place_ids[0], "to": place_ids[1],
                "relation": "travel", "description": phrase("Journey between the opening and decision sites.", "시작 장소와 결정 장소 사이의 여정.")}],
            "nodes": nodes, "edges": edges, "quests": quests, "endings": endings, "factConflicts": []}
