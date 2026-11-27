// Classifications are fixed before execution. Additional rule codes are reported by the runner.
const as = (name, expected, mutate = () => {}, extra = {}) => ({ name, expected, mutate, ...extra });
const flag = { kind: 'flag', key: 'award', value: 'yes' };
const q = { kind: 'quest', key: 'q-rubbing', value: 'completed' };
const register = (p) => (p.stateEntities = [{ id: 'award', kind: 'flag', name: 'Award' }]);
const mark = (p, relation, from, to) =>
  p.world.constraints.push({
    origin: 'owner',
    strength: 'hard',
    description: 'Campaign requirement',
    relation,
    from,
    to,
  });
export const verificationCases = [
  as('Branching project with two endings and a buried vault', [], (p) => {}, { endings: 2 }),
  as(
    'Single linear ending',
    [],
    (p) => {
      p.edges.pop();
      p.nodes.pop();
      p.endings.pop();
      p.scenario.settings.branching = 'linear';
      p.scenario.settings.endings = 'single';
    },
    { endings: 1 },
  ),
  as('Reference edge pointing back to prologue', [], (p) => {
    p.edges.push({
      ...p.edges[0],
      id: 'read-note',
      from: 'n-public',
      to: 'n-start',
      kind: 'reference',
      travel: 'required',
    });
  }),
  as('Scene cut between distant places with no corridors', [], (p) => {
    p.edges.forEach((e) => (e.travel = 'none'));
    p.world.routes = [];
  }),
  as('Quest chain with delayed completion, two prerequisites and a final guard', [], (p) => {
    register(p);
    p.nodes[2].consequences = [flag];
    p.quests[0].completion = [flag];
    for (const [i, parent] of ['q-rubbing', 'quest-one'].entries()) {
      const id = ['quest-one', 'quest-two'][i],
        node = 'node-' + id;
      p.nodes.push({ ...p.nodes[2], id: node, kind: 'quest', title: id });
      p.quests.push({ ...p.quests[0], id, nodeId: node, prerequisiteIds: [parent], title: id });
      const edge = p.edges.find((e) => e.to === 'n-choose'),
        previous = edge.from;
      edge.from = node;
      p.edges.push({ ...edge, id: 'edge-' + id, from: previous, to: node });
    }
    p.edges.at(-1).conditions = [q];
  }),
  as('Optional branch skipped on the direct ending path', [], (p) => {
    p.nodes.push({ ...p.nodes[1], id: 'optional-tour', kind: 'event', mandatory: false });
    p.edges.push(
      { ...p.edges[1], id: 'tour-in', kind: 'optional', from: 'n-choose', to: 'optional-tour' },
      { ...p.edges[1], id: 'tour-out', from: 'optional-tour', to: 'n-public' },
    );
  }),
  as('Unplaced optional legacy state registry inferred from authored terms', [], (p) => {
    delete p.stateEntities;
    p.nodes[0].consequences = [flag];
    p.edges[1].conditions = [flag];
  }),
  as('Legacy graph with illustrative geometry and no scenario header', [], (p) => {}, {
    base: 'legacy',
    status: 'unresolved',
  }),
  as(
    'Impossible prologue with two future visits',
    [
      'scenario.blocked_start',
      'scenario.mandatory_unreachable',
      'scenario.ending_unreachable',
      'scenario.no_reachable_ending',
    ],
    (p) => (p.nodes[0].requiresVisited = ['n-witness', 'n-private']),
    { endings: 0, inspect: 'prologue' },
  ),
  as(
    'Impossible exit with no flag producer',
    ['scenario.progression_blocked', 'scenario.ending_unreachable'],
    (p) => {
      register(p);
      p.edges[4].conditions = [flag];
    },
    { endings: 1 },
  ),
  as('Simultaneous incompatible conditions', ['scenario.contradictory_condition'], (p) => {
    register(p);
    p.nodes[2].conditions = [flag, { ...flag, value: 'no' }];
  }),
  as(
    'Quest guard requiring an unknown lifecycle state',
    ['scenario.quest_state_value'],
    (p) => (p.edges[3].conditions = [{ ...q, value: 'announced' }]),
  ),
  as(
    'Only side quest required on main progression',
    ['scenario.side_quest_required'],
    (p) => (p.quests[0].kind = 'side'),
  ),
  as('Cycle through authored progression', ['scenario.cycle'], (p) => {
    p.edges.push({ ...p.edges[1], id: 'loop', from: 'n-choose', to: 'n-gate' });
  }),
  as('Two prologue scenes', ['scenario.prologue'], (p) => (p.nodes[1].kind = 'prologue')),
  as('Unattached ending record', ['scenario.ending_detail'], (p) => p.endings.pop()),
  as(
    'Wrong-type character in location slot',
    ['references.typed', 'scenario.reference', 'world.location_missing'],
    (p) => (p.nodes[2].locationId = p.characters[0].id),
  ),
  as('Duplicated canonical character ID', ['references.duplicate_id', 'scenario.duplicate_id'], (p) =>
    p.characters.push({ ...p.characters[0] }),
  ),
  as('Missing mandatory fragment coverage', ['references.project', 'coverage.fragment'], (p) => {
    const c = p.storyCandidates.find((c) => c.id === p.narrative.sourceCandidateId);
    c.coverage = c.coverage.filter((row) => row.contentId !== p.userContent[0].id);
  }),
  as(
    'Missing canonical fact trace',
    ['coverage.scenario', 'scenario.source_coverage'],
    (p) => (p.scenario.factIds = []),
  ),
  as(
    'Stale narrative upstream approval',
    ['sources.narrative', 'sources.scenario', 'sources.world'],
    (p) => p.versions.content++,
  ),
  as(
    'Unapproved scenario with a downstream approved atlas',
    ['sources.world'],
    (p) => (p.scenario.approved = false),
  ),
  as('Stale atlas stamps', ['sources.world'], (p) => p.world.scenarioRevision--),
  as(
    'Final approval refers to a generation receipt',
    ['sources.approval'],
    (p) => (p.approval = { runId: p.runs.at(-1).id, revision: p.revision }),
  ),
  as('Disconnected required journey', ['world.journey_unreachable'], (p) => (p.world.routes = [])),
  as(
    'Route with an interior gap',
    ['world.route_geometry'],
    (p) => {
      const r = p.world.routes.find((r) => r.path.length >= 4);
      r.path.splice(1, 1);
    },
    { allowed: ['world.journey_unreachable'] },
  ),
  as(
    'Underground vault moved to surface',
    ['world.constraint_beneath', 'world.location_overlap'],
    (p) => (p.world.placements.find((l) => l.locationId === 'vault').level = 0),
    { allowed: ['world.route_endpoint', 'world.journey_unreachable'] },
  ),
  as('Engineered canal required but absent', ['world.constraint_canal'], (p) =>
    mark(p, 'canal', 'l-gate', 'l-hall'),
  ),
  as('Engineered aqueduct required but absent', ['world.constraint_aqueduct'], (p) =>
    mark(p, 'aqueduct', 'l-gate', 'l-hall'),
  ),
  as(
    'Out-of-bounds atlas marker',
    ['world.location_position'],
    (p) => (p.world.locations[0].position = [999, 999]),
    {
      allowed: [
        'world.constraint_beneath',
        'world.route_endpoint',
        'world.journey_unreachable',
        'references.project',
      ],
    },
  ),
  as(
    'Inconsistent territory reference',
    ['world.territory', 'references.project'],
    (p) => (p.world.territories[0].factionIds = ['missing-faction']),
  ),
  as('Terrain dimensions inconsistent with elevation', ['world.terrain-elevation'], (p) =>
    p.world.elevation.pop(),
  ),
  as('Scoped quest review', [], (p) => {}, { mode: 'targeted', targetId: 'q-rubbing', status: 'proposed' }),
  as('Unknown target', ['scope.target'], (p) => {}, { mode: 'targeted', targetId: 'unknown' }),
  as('Cancellation after schema receipt', [], (p) => {}, { interrupt: 'cancelled', status: 'cancelled' }),
  as('Concurrent design edit after schema receipt', [], (p) => {}, { interrupt: 'stale', status: 'stale' }),
  as('Bounded exploration exhausted', ['scenario.state_budget'], (p) => {
    p.edges = p.edges.filter((e) => e.from !== 'n-start');
    p.stateEntities = [];
    let prior = 'n-start';
    for (let i = 0; i < 12; i++) {
      const id = 'fork-' + i,
        key = 'mark-' + i;
      p.stateEntities.push({ id: key, kind: 'flag', name: key });
      p.nodes.push({ ...p.nodes[1], id, kind: 'event' });
      for (const value of ['left', 'right'])
        p.edges.push({
          id: id + '-' + value,
          from: prior,
          to: id,
          travel: 'none',
          label: value,
          requiresVisited: [],
          consequences: [{ kind: 'flag', key, value }],
        });
      prior = id;
    }
    p.edges.push({
      id: 'fork-exit',
      from: prior,
      to: 'n-gate',
      travel: 'none',
      label: 'Return',
      requiresVisited: [],
    });
  }),
  as(
    'Reversed route distance simulated on detached draft',
    ['world.route_geometry'],
    (p) => (p.world.routes[0].distanceKm += 10),
    { allowed: ['world.journey_unreachable'], repair: 'distance' },
  ),
  as('Repair targeting pinned fact is rejected', [], (p) => {}, { repair: 'forbidden' }),
  as('Repair with a stale source revision is rejected', [], (p) => {}, { repair: 'stale' }),
  as(
    'Mutually exclusive hard rules about one territorial boundary',
    ['world.conflicting_constraints', 'world.constraint_outside'],
    (p) => {
      const site = p.world.locations.find((l) => l.regionId);
      mark(p, 'inside', site.id, site.regionId);
      mark(p, 'outside', site.id, site.regionId);
    },
  ),
  as('Unstructured conflicting locked statements require editorial judgment', [], (p) => {
    for (const [id, statement] of [
      ['fact-gate-open', 'At noon the only gate is open.'],
      ['fact-gate-shut', 'At noon the only gate is shut.'],
    ]) {
      p.canonicalFacts.push({ id, statement });
      p.scenario.factIds.push(id);
    }
  }),
];
