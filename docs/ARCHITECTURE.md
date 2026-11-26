# System architecture

Proposed MVP deployment unit: one stateless FastAPI web service. It serves the built React/TypeScript/Vite assets, the API and a health route. A project belongs to the designer's browser. A request carries a snapshot and a base design revision. Approved changes return as validated data.

~~~mermaid
flowchart LR
  subgraph Browser
    UI[Content and narrative editors] --> P[Project store]
    G[React Flow editor] <--> P
    A[SVG atlas] <--> P
    V[Verification and export] <--> P
    P <--> DB[(IndexedDB)]
    P <--> J[Portable JSON]
  end
  P -->|revisioned request| API[FastAPI and Pydantic boundary]
  API --> F[Generation facade]
  F --> S[Narrative and scenario services]
  F --> W[World service]
  F --> T[Verification tools]
  S --> L[LLM adapter]
  W --> L
  W --> E[Seeded geography engine]
  F -->|proposal and tool receipts| P
~~~

## Decisions and tradeoffs

| Decision | Reason and alternative | Revisit when |
|---|---|---|
| One frontend store over a typed Project | Both editors select entity IDs. Reverse event lists and graph widgets are projections. Separate map and story documents would require reconciliation. | Very large projects need partial loading. |
| IndexedDB plus portable JSON | Atomic local writes, offline viewing after opening the app, no user accounts. Browser profiles can be cleared and do not sync. Expose backup/export and quota errors. Compare-and-swap local saves in a single transaction using a storage version token to detect another tab. | Remote collaboration or shared backups justify a service database. SQLite may serve local experiments. Production durability requires provisioned storage. [Render disks](https://render.com/docs/disks) |
| One web service and relative same-origin API | One release version and simpler routing. Serve API and health routes before SPA fallback, keep missing API paths as JSON errors. Split hosting introduces CORS and independent releases. | Separate scaling becomes measurable. |
| React Flow plus SVG atlas | Editable DAG and inspectable geography with the same ID selection. Atlas rendering reads canonical integer geometry. An image-only map cannot answer route queries. Evaluate keyboard behavior with a parallel list view. [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility) | Validate graph editor version, license and accessibility in Phase 2. |
| Server-side Pydantic and generated TypeScript contract | Validate imported and generated JSON before use, keep one schema. Browser domain checks give immediate feedback. Server rechecks untrusted requests. | Select contract-generation tooling in Phase 1. |
| Stateless stage calls | Each stage is bounded and independently retryable. Browser discards late results and persists only accepted snapshots. Server checks cancellation between calls. No worker queue required. | Runtime duration exceeds measured service timeouts. |

## Boundaries and persistence

Planned HTTP surface: POST /api/candidates, /api/scenario, /api/world and /api/verify (including a bounded repair option), plus GET /health. Selection and ordinary edits are local transactions. Return the run ID, base revision, proposed delta and tool evidence. Invalid input returns field-level errors, a provider timeout returns a retryable stage error, and an impossible layout returns explicit unresolved constraints. Health checks need no project or provider. Render Markdown and import/export JSON locally. Save all project entities in one IndexedDB transaction. On conflict offer reopen or export the unsaved copy.

Treat model text as data. Use allowlisted fields, bounded input sizes, schema parsing, escaped text rendering and domain checks before accepting a proposal. Keep keys in server environment variables. Avoid logging prompts, drafts or provider payloads. Rate and token budgets apply before exposing a paid provider on a public endpoint. Select exact caps after measuring fixtures.

## Procedural world pipeline

1. Compile stable location identities and required scenario journeys into constraints. The World Agent can suggest terrain preferences, regions and political control. Drop any model-supplied geometry.
2. Normalize and sort requirements by stable ID. Feed integer seed, generator version and normalized input into a versioned PRNG. Pin traversal order and tie breaks. Use integer grid geometry for portable output.
3. Generate a connected landmass from seeded elevation and an edge falloff, classify ocean and land, grow land regions, then assign mountains and moisture-based biomes. Trace rivers downslope to outlets. Bound placement attempts and report unsatisfied hard constraints.
4. Place settlements and landmarks on compatible cells. Route roads over traversable cells with deterministic shortest paths. Explicit sea lanes require ports. Validate each required journey implied by a feasible branch. Terrain or route edits rerun physical and narrative-link checks.
5. Derive coastlines from land/ocean boundaries, draw terrain, rivers, territories, roads and selectable place markers in SVG. Persist grid, geometry, generator version and seed so a later engine upgrade still opens an old design. Regeneration previews proposed changes.

## Course patterns

| Pattern and problem | Participants and benefit | Cost and decision |
|---|---|---|
| Adapter: providers differ in payload and error shape | Narrative, Scenario and World services call a structured-provider port. Mock and one future live adapter normalize JSON, usage and failures. | One port is enough. Defer a provider registry until there is a second live integration. |
| Façade: generation must coordinate validation, budgets and approval | Stage endpoints call a workflow facade over domain services. Editors receive proposals, revision checks and receipts consistently. | Keep domain rules in tools and orchestration thin. Avoid an all-purpose project manager. |
| Decorator: usage or timing may need to wrap multiple providers | A future measuring provider could forward the same port and capture allowlisted metrics. | Start with orchestration receipts. Add a decorator only if independent callers would duplicate instrumentation. |

The provider/model, benchmark device and production limits remain open. The [workflow](AGENT_WORKFLOW.md) defines approvals and execution semantics. The [DevOps plan](DEVOPS_PLAN.md) defines release gating.

## Canonical entity resolution (Phase 2.2)

Narrative approval stores the selected story unchanged. A designer may register cast, affiliations and state identities from the approved Narrative screen. For a prose-only source, the scenario agent can prepare those declarations as part of the same generation. A content fragment tagged character or faction supplies creative context and has its own ID. It does not establish a cast identity by itself.

The full scenario request includes approved prose, source fragments and facts, scenario settings and a typed inventory of reusable IDs. Quests from the outgoing graph are identified as historical context. The strict wire contract separates declarations from references. The server allocates canonical IDs for new records, rewrites ID-bearing fields, then validates the graph against the original registry plus the proposed additions. It returns the additions alongside the graph. Explicit acceptance appends them and replaces the reviewed design in one IndexedDB transaction with a revision check. A targeted prose revision cannot add entities.

A reference failure identifies its owning entity, JSON Pointer, expected type, rejected ID and the registered type when known. Eligible failures return a detached, normalized candidate to the requesting tab with `Cache-Control: no-store`. The tab can register a missing cast or state entity and explicitly relink the affected fields. Local revalidation uses the existing deterministic endpoint and records zero provider calls. The owner then reviews a successful correction as a proposal. The accepted revision and graph remain available throughout. Phase 2.3 retains the original in a separate local diagnostic store. The working copy lives in the mounted editor. [Schema and compatibility](DATA_SCHEMA.md)

## Scenario Studio implementation

The editor and both provider adapters use one Project schema. FastAPI handles narrative and scenario requests through the same local-origin, configuration fingerprint, size, concurrency and disconnect guards. Scenario generation and targeted revision each make at most one provider request. The server returns a projected design and an AgentRun. The browser validates the projection against the current project, then persists an explicitly accepted transaction through the existing IndexedDB compare-and-swap token.

ScenarioCanvas renders the canonical nodes and edges using React 19.2.3 and native SVG. The layout uses a topological pass and persisted node positions, with SVG pointer capture, focusable entities and HTML outline controls. Only the editor reads canvas coordinates. We evaluated React Flow, an actively maintained MIT library with keyboard support and a compatible React version. The bounded generation size and existing React event model allowed a native implementation with no package or lockfile changes. We maintain pointer transforms, keyboard behavior and layout ourselves. Checks exercise individual interactions and bounded graphs. Rendered frame rate, assistive technology and touch hardware remain unmeasured. [React Flow](https://reactflow.dev/) · [Accessibility](https://reactflow.dev/learn/advanced-use/accessibility) · [React requirements](https://reactflow.dev/learn/troubleshooting/migrate-to-v13)

The scenario snapshot and editor position changes save through the same project store. Semantic edits increment the scenario version and clear its approval. Moving a node only advances the project transaction revision. Undo and redo retain thirty operations in the mounted studio. Reopening restores the last committed graph and layout. Validation and approval metadata retain the checked revision.

## Route-specific progression and detached recovery

The compact scenario reply is the intermediate design. Normalization assigns identities and materializes the canonical graph; `scenario_state.py` checks entry requirements, applies authored effects and settles all active quests. `scenario_progression.py` explores the playable DAG with a separate set of visited prerequisites and typed values per path, bounded at 2,048 states. Reaching the same location with different accumulated choices can lead to different endings. Every mandatory node needs one feasible history. Main progression needs a route that skips side quests. A bonus ending can depend on a side quest when another ending remains accessible. Independent failures survive cause grouping. Candidate producers may lie on a different route.

Full generation returns an eligible rejected graph to its requester with `Cache-Control: no-store`. The browser retains the original in `worldweaver-rejected-scenarios-v1/originals` (one per project) using a first-write transaction and compare-before-dismiss. Project exports and the original `worldweaver-v1` store contain the accepted design and run receipts. The detached editor reuses the ordinary graph inspectors and deterministic validation endpoint. Revalidation proposes a replacement for the original base revision; Project mutation requires explicit acceptance through the normal compare-and-swap save. Diagnostic files have a separate envelope and carry creative content. [Phase 2.3 verification](PHASE_2_3_REPORT.md)
