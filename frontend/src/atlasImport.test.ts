import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { importProject } from './scenarioWorkflow';
import { defaults } from './atlasWorkflow';
it('keeps old grid projects readable and rejects a serialized atlas that cannot be rendered safely', () => {
  const p = approvedProject();
  expect(importProject(JSON.stringify(p))).toEqual(p);
  Object.assign(p.world!, {
    generatorVersion: 'atlas-1',
    name: 'Broken',
    settings: defaults,
    elevation: [],
    tiles: [],
  });
  expect(() => importProject(JSON.stringify(p))).toThrow();
});
