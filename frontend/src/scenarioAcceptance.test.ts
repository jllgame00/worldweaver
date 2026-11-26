import { expect, it, vi } from 'vitest';
import example from '../../docs/examples/salt-census.json';
import { applyProposal, designOf, importProject } from './scenarioWorkflow';
import { listProjects, saveProject } from './storage';
import type { Project } from './project.generated';

it('reports the exact invalid canonical reference in a portable project', () => {
  const p = structuredClone(example) as unknown as Project;
  p.nodes[0]!.characterIds = ['missing'];
  expect(() => importProject(JSON.stringify(p))).toThrow('/nodes/0/characterIds/0');
});
function proposal() {
  const p = structuredClone(example) as unknown as Project;
  const design = structuredClone(designOf(p));
  design.scenario = {
    id: 'scenario-new',
    title: '장부',
    summary: '소금 기록',
    sourceNarrativeId: p.narrative!.id,
    approved: false,
    settings: {
      scale: 'standard',
      chapterCount: 3,
      branching: 'branching',
      mainQuests: 'strong',
      sideQuests: 'some',
      endings: 'multiple',
      instructions: '',
    },
    chapters: [],
    locations: [],
    geography: [],
    factIds: p.canonicalFacts.map((f) => f.id),
    contentIds: p.userContent.map((c) => c.id),
    layout: [],
  };
  const additions = {
    characters: [{ id: 'char-record', name: '기록관', role: '증언 보관', factionId: 'fac-record' }],
    factions: [{ id: 'fac-record', name: '기록 조합', aim: '증언 보전' }],
    stateEntities: [{ id: 'item-seal', kind: 'item', name: '밀봉 인장' }],
  };
  const run = {
    id: 'run-record',
    stage: 'scenario',
    status: 'proposed',
    mode: 'mock',
    baseRevision: p.revision,
    calls: 1,
    repairAttempts: 0,
    receipts: [{ tool: 'check_scenario', outcome: 'passed', detail: 'Checked' }],
  };
  return { p, response: { baseRevision: p.revision, run, design, additions } };
}
it('relinks only the named reference on a detached draft and requires a fresh deterministic check', async () => {
  const { p, response } = proposal();
  const ref = '/nodes/0/characterIds/0';
  response.design.nodes[0]!.characterIds = ['unregistered'];
  const { repairReferenceProposal } = await import('./referenceRepair');
  const finding = {
    entityIds: [response.design.nodes[0]!.id, 'unregistered'],
    fieldPath: ref,
    expectedType: 'character',
    referenceId: 'unregistered',
  };
  const check = vi.fn(async (_url: string, _options: RequestInit) =>
    Response.json({ valid: true, complete: true, findings: [] }),
  );
  vi.stubGlobal('fetch', check);
  try {
    await expect(repairReferenceProposal(p, response, [finding], { [ref]: 'fac-record' })).rejects.toThrow();
    expect(check).not.toHaveBeenCalled();
    const repaired = await repairReferenceProposal(p, response, [finding], { [ref]: 'char-record' });
    expect(check.mock.calls).toHaveLength(1);
    expect(check.mock.calls[0]?.[0]).toBe('/api/scenario/validate');
    expect(repaired.next.nodes[0]!.characterIds).toEqual(['char-record']);
    expect(repaired.next.runs.at(-1)).toMatchObject({ mode: 'deterministic', calls: 0 });
    expect(response.design.nodes[0]!.characterIds).toEqual(['unregistered']);
    expect(p).toEqual(example);
    check.mockResolvedValueOnce(Response.json({ valid: false, complete: true, findings: [] }));
    await expect(repairReferenceProposal(p, response, [finding], { [ref]: 'char-record' })).rejects.toThrow();
  } finally {
    vi.unstubAllGlobals();
  }
});
it('cannot introduce undeclared state by omitting the declaration block on a full proposal', () => {
  const { p, response } = proposal();
  const { additions: _unused, ...withoutDeclarations } = response;
  withoutDeclarations.design.nodes[0]!.consequences = [{ kind: 'flag', key: 'invented', value: 'yes' }];
  expect(() => applyProposal(p, withoutDeclarations)).toThrow();
});
it('preserves existing place identities and rejects declarations that recycle an old design ID', () => {
  const { p, response } = proposal();
  p.scenario = structuredClone(response.design.scenario);
  p.scenario!.locations.push({ id: 'archive', name: '문서고', kind: 'landmark', purpose: '증언 보전' });
  expect(() => applyProposal(p, response)).toThrow();
  response.design.scenario!.locations = structuredClone(p.scenario!.locations);
  response.design.scenario!.locations.push({
    id: 'archive-new',
    name: '문서고',
    kind: 'landmark',
    purpose: '증언 보전',
  });
  expect(() => applyProposal(p, response)).toThrow();
  response.design.scenario!.locations.pop();
  response.additions.stateEntities[0]!.id = p.endings[0]!.id;
  response.design.endings[0]!.id = 'new-ending';
  expect(() => applyProposal(p, response)).toThrow();
});
it('appends reviewed declarations atomically with their references and reopens them', async () => {
  const { p, response } = proposal();
  response.design.nodes[0]!.characterIds = ['char-record'];
  response.design.nodes[0]!.consequences = [{ kind: 'item', key: 'item-seal', value: 'held' }];
  const next = applyProposal(p, response);
  expect(next.narrative).toEqual(p.narrative);
  expect(next.characters).toEqual([...p.characters, ...response.additions.characters]);
  expect(next.factions).toEqual([...p.factions, ...response.additions.factions]);
  expect(next.stateEntities).toContainEqual(response.additions.stateEntities[0]);
  expect(p.characters.some((c) => c.id === 'char-record')).toBe(false);
  expect(importProject(JSON.stringify(next))).toEqual(next);
  await saveProject('phase22-acceptance', next);
  expect((await listProjects('phase22-acceptance')).projects[0]?.project).toEqual(next);
});
it('rejects a collision, same-type duplicate name, or unrelated registry change on targeted revision', () => {
  const { p, response } = proposal();
  expect(() => applyProposal(p, response, p.nodes[0]!.id)).toThrow();
  response.additions.factions[0]!.name = p.factions[0]!.name;
  expect(() => applyProposal(p, response)).toThrow();
  response.additions.factions[0]!.name = '새 조합';
  response.additions.factions[0]!.id = p.factions[0]!.id;
  expect(() => applyProposal(p, response)).toThrow();
  expect(p).toEqual(example);
});
