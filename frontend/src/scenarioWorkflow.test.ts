import { expect, it } from 'vitest';
import * as workflow from './scenarioWorkflow';
import example from '../../docs/examples/salt-census.json';
import type { Project, Scenario } from './project.generated';
import { editNarrative } from './project';

const source = structuredClone(example) as unknown as Project;
export function designFixture(): Project {
  const scenario: Scenario = {
    id: 'scenario',
    title: 'Census',
    summary: 'Trace the ledger.',
    approved: true,
    sourceNarrativeId: source.narrative!.id,
    settings: {
      scale: 'short',
      chapterCount: 1,
      branching: 'branching',
      mainQuests: 'strong',
      sideQuests: 'none',
      endings: 'multiple',
      instructions: '',
    },
    chapters: [{ id: 'opening', title: 'Opening', purpose: 'Find the ledger', summary: 'A secret surfaces.' }],
    locations: [],
    geography: [],
    layout: [],
    factIds: source.canonicalFacts.map((x) => x.id),
    contentIds: source.userContent.map((x) => x.id),
  };
  return { ...structuredClone(source), scenario };
}
it('preserves approved scenario on upstream edit and rejects stale proposals', () => {
  const original = designFixture();
  const changed = editNarrative(original, { ...original.narrative!.story, title: 'Next' });
  expect(workflow.scenarioCurrent(original)).toBe(true);
  expect(workflow.scenarioCurrent(changed)).toBe(false);
  expect(changed.scenario).toEqual(original.scenario);
  expect(() => workflow.applyProposal(changed, { baseRevision: original.revision })).toThrow();
});
it('requires a scenario validation receipt and scopes a targeted revision to one entity', () => {
  const p = designFixture();
  const design = structuredClone(workflow.designOf(p));
  design.scenario!.approved = false;
  const target = design.nodes[0]!;
  target.description = 'A witness hid a second roll.';
  const run = {
    id: 'run-scenario',
    stage: 'scenario',
    baseRevision: p.revision,
    status: 'proposed',
    mode: 'mock',
    calls: 1,
    repairAttempts: 0,
    receipts: [] as { tool: string; outcome: string; detail: string }[],
  };
  const proposal = { baseRevision: p.revision, design, run };
  expect(() => workflow.applyProposal(p, proposal, target.id)).toThrow();
  run.receipts.push({ tool: 'check_scenario', outcome: 'passed', detail: 'Checked' });
  expect(workflow.applyProposal(p, proposal, target.id).nodes[0]?.description).toBe(target.description);
  expect(p.nodes[0]?.description).not.toBe(target.description);
  design.nodes[1]!.description = 'Unrequested edit';
  expect(() => workflow.applyProposal(p, proposal, target.id)).toThrow();
});
it('layout preserves approval and narrative versions, semantic edits invalidate approval', () => {
  const original = designFixture();
  const layout = workflow.editDesign(
    original,
    (p) => p.scenario!.layout.push({ nodeId: p.nodes[0]!.id, x: 5, y: 9 }),
    true,
  );
  expect(layout.scenario?.approved).toBe(true);
  expect(layout.versions).toEqual(original.versions);
  const changed = workflow.editDesign(layout, (p) => {
    p.nodes[0]!.title = 'Title';
  });
  expect(changed.scenario?.approved).toBe(false);
  expect(changed.nodes[0]!.id).toBe(original.nodes[0]!.id);
  expect(original.nodes[0]!.title).not.toBe('Title');
});
it('round-trips a proposed landmark separating two canonical places', () => {
  const p = designFixture();
  const places = p.world!.locations;
  const project = {
    ...p,
    scenario: {
      ...p.scenario!,
      locations: [{ id: 'forest', name: 'Ashwood', kind: 'landmark' as const, purpose: 'Cover' }],
      geography: [
        {
          from: places[0]!.id,
          to: places[1]!.id,
          via: 'forest',
          relation: 'separates' as const,
          description: 'Cross the forest.',
        },
      ],
    },
  };
  expect(workflow.importProject(JSON.stringify(project))).toEqual(project);
  expect(workflow.scenarioMarkdown(project)).toContain('via Ashwood');
  project.scenario.geography[0]!.via = 'missing';
  expect(() => workflow.importProject(JSON.stringify(project))).toThrow();
});
it('reconciles an outdated design to an approved source while preserving its editable graph', () => {
  const p = designFixture();
  p.versions.narrative++;
  const reconciled = workflow.reconcileSource(p);
  expect(workflow.scenarioCurrent(reconciled)).toBe(true);
  expect(reconciled.nodes).toEqual(p.nodes);
  expect(reconciled.scenario?.approved).toBe(false);
  expect(p.scenario?.approved).toBe(true);
  p.narrative!.approved = false;
  expect(() => workflow.reconcileSource(p)).toThrow();
});
it('imports both project generations and exports readable branches and quest objectives', () => {
  for (const project of [source, designFixture()])
    expect(workflow.importProject(JSON.stringify(project))).toEqual(project);
  const markdown = workflow.scenarioMarkdown(designFixture());
  expect(markdown).toContain(source.edges[0]!.label);
  expect(markdown).toContain(source.quests[0]!.objective);
  expect(markdown).toContain(source.world!.locations[0]!.name);
  expect(() => workflow.importProject('{}')).toThrow();
});
