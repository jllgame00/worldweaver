import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { saveProject, listProjects } from './storage';
import { importProject } from './scenarioWorkflow';
import * as api from './atlasWorkflow';
it('uses current approval, keeps the scenario declaration intact and round trips physical placements', async () => {
  const p = approvedProject(),
    saved = structuredClone(p);
  const world = await api.generateAtlas(p, '하천 지도', 17, api.defaults, []);
  expect(api.worldIssues(p, world).filter((f: { severity: string }) => f.severity === 'error')).toEqual([]);
  const q = api.acceptAtlas(p, world, p.revision, true);
  expect(q.scenario).toEqual(p.scenario);
  expect(q.world!.locations.some((x: { id: string }) => x.id === 'vault')).toBe(false);
  expect(q.world!.placements!.some((x: { locationId: string }) => x.locationId === 'vault')).toBe(true);
  expect(api.resolvedWorld(q)!.locations.find((x) => x.id === 'vault')!.level).toBeLessThan(0);
  expect(p).toEqual(saved);
  await saveProject('atlas-accept', q);
  expect(importProject(JSON.stringify((await listProjects('atlas-accept')).projects[0]!.project))).toEqual(q);
  expect(() => api.acceptAtlas(q, world, p.revision, true)).toThrow();
  const outdated = structuredClone(q);
  outdated.versions.scenario++;
  expect(
    api
      .worldIssues(outdated, api.resolvedWorld(outdated)!)
      .some((x: { code: string }) => x.code === 'source'),
  ).toBe(true);
  p.scenario!.approved = false;
  await expect(api.generateAtlas(p, 'old', 17, api.defaults, [])).rejects.toThrow();
});
it('records advisory evidence and approves an unchanged saved draft without advancing its geometry version', async () => {
  const p = approvedProject();
  const world = await api.generateAtlas(p, 'Estuary', 8, api.defaults, [
    {
      from: 'vault',
      to: 'absent-river',
      relation: 'river',
      origin: 'owner',
      strength: 'soft',
      description: 'Preferred bank',
    },
  ]);
  const draft = api.acceptAtlas(p, world, p.revision, false);
  expect(draft.findings.some((f) => f.rule === 'world.constraint_reference' && f.status === 'open')).toBe(
    true,
  );
  const q = api.acceptAtlas(draft, api.resolvedWorld(draft)!, draft.revision, true);
  expect(q.versions.world).toBe(draft.versions.world);
  expect(q.runs.at(-1)?.mode).toBe('deterministic');
});
