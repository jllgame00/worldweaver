---
name: world-map-validation
description: Use when a WORLDWEAVER seed, geography requirement, generator, location, travel route or scenario link changes.
---

# World map validation

**Inputs.** Pin a project revision, generator version, seed, normalized semantic requirements, world geometry, and scenario travel requirements. Use the [data contract](../../../docs/DATA_SCHEMA.md) and [world test cases](../../../docs/TDD_PLAN.md).

1. Replay generation twice with the same version, seed and effective inputs. Compare canonical geometry, terrain, placement and routes. Record the input ordering and normalization applied. A screenshot or list of marker centers covers only a fraction of these outputs.
2. Check finite in-bounds coordinates, valid geometry, unique stable IDs, region membership and terrain suitability. Confirm each required land location lies on land. Validate coastline and applicable river, mountain and biome constraints against the generator's inputs.
3. Follow required journeys in the travel graph, respecting route direction and mode. Check the entire path geometry against the passable surface, including the interior of long segments. Flag an unexplained water crossing even when both endpoints lie on land. Sea travel requires an explicit sea connection.
4. Resolve scenario location references by ID and compare the derived location-to-event and quest lists. Repeat both lookups after editing a location or scenario reference.

**Failure handling.** Preserve the accepted map and its seed. Report the failing location, route segment, blocked journey or missing reference. Propose a scoped repair, then rerun the failed check and affected narrative links on the new revision.

**Evidence and completion.** Capture the revision, seed, version, effective inputs, compared fields, deterministic replay result and failing IDs or coordinates. A pass requires evidence of geometry validity, legal travel and bidirectional references for the tested input. Identify any unexecuted checks and unresolved findings.
