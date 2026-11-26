---
name: narrative-validation
description: Use when story candidates, canonical facts, scenario branches, or their references change in WORLDWEAVER.
---

# Narrative validation

**Inputs.** Take one project revision, the affected user content and canonical facts, the selected narrative or candidate batch, the scenario graph if present, and any proposed edit. Read the [entity contract](../../../docs/DATA_SCHEMA.md) and [agent workflow](../../../docs/AGENT_WORKFLOW.md) for the current stage.

1. Validate the stage's schema and references. For a candidate batch, require three candidates. Account for each mandatory element, optional omission and exclusion. Trace factual claims back to the user's words. Compare the candidates' conflicts, player decisions and possible endings to assess how their directions differ.
2. Check edge endpoints, prerequisites, node kinds and ending references. Traverse from the prologue with the supported conditions. Inspect each reachable branch state for progression to an ending. Record a witness path and unmet condition for a dead end. Check mandatory-node reachability, at least one reachable ending, and absence of cycles.
3. Resolve each location reference by stable ID when the stage requires it. Compare derived reverse lookups to the same project revision. Separate deterministic rule failures from interpretive narrative concerns. For the latter, quote the relevant passage and fact, and explain exactly what needs human review.

**Failure handling.** Preserve the last accepted revision. Record each finding with its source, severity, entity IDs, explanation, proposed repair and status. Keep canonical fact edits and major story changes under user control. Revalidate after an accepted patch. Return open issues when the repair budget is exhausted.

**Evidence and completion.** Record the input revision, checks invoked, counts, affected IDs, witness path or excerpts, and any approval. Report a structural pass only when the applicable checks ran successfully. State which semantic questions remain open and which stage-specific checks are pending.
