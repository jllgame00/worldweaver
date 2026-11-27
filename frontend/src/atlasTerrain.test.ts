import { describe, expect, it } from 'vitest';
import type { AtlasSettings } from './atlasTypes';
import { terrain, terrainIssues } from './atlasTerrain';
import type { World } from './project.generated';

const settings: AtlasSettings = {
  size: 'small',
  kmPerCell: 5,
  land: 55,
  ruggedness: 2,
  climate: 'temperate',
  settlements: 1,
  roads: 1,
  politics: 1,
};

function world(seed: number, changes: Partial<AtlasSettings> = {}): World {
  return {
    id: 'map',
    seed,
    generatorVersion: 'atlas-test',
    locations: [],
    routes: [],
    ...terrain(seed, { ...settings, ...changes }),
  };
}

describe('seeded relief and drainage', () => {
  it('selects distinct major drainage corridors across the standard continent', () => {
    const outlets = world(37, { size: 'standard' })
      .features.filter((f) => f.kind === 'river')
      .map((f) => f.cells.at(-1)!);
    expect(outlets.length).toBeGreaterThanOrEqual(3);
    for (const [i, [x, y]] of outlets.entries())
      for (const [px, py] of outlets.slice(i + 1))
        expect(Math.abs(x - px) + Math.abs(y - py)).toBeGreaterThanOrEqual(7);
  });
  it('replays a contiguous continent with elevation, an inland lake and adjacent downhill rivers', () => {
    const first = world(37);
    expect(first.tiles).toHaveLength(32);
    expect(first.tiles.every((row) => row.length === 48)).toBe(true);
    expect(first).toEqual(world(37));
    expect(world(38).tiles).not.toEqual(first.tiles);
    const surface = first.tiles.join('');
    for (const tile of '~lmhvpf') expect(surface).toContain(tile);
    expect(surface.replace(/[~l]/g, '').length / surface.length).toBeCloseTo(0.55, 1);
    expect(new Set(first.elevation!.flat()).size).toBeGreaterThan(100);
    expect(first.features.map((f) => f.kind)).toEqual(
      expect.arrayContaining(['lake', 'ridge', 'river', 'grove']),
    );
    for (const river of first.features.filter((f) => f.kind === 'river')) {
      expect(river.cells.length).toBeGreaterThanOrEqual(4);
      for (const [i, [x, y]] of river.cells.entries()) {
        if (i === 0) continue;
        const [px, py] = river.cells[i - 1]!;
        expect(Math.abs(x - px) + Math.abs(y - py)).toBe(1);
        expect(first.elevation![y]![x]!).toBeLessThanOrEqual(first.elevation![py]![px]!);
      }
      const [x, y] = river.cells[river.cells.length - 1]!;
      expect(
        /[~l]/.test(first.tiles[y]![x]!) ||
          first.features.some((f) => f.kind === 'basin' && f.cells.some(([bx, by]) => bx === x && by === y)),
      ).toBe(true);
    }
    expect(terrainIssues(first)).toEqual([]);
  });

  it('changes the dry and frozen biomes with climate and the coastline with land settings', () => {
    const arid = world(83, { climate: 'arid', land: 35 }).tiles.join('');
    const cold = world(83, { climate: 'cold', land: 75 }).tiles.join('');
    expect(arid.match(/d/g)?.length ?? 0).toBeGreaterThan(30);
    expect(cold.match(/s/g)?.length ?? 0).toBeGreaterThan(30);
    expect(arid.replace(/[~l]/g, '').length / arid.length).toBeCloseTo(0.35, 1);
    expect(cold.replace(/[~l]/g, '').length / cold.length).toBeCloseTo(0.75, 1);
  });

  it('builds two substantial islands with navigable ocean between their ports', async () => {
    const { buildRoutes, spatialIssues } = await import('./atlasSpatial');
    for (const land of [35, 75]) {
      const map = world(801, { land, landform: 'islands' });
      const sites = new Set(map.regions.flatMap((r) => r.cells.map((p) => p.join())));
      const islands: string[][] = [];
      for (const start of sites) {
        sites.delete(start);
        const queue = [start];
        for (const cell of queue) {
          const [x, y] = cell.split(',').map(Number) as [number, number];
          for (const next of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`])
            if (sites.delete(next)) queue.push(next);
        }
        islands.push(queue);
      }
      expect(islands).toHaveLength(2);
      expect(islands.every((island) => island.length > 100)).toBe(true);
      map.locations = islands.map((island, i) => {
        const position = island
          .map((cell) => cell.split(',').map(Number) as [number, number])
          .find(([x, y]) =>
            [
              map.tiles[y]?.[x - 1],
              map.tiles[y]?.[x + 1],
              map.tiles[y - 1]?.[x],
              map.tiles[y + 1]?.[x],
            ].includes('~'),
          )!;
        return {
          id: 'port-' + i,
          name: 'Harbor ' + i,
          kind: 'port',
          preference: 'any-land',
          position,
          regionId: map.regions.find((r) => r.cells.some((p) => p.join() === position.join()))!.id,
        };
      });
      const demand = {
        relation: 'travel',
        from: 'port-0',
        to: 'port-1',
        strength: 'hard',
        origin: 'owner',
        description: 'Cross the strait',
      } as const;
      map.routes = buildRoutes(map, [demand]);
      expect(map.routes.map((r) => r.mode)).toEqual(['sea']);
      expect(terrainIssues(map)).toEqual([]);
      expect(spatialIssues(map, [demand])).toEqual([]);
    }
  });

  it('rejects a ragged or excessive grid before inspecting geometry', () => {
    const map = world(37);
    expect(terrainIssues({ ...map, tiles: ['~~', '~'] })).toMatchObject([{ severity: 'error' }]);
    expect(terrainIssues({ ...map, tiles: ['p'.repeat(129)] })).toMatchObject([{ severity: 'error' }]);
  });

  it('keeps every ocean cell connected to the open sea', () => {
    const map = world(20, { land: 55, ruggedness: 0 });
    const ocean = new Set(
      map.tiles.flatMap((row, y) => [...row].flatMap((t, x) => (t === '~' ? [`${x},${y}`] : []))),
    );
    const reachable = ['0,0'];
    ocean.delete(reachable[0]!);
    for (const cell of reachable) {
      const [x, y] = cell.split(',').map(Number) as [number, number];
      for (const next of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`])
        if (ocean.delete(next)) reachable.push(next);
    }
    expect(ocean.size).toBe(0);
  });

  it('pinpoints duplicate region claims, broken area overlays and uphill rivers', () => {
    const map = world(37);
    const first = map.regions[0]!,
      other = map.regions[1]!;
    other.cells.push(first.cells[0]);
    const grove = map.features.find((feature) => feature.kind === 'grove')!;
    grove.cells = [[0, 0]];
    const river = map.features.find((feature) => feature.kind === 'river')!;
    const [x, y] = river.cells[1]!,
      [beforeX, beforeY] = river.cells[0];
    map.elevation![y]![x] = map.elevation![beforeY]![beforeX]! + 1;
    expect(terrainIssues(map)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'region-land', ids: [other.id], cell: first.cells[0] }),
        expect.objectContaining({ code: 'terrain-feature-surface', ids: [grove.id], cell: [0, 0] }),
        expect.objectContaining({ code: 'river-drainage', ids: [river.id], cell: [x, y] }),
      ]),
    );
    river.cells.pop();
    expect(terrainIssues(map).some((issue) => issue.code === 'river-drainage')).toBe(true);
  });

  it('produces connected and fully partitioned land across climate, seed and size extremes', () => {
    for (const seed of [0, 1, 19, 2147483647]) {
      for (const size of ['small', 'standard'] as const) {
        for (const climate of ['temperate', 'arid', 'cold'] as const) {
          for (const land of [35, 75]) {
            const map = world(seed, { size, climate, land, ruggedness: seed % 4 });
            expect(terrainIssues(map), JSON.stringify({ seed, size, climate, land })).toEqual([]);
            const cells = map.tiles.flatMap((row, y) =>
              [...row].flatMap((tile, x) => ('~l'.includes(tile) ? [] : [`${x},${y}`])),
            );
            const unseen = new Set(cells);
            const queue = [cells[0]!];
            unseen.delete(queue[0]!);
            for (let i = 0; i < queue.length; i++) {
              const [x, y] = queue[i]!.split(',').map(Number) as [number, number];
              for (const next of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
                if (unseen.delete(next)) queue.push(next);
              }
            }
            expect(unseen.size).toBe(0);
            expect(map.features.some((f) => f.kind === 'river')).toBe(true);
          }
        }
      }
    }
  });
});
