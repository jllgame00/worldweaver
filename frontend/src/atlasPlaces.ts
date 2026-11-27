import type { Location, Project, TravelRoute, World } from './project.generated';

export function displayableGrid(rows: string[]): boolean {
  const width = rows[0]?.length ?? 0;
  return width > 0 && width <= 128 && rows.length <= 128 && rows.every(row => row.length === width);
}

/** A scenario owns the identity. The atlas stores only its placement and explicit cartographic edits. */
export function atlasPlaces(p: Project): Location[] {
  const placements = new Map(p.world?.placements?.map((v) => [v.locationId, v]));
  return [
    ...(p.world?.locations ?? []),
    ...(p.scenario?.locations ?? []).map((site) => {
      const entry = placements.get(site.id);
      const { locationId: _id, label, ...attributes } = entry ?? {};
      return {
        id: site.id,
        name: label ?? site.name,
        kind: site.kind,
        preference: 'any-land' as const,
        description: site.purpose,
        ...attributes,
      };
    }),
  ];
}
export function resolvedWorld(p: Project): World | undefined {
  return p.world && { ...p.world, locations: atlasPlaces(p) };
}
export function portableWorld(p: Project, draft: World): World {
  const declared = new Map(p.scenario?.locations.map((v) => [v.id, v]));
  return {
    ...draft,
    locations: draft.locations.filter((v) => !declared.has(v.id)),
    placements: draft.locations
      .filter((v) => declared.has(v.id))
      .map((v) => {
        const source = declared.get(v.id)!;
        const { id, name, kind, description, preference, generatedRole: _worldOnly, ...shape } = v;
        return {
          locationId: id,
          ...shape,
          ...(name !== source.name && { label: name }),
          ...(kind !== source.kind && { kind }),
          ...(preference !== 'any-land' && { preference }),
          ...(description !== source.purpose && { description }),
        };
      }),
  };
}

// Find one authored route chain for this journey. Physical validity is checked by the atlas validator.
export function journeyRoutes(routes: TravelRoute[]) {
  const paths = new Map<string, { to: string; route: string }[]>();
  for (const route of routes.filter((r) => r.mode !== 'aqueduct' && r.mode !== 'canal')) {
    for (const [from, to] of [
      [route.from, route.to],
      [route.to, route.from],
    ] as const) {
      if (!paths.has(from)) paths.set(from, []);
      paths.get(from)!.push({ to, route: route.id });
    }
  }
  return (start: string, end: string) => {
    const visited = new Map<string, { parent: string; route: string }>();
    const queue = [start];
    for (let i = 0; i < queue.length && !visited.has(end); i++) {
      const parent = queue[i]!;
      for (const { to, route } of paths.get(parent) ?? []) {
        if (to === start || visited.has(to)) continue;
        visited.set(to, { parent, route });
        queue.push(to);
      }
    }
    const result: string[] = [];
    for (let step = visited.get(end); step; step = visited.get(step.parent)) result.push(step.route);
    return result.reverse();
  };
}
