import type { Project } from './project.generated';
import { equalData } from './scenarioWorkflow';

export function validationRun(project: Project, id?: string) {
  const run = id && project.runs.find((r) => r.id === id);
  if (
    !run ||
    run.stage !== 'scenario' ||
    run.mode !== 'deterministic' ||
    run.calls !== 0 ||
    run.baseRevision > project.revision ||
    !['verified', 'unresolved'].includes(run.status)
  )
    return;
  const receipt = run.receipts.find((r) => r.tool === 'validate_scenario');
  if (receipt?.outcome !== (run.status === 'verified' ? 'passed' : 'failed')) return;
  return run;
}

// The save token serializes writes. Validation follows the design that was checked, across layout saves.
export function sameScenarioInputs(before: Project, after: Project): boolean {
  if (!before.scenario || !after.scenario || before.id !== after.id) return false;
  const design = ({ layout: _layout, approved: _approved, ...semantic }: NonNullable<Project['scenario']>) =>
    semantic;
  return (
    (['content', 'candidates', 'narrative', 'scenario'] as const).every(
      (k) => before.versions[k] === after.versions[k],
    ) &&
    equalData(before.basis.narrative, after.basis.narrative) &&
    equalData(before.basis.candidates, after.basis.candidates) &&
    equalData(before.basis.scenario, after.basis.scenario) &&
    equalData(design(before.scenario), design(after.scenario)) &&
    (
      [
        'userContent',
        'canonicalFacts',
        'storyCandidates',
        'narrative',
        'nodes',
        'edges',
        'quests',
        'endings',
        'characters',
        'factions',
        'stateEntities',
      ] as const
    ).every((key) => equalData(before[key], after[key]))
  );
}
