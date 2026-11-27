import type { World, Point, Location } from './project.generated';

/** Provide a port per island, also connecting inland required journeys to the ferry network. */
export function islandPorts(world: World, free: (s: string) => string, korean: boolean): Location[] {
  const width = world.tiles[0]!.length,
    height = world.tiles.length;
  const tile = (x: number, y: number) => world.tiles[y]?.[x];
  const regions = new Map(world.regions.flatMap((r) => r.cells.map((p) => [p.join(), r.id] as const)));
  const sites = new Map(
    world.locations.filter((l) => l.position && !(l.level ?? 0)).map((l) => [l.position!.join(), l]),
  );
  const seen = new Set<number>(),
    ports: Location[] = [];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const value = tile(x, y);
      if (seen.has(y * width + x) || !value || '~l'.includes(value)) continue;
      const component: Point[] = [[x, y]];
      seen.add(y * width + x);
      let anchor: Point | undefined,
        existing = false;
      for (const [cx, cy] of component) {
        const site = sites.get([cx, cy].join());
        if (site?.kind === 'port') existing = true;
        for (const [nx, ny] of [
          [cx - 1, cy],
          [cx + 1, cy],
          [cx, cy - 1],
          [cx, cy + 1],
        ] as Point[]) {
          const t = tile(nx, ny);
          if (!t) continue;
          if (t === '~' && !site && !anchor) anchor = [cx, cy];
          if (!'~l'.includes(t) && !seen.has(ny * width + nx)) {
            seen.add(ny * width + nx);
            component.push([nx, ny]);
          }
        }
      }
      if (existing || !anchor) continue;
      const id = free('atlas-harbor-' + (ports.length + 1));
      ports.push({
        id,
        name: (korean ? '해협 나루 ' : 'Strait Haven ') + (ports.length + 1),
        kind: 'port',
        preference: 'any-land',
        generatedRole: 'harbor',
        position: anchor,
        regionId: regions.get(anchor.join()),
      });
    }
  return ports;
}
