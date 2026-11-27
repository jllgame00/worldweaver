import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { defaults, generateAtlas, worldIssues } from './atlasWorkflow';
it('adds navigable ports for required journeys spanning islands without changing the source places', async () => {
  const p = approvedProject();
  const w = await generateAtlas(p, 'Two islands', 80, { ...defaults, landform: 'islands', settlements: 0 }, []);
  expect(w.locations.filter((l) => l.kind === 'port').length).toBeGreaterThanOrEqual(2);
  expect(w.routes.some((r) => r.mode === 'sea')).toBe(true);
  expect(worldIssues(p, w).filter((f) => f.severity === 'error')).toEqual([]);
});
