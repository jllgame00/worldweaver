import { afterEach, expect, it, vi } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';
import type { Project } from './project.generated';

import { runVerification, verificationPlan } from './verificationEngine';

async function accepted() {
  const p = approvedProject();
  return acceptAtlas(p, await generateAtlas(p, 'Marsh', 42, defaults, []), p.revision, true);
}

function graph(p: Project) {
  const path = (id: string) => ['n-start', 'n-gate', 'n-witness', 'n-choose', id];
  return {
    valid: true,
    complete: true,
    statesExplored: 6,
    findings: [],
    feasibleEdgeIds: p.edges.map((e) => e.id),
    paths: p.endings.map((e) => ({ endingId: e.id, nodeIds: path(e.nodeId) })),
  };
}
afterEach(() => vi.unstubAllGlobals());

it('requires every current full receipt and ending witnesses before marking verified', async () => {
  const p = await accepted(),
    before = JSON.stringify(p);
  const call = vi.fn(async () => Response.json(graph(p)));
  vi.stubGlobal('fetch', call);
  const report = await runVerification(p, { mode: 'full' });
  expect(report.run.status).toBe('verified');
  expect(report.tools.map((r) => r.tool)).toEqual(verificationPlan('full'));
  expect(report.tools.every((r) => r.status === 'passed' && r.checkedRevision === p.revision)).toBe(true);
  expect(report.paths).toHaveLength(2);
  expect(report.run.calls).toBe(0);
  expect(call).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(p)).toBe(before);
});

it('marks unavailable world and incomplete traversal explicitly, keeps earlier receipts', async () => {
  const p = approvedProject();
  delete p.world;
  vi.stubGlobal('fetch', async () =>
    Response.json({ ...graph(p), valid: false, complete: false, paths: [] }),
  );
  const r = await runVerification(p, { mode: 'quick' });
  expect(r.tools.find((t) => t.tool === 'progression')?.status).toBe('incomplete');
  expect(r.tools.find((t) => t.tool === 'atlas')?.status).toBe('skipped');
  expect(r.run.status).toBe('unresolved');
});

it('discards late witnesses after cancellation and revision changes', async () => {
  const p = await accepted();
  for (const status of ['cancelled', 'stale'] as const) {
    const controller = new AbortController();
    let current = true;
    vi.stubGlobal('fetch', async () => {
      if (status === 'cancelled') controller.abort();
      else current = false;
      return Response.json(graph(p));
    });
    const r = await runVerification(p, { mode: 'full', signal: controller.signal, isCurrent: () => current });
    expect(r.run.status).toBe(status);
    expect(r.paths).toEqual([]);
    expect(r.tools.find((t) => t.tool === 'atlas')?.status).toBe('skipped');
  }
});

it('rejects fabricated or incomplete successful scenario responses', async () => {
  const p = await accepted();
  for (const data of [
    { valid: true },
    { ...graph(p), paths: [] },
    { ...graph(p), paths: [{ endingId: 'unknown', nodeIds: [] }] },
  ]) {
    vi.stubGlobal('fetch', async () => Response.json(data));
    const r = await runVerification(p, { mode: 'full' });
    expect(r.run.status).toBe('failed');
    expect(r.tools.find((t) => t.tool === 'progression')?.status).toBe('failed');
  }
});

it('keeps a locally clean unapproved world pending without inventing a blocking design defect', async () => {
  const p = await accepted();
  p.world!.approved = false;
  vi.stubGlobal('fetch', async () => Response.json(graph(p)));
  const r = await runVerification(p, { mode: 'full' });
  expect(r.findings.filter((f) => f.severity === 'error')).toEqual([]);
  expect(r.tools.find((t) => t.tool === 'sources')?.status).toBe('incomplete');
  expect(r.run.status).toBe('unresolved');
});

it('announces the actual dispatch before each receipt and omits unbuilt tools', async () => {
  const p = approvedProject();
  delete p.world;
  const trace: string[] = [];
  vi.stubGlobal('fetch', async () => Response.json(graph(p)));
  await runVerification(p, {
    mode: 'quick',
    onStart: (t) => trace.push('run ' + t),
    onTool: (r) => trace.push(r.status + ' ' + r.tool),
  });
  expect(trace[0]).toBe('run schema');
  expect(trace).toContain('run progression');
  expect(trace).not.toContain('run atlas');
  expect(trace.at(-1)).toBe('skipped atlas');
});

it('rejects a malformed nested transition at the evidence boundary', async () => {
  const p = await accepted();
  const f = {
    rule: 'blocked_start',
    severity: 'error',
    entityIds: [p.nodes[0]!.id],
    explanation: 'Blocked',
    suggestedRepair: 'Review',
    blockedTransitions: [
      {
        fieldPath: '/nodes/0/conditions/0',
        kind: 'flag',
        key: 'bad key!',
        actual: null,
        required: 'yes',
        producerIds: [],
      },
    ],
  };
  vi.stubGlobal('fetch', async () => Response.json({ ...graph(p), valid: false, findings: [f] }));
  const r = await runVerification(p, { mode: 'full' });
  expect(r.run.status).toBe('failed');
  expect(r.findings.some((row) => row.rule === 'scenario.blocked_start')).toBe(false);
});

it('keeps required journeys inconclusive when only some transitions were explored', async () => {
  const p = await accepted();
  vi.stubGlobal('fetch', async () =>
    Response.json({
      ...graph(p),
      valid: false,
      complete: false,
      feasibleEdgeIds: [p.edges[0]!.id],
      paths: [],
    }),
  );
  const r = await runVerification(p, { mode: 'full' });
  expect(r.tools.find((t) => t.tool === 'atlas')?.status).toBe('incomplete');
});

it('marks a targeted validator inconclusive if a global prerequisite prevented its check', async () => {
  const p = await accepted();
  vi.stubGlobal('fetch', async () =>
    Response.json({
      valid: false,
      complete: true,
      statesExplored: 0,
      paths: [],
      findings: [
        {
          rule: 'cycle',
          entityIds: ['n-start'],
          severity: 'error',
          explanation: 'Cyclic graph.',
          suggestedRepair: 'Review cycle.',
        },
      ],
    }),
  );
  const r = await runVerification(p, { mode: 'targeted', targetId: p.world!.features[0]!.id });
  expect(r.findings.some((f) => f.rule === 'scenario.cycle')).toBe(false);
  expect(r.tools.find((t) => t.tool === 'progression')?.status).toBe('incomplete');
});
it('identifies mutually exclusive hard containment rules at their shared source', async () => {
  const p = await accepted(),
    world = p.world!;
  const location = world.locations.find((l) => l.regionId)!;
  for (const relation of ['inside', 'outside'] as const)
    world.constraints!.push({
      relation,
      from: location.id,
      to: location.regionId!,
      origin: 'owner',
      strength: 'hard',
      description: relation,
    });
  vi.stubGlobal('fetch', async () => Response.json(graph(p)));
  const result = await runVerification(p, { mode: 'full' });
  expect(result.findings.find((f) => f.rule === 'world.conflicting_constraints')?.entityIds).toContain(
    location.id,
  );
});
