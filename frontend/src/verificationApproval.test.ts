import { expect, it, vi } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';
import { runVerification } from './verificationEngine';
import { verificationIdentity } from './verificationHistory';
import { persistReport } from './verificationReport';
import { editDesign } from './scenarioWorkflow';

it('checks the full design again before owner approval and preserves proof across canvas moves', async () => {
  const source = approvedProject();
  const p = acceptAtlas(
    source,
    await generateAtlas(source, 'Estuary', 42, defaults, []),
    source.revision,
    true,
  );
  const response = {
    valid: true,
    complete: true,
    statesExplored: 6,
    findings: [],
    feasibleEdgeIds: p.edges.map((e) => e.id),
    paths: p.endings.map((e) => ({
      endingId: e.id,
      nodeIds: ['n-start', 'n-gate', 'n-witness', 'n-choose', e.nodeId],
    })),
  };
  const request = vi.fn(async () => Response.json(response));
  vi.stubGlobal('fetch', request);
  const report = await runVerification(p, { mode: 'full' });
  const checked = persistReport(p, report, await verificationIdentity(p));
  const module = await import('./verificationReport');
  expect(module.confirmWorldReview).toBeTypeOf('function');
  const approved = await module.confirmWorldReview(checked, report.run.id, new AbortController().signal);
  expect(request).toHaveBeenCalledTimes(2);
  expect(approved.approval?.revision).toBe(p.revision);
  const moved = editDesign(
    approved,
    (next) => {
      next.scenario!.layout = [{ nodeId: next.nodes[0]!.id, x: 9, y: 2 }];
    },
    true,
  );
  const after = await runVerification(moved, { mode: 'full' });
  expect(after.findings.filter((f) => f.rule === 'sources.approval')).toEqual([]);
  const tampered = structuredClone(moved);
  tampered.nodes[0]!.description += ' changed';
  expect(
    (await runVerification(tampered, { mode: 'full' })).findings.some((f) => f.rule === 'sources.approval'),
  ).toBe(true);
  await expect(
    module.confirmWorldReview(tampered, report.run.id, new AbortController().signal),
  ).rejects.toThrow();
});
