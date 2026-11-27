from backend.app.contracts import definition

def test_world_accepts_versioned_physical_data_and_enforces_scale():
    checker = definition("World")
    world = dict(id="atlas", seed=8, generatorVersion="atlas-1", tiles=["~phl"], regions=[], features=[],
                 locations=[], routes=[], name="청람", elevation=[[0, 7, 12, 5]], approved=False,
                 sourceNarrativeId="story", sourceScenarioId="scenario", narrativeRevision=1, scenarioRevision=2,
                 settings=dict(size="small", kmPerCell=2, land=52, ruggedness=2, climate="temperate",
                               settlements=1, roads=1, politics=1), placements=[], constraints=[], territories=[])
    assert checker.is_valid(world)
    world["settings"]["kmPerCell"] = 0
    assert not checker.is_valid(world)
