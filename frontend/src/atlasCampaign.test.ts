import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { defaults, generateAtlas, worldIssues } from './atlasWorkflow';
import type { Location, Point, World } from './project.generated';

it('places a river gate between two nearby surface sites on the same seed as the campaign', async () => {
  const p = approvedProject();
  const w = await generateAtlas(
    p,
    'Confluence',
    74874,
    {
      ...defaults,
      size: 'standard',
      land: 35,
      climate: 'temperate',
      ruggedness: 1,
      roads: 2,
      settlements: 2,
      politics: 3,
      kmPerCell: 0.1,
    },
    [
      { from: 'l-gate', relation: 'river', strength: 'hard', origin: 'owner', description: 'On the river' },
      {
        from: 'l-hall',
        to: 'l-beacon',
        relation: 'near',
        strength: 'hard',
        origin: 'owner',
        description: 'Within four cells',
      },
      {
        from: 'l-hall',
        to: 'l-beacon',
        via: 'l-gate',
        relation: 'separates',
        strength: 'hard',
        origin: 'owner',
        description: 'On opposite sides',
      },
    ],
  );
  expect(worldIssues(p, w).filter((f) => f.severity === 'error')).toEqual([]);
});

function vacantSquare(w: World): Point[] {
  const occupied = new Set(w.locations.map((l) => l.position?.join()));
  for (let y = 1; y < w.tiles.length - 1; y++) {
    for (let x = 1; x < w.tiles[0]!.length - 1; x++) {
      const cells = Array.from({ length: 9 }, (_, i): Point => [x + (i % 3) - 1, y + Math.floor(i / 3) - 1]);
      if (cells.every(([cx, cy]) => !'~l'.includes(w.tiles[cy]![cx]!) && !occupied.has([cx, cy].join())))
        return cells;
    }
  }
  throw Error('Expected an unoccupied 3 × 3 land patch in the fixture.');
}

it('preserves a valid footprint hole and rejects an excluded marker or disjoint shape', async () => {
  const p = approvedProject();
  const w = await generateAtlas(p, 'Footprints', 74001, defaults, []);
  const block = vacantSquare(w),
    ring = block.filter((_, i) => i !== 4);
  function inspect(position: Point, area: Point[]) {
    const region = w.regions.find((r) => r.cells.some((c) => c.join() === position.join()))!;
    const addition: Location = {
      id: 'orchard',
      name: 'Orchard',
      kind: 'forest',
      preference: 'any-land',
      position,
      regionId: region.id,
      area,
    };
    return worldIssues(p, { ...w, locations: [...w.locations, addition] }).filter(
      (f) => f.severity === 'error',
    );
  }
  expect(inspect(ring[0]!, ring)).toEqual([]);
  expect(inspect(block[4]!, ring)).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'location_area', ids: ['orchard'] })]),
  );
  expect(inspect(block[0]!, [block[0]!, block[8]!])).toEqual(
    expect.arrayContaining([expect.objectContaining({ code: 'location_area', ids: ['orchard'] })]),
  );
});
