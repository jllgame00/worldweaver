"""State comparisons and quest settlement on one playable branch."""
from collections import defaultdict
from typing import Any, NotRequired, TypedDict


Record = dict[str, Any]
Values = dict[tuple[str, str], str]
QUEST_STATES = {"active", "completed", "failed"}


class BlockedTransition(TypedDict):
    edgeId: NotRequired[str]
    targetId: NotRequired[str]
    fieldPath: str
    kind: str
    key: str
    actual: str | None
    required: str
    producerIds: list[str]


class ScenarioState:
    def __init__(self, project: Record):
        self.quests = {q["id"]: q for q in project["quests"]}
        self.at_node = {q["nodeId"]: q for q in project["quests"]}
        self.paths = {row["id"]: f"/{group}/{i}" for group in ("nodes", "edges", "quests")
                      for i, row in enumerate(project[group])}
        self.names = {row["id"]: row.get("title") or row.get("name") or row.get("label") or row["id"]
                      for rows in (project["nodes"], project["edges"], project.get("stateEntities", []),
                                   project["characters"], project["factions"], project.get("world", {}).get("locations", []),
                                   project.get("scenario", {}).get("locations", [])) for row in rows}
        self.producers: dict[tuple[str, str, str], list[str]] = defaultdict(list)
        for row in [*project["nodes"], *project["edges"]]:
            if row.get("kind") == "reference":
                continue
            for term in row.get("consequences", []):
                ids = self.producers[term["kind"], term["key"], term["value"]]
                if row["id"] not in ids:
                    ids.append(row["id"])
        for q in self.quests.values():
            self.names[q["id"]] = q.get("title") or self.names[q["nodeId"]]
            for status in ("active", "completed", "failed"):
                if status != "failed" or q.get("failure"):
                    ids = self.producers["quest", q["id"], status]
                    if q["nodeId"] not in ids:
                        ids.append(q["nodeId"])

    def label(self, key: str) -> str:
        name = self.names.get(key, key)
        return f"{name} ({key})" if name != key else key

    def blocked(self, path: str, kind: str, key: str, actual: str | None, required: str) -> BlockedTransition:
        producers = [key] if kind == "visited" else self.producers.get((kind, key, required), [])
        return {"fieldPath": path, "kind": kind, "key": key, "actual": actual,
                "required": required, "producerIds": producers}

    def unmet_terms(self, row: Record, field: str, values: Values) -> list[BlockedTransition]:
        unmet = []
        for i, term in enumerate(row.get(field, [])):
            kind, key, required = term["kind"], term["key"], term["value"]
            actual = values.get((kind, key))
            if actual != required:
                unmet.append(self.blocked(f'{self.paths[row["id"]]}/{field}/{i}/value', kind, key, actual, required))
        return unmet

    def blockers(self, row: Record, history: frozenset[str], values: Values) -> list[BlockedTransition]:
        path = self.paths[row["id"]]
        unmet = [self.blocked(f"{path}/requiresVisited/{i}", "visited", key, None, "visited")
                 for i, key in enumerate(row["requiresVisited"]) if key not in history]
        unmet.extend(self.unmet_terms(row, "conditions", values))
        quest = self.at_node.get(row["id"])
        if quest:
            for i, key in enumerate(quest.get("prerequisiteIds", [])):
                actual = values.get(("quest", key))
                if actual != "completed":
                    unmet.append(self.blocked(f'{self.paths[quest["id"]]}/prerequisiteIds/{i}',
                                              "quest", key, actual, "completed"))
        # Explain the unsatisfied authored objective behind an active quest guard.
        for gate in list(unmet):
            if gate["kind"] == "quest" and gate["actual"] == "active" and gate["required"] == "completed":
                unmet.extend(self.unmet_terms(self.quests[gate["key"]], "completion", values))
        return unmet

    def apply(self, row: Record, previous: Values) -> tuple[Values, list[BlockedTransition]]:
        values = previous.copy()
        quest = self.at_node.get(row["id"])
        if quest:
            values.setdefault(("quest", quest["id"]), "active")
        writes = {}
        for i, term in enumerate(row.get("consequences", [])):
            kind, key, value = term["kind"], term["key"], term["value"]
            if kind == "quest":
                writes[key] = (i, value)
            else:
                values[kind, key] = value

        def matches(q: Record, field: str) -> bool:
            return all(values.get((t["kind"], t["key"])) == t["value"] for t in q.get(field, []))

        # Settle simultaneously in rounds. Each round retires active quests, so chains terminate.
        while True:
            updates = {}
            for (kind, key), status in values.items():
                if kind != "quest" or status != "active":
                    continue
                q = self.quests[key]
                explicit = writes.get(key, (None, None))[1]
                if (q.get("failure") or explicit == "failed") and matches(q, "failure"):
                    updates["quest", key] = "failed"
                elif matches(q, "completion"):
                    updates["quest", key] = "completed"
            if not updates:
                break
            values.update(updates)

        invalid = []
        for key, (index, requested) in writes.items():
            # An explicit active assignment at entry is compatible with immediate resolution.
            entered = quest is not None and quest["id"] == key
            before = "active" if entered else previous.get(("quest", key))
            if values.get(("quest", key)) == requested or (requested == "active" and before == "active"):
                continue
            path = f'{self.paths[row["id"]]}/consequences/{index}/value'
            invalid.append(self.blocked(path, "quest", key, values.get(("quest", key)), requested))
            if before == "active" and requested in ("completed", "failed"):
                field = "completion" if requested == "completed" else "failure"
                invalid.extend(self.unmet_terms(self.quests[key], field, values))
        return values, invalid

    def explain(self, blocks: list[BlockedTransition]) -> str:
        parts = []
        previous_edge = None
        for b in blocks:
            if "edgeId" in b and b["edgeId"] != previous_edge:
                parts.append(f'Transition {self.label(b["edgeId"])} to {self.label(b["targetId"])}.')
                previous_edge = b["edgeId"]
            actual = repr(b["actual"]) if b["actual"] is not None else "unset"
            source = ", ".join(self.label(key) for key in b["producerIds"])
            producer = f"Possible source sites include {source}." if source else "No matching source is declared."
            parts.append(f'{self.label(b["key"])} is {actual} and must be {b["required"]!r}. {producer}')
        return " ".join(parts)
