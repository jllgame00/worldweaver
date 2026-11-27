import type { AtlasIssue, AtlasSettings } from './atlasTypes';
import type { Point, Region, TerrainFeature, World } from './project.generated';

// Each field samples its own continuous lattice, so a climate change preserves the coastline.
function noise(seed: number, x: number, y: number): number {
  function sample(i: number, j: number) {
    let h = seed ^ Math.imul(i, 374761393) ^ Math.imul(j, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const i = Math.floor(x),
    j = Math.floor(y);
  const dx = x - i,
    dy = y - j;
  const u = dx * dx * (3 - 2 * dx),
    v = dy * dy * (3 - 2 * dy);
  const top = sample(i, j) * (1 - u) + sample(i + 1, j) * u;
  const bottom = sample(i, j + 1) * (1 - u) + sample(i + 1, j + 1) * u;
  return top * (1 - v) + bottom * v;
}

function neighbors(i: number, width: number, height: number): number[] {
  const result: number[] = [];
  if (i % width > 0) result.push(i - 1);
  if (i % width < width - 1) result.push(i + 1);
  if (i >= width) result.push(i - width);
  if (i < width * (height - 1)) result.push(i + width);
  return result;
}

function gridCells(ids: number[], width: number): [Point, ...Point[]] {
  return ids.map((i) => [i % width, Math.floor(i / width)]) as [Point, ...Point[]];
}

function fill(starts: number[], around: number[][], allowed: (i: number) => boolean) {
  const queue = [...starts],
    distance = new Int32Array(around.length).fill(-1);
  const owner = new Int32Array(around.length).fill(-1);
  starts.forEach((i, n) => {
    distance[i] = 0;
    owner[i] = n;
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]!;
    for (const j of around[i]!)
      if (distance[j]! < 0 && allowed(j)) {
        distance[j] = distance[i]! + 1;
        owner[j] = owner[i]!;
        queue.push(j);
      }
  }
  return { queue, distance, owner };
}

export function terrain(
  seed: number,
  settings: AtlasSettings,
): Pick<World, 'tiles' | 'regions' | 'features' | 'elevation'> {
  const width = settings.size === 'small' ? 48 : 72,
    height = (width * 2) / 3;
  const all = Array.from({ length: width * height }, (_, i) => i);
  const around = all.map((i) => neighbors(i, width, height));
  const center = width * Math.floor(height / 2) + Math.floor(width / 2);
  const islands = settings.landform === 'islands';
  const strait = Array.from({ length: height }, (_, y) =>
    Math.floor(width * (0.5 + 0.14 * (noise(seed + 83, 1, (3 * y) / height) - 0.5))),
  );
  const shape = all.map((i) => {
    const x = ((i % width) + 0.5) / width,
      y = (Math.floor(i / width) + 0.5) / height;
    const localX = islands ? (2 * x) % 1 : x;
    return (
      1 -
      Math.hypot(2 * localX - 1, 2 * y - 1) +
      0.6 * noise(seed, x * 4, y * 4) +
      0.2 * noise(seed + 25, x * 11, y * 11)
    );
  });
  // Growing the best cell on the active coastline preserves four-neighbor connectivity.
  const land = new Set<number>(),
    frontier = new Set(islands ? [center - width / 4, center + width / 4] : [center]);
  while (land.size < Math.round((all.length * settings.land) / 100) && frontier.size) {
    let best = -1;
    for (const i of frontier) if (best < 0 || shape[i]! > shape[best]!) best = i;
    land.add(best);
    frontier.delete(best);
    for (const j of around[best]!) {
      if (islands && Math.abs((j % width) - strait[Math.floor(j / width)]!) <= 1) continue;
      if (around[j]!.length === 4 && !land.has(j)) frontier.add(j);
    }
  }
  const coast = fill(
    all.filter((i) => !land.has(i)),
    around,
    (i) => land.has(i),
  ).distance;
  const relief = all.map((i) => {
    if (!land.has(i)) return 0;
    const x = (i % width) / width,
      y = Math.floor(i / width) / height;
    const spine = 0.3 + 0.42 * x + 0.45 * (noise(seed + 71, x * 4, 1) - 0.5);
    const crest = Math.max(0, 1 - Math.abs(y - spine) * 6);
    const hills = noise(seed + 41, x * 7, y * 7);
    return (
      1 +
      Math.round(
        coast[i]! * 18 +
          (1 + settings.ruggedness) *
            Math.min(1, coast[i]! / 4) *
            (32 * hills + 185 * crest * crest * (0.45 + hills)),
      )
    );
  });
  const rank = [...land].sort((a, b) => relief[b]! - relief[a]! || a - b);
  const peak = relief[rank[0]!]!;
  const tiles: string[] = all.map((i) => {
    if (!land.has(i)) return '~';
    const x = (i % width) / width,
      y = Math.floor(i / width) / height;
    const moisture = noise(seed + 57, x * 5, y * 5) + 0.14 * (1 - x) - (settings.climate === 'arid' ? 0.35 : 0);
    if (settings.climate === 'cold' && y < 0.33 + (0.32 * relief[i]!) / peak) return 's';
    if (relief[i]! > peak * 0.66) return 'm';
    if (relief[i]! > peak * 0.4) return 'h';
    if (moisture < 0.24) return 'd';
    if (moisture > 0.56) return 'f';
    return 'p';
  });

  const features: TerrainFeature[] = [];
  function feature(kind: TerrainFeature['kind'], name: string, cells: number[]) {
    const n = features.filter((f) => f.kind === kind).length + 1;
    features.push({ id: `atlas-${kind}-${n}`, kind, name, cells: gridCells(cells, width) });
  }
  // Flood an inland depression. Its spill level is below every surrounding shore.
  const lakeSite = rank.filter((i) => coast[i]! >= 4).at(-1)!;
  const lake = new Set([lakeSite]);
  const shores = new Set(around[lakeSite]!);
  while (lake.size < width / 8 && shores.size) {
    const next = [...shores].sort((a, b) => relief[a]! - relief[b]! || a - b)[0]!;
    shores.delete(next);
    if (coast[next]! < 3) continue;
    lake.add(next);
    for (const j of around[next]!) if (!lake.has(j)) shores.add(j);
  }
  const lakeLevel =
    Math.min(...[...lake].flatMap((i) => around[i]!.filter((j) => !lake.has(j)).map((j) => relief[j]!))) - 1;
  for (const i of lake) {
    land.delete(i);
    tiles[i] = 'l';
    relief[i] = lakeLevel;
  }
  feature('lake', 'Stillwater Lake', [...lake]);
  const sea = fill([0], around, (i) => tiles[i] === '~').distance;
  for (const i of all)
    if (tiles[i] === '~' && sea[i]! < 0) {
      const pool = [i];
      tiles[i] = 'l';
      let shore = Infinity;
      for (const cell of pool)
        for (const next of around[cell]!) {
          if (tiles[next] === '~') {
            tiles[next] = 'l';
            pool.push(next);
          } else if (land.has(next)) shore = Math.min(shore, relief[next]!);
        }
      for (const cell of pool) relief[cell] = Math.max(1, shore - 1);
      feature('lake', `Mere ${features.filter((f) => f.kind === 'lake').length + 1}`, pool);
    }

  // Strict descent gives each cell a terminating drainage path; inland sinks become explicit basins.
  const downstream = all.map((i) => around[i]!.reduce((best, j) => (relief[j]! < relief[best]! ? j : best), i));
  const streams = rank
    .filter((i) => land.has(i) && relief[i]! > peak * 0.35)
    .map((i) => {
      const path = [i];
      while (land.has(i) && downstream[i] !== i) {
        i = downstream[i]!;
        path.push(i);
      }
      return path;
    })
    .filter((path) => path.length >= 4)
    .sort(
      (a, b) =>
        Number(land.has(a[a.length - 1]!)) - Number(land.has(b[b.length - 1]!)) ||
        b.length - a.length ||
        a[0]! - b[0]!,
    );
  const used = new Set<number>();
  const outlets: number[] = [];
  let rivers = 0;
  for (const path of streams) {
    if (rivers === (width === 48 ? 3 : 5)) break;
    if (path.some((i) => used.has(i))) continue;
    const end = path[path.length - 1]!;
    // At continental scale select major catchments with spatially distinct outlets.
    if (
      outlets.some(
        (i) =>
          Math.abs((i % width) - (end % width)) + Math.abs(Math.floor(i / width) - Math.floor(end / width)) <
          width / 8,
      )
    )
      continue;
    outlets.push(end);
    if (land.has(end)) feature('basin', `Closed Basin ${rivers + 1}`, [end]);
    feature('river', ['Alder River', 'Silver Run', 'Greywater', 'Reedwater', 'North Fork'][rivers++]!, path);
    for (const i of path) {
      used.add(i);
      if (land.has(i) && relief[i]! < peak * 0.55) tiles[i] = 'v';
    }
  }
  for (const [tile, kind, name] of [
    ['m', 'ridge', 'Crown Range'],
    ['f', 'grove', 'Alderwood'],
    ['d', 'dunes', 'Amber Dunes'],
  ] as const) {
    const visited = new Set<number>();
    let largest: number[] = [];
    for (const i of land)
      if (tiles[i] === tile && !visited.has(i)) {
        const group = [i];
        visited.add(i);
        for (let j = 0; j < group.length; j++) {
          for (const n of around[group[j]!]!)
            if (tiles[n] === tile && !visited.has(n)) {
              visited.add(n);
              group.push(n);
            }
        }
        if (group.length > largest.length) largest = group;
      }
    if (largest.length) feature(kind, name, largest);
  }

  const seeds = [rank.find((i) => land.has(i))!];
  let partition = fill(seeds, around, (i) => land.has(i));
  while (seeds.length < (width === 48 ? 4 : 6)) {
    const nextIsland = rank.find((i) => land.has(i) && partition.owner[i]! < 0);
    seeds.push(nextIsland ?? partition.queue[partition.queue.length - 1]!);
    partition = fill(seeds, around, (i) => land.has(i));
  }
  const names = ['High March', 'Westreach', 'Low March', 'Dawn Vale', 'Reed Coast', 'Ash Downs'];
  const regions: Region[] = seeds.map((_, n) => ({
    id: `atlas-region-${n + 1}`,
    name: names[n]!,
    cells: gridCells(
      partition.queue.filter((i) => partition.owner[i] === n),
      width,
    ),
  }));
  return {
    tiles: Array.from({ length: height }, (_, y) => tiles.slice(y * width, (y + 1) * width).join('')),
    elevation: Array.from({ length: height }, (_, y) => relief.slice(y * width, (y + 1) * width)),
    regions,
    features,
  };
}

/** Checks persisted geometry independently of the algorithm that produced it. */
export function terrainIssues(world: World): AtlasIssue[] {
  const issues: AtlasIssue[] = [];
  function error(code: string, id: string, message: string, repair: string, cell?: Point) {
    issues.push({ code, ids: [id], severity: 'error', message, repair, ...(cell ? { cell } : {}) });
  }
  const { tiles, regions, features, elevation } = world;
  const width = tiles?.[0]?.length ?? 0,
    height = tiles?.length ?? 0;
  if (
    !Array.isArray(tiles) ||
    !width ||
    !height ||
    width > 128 ||
    height > 128 ||
    !tiles.every((row) => typeof row === 'string' && row.length === width && /^[~lmhvpfds]+$/.test(row))
  ) {
    error(
      'terrain-grid',
      world.id,
      'Terrain must be a rectangle of known tiles up to 128 × 128 cells.',
      'Restore the grid or regenerate terrain.',
    );
    return issues;
  }
  if (
    !Array.isArray(elevation) ||
    elevation.length !== height ||
    !elevation.every(
      (row) =>
        Array.isArray(row) && row.length === width && row.every((n) => Number.isSafeInteger(n) && n >= 0),
    )
  ) {
    error(
      'terrain-elevation',
      world.id,
      'The elevation grid must give a nonnegative integer height for every tile.',
      'Restore the elevation grid or regenerate terrain.',
    );
    return issues;
  }
  const surface = tiles.join(''),
    heights = elevation.flat();
  const water = (i: number) => surface[i] === '~' || surface[i] === 'l';
  const inBounds = (p: Point) =>
    Array.isArray(p) &&
    p.length === 2 &&
    p.every(Number.isInteger) &&
    p[0] >= 0 &&
    p[0] < width &&
    p[1] >= 0 &&
    p[1] < height;
  const all = Array.from({ length: surface.length }, (_, i) => i);
  const around = all.map((i) => neighbors(i, width, height));
  const point = (i: number): Point => [i % width, Math.floor(i / width)];
  const sea = all.find((i) => surface[i] === '~' && heights[i] !== 0);
  if (sea !== undefined)
    error('terrain-sea-level', world.id, 'Ocean elevation must be zero.', 'Restore sea level.', point(sea));
  const coast = fill(
    all.filter((i) => surface[i] === '~' && around[i]!.length < 4),
    around,
    (i) => surface[i] === '~',
  ).distance;
  const stranded = all.find((i) => surface[i] === '~' && coast[i]! < 0);
  if (stranded !== undefined)
    error(
      'terrain-inland-sea',
      world.id,
      'An ocean cell has no outlet to the open sea.',
      'Classify the enclosed water as a lake.',
      point(stranded),
    );
  const firstLand = all.find((i) => !water(i));
  if (firstLand === undefined || !surface.includes('~')) {
    error(
      'terrain-continent',
      world.id,
      'The atlas needs a continent and surrounding ocean.',
      'Regenerate the landmass.',
    );
  }
  if (
    !Array.isArray(regions) ||
    !Array.isArray(features) ||
    regions.length + features.length > surface.length * 2 ||
    [...regions, ...features].reduce((sum, entity) => sum + (entity?.cells?.length ?? 0), 0) >
      surface.length * 16
  ) {
    error(
      'terrain-geometry-limit',
      world.id,
      'Region and feature data exceed the geometry budget.',
      'Restore a bounded terrain snapshot.',
    );
    return issues;
  }
  const claimed = new Set<number>(),
    basins = new Set<number>(),
    ids = new Set<string>();
  const rivers: { id: string; cells: number[] }[] = [];
  const featureTiles: Partial<Record<TerrainFeature['kind'], string>> = {
    lake: 'l',
    ridge: 'mh',
    grove: 'f',
    dunes: 'd',
  };
  function cells(entity: Region | TerrainFeature): number[] | undefined {
    if (ids.has(entity.id))
      error(
        'terrain-id',
        entity.id,
        'Two overlays share an ID.',
        'Give each region and feature a distinct ID.',
      );
    ids.add(entity.id);
    if (!Array.isArray(entity.cells) || !entity.cells.length || !entity.cells.every(inBounds)) {
      error(
        'terrain-coordinates',
        entity.id,
        'Geometry contains an empty or out-of-bounds cell list.',
        'Use integer coordinates inside the grid.',
      );
      return;
    }
    const values = entity.cells.map(([x, y]) => y * width + x);
    const members = new Set(values);
    if (members.size !== values.length) {
      error('terrain-repeat', entity.id, 'Geometry repeats a cell.', 'Remove the repeated cell.');
      return;
    }
    const pending = [values[0]!];
    members.delete(pending[0]!);
    for (let n = 0; n < pending.length; n++) {
      for (const next of around[pending[n]!]!) if (members.delete(next)) pending.push(next);
    }
    if (members.size) {
      error(
        'terrain-disconnected',
        entity.id,
        'Geometry contains disconnected cells.',
        'Use a four-neighbor connected shape.',
      );
    }
    return values;
  }
  for (const region of regions) {
    const members = cells(region);
    if (!members) continue;
    const conflict = members.find((i) => water(i) || claimed.has(i));
    if (conflict !== undefined)
      error(
        'region-land',
        region.id,
        'Region claims water or overlaps another region.',
        'Assign this land cell to exactly one region.',
        point(conflict),
      );
    for (const i of members) claimed.add(i);
  }
  const unassigned = all.find((i) => !water(i) && !claimed.has(i));
  if (unassigned !== undefined)
    error(
      'region-gap',
      world.id,
      'A land cell has no region.',
      'Extend an adjacent region to cover this cell.',
      point(unassigned),
    );
  for (const f of features) {
    const members = cells(f);
    if (!members) continue;
    if (f.kind === 'river') {
      rivers.push({ id: f.id, cells: members });
      continue;
    }
    const compatible = featureTiles[f.kind];
    const bad = members.find((i) => {
      if (f.kind === 'basin') return water(i) || around[i]!.some((j) => heights[j]! < heights[i]!);
      if (!compatible?.includes(surface[i]!)) return true;
      return (
        f.kind === 'lake' && (heights[i] !== heights[members[0]!] || around[i]!.some((j) => surface[j] === '~'))
      );
    });
    if (bad !== undefined)
      error(
        'terrain-feature-surface',
        f.id,
        'Feature geometry conflicts with its terrain or drainage.',
        'Align the overlay with its physical surface.',
        point(bad),
      );
    else if (f.kind === 'basin') for (const i of members) basins.add(i);
  }
  for (const river of rivers) {
    const bad = river.cells.find(
      (i, n, path) =>
        (n < path.length - 1 && water(i)) ||
        (n > 0 && (!around[path[n - 1]!]!.includes(i) || heights[i]! > heights[path[n - 1]!]!)),
    );
    const end = river.cells[river.cells.length - 1]!;
    if (bad !== undefined || river.cells.length < 2 || (!water(end) && !basins.has(end))) {
      error(
        'river-drainage',
        river.id,
        'A river needs a continuous downhill course to water or a documented basin.',
        'Trace the river from land to its outlet.',
        point(bad ?? end),
      );
    }
  }
  return issues;
}
