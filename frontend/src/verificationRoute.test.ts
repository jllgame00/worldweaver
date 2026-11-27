import { expect, it } from 'vitest';
import { spatialIssues } from './atlasSpatial';
import { createProject } from './project';
import type { Point, Project, TravelRoute } from './project.generated';
import { rebuiltRoute } from './verificationRoute';

function projectWithDamagedRoad(): Project {
  const project = createProject('Crossing');
  const cells: Point[] = [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [2, 0],
  ];
  project.world = {
    id: 'world',
    seed: 7,
    generatorVersion: 'atlas-1',
    tiles: ['p~p', 'ppp'],
    features: [],
    regions: [{ id: 'r', name: 'Banks', cells: cells as [Point, ...Point[]] }],
    locations: ['a', 'z'].map((id, i) => ({
      id,
      name: id,
      kind: 'village',
      regionId: 'r',
      preference: 'any-land',
      position: [2 * i, 0],
    })),
    routes: [
      {
        id: 'designer-road',
        from: 'z',
        to: 'a',
        mode: 'road',
        path: [
          [2, 0],
          [1, 0],
          [0, 0],
        ],
        distanceKm: 2,
      },
    ],
  };
  return project;
}

it('rebuilds one blocked road in its saved direction with a verified dry path and measured length', () => {
  const project = projectWithDamagedRoad(),
    world = project.world!,
    before = structuredClone(project);
  const rebuilt = rebuiltRoute(project, 'designer-road');
  expect(rebuilt).toEqual({
    id: 'designer-road',
    from: 'z',
    to: 'a',
    mode: 'road',
    path: [
      [2, 0],
      [2, 1],
      [1, 1],
      [0, 1],
      [0, 0],
    ],
    distanceKm: 4,
  });
  expect(spatialIssues({ ...world, routes: [rebuilt!] }, []).filter((i) => i.severity === 'error')).toEqual(
    [],
  );
  expect(rebuiltRoute(project, 'designer-road')).toEqual(rebuilt);
  expect(project).toEqual(before);
});

it('declines a mode change, a duplicate target ID, and a path that already passes', () => {
  const project = projectWithDamagedRoad(),
    route = project.world!.routes[0]!;
  route.mode = 'sea';
  expect(rebuiltRoute(project, route.id)).toBeUndefined();
  route.mode = 'road';
  project.world!.routes.push({ ...route });
  expect(rebuiltRoute(project, route.id)).toBeUndefined();
  project.world!.routes.pop();
  const valid = rebuiltRoute(project, route.id) as TravelRoute;
  project.world!.routes = [valid];
  expect(rebuiltRoute(project, route.id)).toBeUndefined();
});
