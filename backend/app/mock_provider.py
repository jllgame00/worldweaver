import json

from .mock_scenario import mock_scenario
from .provider import GenerationRequest


DIRECTIONS = (
    (
        "The Open Record",
        "Tense and investigative",
        "An archivist must decide whether to publish evidence that could bring down the people keeping the settlement alive.",
        "Exposure can force reform, but witnesses lose the protection of secrecy.",
        "The archivist wants to return control of the record to the people it governs.",
        "A council controlling access to public records.",
        ["Find the missing testimony.", "Decide whether to publish with the names attached.", "Face the council's response in public."],
        ["Publishing wins an inquiry and exposes the witnesses.", "Holding the record back protects the witnesses and preserves the council's power."],
    ),
    (
        "The Last Gate",
        "Urgent and intimate",
        "A caretaker must decide which passage to close before a cascading failure hits the settlements.",
        "Keeping the main gate open protects a refuge while endangering those downstream.",
        "The caretaker wants to get an isolated household out before the next surge.",
        "A failing mechanism and an evacuation plan that cannot reach everyone in time.",
        ["Inspect the vulnerable route.", "Choose where to send the rescue crew.", "Close a passage before the surge arrives."],
        ["The refuge survives at the cost of abandoning the lower crossing.", "Closing the main gate saves the crossing and forces the refuge to relocate."],
    ),
    (
        "An Uneasy Charter",
        "Measured and political",
        "A mediator must build a new charter while two rivals threaten to leave the exchange network.",
        "Binding arbitration prevents open conflict but cedes local control of future disputes.",
        "The mediator wants independent settlements to keep trading without taking sides.",
        "Rival delegates bargaining for control over passage and supplies.",
        ["Hear the delegates' minimum terms.", "Choose a binding charter or a reversible truce.", "Return to the settlements to explain the concessions."],
        ["A charter keeps the network open and gives an arbiter the deciding vote.", "A truce preserves autonomy and leaves passage vulnerable to the next dispute."],
    ),
)


class MockProvider:
    async def generate(self, request: GenerationRequest) -> str:
        if request.context is not None and request.task == "scenario":
            return json.dumps(mock_scenario(request.context), ensure_ascii=False)
        if request.context is not None and request.task == "revision":
            context = request.context
            text = context["target"][context["field"]] + "\n" + context["instructions"]
            if context["field"] == "summary":
                story = context["narrative"]["story"]
                text += "\n" + "\n".join([*story["progression"], story["possibleEndings"][0]])
            return json.dumps({"text": text, "factConflicts": []}, ensure_ascii=False)
        genre = next(
            (item["text"] for item in request.content if item["category"] == "genre" and item["treatment"] != "excluded"),
            "Narrative adventure",
        )
        context = "\n".join(item["text"] for item in request.content if item["treatment"] != "excluded")
        candidates = []
        for index, direction in enumerate(DIRECTIONS, 1):
            title, tone, premise, conflict, motivation, opposition, progression, endings = direction
            coverage = [
                {
                    "contentId": item["id"],
                    "disposition": "excluded" if item["treatment"] == "excluded" else "incorporated",
                    "reason": (
                        "Acknowledged as excluded from the direction."
                        if item["treatment"] == "excluded"
                        else "Supplied as context in the world background for editorial review."
                    ),
                }
                for item in request.content
            ]
            background = "The settlement is held together by routes, shared obligations and contested records."
            if context:
                background = f"{background}\n\nDesigner context\n{context}"
            candidates.append({
                "id": f"direction-{index}",
                "story": {
                    "title": title, "genre": genre, "tone": tone, "premise": premise,
                    "conflict": conflict, "motivation": motivation, "opposition": opposition,
                    "background": background, "progression": progression, "possibleEndings": endings,
                },
                "coverage": coverage,
            })
        return json.dumps({"candidates": candidates, "factConflicts": []}, ensure_ascii=False)
