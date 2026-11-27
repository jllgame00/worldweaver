"""Deterministic Scenario Studio checks. Reference links never advance play."""
from collections import Counter, defaultdict
from graphlib import CycleError, TopologicalSorter
from typing import Any, Literal

from pydantic import ValidationError

from .contracts import PROJECT_VALIDATOR, ProjectSnapshot, ReferenceIssue, entity_ids, scenario_references, schema_location
from .scenario_progression import Finding, GraphCheck, explore
from .scenario_state import QUEST_STATES


def reference_finding(owner: str, ref: ReferenceIssue) -> Finding:
    expected = ref["expectedType"]
    detail = f'Found {ref["actualType"]}.' if "actualType" in ref else "The ID is missing."
    return {
        "rule": "reference", "severity": "error", "entityIds": list(dict.fromkeys((owner, ref["referenceId"]))),
        "witnessPath": [], **ref,
        "explanation": f'{ref["fieldPath"]} expects type {expected}. {detail}',
        "suggestedRepair": f"Select a registered {expected} ID for this field.",
    }


STATE_BUDGET = 2048
Record = dict[str, Any]


def approved_source(project: Record) -> bool:
    narrative = project.get("narrative", {})
    versions = project["versions"]
    source = next((row for row in project["storyCandidates"] if row["id"] == narrative.get("sourceCandidateId")), None)
    required = {row["id"] for row in project["userContent"] if row["treatment"] == "mandatory"}
    return bool(narrative.get("approved") and source
                and project["basis"].get("candidates") == {"content": versions["content"]}
                and project["basis"].get("narrative") == {"content": versions["content"], "candidates": versions["candidates"]}
                and not any(row["contentId"] in required and row["disposition"] != "incorporated" for row in source["coverage"]))


def validate_graph(project: Record, *, budget: int = STATE_BUDGET, verification: bool = False) -> GraphCheck:
    result: GraphCheck = {"valid": False, "complete": True, "findings": [], "paths": [], "statesExplored": 0}
    issued = set()

    def report(rule: str, ids: list[str], reason: str, repair: str, path: list[str] | None = None,
               severity: Literal["error", "warning", "info"] = "error") -> None:
        signature = (rule, tuple(ids))
        if signature not in issued:
            issued.add(signature)
            result["findings"].append({"rule": rule, "severity": severity, "entityIds": list(dict.fromkeys(ids)),
                                       "explanation": reason, "suggestedRepair": repair, "witnessPath": path or []})

    issue = next(PROJECT_VALIDATOR.iter_errors(project), None)
    if issue:
        report("structure", [], f"Invalid field at {schema_location(issue)}.", "Restore the required field or select an allowed value.")
        return result
    for identifier, count in Counter(entity_ids(project)).items():
        if count > 1:
            report("duplicate_id", [identifier], "Multiple records have this ID.", "Give each entity its own ID and relink its references.")
    for owner, ref in scenario_references(project):
        result["findings"].append(reference_finding(owner, ref))
    if result["findings"]:
        return result
    # The full verification plan checks cross-domain references and approvals independently.
    if not verification:
        try:
            ProjectSnapshot.model_validate(project)
        except ValidationError:
            report("project_reference", [project["id"]], "The project has inconsistent references, coverage, or version records.", "Review the project source and restore the referenced records.")
    scenario = project.get("scenario")
    if not verification and (not approved_source(project) or (scenario and project["basis"].get("scenario") != {
        key: project["versions"][key] for key in ("content", "narrative")
    })):
        report("narrative_source", [project.get("narrative", project)["id"]], "The scenario needs a current approved narrative.", "Review and approve the upstream narrative and regenerate or review this scenario.")
    if scenario:
        for geography in scenario["geography"]:
            places = {geography["from"], geography["to"]}
            if geography["relation"] == "separates" and (len(places) != 2 or not geography.get("via") or geography["via"] in places):
                report("geography_separates", sorted(places), "A separating feature needs two endpoints and a distinct place between them.", "Select the third location as the barrier.")
        for node in project["nodes"]:
            if not node.get("chapterId"):
                report("chapter_required", [node["id"]], "This node has no chapter.", "Assign the node to a chapter.")
        for field, group in (("factIds", "canonicalFacts"), ("contentIds", "userContent")):
            if set(scenario[field]) != {row["id"] for row in project[group]}:
                report("source_coverage", [scenario["id"]], f"{field} does not account for the source snapshot.", "Review the source and regenerate its traceability.")
        if len({row["nodeId"] for row in scenario["layout"]}) != len(scenario["layout"]):
            report("duplicate_layout", [scenario["id"]], "A node has multiple layout positions.", "Keep one position per node.")
    nodes = {row["id"]: row for row in project["nodes"]}
    edges = [row for row in project["edges"] if row.get("kind") != "reference"]
    outgoing: dict[str, list[Record]] = defaultdict(list)
    for group in ("nodes", "edges", "quests"):
        for i, row in enumerate(project[group]):
            for field in ("conditions", "consequences", "completion", "failure"):
                terms = row.get(field, [])
                if len({(v["kind"], v["key"], v["value"]) for v in terms}) != len({(v["kind"], v["key"]) for v in terms}):
                    report("contradictory_condition", [row["id"]], f"{field} sets incompatible values for the same key.", "Choose one value for this condition or consequence.")
                for j, term in enumerate(terms):
                    if term["kind"] == "quest" and term["value"] not in QUEST_STATES:
                        path = f"/{group}/{i}/{field}/{j}/value"
                        result["findings"].append({
                            "rule": "quest_state_value", "severity": "error", "entityIds": [row["id"], term["key"]],
                            "explanation": f'{path} has unknown quest status {term["value"]!r}.',
                            "suggestedRepair": "Use active, completed or failed.", "fieldPath": path, "witnessPath": [],
                        })
    ordering = TopologicalSorter({key: () for key in nodes})
    seen_edges = set()
    for edge in edges:
        signature = (edge["from"], edge["to"], edge.get("kind", "progression"), edge["label"],
                     frozenset(edge["requiresVisited"]), tuple(sorted(tuple(sorted(x.items())) for x in edge.get("conditions", []))),
                     tuple(sorted(tuple(sorted(x.items())) for x in edge.get("consequences", []))))
        if signature in seen_edges:
            report("duplicate_edge", [edge["id"]], "An identical progression already connects these nodes.", "Remove the duplicate or distinguish its choice and conditions.")
        seen_edges.add(signature)
        outgoing[edge["from"]].append(edge)
        ordering.add(edge["to"], edge["from"])
        if edge["from"] == edge["to"]:
            report("self_edge", [edge["id"]], "The progression returns to its source.", "Choose a different destination.")
        if edge["travel"] == "required" and not all(nodes[edge[key]].get("locationId") for key in ("from", "to")):
            report("travel_location", [edge["id"]], "A required journey has an unnamed endpoint.", "Assign both endpoint locations.")
    try:
        node_order = tuple(ordering.static_order())
    except CycleError as exc:
        report("cycle", exc.args[1], "Progression contains a cycle.", "Remove or redirect an edge in the cycle.")
    prologues = [key for key, node in nodes.items() if node["kind"] == "prologue"]
    if len(prologues) != 1:
        report("prologue", prologues or [project["id"]], "A scenario needs exactly one prologue.", "Choose one starting node.")
    for group, kind in (("quests", "quest"), ("endings", "ending")):
        counts = Counter(row["nodeId"] for row in project[group])
        for key, node in nodes.items():
            if node["kind"] == kind and counts[key] != 1:
                report(f"{kind}_detail", [key], f"This node needs one {kind} record.", "Add or reconcile its details.")
            if kind == "quest" and node["kind"] == kind and (not node.get("locationId") or "objective" in node):
                report("quest_fields", [key], "Quest nodes need a location and keep their objective on the quest.", "Assign a location and edit the quest objective.")
            if kind == "ending" and node["kind"] == kind and outgoing[key]:
                report("ending_successor", [key], "An ending has an outgoing progression.", "Remove its outgoing progression.")
    if result["findings"]:
        return result
    try:
        TopologicalSorter({q["id"]: q.get("prerequisiteIds", []) for q in project["quests"]}).prepare()
    except CycleError as exc:
        cycle = exc.args[1]
        names = {q["id"]: q.get("title") or nodes[q["nodeId"]]["title"] for q in project["quests"]}
        report("quest_prerequisite_cycle", cycle, "Quest prerequisites form a cycle through " + " → ".join(names[q] for q in cycle),
               "Remove the circular prerequisite or move its requirement to a later branch.")
        source = cycle[1]
        index, quest = next((i, q) for i, q in enumerate(project["quests"]) if q["id"] == source)
        result["findings"][-1]["fieldPath"] = f'/quests/{index}/prerequisiteIds/{quest["prerequisiteIds"].index(cycle[0])}'
    passed: set[str] = set()
    explore(project, nodes, outgoing, node_order, prologues[0], result, budget, passed)
    if verification:
        result["feasibleEdgeIds"] = sorted(passed)
    if not result["complete"]:
        return result
    if any(edge["travel"] == "required" for edge in edges) or project.get("scenario", {}).get("geography"):
        report("geography_pending", [], "Physical journeys require verification in the world stage.", "Review placement and routes when the atlas is available.", severity="info")
    report("narrative_review", [], "Story coherence and fidelity to locked facts require editorial review.", "Read each decision, cost and ending against the approved narrative.", severity="info")
    result["valid"] = all(row["severity"] != "error" for row in result["findings"])
    return result
