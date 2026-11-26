# Portable Project v1

The [JSON Schema](project-v1.schema.json) is the normative field/type contract (Draft 4). Every object is closed. Required fields are explicit. This document owns relational, temporal and semantic constraints that JSON Schema cannot express. The [complete synthetic project](examples/salt-census.json) is a hand-authored design example, including illustrative geometry. It makes no generation or test-run claim.

## Ownership and lifetime

Each entity has an immutable project-wide unique string `id`. Names and array positions are display or storage details. Foreign keys target the indicated type in the same project. In the table, fields before the optional column are required in addition to the ID.

| Entity | Required payload | Optional | Owner, lifetime and relational rules |
|---|---|---|---|
| Project | schemaVersion, title, revision, versions, basis, userContent, canonicalFacts, storyCandidates, characters, factions, nodes, edges, quests, endings, findings, runs | synthetic, narrative, world, approval | Designer owns the root from creation through export. Empty collections represent unfinished stages. Increment revision on each accepted design transaction. |
| UserContent | category, treatment, text | — | Designer creates and edits fragments. Each fresh candidate accounts for every fragment exactly once at its source content version. A stale candidate can omit later additions. Resolve references from facts and candidate coverage before removing a fragment. |
| CanonicalFact | statement | sourceContentId | Designer pins and explicitly edits or removes each fact. Generators can read it. Optional provenance points to UserContent. |
| StoryCandidate | story, coverage | — | Narrative Agent proposes an immutable batch of exactly three. The initial batch may be empty. Coverage refers to UserContent. Keep the source candidate while its Narrative exists. |
| Narrative | sourceCandidateId, story, approved | — | Selection creates the designer's editable story from one candidate. Its source is a historical snapshot. Editing clears approval. Only the Narrative supplies downstream story text. |
| Character | name, role | factionId | Narrative review establishes the cast. User edits or explicitly accepts generated changes. Referenced by ScenarioNode. |
| Faction | name, aim | — | Narrative review establishes organizations including kingdoms. Character affiliation and Region control can reference a Faction. |
| ScenarioNode | kind, title, description, mandatory, characterIds, requiresVisited | objective, locationId | Scenario Agent proposes, designer edits. Character and predecessor references must exist. A placed event joins to one Location. For quest nodes put the objective on Quest only. |
| ScenarioEdge | from, to, label, requiresVisited, travel | — | Directed progression from one node ID to another. Label names the choice or transition. Delete or retarget dependent edges on confirmed node removal. |
| Quest | nodeId, objective, outcome | — | One record per quest-kind node. Inherits the location through that node. A quest always needs a Location identity. |
| Ending | nodeId, consequence | — | One per ending-kind node, with zero outgoing edges. Records the consequence of reaching that node. |
| World | seed, generatorVersion, tiles, regions, features, locations, routes | — | Scenario generation may create a shell to hold location identities. World generation fills geometry in that same object. User-approved revisions replace it atomically. |
| Region | name, cells | controllerId | World owns a nonempty set of unique land cells. Optional controlling Faction models political territory. Regenerate boundaries while retaining identities where applicable. |
| TerrainFeature | name, kind, cells | — | Named feature overlay on the terrain grid. Engine supplies geometry. A river is an ordered adjacent path to an outlet. |
| Location | name, kind, preference | position, regionId | Scenario or World Agent proposes places. In a world shell both optional fields are absent. Place both together in a generated world. Scenario links survive renaming and repositioning. |
| TravelRoute | from, to, mode, path | — | World owns an undirected connection between distinct Location IDs, with an ordered path from the first endpoint to the second. Recheck after terrain or endpoint edits. |
| ValidationFinding | rule, origin, severity, entityIds, explanation, suggestedRepair, status, checkedRevision, runId | — | Verification Agent owns revision-scoped findings. Link to AgentRun. Keep a declined suggestion visible. Mark past findings superseded when inputs change. |
| AgentRun | stage, baseRevision, mode, status, repairAttempts, receipts, calls | tokens, durationMs | Orchestrator creates one ID per invocation, appends tool outcomes and finalizes once. Past receipts remain read-only. Keep counts and safe summaries. |

`story` is a typed value object used for candidate snapshots and the selected narrative. Its fields are title, genre, tone, premise, conflict, motivation, opposition, background, progression and possibleEndings. Coverage pairs a content ID with disposition and reason. An excluded entry requires an exclusion acknowledgment. Unused optional entries need a reason. A mandatory conflict blocks approval until the designer resolves it. Structural coverage establishes traceability. Compare the story itself against facts and constraints during review.

~~~mermaid
erDiagram
  Project ||--o{ UserContent : contains
  Project ||--o{ CanonicalFact : protects
  StoryCandidate }o--o{ UserContent : accounts_for
  StoryCandidate ||--o| Narrative : seeds
  Project ||--o{ ScenarioNode : owns
  ScenarioNode ||--o{ ScenarioEdge : departs
  ScenarioEdge }o--|| ScenarioNode : arrives
  ScenarioNode ||--o| Quest : details
  ScenarioNode ||--o| Ending : concludes
  ScenarioNode }o--o| Location : occurs_at
  World ||--o{ Location : holds
  Location }o--o| Region : occupies
  TravelRoute }o--|| Location : endpoint
  AgentRun ||--o{ ValidationFinding : reports
~~~

## Graph and travel invariants

Exactly one prologue starts a nonempty completed graph. Reject duplicate IDs, dangling or wrong-type references, self-edges and cycles anywhere. Prerequisites on a node and edge are conjunctions of already visited node IDs. On arriving at a node add it to the visited set, then evaluate outgoing edges and the destination prerequisites. Start with an empty history. Explore feasible states (node and visited prerequisites), including both arms of a choice. A mandatory node must be reachable on some feasible playthrough. All feasible non-ending states must have a successor and a path to an ending. At least one ending must be reachable. Use a bounded state budget and report incomplete verification if exhausted. No free-form condition evaluation.

For a required journey both endpoint nodes must have valid location IDs. Look for a path through physically valid, bidirectional TravelRoutes between the two places. Equality permits zero travel. Edges between distinct physical locations require travel unless the designer explicitly marks a scene cut (`none`) and the progression requires no player journey. At graph-only stage, pending geography is unverified. Disallow final approval until every required journey passes.

~~~mermaid
flowchart LR
  S[The erased line] --> G[Survey the flood line]
  G --> Q[Take a rubbing]
  Q --> C{Name the witnesses?}
  C -->|Publish| P[The restored roll]
  C -->|Seal| R[The sealed register]
~~~

~~~mermaid
flowchart LR
  N[Selected node ID] --> K[ScenarioNode.locationId]
  K --> L[Location in Project.world]
  L --> M[Highlight atlas marker]
  L --> I[Filter nodes by locationId]
  I --> E[Events and Quest via nodeId]
  A[ScenarioEdge] --> B[Endpoint node locations]
  B --> T[Check path through valid TravelRoutes]
~~~

## Geometry contract

Points are integer [x,y] grid cells, origin top left. Rows must have equal width. The terrain alphabet is ocean (~), plain (p), mountain (m), forest (f), desert (d). Coastline is the border between ocean and land. A populated world partitions every land cell into exactly one region. Each location occupies a distinct compatible land cell in its region. Terrain preference guides placement, with any relaxation shown to the user. Ports need an adjacent ocean cell. A route visits four-neighbor cells. Its endpoints match the named locations. Road cells must be traversable land (p/f/d in v1). A sea route joins two ports, with one or more ocean cells between them. Render rivers as overlays, allowing fords where a road crosses a river cell in v1. A final world rejects out-of-range points, unplaced required sites, broken routes and unsatisfied hard constraints.

## Revisions, stale data and interchange

- `revision` counts accepted design transactions. Per-stage `versions` count local edits or replacements. Initial values are zero. A stage's `basis` records the upstream versions used when accepting its output. Missing basis means ungenerated. Freshness is transitive. Graph-generated location identities belong to the scenario stage. Geometry, routes and later atlas-only places belong to the world stage. Editing an identity used by both triggers both sets of checks.
- A fact or input edit bumps content. Keep old candidates, narrative, graph and map visible as stale. Reapprove or regenerate in dependency order. Never update a basis simply to silence a warning. Compare source versions after review. Replacing a batch whose selected candidate would disappear requires an explicit preview of a coherent replacement or removal of dependents. Ordinary renames keep IDs. Referenced deletion must be blocked or accompanied by an accepted atomic relink/removal.
- Scenario edits invalidate world constraints and verification. World edits rerun affected geometry, route and link checks even if the graph is unchanged. Verification status derives from a complete passing receipt for the current revision and review of outstanding findings. An empty findings list conveys no check by itself. Persist historical entity IDs on superseded findings as revision-scoped pointers. Deleted targets display their ID and revision without linking to a different object.
- Export full UTF-8 JSON, including stale drafts, IDs and geometry. Import into an isolated candidate, validate schema and foreign keys, show domain findings, then save as a new project or explicitly replace. Preserve the original on any error. Same-ID collision prompts copy (new root ID, retain project-local child IDs) or explicit replacement. Drafts may retain domain findings, but the editor must never persist dangling live references. A Markdown export is a projection with revision, outstanding findings and freshness.
- Dispatch imports by exact schemaVersion. Start with 1.0.0 only. Future supported versions use tested, ordered, lossless migrations on a copy, followed by validation. Reject unknown versions with an actionable version message and retain the file. Use a separate generatorVersion for geometry changes. Reopen stored geometry without rerunning the generator.

Verification receipts cover exactly their run's baseRevision. Accepting a repair advances the design revision. Run full verification again on the accepted snapshot before final approval. Recording checks and user approval is a metadata transaction and leaves the design revision unchanged. It still participates in local save conflict detection. Imported receipts are historical. Keep the trusted IDs of locally executed verify runs in browser storage outside the portable design. A newly imported project needs a fresh full check and local approval before its current design can display as approved. Draft export always remains available.
