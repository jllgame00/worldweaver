# Product specification

**WORLDWEAVER** (working name) · *From scattered ideas to a living world.*

An indie developer, narrative or game designer, student, or designer on a small team may know the ending and two places long before they know how the player gets between them. Today they must reconcile prose, branches and geography by hand. WORLDWEAVER's design hypothesis is that editing a branch alongside its route will help designers catch impossible journeys while retaining authorship. Demand, usability and comparative advantage await evaluation.

## Journey and acceptance contract

| ID | User action and planned behavior | Acceptance example |
|---|---|---|
| P1 | Start a project with any nonempty subset of genre, themes/atmosphere, characters, factions, creatures, items/artifacts, locations, historical events, mechanics, desired endings, narrative constraints or free-form ideas. Mark entries mandatory, optional or excluded. Pin canonical facts. | A single fragment suffices. Contradictory mandatory requirements prompt a decision. Regeneration leaves pinned text intact. |
| P2 | Generate three directions. Compare genre/tone, premise, conflict, motivation, opposing force, background, progression, endings and content coverage. | Each candidate accounts for the input. For every pair the reviewer can identify a different central decision and consequence. Near-paraphrases return for revision. |
| P3 | Select one candidate, edit its narrative and approve the working version. | Reopening an edited narrative preserves it and the identity of its source candidate. |
| P4 | Build and edit a branching scenario with a prologue, chapters, events, quests, choices, edge conditions and endings. | A designer changes an edge or objective, traverses both branches and finds their endings. An invalid edit yields an actionable finding or is rejected atomically. |
| P5 | Build a seeded fictional continent. Inspect coast, ocean, relief, rivers, forests, plains, appropriate dry biomes, regions/territories, kingdoms, settlements, cities, villages, dungeons, landmarks and roads. | Same version, seed and normalized requirements yield identical geometry. A designer can select a village and follow a traversable route to a quest. |
| P6 | Work with scenario and atlas together. Select an event to locate it, or a place to list its events and quests. | Rename a place once and both views update. Removing a stop on a required route surfaces affected progressions. |
| P7 | Inspect deterministic findings and editorial suggestions, preview a repair, approve major changes and recheck. | Each finding shows severity, affected entities, explanation, proposal, status and remaining issues. An exhausted repair budget leaves open problems visible. |
| P8 | Save and reopen locally, import/export portable JSON and export a readable design document. | Round trip preserves IDs, revisions, seed, geometry and edits. Markdown includes narrative, branching choices, quests, endings, geography, routes and verification status. |

The MVP ends with one designer editing one portable project. Team members can exchange files. Real-time collaboration, accounts, a gameplay scripting language, arbitrary progression cycles, image-model maps and engine-specific exporters sit outside this release.

## Quality and proposed measurements

Targets guide product acceptance. Collect a baseline before claiming improvement. Record device, viewport, project size, provider mode and sample size with measurements.

| Quality | Proposed KPI and measurement |
|---|---|
| Authorial control | In the acceptance fixture and mutation cases, 100% of mandatory entries have reviewed coverage and zero pinned facts change through generation or repair. Human review examines meaning. |
| Useful directions | In a pilot with five target users, at least four can describe a distinct decision and consequence for all three candidates and select a direction worth editing. Record reasons for rejection. |
| Editing usability | At least four of five first-time pilot users can edit an event and identify its location and return route without help within five minutes. Time from opening the integrated view. |
| Integrity and recovery | Zero dangling references or impossible required journeys in an approved export. Every failure/cancellation fixture preserves the previous approved design. Draft backups can contain explicitly unresolved issues. |
| Interaction and access | Target p95 selection-to-highlight under 200 ms on a recorded reference laptop with 100 nodes and 50 locations. Complete lookup, selection and export by keyboard and view details at 360 CSS px. |
| Sustainable operation | Record calls, token counts when available, retry counts and local geometry generation time per accepted project. Ordinary CI spends zero live tokens. Compare repeated runs before setting a cost baseline. |

Screen behavior belongs to the [UX design](UX_DESIGN.md). Domain checks and acceptance tests belong to the [data contract](DATA_SCHEMA.md) and [test plan](TDD_PLAN.md).
