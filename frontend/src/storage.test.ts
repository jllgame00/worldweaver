import { expect, test } from 'vitest';
import fixture from '../../docs/examples/salt-census.json';
import { createProject } from './project';
import { listProjects, SaveConflict, saveProject } from './storage';
import { isProject } from './validation';

test('a stale writer cannot overwrite a project saved by another tab', async () => {
  const name = 'ww-storage-race';
  const original = createProject('Original title');
  const { token } = await saveProject(name, original);
  const saved = await saveProject(name, { ...original, title: 'First writer', revision: 1 }, token);

  await expect(saveProject(name, { ...original, title: 'Stale writer', revision: 1 }, token)).rejects.toBeInstanceOf(SaveConflict);
  expect(await listProjects(name)).toEqual({ projects: [saved], unreadable: false });
});

test('round-trips the unchanged canonical example including later-stage data', async () => {
  const example: unknown = JSON.parse(JSON.stringify(fixture));
  if (!isProject(example)) throw new Error('The Phase 0 example failed validation');

  await saveProject('ww-canonical-fixture', example);
  const { projects, unreadable } = await listProjects('ww-canonical-fixture');

  expect(unreadable).toBe(false);
  expect(projects.map(({ project }) => project)).toEqual([fixture]);
});
