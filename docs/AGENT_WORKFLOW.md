# Runtime workflow

A coding agent reads repository skills while developing WORLDWEAVER. At runtime, four logical responsibilities share one process and may share one provider. The orchestrator calls typed tools, retains tool receipts and controls which changes reach the designer's project.

~~~mermaid
flowchart TD
  I[Content draft] --> N[Generate three candidates]
  N --> S[User selects and edits]
  S -->|Approve narrative| G[Generate candidate graph and location IDs]
  G --> W[Generate world proposal]
  W --> V[Run deterministic checks]
  V -->|Clean| A[User reviews design]
  V -->|Findings| R{Repair budget available?}
  R -->|Yes| P[Propose targeted patch]
  P -->|Major change| H[User reviews diff]
  H -->|Accept in draft| V
  H -->|Decline| U[Unresolved findings]
  P -->|Mechanical change in draft| V
  R -->|No| U
  A -->|Approve current revision| D[Approved design]
  U -->|User edits| V
~~~

## Agent contracts

| Agent | Inputs | Structured output and tool calls |
|---|---|---|
| Narrative | UserContent and read-only CanonicalFact set | Call provider. Parse exactly three StoryCandidates, inspect coverage, conflicts and pairwise decisions/consequences. Return the batch or an actionable error. Selection instantiates an editable Narrative. |
| Scenario | Approved Narrative, reviewed cast, facts and known places | Call provider for proposed nodes, edges, quests, endings and place identities. Allocate stable IDs and resolve response-local aliases in one transaction. Run reference, DAG and feasible progression tools before offering the graph. |
| World | Narrative, scenario location IDs, required travel pairs and seed | Optionally call provider for structured semantic constraints. Preserve existing IDs. Call the deterministic generator, then terrain, route and link validators. Return a proposed World or diagnostics including failed constraints. |
| Verification | Revisioned project or candidate patch, prior findings | Always run appropriate deterministic tools. Optional provider review returns editorial findings with reasons and affected IDs. Propose targeted changes with before/after values, rerun checks and expose unresolved findings. |

## Tool boundary

| Port | Result / failure contract |
|---|---|
| generateStructured(task, schema, data, budget) | JSON, usage, mock/live mode or typed timeout, quota, unavailable or invalid-output error. Data cannot redefine the schema or authorize actions. |
| buildWorld(seed, generatorVersion, requirements) | Geometry and stable location mapping or bounded placement diagnostics. Pure, replayable on normalized inputs. |
| checkProject(snapshot, scope) | Tool receipts and findings with rule, revision, entities and explanation. Validate references, feasible graph progression, geometry and travel as applicable. A skipped or exhausted check cannot return passed. |
| proposeRepair(snapshot, findings, remainingBudget) | Typed allowlisted domain edits with target ID, old value, proposed value, rationale and impact class. A patch is temporary until accepted. |
| applyProposal(baseRevision, patch, approval) | Compare current revision and expected old values, verify allowed ownership, validate a working copy, then atomically replace approved data on acceptance. Otherwise retain the current project. |

## Execution policy

- The UI reflects draft → generating → proposed → review → accepted for an individual stage. It can also show failed, cancelled, stale or unresolved. These are view states over the saved stage, revision and AgentRun. Approving a narrative enables scenario generation. A valid graph with named but unplaced locations enables world generation. Final approval requires current upstream approvals, a verified current design and a user action. Record that final action in Project.approval with the passing run ID and current revision.
- Capture the base revision and immutable input snapshot at start. Use one run ID through all its tool calls. Partial tokens and malformed records never replace a stage. Repeated application of the same proposal yields no second write. A late response after a user edit or cancellation is discarded. Reopening a project with an interrupted running entry marks it cancelled and offers a fresh run.
- **Repair ceiling: two attempts per verification run.** Attempt 1 and attempt 2 each consume budget when a patch is requested, even if malformed or rejected. Rerun relevant tools after each applied draft patch and the full suite before final approval. If a third repair would be needed, return unresolved with the last receipts. A new run requires deliberate user action. Never reset the counter through a nested tool call.
- Only mechanical, non-semantic edits (e.g. normalizing a road path's direction to its declared endpoints) may be applied automatically to a temporary proposal. Changing story meaning, branches, endings, deleting an entity, or replacing designer edits needs a before/after decision. A pinned fact can change only in the direct fact editor. Rejecting a proposal retains the existing design and its open finding.
- Each LLM stage gets one initial call and at most one transient retry inside a total call/token/time budget. A malformed payload returns field errors. Scarce budget, quota errors or a second timeout terminate the stage. For repair work, all provider retries consume the run's call budget and cannot increase the two-patch limit. Set configurable numeric token and timeout caps before enabling live mode. CI uses a mock. Cancel aborts in-flight transport where supported, stops further tool dispatch and ignores late results. An already submitted call may incur usage.
- AgentRun stores stage, base revision, mode, call count, repair count, allowlisted tool receipts and outcome. Optional timing/tokens record measured values only. A clean full check may set verified. An error, missing receipt, stale input, incomplete exploration or unmet approval condition prevents a final approved design. Subjective advice can be acknowledged or declined with its status visible. Log IDs and rule codes without raw story text, keys or prompts.

See the [schema](DATA_SCHEMA.md) for persisted fields and the [TDD plan](TDD_PLAN.md) for adverse cases.

On accepting a repaired design, advance its revision and perform a full check in a new verify run against that revision. This final check has repair disabled. A failure returns unresolved findings. Finalize the verify run before recording the designer's separate approval. Verification and approval metadata leave the design revision unchanged. Imported run IDs start outside the local trust set.
