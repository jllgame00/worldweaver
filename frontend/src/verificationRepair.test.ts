import { expect, it } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas, resolvedWorld, worldIssues } from './atlasWorkflow';
import { repairDraft } from './verificationRepair';
import type { RepairEdit } from './verificationRepair';

it('corrects route length on a copy and invalidates only world approval', async () => {
  const p = approvedProject();
  const q = acceptAtlas(p, await generateAtlas(p, 'Estuary', 17, defaults, []), p.revision, true);
  const route = q.world!.routes[0]!,
    expected = route.distanceKm!;
  route.distanceKm = expected + 20;
  const edit: RepairEdit = {
    proposalId: 'fix-length',
    findingId: 'route-fault',
    recordId: route.id,
    field: 'distanceKm',
    before: String(route.distanceKm),
    after: String(expected),
    requires: [],
  };
  const next = repairDraft(q, [edit], q.revision);
  expect(worldIssues(next, resolvedWorld(next)!).filter((f) => f.severity === 'error')).toEqual([]);
  expect(next.world?.approved).toBe(false);
  expect(next.scenario).toEqual(q.scenario);
  expect(next.canonicalFacts).toEqual(q.canonicalFacts);
  expect(route.distanceKm).toBe(expected + 20);
  expect(() => repairDraft(q, [edit], q.revision - 1)).toThrow(/changed/i);
  expect(() => repairDraft(q, [{ ...edit, before: '123456' }], q.revision)).toThrow(/changed/i);
  expect(() => repairDraft(q, [{ ...edit, requires: ['other-edit'] }], q.revision)).toThrow(/dependent/i);
  expect(() =>
    repairDraft(
      q,
      [edit, { ...edit, proposalId: 'bad', field: 'statement', recordId: q.canonicalFacts[0]!.id }],
      q.revision,
    ),
  ).toThrow();
  expect(route.distanceKm).toBe(expected + 20);
});
