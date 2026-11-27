import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { isProject } from './validation';
import { listProjects, saveProject } from './storage';
import { importProject } from './scenarioWorkflow';
import type { AgentRun, Project } from './project.generated';

const run: AgentRun = {
  id: 'verify-example',
  stage: 'verify',
  baseRevision: 0,
  mode: 'deterministic',
  status: 'proposed',
  repairAttempts: 0,
  calls: 0,
  receipts: [],
};
const entry = {
  runId: run.id,
  fingerprint: 'a'.repeat(64),
  timestamp: '2026-11-27T01:00:00Z',
  mode: 'quick',
  tools: [],
  findings: [],
  paths: [],
  statesExplored: 0,
  decisions: [],
};
it('round trips historical verification metadata with canonical JSON and IndexedDB', async () => {
  const p = approvedProject();
  const checked = { ...p, runs: [...p.runs, run], verificationHistory: [entry] };
  expect(isProject(checked)).toBe(true);
  await saveProject('verification-history', checked as Project);
  expect(
    importProject(JSON.stringify((await listProjects('verification-history')).projects[0]!.project)),
  ).toEqual(checked);
  expect(isProject({ ...checked, runs: p.runs })).toBe(false);
  expect(isProject({ ...checked, verificationHistory: [{ ...entry, fingerprint: 'untrusted' }] })).toBe(
    false,
  );
  expect(
    isProject({
      ...checked,
      runs: [...p.runs, { ...run, status: 'verified' }],
      verificationHistory: [{ ...entry, mode: 'full', tools: [] }],
    }),
  ).toBe(false);
});

it('charges each requested repair to its run and retains the pending comparison across reload', async () => {
  const p = approvedProject(),
    checked = { ...p, runs: [...p.runs, run], verificationHistory: [entry] } as Project;
  const module = await import('./verificationHistory');
  expect(module.reserveRepair).toBeTypeOf('function');
  const change = {
    proposalId: 'first',
    findingId: 'route-error',
    recordId: 'route',
    field: 'distanceKm',
    before: '10',
    after: '4',
    requires: [],
  };
  const source = {
    ...checked,
    verificationHistory: [
      {
        ...checked.verificationHistory![0]!,
        findings: [
          {
            id: change.findingId,
            runId: run.id,
            rule: 'world.route_geometry',
            origin: 'deterministic' as const,
            severity: 'error' as const,
            entityIds: ['route'],
            explanation: 'Distance',
            suggestedRepair: 'Recalculate',
            status: 'open' as const,
            checkedRevision: p.revision,
          },
        ],
      },
    ],
  };
  const one = module.reserveRepair(source, run.id, [change], 'technical');
  const two = module.reserveRepair(one, run.id, [{ ...change, proposalId: 'second' }], 'technical');
  expect(() => module.reserveRepair(two, run.id, [{ ...change, proposalId: 'third' }], 'technical')).toThrow(
    /two/i,
  );
  expect(two.runs.at(-1)?.repairAttempts).toBe(2);
  await saveProject('saved-repair', two);
  expect(
    (await listProjects('saved-repair')).projects[0]?.project.verificationHistory?.[0]?.proposals?.[0]
      ?.edits[0],
  ).toEqual(change);
  const damaged = structuredClone(two);
  damaged.verificationHistory![0]!.proposals![0]!.edits[0].findingId = 'missing-source';
  expect(isProject(damaged)).toBe(false);
});
