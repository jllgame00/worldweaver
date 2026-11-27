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

## Phase 2 runtime and approval

A full scenario uses one provider request with SDK retries disabled. The live UI shows the effective scenario output cap and binds it to the request. Unconditional segments omit rule bundles in the provider contract, and common node prose can reuse the related chapter, quest or ending. The service materializes and validates the full canonical design before returning a proposal. Targeted revisions and narrative candidates retain the base output cap. Incomplete envelopes stop before design parsing. Error codes distinguish reported output exhaustion, filtering, unknown interruption, timeout and invalid output. Usage receipts include provider-supplied numeric fields only. [Generation reliability and limits](PHASE_2_1_REPORT.md)

POST /api/scenario takes project and settings. It requires a current approved Narrative, includes its story, source fragments with treatments, locked facts, cast and place identities, and asks the configured adapter for a closed structured response. It allocates stable IDs for response-local aliases, maps references, and applies the same schema and graph tools used for manual validation. The client receives baseRevision, design, additions (new characters, factions and state entities) and run. Neither generation nor revision saves an unreviewed proposal. Failures carry an error and run when available. Rejection, cancellation and late responses preserve the design.

The effective inventory before validation includes existing declarations, promoted legacy state keys and every local declaration in this proposal. Relationships resolve to factions. Character, item, flag, decision, quest and location keys resolve to the corresponding domains. Prior graph quests are context for replacement and must be declared in the new graph before use. For eligible failures, the tab can submit an owner-relinked draft to /api/scenario/validate and review it without calling a provider. [Canonical entity workflow](PHASE_2_2_REPORT.md)

POST /api/scenario/revise takes project, targetId and instructions. The editor requests a node description, quest objective or expanded chapter summary. The adapter receives relevant neighbors, the selected story, locked facts and constraints. Reported canon conflicts reject the response. The service merges only the allowed prose field into a copied design, validates it, and returns the proposed change. The client compares the before and after, restricts the changed fields and checks revision at acceptance. No automatic repair calls occur.

POST /api/scenario/validate returns structural and condition-aware findings. Checks resolve typed references, participation and source coverage, detect duplicate IDs and transitions, validate chapter and quest ownership and enforce a DAG over playable progression and optional edges. Reference edges are annotations. Feasible-path exploration starts with empty state, applies node effects, evaluates quest failure then completion, checks guards, applies edge effects and checks destination prerequisites. A failed or active quest cannot satisfy a completion prerequisite. It returns a witness for each reachable ending or blocked state and stops with an error at 2,048 states. Unreachable optional content can be a warning. Unreachable endings block approval. This model has no external gameplay events or scripts. A structural pass cannot establish canon fidelity, believable motives, physical travel or satisfaction under arbitrary game rules.

Approval requires a successful complete check of the current revision, a current approved source and explicit editorial acknowledgement. Scenario approval is independent of final integrated project verification. Phase 3 consumes current approved scenario metadata and stable location constraints.

Scenario validation submits the saved Project to the deterministic endpoint, even while the detached rejected-proposal store is opening. Saving the result appends an AgentRun and its findings without advancing design versions. The local IndexedDB record holds the checked run ID in the same transaction. Later writes carry that ID forward only for matching source versions, content, canon, registry and scenario design. Layout and approval metadata are independent. Layout undo restores positions only. A failed or incomplete check records an unresolved result and withdraws prior scenario approval. Import starts without local trust, even if the portable JSON includes verified runs. Older unapproved saves require one local validation. No database upgrade or provider request is needed.

## Phase 2.3 progression and rejection

The one-request prompt includes an executable excerpt for an optional inspection that earns an item, returns to a council and unlocks publication. The designer can still adjourn without inspecting. The server allocates stable IDs and compiles declarations, rules and graph connections into the existing Project. It simulates each reachable history before issuing a proposal. A guard cannot earn its own prerequisite. Failures identify the first observable blocked guard in a history and its possible sources. A failed graph never triggers another provider call.

An eligible rejected generation returns the normalized proposal and structured findings. The browser retains the original separately and exposes a detached graph editor. A designer can change the source event, quest objective, prerequisite, edge or destination with the ordinary inspectors and submit the edited graph to `POST /api/scenario/validate`. Successful revalidation creates a deterministic proposal with zero provider calls. The owner compares the edits, accepts the draft, reviews it and explicitly approves the current revision. [Execution order and acceptance boundaries](PHASE_2_3_REPORT.md)

## Procedural geography and approval

Generation starts from approved current sources and normalized typed location/travel requirements. A local deterministic run constructs the grid, then regions, placements and journeys. The UI exposes completed stages and retains the detached proposal even when geography checks block approval. A designer can correct constraints, move a location, reroute or regenerate unlocked placements, and recheck locally. Reconciliation refreshes source stamps and requirements against the current project while keeping manual placements available for review.

The accepted transaction records a world AgentRun with mode deterministic, zero calls, zero repair attempts, the base revision and a validate_atlas receipt. Warnings retain the affected IDs or spatial cell. The owner separately assesses names, story meaning and political relationships before approving. The physical engine has no credential dependency. Phase 4 can inspect the stored source basis and recompute the same structural checks from canonical data. [World approval and recovery](WORLD_GENERATION.md)
