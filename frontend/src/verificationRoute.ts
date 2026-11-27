import { resolvedWorld } from './atlasPlaces';
import { buildRoutes, lengthKm, spatialIssues } from './atlasSpatial';
import type { Project, TravelRoute } from './project.generated';

export function rebuiltRoute(project: Project, id: string): TravelRoute | undefined {
  const world = resolvedWorld(project);
  if (!world) return;
  const targets = world.routes.filter((route) => route.id === id);
  const route = targets[0];
  if (!route || targets.length !== 1) return;
  const from = world.locations.find((site) => site.id === route.from);
  const to = world.locations.find((site) => site.id === route.to);
  if (!from?.position || !to?.position || route.from === route.to) return;
  const faults = (candidate: TravelRoute) =>
    spatialIssues({ ...world, routes: [candidate] }, []).filter(
      (issue) => issue.ids.includes(id) && issue.severity === 'error',
    );
  if (!faults(route).some((issue) => issue.code === 'route_geometry')) return;

  const surface = ['road', 'trail', 'pass', 'bridge'].includes(route.mode);
  const rivers = new Set(
    world.features.filter((f) => f.kind === 'river').flatMap((f) => f.cells.map((p) => p.join())),
  );
  function physicalPath(path: TravelRoute['path']): TravelRoute | undefined {
    const { crossings: _, ...original } = route!;
    const crossings = surface ? path.filter((p) => rivers.has(p.join())) : [];
    const candidate = {
      ...original,
      path,
      distanceKm: lengthKm(world!, path, from!, to!),
      ...(crossings.length && { crossings }),
    };
    if (!faults(candidate).length) return candidate;
  }
  // Keep the designer's corridor if restoring direction, distance or crossing marks suffices.
  if (route.path.length >= 2) {
    const preserved =
      physicalPath([...route.path]) ?? physicalPath([...route.path].reverse() as TravelRoute['path']);
    if (preserved) return preserved;
  }
  const endpoints = new Set([from.position.join(), to.position.join()]);
  // For an explicit sea leg, exclude inland shortcuts from the generator's land-first search.
  const tiles =
    route.mode !== 'sea'
      ? world.tiles
      : world.tiles.map((row, y) =>
          [...row].map((tile, x) => (tile === '~' || endpoints.has([x, y].join()) ? tile : 'l')).join(''),
        );
  const relation = route.mode === 'aqueduct' || route.mode === 'canal' ? route.mode : 'travel';
  const routes = buildRoutes({ ...world, tiles, locations: [from, to] }, [
    { from: from.id, to: to.id, relation, strength: 'hard', origin: 'owner', description: '' },
  ]).filter((r) => relation === 'travel' || r.mode === relation);
  if (routes.length !== 1) return;
  const generated = routes[0]!;
  return physicalPath(
    generated.from === from.id ? generated.path : ([...generated.path].reverse() as TravelRoute['path']),
  );
}
