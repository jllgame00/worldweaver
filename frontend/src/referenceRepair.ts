import { newId, designSnapshot } from './project';
import {atlasPlaces} from './atlasPlaces';
import { findingsOf, type ScenarioFinding } from './ScenarioFindings';
import type { Project } from './project.generated';
import { applyProposal, designOf, proposalProject } from './scenarioWorkflow';
import { isProject, preparedStateEntities } from './validation';

export interface ReferenceFinding {
  entityIds: string[];
  fieldPath?: string;
  referenceId?: string;
  expectedType?: string;
}
export const relinkCopy = {
  title: 'Relink rejected references',
  validate: 'Check corrections without generation',
  choose: 'Choose a replacement',
  invalid: 'This reference cannot be relinked on this draft.',
  stale: 'The project changed. This repair belongs to an older revision.',
  failed: 'The corrected draft still has validation errors.',
  request: 'Local validation failed.',
};
export class RelinkRejected extends Error {
  constructor(readonly findings: ScenarioFinding[], readonly draft: Project) {
    super(relinkCopy.failed);
  }
}
export function recoveryProject(p: Project, recovery: unknown) {
  if (
    !recovery ||
    typeof recovery !== 'object' ||
    !('baseRevision' in recovery) ||
    recovery.baseRevision !== p.revision
  )
    throw Error(relinkCopy.stale);
  if (!('design' in recovery) || !('additions' in recovery)) throw Error(relinkCopy.invalid);
  return proposalProject(p, recovery.design, recovery.additions);
}
export function replacementOptions(p: Project, type?: string): { id: string; name: string }[] {
  switch (type) {
    case 'character':
      return p.characters;
    case 'faction':
      return p.factions;
    case 'location':
      return atlasPlaces(p);
    case 'quest':
      return p.quests.map((q) => ({ id: q.id, name: q.title ?? q.objective }));
    case 'chapter':
      return p.scenario?.chapters.map((c) => ({ id: c.id, name: c.title })) ?? [];
    case 'node':
    case 'quest node':
    case 'ending node':
      return p.nodes
        .filter((n) => type === 'node' || n.kind === type.split(' ')[0])
        .map((n) => ({ id: n.id, name: n.title }));
    case 'item':
    case 'decision':
    case 'flag':
      return (p.stateEntities ?? []).filter((e) => e.kind === type);
    default:
      return [];
  }
}
// Only reference slots in the replaceable design or newly declared cast can be edited.
const editablePath =
  /^\/(nodes|edges|quests|endings|characters)\/(\d+)\/(?:from|to|nodeId|locationId|chapterId|factionId|(?:characterIds|factionIds|locationIds|prerequisiteIds|requiresVisited)\/\d+|(?:conditions|consequences|failure|completion)\/\d+\/key)$/;
export function additionsFromDraft(project: Project, draft: Project) {
  return {
    characters: draft.characters.slice(project.characters.length),
    factions: draft.factions.slice(project.factions.length),
    stateEntities: draft.stateEntities?.slice(preparedStateEntities(project).length) ?? [],
  };
}
export async function repairReferenceProposal(
  project: Project,
  recovery: unknown,
  findings: ReferenceFinding[],
  replacements: Record<string, string>,
  signal?: AbortSignal,
) {
  const draft = structuredClone(recoveryProject(project, recovery));
  for (const finding of findings) {
    const path = finding.fieldPath ?? '';
    const match = editablePath.exec(path);
    const selected = replacements[path];
    if (!match || !selected || !replacementOptions(draft, finding.expectedType).some((o) => o.id === selected))
      throw Error(relinkCopy.invalid);
    const group = match[1] as 'nodes' | 'edges' | 'quests' | 'endings' | 'characters';
    const index = Number(match[2]);
    const owner = draft[group][index];
    if (
      !owner ||
      owner.id !== finding.entityIds[0] ||
      (group === 'characters' && index < project.characters.length)
    )
      throw Error(relinkCopy.invalid);
    const parts = path.split('/').slice(3);
    let target: unknown = owner;
    for (const key of parts.slice(0, -1)) {
      if (!target || typeof target !== 'object' || !Object.hasOwn(target, key)) throw Error(relinkCopy.invalid);
      target = Reflect.get(target, key);
    }
    const key = parts.at(-1)!;
    if (!target || typeof target !== 'object' || Reflect.get(target, key) !== finding.referenceId)
      throw Error(relinkCopy.invalid);
    Reflect.set(target, key, selected);
  }
  if (!findings.length) throw Error(relinkCopy.invalid);
  return validateRecoveredDraft(project, draft, signal);
}
export async function validateRecoveredDraft(project: Project, draft: Project, signal?: AbortSignal) {
  if (!isProject(draft)) throw Error(relinkCopy.invalid);
  const res = await fetch('/api/scenario/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(designSnapshot(draft)),
    signal,
  });
  if (!res.ok) throw Error(relinkCopy.request);
  const check = await res.json();
  const issues = findingsOf(check?.findings);
  if (check.valid !== true || check.complete !== true || issues.some((f) => f.severity === 'error'))
    throw new RelinkRejected(issues, draft);
  const response = {
    baseRevision: project.revision,
    design: designOf(draft),
    additions: additionsFromDraft(project, draft),
    run: {
      id: newId('check'),
      stage: 'scenario',
      baseRevision: project.revision,
      mode: 'deterministic',
      status: 'proposed',
      calls: 0,
      repairAttempts: 0,
      receipts: [
        {
          tool: 'check_scenario',
          outcome: 'passed',
          detail: 'Designer revalidated the edited proposal.',
        },
      ],
    },
  };
  return { response, next: applyProposal(project, response) };
}
