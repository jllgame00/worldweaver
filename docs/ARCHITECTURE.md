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
