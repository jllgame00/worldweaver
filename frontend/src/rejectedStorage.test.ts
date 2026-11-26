import { expect, it } from 'vitest';
import sample from '../../docs/examples/salt-census.json';
import { designOf, importProject } from './scenarioWorkflow';
import type { Project } from './project.generated';
import {
  dismissRejection,
  keepRejection,
  loadRejection,
  readRecoveryFile,
  writeRecoveryFile,
} from './rejectedStorage';

function fixture() {
  const project = structuredClone(sample) as unknown as Project;
  project.id = 'project-' + crypto.randomUUID();
  const design = designOf(project);
  design.scenario = {
    id: 'rejected',
    title: '봉인된 수문',
    summary: '장부를 찾아라',
    approved: false,
    sourceNarrativeId: project.narrative!.id,
    settings: {
      scale: 'short',
      chapterCount: 1,
      branching: 'linear',
      mainQuests: 'light',
      sideQuests: 'none',
      endings: 'single',
      instructions: '',
    },
    chapters: [],
    locations: [],
    geography: [],
    layout: [],
    contentIds: [],
    factIds: [],
  };
  const rejected = {
    recovery: {
      baseRevision: project.revision,
      design,
      additions: { characters: [], factions: [], stateEntities: [] },
    },
    findings: [
      {
        rule: 'dead_end',
        severity: 'error' as const,
        entityIds: [project.nodes[0]!.id],
        explanation: 'Gate blocked.',
        suggestedRepair: 'Restore the ledger event.',
      },
    ],
  };
  return { project, rejected };
}
it('keeps the original across reopen and competing writes, with compare-before-dismiss', async () => {
  const { project, rejected } = fixture();
  const another = structuredClone(rejected);
  another.recovery.design.scenario!.title = 'replacement';
  const first = await keepRejection(project, rejected);
  expect(await keepRejection(project, another)).toEqual(first);
  expect(await loadRejection(project.id)).toEqual(rejected);
  expect(await dismissRejection(project.id, another)).toBe(false);
  expect(await loadRejection(project.id)).toEqual(first);
  expect(await dismissRejection(project.id, first)).toBe(true);
  expect(await loadRejection(project.id)).toBeUndefined();
  expect(project.scenario).toBeUndefined();
});
it('exchanges a detached diagnostic only for its original project revision', () => {
  const { project, rejected } = fixture(),
    file = writeRecoveryFile(project.id, rejected);
  expect(readRecoveryFile(project, file)).toEqual(rejected);
  expect(() => importProject(file)).toThrow();
  expect(() => readRecoveryFile({ ...project, revision: project.revision + 1 }, file)).toThrow();
  expect(() => readRecoveryFile({ ...project, id: 'other' }, file)).toThrow();
  expect(() => readRecoveryFile(project, JSON.stringify(project))).toThrow();
  expect(JSON.parse(file)).not.toHaveProperty('narrative');
  const wrong = structuredClone(rejected);
  wrong.recovery.design.scenario!.approved = true;
  expect(() => readRecoveryFile(project, writeRecoveryFile(project.id, wrong))).toThrow();
});
