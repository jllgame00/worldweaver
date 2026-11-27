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

The original HTTP plan included /api/world. Phase 3 implements local generation for repeated offline edits. The other service boundaries include POST /api/candidates, /api/scenario, the planned /api/verify, and GET /health. Selection and ordinary edits are local transactions. Return the run ID, base revision, proposed delta and tool evidence. Invalid input returns field-level errors, a provider timeout returns a retryable stage error, and an impossible layout returns explicit unresolved constraints. Health checks need no project or provider. Render Markdown and import/export JSON locally. Save all project entities in one IndexedDB transaction. On conflict offer reopen or export the unsaved copy.

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

## Local World Atlas

The browser already holds the authoritative project and renders its terrain. A shared TypeScript engine supplies generation, editing, path rebuilding and validation directly to the studio and the headless campaign. This avoids shipping an entire private project per edit and keeps one implementation of the geometry rules. FastAPI continues to validate the shared Project envelope and references wherever a project enters a service. Atlas operations never select a provider. Source snapshots and compare-and-swap on the existing project store guard final adoption.

atlasWorkflow prepares requirements and source identity, atlasTerrain builds connected land, elevations, lakes, drainage and regions, and atlasSpatial solves placement and routes. atlasPorts adds coastal transfer sites where needed on islands. atlasPlaces joins scenario declarations to their physical placements by foreign key. AtlasStudio stages calculations, validates, edits and accepts changes. atlasRecovery retains an unapproved working copy independently of the last accepted world and detects competing tabs. An error or cancellation before adoption preserves the project. Work per generation is bounded by supported grid and input sizes; stages yield between local computations. Keyboard-accessible record controls share selection and mutations with the map.

React and native SVG batch connected terrain into paths. Contours come from neighboring cells, overlays from canonical feature/route data, and decluttered labels from viewport and selection. The same sheet supplies a standalone SVG with legend, compass and scale. This adds no runtime dependency or license and leaves lockfiles untouched. A raster was produced from the exported SVG to inspect print output. Browser input and painting performance require a rendered browser. [Algorithms, coordinate conventions and limits](WORLD_GENERATION.md) · [Campaign measurements](ATLAS_CAMPAIGN.md)

## Phase 4 runtime boundary

World Bible derives a typed entity catalog and relationship index from Project, including scenario-owned atlas placements. Edges distinguish canonical fields, deterministic derived usage and separately displayed editorial suggestions. Search, graph, list, impact preview and editor links use canonical IDs. The bounded graph shows one selected neighborhood at a time. A suggested association never participates in the deletion guard.

VerificationAgent invokes verificationEngine on an isolated project snapshot. A closed tool plan delegates to the shared Draft 4 contract, canonical reference checker, source approval checks, progression API, physical atlas validators and source coverage checker. On the verification variant of the progression endpoint the same state explorer also returns traversed edges. The atlas checks only feasible scene transitions explicitly marked as travel, together with authored geography constraints. Reports preserve execution failure, skipped coverage, interrupted traversal and witnesses. A blocked prerequisite prevents downstream success claims.

The semantic endpoint uses the existing server-owned provider, allowlisted structured result, explicit model/budget consent, bounded source excerpts and no automatic paid retries. Deterministic tools have no model dispatch path. Only the review UI can submit a model request. Imported report data cannot grant permission to invoke tools. The normal generation payload excludes verification history.

A repair request reserves one of two persisted attempts, records the field-level proposal and validates it on a detached canonical copy. Acceptance validates the exact candidate again, saves once through the IndexedDB compare-and-swap and checks the saved design. Database conflicts and stale snapshots preserve the previous winner. Final project approval requires an explicit owner action and a fresh full recheck. [Runtime, limits and recovery](VERIFICATION_AGENT.md)

## Phase 5B content intake API

`POST /api/content/extract` accepts JSON with `projectId`, a safe nonnegative `baseRevision` and `sourceText`. Only the original text goes to the configured provider. Use the shared generation fingerprint in `X-Worldweaver-Generation`. Live requests also need `X-Worldweaver-Content-Budget: 1:<cap>`, where the cap is advertised as `contentExtractionMaxOutputTokens` by `GET /api/generation`. The cap is the smaller of 1,600 and the configured maximum. The shared loopback, origin, JSON, coalescing and disconnect checks apply. One adapter call uses the configured deadline. The UTF-8 model payload is bounded by the smaller of 24,576 bytes and the configured input limit. The source is creative data and cannot change provider configuration or tool access.

Success returns `projectId`, `baseRevision`, `fragments` and `operation` with `Cache-Control: no-store`. Up to 24 fragments use the canonical category/treatment enums and nonblank text of at most 4,096 characters. Each has `evidence: {quote, occurrence}`. The quote is exact, and occurrence is counted from 1 over nonoverlapping matches left to right. The backend and browser independently check the citation. The provider format is closed and requires treatment. A valid injected provider result with an omitted treatment normalizes to `optional`. Unrecognized fields, duplicate JSON members, nonexistent quotes or occurrences and malformed output reject the batch. Errors retain the existing `error.code` and `error.message` envelope. Dispatched operations and model-stage rejections include `error.operation` with an ID, mode and observed dispatch/response counts.

The browser keeps original text, pending proposal and at most 50 recent receipt events in a project-scoped localStorage entry. They are outside portable Project JSON and IndexedDB's canonical record. A separate tab's newer local draft triggers a storage notice and keeps the current view in memory. Only accepting selected valid rows calls the canonical `editContent` and IndexedDB compare-and-swap. The revision advances once and downstream source approval continues to use existing version rules. Documented operating counts describe retained receipts, including the limits of observing a lost response. [Phase 5B evidence](PHASE_5B_REPORT.md)

## Interface locale boundary

`LocaleProvider` supplies `ko` or `en` to the mounted workspace. Its only persisted value is the independent browser preference `worldweaver.interfaceLocale`. Missing or invalid values resolve to Korean. A failed write leaves the current selection active in memory and shows the session-only status. The provider updates `document.documentElement.lang`. Studio and editor keys use their existing project/entity identities.

Each presentation dictionary uses shared English keys with a Korean counterpart constrained by `Translation<T>`. Functions retain the same interpolation arguments and stable enum keys. Date and number display use `Intl`, including stored timestamps rendered without rewriting the values. Specialized dictionaries cover workspace fields, graph and atlas labels, tool states and structured diagnostic codes. Pure domain operations keep their canonical enums, existing result data and approval receipts. For a known diagnostic the UI can show a Korean explanation by code. Unknown provider or domain detail remains available in original form. [Coverage and test evidence](PHASE_5C_REPORT.md)
