import type { Location, Project, World } from './project.generated';

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
