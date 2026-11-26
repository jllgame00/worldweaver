"""Bounded exploration of the playable graph from an empty initial state."""
from collections import defaultdict, deque
from typing import Literal, NotRequired, TypedDict

from .scenario_state import BlockedTransition, Record, ScenarioState, Values


class Finding(TypedDict):
    rule: str
    severity: Literal["error", "warning", "info"]
    entityIds: list[str]
    explanation: str
    suggestedRepair: str
    witnessPath: list[str]
    fieldPath: NotRequired[str]
    referenceId: NotRequired[str]
    expectedType: NotRequired[str]
    actualType: NotRequired[str]
    blockedTransitions: NotRequired[list[BlockedTransition]]
    causeNodeId: NotRequired[str]


class EndingPath(TypedDict):
    endingId: str
    nodeIds: list[str]


class GraphCheck(TypedDict):
    valid: bool
    complete: bool
    findings: list[Finding]
    paths: list[EndingPath]
    statesExplored: int


State = tuple[str, frozenset[str], frozenset[tuple[tuple[str, str], str]]]


def explore(project: Record, nodes: dict[str, Record], outgoing: dict[str, list[Record]],
            node_order: tuple[str, ...], start: str, result: GraphCheck, budget: int) -> None:
    model = ScenarioState(project)
    end_ids = {row["nodeId"]: row["id"] for row in project["endings"]}
    edges = [edge for rows in outgoing.values() for edge in rows]
    needed = {key for row in [*nodes.values(), *edges] for key in row["requiresVisited"]}
    initial: State = (start, frozenset(), frozenset())
    parents: dict[State, State | None] = {initial: None}
    queue = deque([initial])
    reached: dict[str, State] = {}
    side_free: set[str] = set()
    side_ids = {q["id"] for q in model.quests.values() if q.get("kind") == "side"}
    completed: set[str] = set()
    side_free_completed: set[str] = set()
    objectives: dict[str, tuple[State, list[BlockedTransition]]] = {}
    passed: set[str] = set()
    blocked_edges: dict[str, tuple[State, list[BlockedTransition]]] = {}
    roots: dict[str, list[Finding]] = defaultdict(list)
    diagnosed_quests: set[str] = set()

    def witness(state: State | None) -> list[str]:
        path = []
        while state is not None:
            path.append(state[0])
            state = parents[state]
        return path[::-1]

    def report(rule: str, ids: list[str], reason: str, repair: str, state: State | None = None,
               blocks: list[BlockedTransition] | None = None, cause: str | None = None,
               severity: Literal["error", "warning", "info"] = "error") -> Finding:
        issue: Finding = {"rule": rule, "severity": severity, "entityIds": ids, "explanation": reason,
                          "suggestedRepair": repair, "witnessPath": witness(state)}
        if blocks:
            issue.update(blockedTransitions=blocks, fieldPath=blocks[0]["fieldPath"])
            issue["explanation"] += " " + model.explain(blocks)
            missing_effect = next((b for b in blocks if b["kind"] not in ("visited", "quest") and not b["producerIds"]), None)
            if missing_effect:
                name = model.names.get(missing_effect["key"], missing_effect["key"])
                issue["suggestedRepair"] = (
                    f"If this requirement is intended, choose a scene or transition that executes before the check "
                    f"and add a {missing_effect['kind']} consequence setting {name} to {missing_effect['required']!r}."
                )
            diagnosed_quests.update(b["key"] for b in blocks if b["kind"] == "quest" and b["required"] == "completed")
        if cause:
            issue["causeNodeId"] = cause
        result["findings"].append(issue)
        return issue

    def observe(values: Values, state: State) -> None:
        clean = all(("quest", key) not in values for key in side_ids)
        for (kind, key), status in values.items():
            if kind != "quest":
                continue
            if status == "completed":
                completed.add(key)
                if clean:
                    side_free_completed.add(key)
            elif key not in objectives:
                objectives[key] = (state, model.unmet_terms(model.quests[key], "completion", values))

    start_blocks = model.blockers(nodes[start], frozenset(), {})
    if start_blocks:
        queue.clear()
        roots[start].append(report("blocked_start", [start], f"{model.label(start)} has unmet entry requirements.",
                                   "Move this guard to a scene after the required state is supplied.",
                                   blocks=start_blocks))
    while queue:
        state = queue.popleft()
        key, history, old_values = state
        result["statesExplored"] += 1
        if key in needed:
            history = history | {key}
        values, invalid = model.apply(nodes[key], dict(old_values))
        if invalid:
            if not any(f["rule"] == "quest_transition" for f in roots[key]):
                roots[key].append(report("quest_transition", [key], f"{model.label(key)} requests an invalid quest transition.",
                                         "Activate the quest at its quest node and satisfy its objective before a terminal change.",
                                         state, invalid))
            continue
        if key in end_ids and key not in reached:
            result["paths"].append({"endingId": end_ids[key], "nodeIds": witness(state)})
        reached.setdefault(key, state)
        if all(("quest", q) not in values for q in side_ids):
            side_free.add(key)
        observe(values, state)
        available = False
        missing: list[BlockedTransition] = []
        for edge in outgoing.get(key, []):
            dest = edge["to"]
            blocked = model.blockers(edge, history, values)
            if not blocked:
                next_values, invalid = model.apply(edge, values)
                if invalid:
                    if not any(f["rule"] == "quest_transition" and edge["id"] in f["entityIds"] for f in roots[key]):
                        roots[key].append(report("quest_transition", [key, edge["id"]],
                                                 f"{model.label(edge['id'])} requests an invalid quest transition.",
                                                 "Place this effect after quest activation and its required conditions.", state, invalid))
                    blocked = invalid
                else:
                    blocked = model.blockers(nodes[dest], history, next_values)
            if blocked:
                for block in blocked:
                    block.update(edgeId=edge["id"], targetId=dest)
                missing.extend(blocked)
                blocked_edges.setdefault(edge["id"], (state, blocked))
                continue
            available = True
            passed.add(edge["id"])
            observe(next_values, state)
            successor = (dest, history, frozenset(next_values.items()))
            if successor not in parents:
                if len(parents) >= budget:
                    result["complete"] = False
                    report("state_budget", [key], "The feasible-state budget was exhausted.",
                           "Simplify the branch histories and recheck.", state)
                    return
                parents[successor] = state
                queue.append(successor)
        if not available and key not in end_ids and not any(
            f["rule"] in ("dead_end", "quest_transition") and f.get("blockedTransitions", []) == missing for f in roots[key]
        ):
            roots[key].append(report("dead_end", [key], f"{model.label(key)} has no feasible successor.",
                                     "Supply the required state earlier on this path or revise the outgoing guard.",
                                     state, missing))

    # A conditional choice may be unavailable on one visit and available on another.
    for edge in edges:
        key, edge_id = edge["from"], edge["id"]
        if edge_id not in blocked_edges or edge_id in passed:
            continue
        if any(f["rule"] in ("dead_end", "quest_transition") and
               any(b.get("edgeId") == edge_id for b in f.get("blockedTransitions", [])) for f in roots[key]):
            continue
        state, blocks = blocked_edges[edge_id]
        roots[key].append(report("progression_blocked", [key, edge_id, edge["to"]],
                                 f"{model.label(key)} cannot take {model.label(edge_id)} on any reachable path.",
                                 "Supply the condition before this transition or revise its guard.", state, blocks))

    for qid, (state, blocks) in objectives.items():
        if qid not in completed and qid not in diagnosed_quests:
            node_id = model.quests[qid]["nodeId"]
            roots[node_id].append(report("quest_completion_unreachable", [node_id, qid],
                                         f"No reachable path completes {model.label(qid)}.",
                                         "Supply the objective on the active quest's path before failure or an ending.", state, blocks))

    # Attribute a consequence only if every incoming progression proves the same single root.
    incoming: dict[str, list[Record]] = defaultdict(list)
    for edge in edges:
        incoming[edge["to"]].append(edge)
    causes: dict[str, str] = {}
    for key in node_order:
        if key in reached:
            continue
        evidence = set()
        for edge in incoming[key]:
            source = edge["from"]
            if len(roots[source]) == 1 and (edge["id"] in blocked_edges or source not in reached):
                evidence.add(source)
            else:
                evidence.add(causes.get(source))
        if len(evidence) == 1 and None not in evidence:
            causes[key] = next(iter(evidence))
        if key in roots and roots[key]:
            continue
        label = model.label(key)
        if key in end_ids:
            report("ending_unreachable", [key, end_ids[key]], f"No feasible path reaches ending {label}.",
                   "Connect it to a choice with satisfiable conditions.", cause=causes.get(key))
        elif nodes[key]["mandatory"]:
            report("mandatory_unreachable", [key], f"No feasible path reaches mandatory scene {label}.",
                   "Repair its incoming progression or prerequisites.", cause=causes.get(key))
        else:
            report("optional_unreachable", [key], f"No feasible path reaches optional scene {label}.",
                   "Connect it or review its conditions.", cause=causes.get(key), severity="warning")
    if not result["paths"]:
        end_causes = {causes.get(key) for key in end_ids}
        report("no_reachable_ending", [start], "No ending can be reached.", "Connect a feasible progression to an ending.",
               cause=next(iter(end_causes)) if len(end_causes) == 1 else None)

    if side_ids:
        main_nodes = {q["nodeId"] for q in model.quests.values() if q.get("kind") == "main"}
        required = {key for key in reached if (nodes[key]["mandatory"] or key in main_nodes)
                    and key not in end_ids and key not in {model.quests[q]["nodeId"] for q in side_ids}}
        dependent = required - side_free
        dependent.update(q["nodeId"] for q in model.quests.values() if q.get("kind") == "main"
                         and q["id"] in completed - side_free_completed)
        if result["paths"] and not side_free.intersection(end_ids):
            dependent.add(result["paths"][0]["nodeIds"][-1])
        for key in sorted(dependent):
            report("side_quest_required", [key], f"Reaching the main progression at {model.label(key)} requires a side quest.",
                   "Provide a feasible main path that skips optional quests.", reached[key])
