import { describe, expect, it } from 'vitest';
import { buildRoutes, placeLocations, spatialIssues } from './atlasSpatial';
import type { Location, Point, World } from './project.generated';
import type { AtlasConstraint } from './atlasTypes';

function place(id: string, position?: Point, kind: Location['kind'] = 'village'): Location {
  return { id, name: id, kind, preference: 'any-land', ...(position && { position, regionId: 'region' }) };
}

function grid(tiles: string[], locations: Location[] = []): World {
  const cells: Point[] = [];
  tiles.forEach((row, y) =>
    [...row].forEach((tile, x) => {
      if (!'~l'.includes(tile)) cells.push([x, y]);
    }),
  );
  return {
    id: 'world',
    seed: 72,
    generatorVersion: 'atlas-test',
    tiles,
    features: [],
    regions: [{ id: 'region', name: 'Terrace', cells: cells as [Point, ...Point[]] }],
    locations,
    routes: [],
  };
}

function rule(relation: AtlasConstraint['relation'], from: string, to?: string, via?: string): AtlasConstraint {
  return { relation, from, to, via, origin: 'scenario', strength: 'hard', description: 'Reviewed geography' };
}

const errors = (world: World, rules: AtlasConstraint[]) =>
  spatialIssues(world, rules).filter((i) => i.severity === 'error');

describe('atlas placement and journeys', () => {
  it('replays placement independently of input order, honoring a locked site, river, near and beneath', () => {
    const world = grid(['~~~~~~~', 'ppppppp', 'ppppppp', 'ppppppp']);
    world.features.push({
      id: 'stream',
      name: 'Stream',
      kind: 'river',
      cells: [
        [5, 2],
        [5, 1],
        [5, 0],
      ],
    });
    const hall = { ...place('hall', [3, 2]), locked: true };
    const locations = [place('crypt', undefined, 'dungeon'), hall, place('mill')];
    const rules = [rule('beneath', 'crypt', 'hall'), rule('near', 'mill', 'hall'), rule('river', 'mill')];
    world.locations = placeLocations(world, locations, rules);
    expect(world.locations.find((l) => l.id === 'crypt')).toMatchObject({ position: [3, 2], level: -1 });
    expect(world.locations.find((l) => l.id === 'hall')).toEqual(hall);
    expect(placeLocations(world, [...locations].reverse(), [...rules].reverse())).toEqual(world.locations);
    expect(errors(world, rules)).toEqual([]);
  });

  it('identifies ocean, fractional, duplicate and out-of-bounds locations with their IDs', () => {
    const world = grid(
      ['p~p'],
      [place('wet', [1, 0]), place('far', [4, 0]), place('half', [0.5, 0]), place('wet', [0, 0])],
    );
    const issues = errors(world, []);
    expect(issues.map((i) => i.code)).toContain('location_id');
    for (const id of ['wet', 'far', 'half'])
      expect(issues.some((i) => i.code === 'location_position' && i.ids.includes(id))).toBe(true);
  });

  it('requires an uninterrupted path through legal cells and reports a disconnected hard journey', () => {
    const world = grid(['ppppp', 'pp~pp'], [place('a', [0, 1]), place('b', [4, 1])]);
    const rules = [rule('travel', 'a', 'b')];
    world.routes = buildRoutes(world, rules);
    expect(world.routes).toHaveLength(1);
    const route = world.routes[0]!;
    expect(route.path).not.toContainEqual([2, 1]);
    expect(route.path.length).toBe(7);
    expect(errors(world, rules)).toEqual([]);
    world.routes = [
      {
        ...route,
        path: [
          [0, 1],
          [1, 1],
          [2, 1],
          [3, 1],
          [4, 1],
        ],
      },
    ];
    expect(errors(world, rules)).toContainEqual(
      expect.objectContaining({ code: 'route_geometry', cell: [2, 1] }),
    );
    expect(errors(world, rules).map((i) => i.code)).toContain('journey_unreachable');
    world.routes = [
      {
        ...route,
        path: [
          [0, 1],
          [4, 1],
        ],
      },
    ];
    expect(errors(world, rules).map((i) => i.code)).toEqual(
      expect.arrayContaining(['route_geometry', 'journey_unreachable']),
    );
    world.routes = [];
    expect(errors(world, rules).map((i) => i.code)).toContain('journey_unreachable');
  });

  it('joins islands through ports and rejects a sea route when either port is removed', () => {
    const world = grid(
      ['pp~~pp'],
      [
        place('west', [0, 0]),
        place('wharf', [1, 0], 'port'),
        place('pier', [4, 0], 'port'),
        place('east', [5, 0]),
      ],
    );
    const rules = [rule('travel', 'west', 'east')];
    world.routes = buildRoutes(world, rules);
    expect(world.routes.map((r) => r.mode)).toContain('sea');
    expect(errors(world, rules)).toEqual([]);
    world.locations = world.locations.filter((l) => l.id !== 'pier');
    expect(errors(world, rules).map((i) => i.code)).toEqual(
      expect.arrayContaining(['route_endpoint', 'journey_unreachable']),
    );
  });

  it('labels river crossings, mountain passes, artificial waterworks and vertical tunnels', () => {
    const world = grid(
      ['ppppp', 'mmmmm', 'ppppp'],
      [
        place('a', [0, 0]),
        place('b', [4, 0]),
        place('c', [4, 2]),
        { ...place('vault', [0, 0], 'dungeon'), level: -1 },
      ],
    );
    world.features = [
      {
        id: 'river',
        name: 'River',
        kind: 'river',
        cells: [
          [2, 0],
          [2, 1],
          [2, 2],
        ],
      },
    ];
    const rules = [
      rule('travel', 'a', 'b'),
      rule('travel', 'b', 'c'),
      rule('travel', 'vault', 'a'),
      rule('aqueduct', 'a', 'b'),
    ];
    world.routes = buildRoutes(world, rules);
    expect(world.routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mode: 'bridge', crossings: [[2, 0]] }),
        expect.objectContaining({ mode: 'pass' }),
        expect.objectContaining({ mode: 'aqueduct' }),
        expect.objectContaining({
          mode: 'tunnel',
          path: [
            [0, 0],
            [0, 0],
          ],
        }),
      ]),
    );
    expect(errors(world, rules)).toEqual([]);
    world.routes = world.routes.filter((r) => r.mode === 'aqueduct');
    expect(errors(world, rules).map((i) => i.code)).toContain('journey_unreachable');
  });

  it('explains conflicting locks, missing references and unsatisfied suggestions at their own severity', () => {
    const world = grid(
      ['ppppppppp'],
      [
        { ...place('a', [0, 0]), locked: true },
        { ...place('b', [8, 0]), locked: true },
      ],
    );
    const rules = [
      rule('near', 'a', 'b'),
      { ...rule('river', 'a'), strength: 'soft' as const },
      rule('near', 'a', 'missing'),
    ];
    world.locations = placeLocations(world, world.locations, rules);
    const issues = spatialIssues(world, rules);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', ids: ['a', 'b'] }),
        expect.objectContaining({ severity: 'warning', ids: ['a'] }),
        expect.objectContaining({ code: 'constraint_reference', ids: ['a', 'missing'] }),
      ]),
    );
  });

  it('uses a feasible requested underground level even for a suggested beneath relationship', () => {
    const world = grid(
      ['ppp'],
      [{ ...place('archive', [1, 0]), locked: true }, place('cellar', undefined, 'dungeon')],
    );
    const rules = [{ ...rule('beneath', 'cellar', 'archive'), strength: 'soft' as const }];
    world.locations = placeLocations(world, world.locations, rules);
    expect(spatialIssues(world, rules)).toEqual([]);
    expect(world.locations.find((l) => l.id === 'cellar')).toMatchObject({ level: -1, position: [1, 0] });
  });

  it('routes a canal around a short mountain shortcut and rejects a wrong-type area reference', () => {
    const world = grid(
      ['ppppppp', 'p~~~~~p', 'p~~~~~p', 'p~~~~~p', 'p~~~~~p', 'pppmppp'],
      [place('locks', [2, 5]), place('dock', [4, 5])],
    );
    const rules = [rule('canal', 'locks', 'dock')];
    world.routes = buildRoutes(world, rules);
    expect(world.routes.find((r) => r.mode === 'canal')?.path).not.toContainEqual([3, 5]);
    expect(errors(world, rules)).toEqual([]);
    expect(errors(world, [rule('outside', 'locks', 'dock')]).map((i) => i.code)).toContain(
      'constraint_reference',
    );
  });

  it('places a woodland area, regional membership and the third site separating two locked settlements', () => {
    const world = grid(
      ['fffffff', 'ppppppp', 'ppppppp'],
      [
        place('grove', undefined, 'forest'),
        place('witness'),
        { ...place('west', [0, 2]), locked: true },
        { ...place('east', [6, 2]), locked: true },
        place('gate'),
      ],
    );
    world.territories = [{ id: 'march', name: 'March', regionIds: ['region'], factionIds: [] }];
    const rules = [
      rule('inside', 'witness', 'grove'),
      rule('inside', 'grove', 'march'),
      rule('separates', 'west', 'east', 'gate'),
    ];
    world.locations = placeLocations(world, world.locations, rules);
    expect(world.locations.find((l) => l.id === 'grove')!.area).toContainEqual(
      world.locations.find((l) => l.id === 'witness')!.position,
    );
    expect(world.locations.find((l) => l.id === 'gate')!.position![1]).toBe(2);
    expect(errors(world, rules)).toEqual([]);
  });

  it('keeps a hard geographic requirement ahead of any number of conflicting proposals', () => {
    const world = grid(
      ['pppppppppppp'],
      [{ ...place('a', [0, 0]), locked: true }, { ...place('b', [11, 0]), locked: true }, place('marker')],
    );
    const rules = [
      rule('near', 'marker', 'a'),
      ...Array.from({ length: 1001 }, (_, i) => ({
        ...rule('near', 'marker', 'b'),
        strength: 'soft' as const,
        description: 'Suggestion ' + i,
      })),
    ];
    world.locations = placeLocations(world, world.locations, rules);
    expect(errors(world, rules)).toEqual([]);
  });
});
