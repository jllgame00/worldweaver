import {atlasPlaces} from './atlasPlaces';
import { advance, narrativeFresh } from './project';
import type { Project } from './project.generated';
import { entities, isProject, preparedStateEntities, scenarioReferencePath, structurallyValidProject } from './validation';

export type Design = Pick<Project, 'scenario' | 'nodes' | 'edges' | 'quests' | 'endings'>;
export function designOf({ scenario, nodes, edges, quests, endings }: Project): Design {
  return { scenario, nodes, edges, quests, endings };
}
export function scenarioCurrent(p: Project) {
  return (
    !!p.narrative?.approved &&
    narrativeFresh(p) &&
    p.scenario?.sourceNarrativeId === p.narrative.id &&
    p.basis.scenario?.narrative === p.versions.narrative &&
    p.basis.scenario.content === p.versions.content
  );
}
export function reconcileSource(project: Project): Project {
  const narrative = project.narrative;
  if (!project.scenario || !narrative?.approved || !narrativeFresh(project))
    throw new Error('Approve a current source narrative first.');
  return editDesign(project, (draft) => {
    draft.basis.scenario = { narrative: project.versions.narrative, content: project.versions.content };
    const scenario = draft.scenario!;
    scenario.sourceNarrativeId = narrative.id;
    scenario.factIds = project.canonicalFacts.map((f) => f.id);
    scenario.contentIds = project.userContent.map((f) => f.id);
  });
}
export function editDesign(project: Project, mutate: (next: Project) => void, layoutOnly = false): Project {
  const draft = structuredClone(project);
  mutate(draft);
  if (equalData(project, draft)) return project;
  if (layoutOnly && (!project.scenario || !draft.scenario ||
      !equalData(draft, { ...project, scenario: { ...project.scenario, layout: draft.scenario.layout } })))
    throw Error('A layout edit can only change node positions.');
  const next = layoutOnly ? { ...draft, revision: project.revision + 1 } : advance(draft, ['scenario']);
  if (!layoutOnly && next.scenario) next.scenario.approved = false;
  if (!isProject(next)) throw new Error('Edit contains an unresolved reference or invalid field.');
  return next;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function targetFields(design: Design, id: string) {
  return [...design.nodes, ...design.quests, ...(design.scenario?.chapters ?? [])].find((x) => x.id === id);
}
/** Build a detached candidate; references are checked before persistence or acceptance. */
export function proposalProject(p: Project, design: unknown, additions: unknown): Project {
  if (
    !record(design) ||
    !record(design.scenario) ||
    design.scenario.sourceNarrativeId !== p.narrative?.id ||
    design.scenario.approved !== false
  )
    throw Error('Invalid scenario proposal.');
  const base = advance(p, ['scenario']);
  const candidate = {
    ...base,
    scenario: design.scenario,
    nodes: design.nodes,
    edges: design.edges,
    quests: design.quests,
    endings: design.endings,
    basis: { ...base.basis, scenario: { content: p.versions.content, narrative: p.versions.narrative } },
  };
  if (additions !== undefined) {
    if (
      !record(additions) ||
      Object.keys(additions).length !== 3 ||
      !Array.isArray(additions.characters) ||
      !Array.isArray(additions.factions) ||
      !Array.isArray(additions.stateEntities)
    )
      throw Error('Invalid entity declarations.');
    Object.assign(candidate, {
      characters: [...p.characters, ...additions.characters],
      factions: [...p.factions, ...additions.factions],
      stateEntities: [...preparedStateEntities(p), ...additions.stateEntities],
    });
  }
  if (!structurallyValidProject(candidate)) throw Error('Invalid proposal fields.');
  if (additions !== undefined) {
    const uniqueNewNames = (rows: { name: string; kind?: string }[], start: number) => {
      const identity = (x: { name: string; kind?: string }) =>
        (x.kind ?? '') + '/' + x.name.trim().normalize('NFC').toLowerCase();
      const seen = new Set(rows.slice(0, start).map(identity));
      for (const row of rows.slice(start)) {
        if (!row.name.trim() || seen.has(identity(row)))
          throw Error('Use an existing entity or a distinct new name.');
        seen.add(identity(row));
      }
    };
    uniqueNewNames(candidate.characters, p.characters.length);
    uniqueNewNames(candidate.factions, p.factions.length);
    const originalStates = preparedStateEntities(p);
    uniqueNewNames(candidate.stateEntities ?? [], originalStates.length);
    const originalPlaces = p.scenario?.locations ?? [];
    const places = candidate.scenario.locations;
    const byId = new Map(places.map((place) => [place.id, place]));
    if (!originalPlaces.every((place) => equalData(place, byId.get(place.id))))
      throw Error('An established location changed.');
    const oldPlaceIds = new Set(originalPlaces.map((place) => place.id));
    const newPlaces = places.filter((place) => !oldPlaceIds.has(place.id));
    const established = [...originalPlaces, ...(p.world?.locations ?? [])];
    uniqueNewNames(
      [...established, ...newPlaces].map(({ name }) => ({ name })),
      established.length,
    );
    const knownIds = new Set([...entities(p), ...originalStates].map((row) => row.id));
    for (const row of [
      ...candidate.characters.slice(p.characters.length),
      ...candidate.factions.slice(p.factions.length),
      ...(candidate.stateEntities ?? []).slice(originalStates.length),
      ...newPlaces,
    ]) {
      if (knownIds.has(row.id)) throw Error('A new declaration reuses an established ID.');
    }
  }
  return candidate;
}
export function applyProposal(p: Project, response: unknown, targetId?: string): Project {
  if (!record(response) || response.baseRevision !== p.revision)
    throw new Error('Project changed. Request a current proposal.');
  const { design, run } = response;
  if (
    !p.narrative?.approved ||
    !narrativeFresh(p) ||
    !record(design) ||
    !record(run) ||
    run.stage !== 'scenario' ||
    run.status !== 'proposed' ||
    !Array.isArray(run.receipts) ||
    !run.receipts.some((r) => record(r) && r.tool === 'check_scenario' && r.outcome === 'passed') ||
    run.baseRevision !== p.revision ||
    !record(design.scenario) ||
    design.scenario.sourceNarrativeId !== p.narrative.id ||
    design.scenario.approved !== false ||
    !['nodes', 'edges', 'quests', 'endings'].every((k) => Array.isArray(design[k]))
  )
    throw new Error('Invalid scenario proposal.');
  if (targetId && response.additions !== undefined) throw Error('A targeted revision cannot add entities.');
  const declarations =
    !targetId && response.additions === undefined
      ? { characters: [], factions: [], stateEntities: [] }
      : response.additions;
  const next: unknown = { ...proposalProject(p, design, declarations), runs: [...p.runs, run] };
  if (!isProject(next)) throw new Error('Proposal contains invalid fields or references.');
  if (targetId) {
    if (!scenarioCurrent(p)) throw new Error('Scenario source changed.');
    const expected = structuredClone(designOf(p));
    const before = targetFields(expected, targetId),
      after = targetFields(next, targetId);
    if (!before || !after || !expected.scenario) throw new Error('Revision target changed.');
    const fields =
      'requiresVisited' in before
        ? ['title', 'description', 'purpose', 'objective', 'outcome']
        : 'nodeId' in before
          ? ['title', 'description', 'objective', 'outcome', 'reward']
          : ['title', 'purpose', 'summary'];
    for (const field of fields) {
      if (field in after) Object.assign(before, { [field]: Reflect.get(after, field) });
      else Reflect.deleteProperty(before, field);
    }
    expected.scenario.approved = false;
    if (!equalData(expected, designOf(next)))
      throw new Error('Revision changes entities outside the selected target.');
  }
  return next;
}
export function equalData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) && Array.isArray(right))
    return left.length === right.length && left.every((v, i) => equalData(v, right[i]));
  if (!record(left) || !record(right)) return false;
  return (
    Object.keys(left).length === Object.keys(right).length &&
    Object.entries(left).every(([k, v]) => Object.hasOwn(right, k) && equalData(v, right[k]))
  );
}
export class InvalidProjectReference extends Error {}
export function importProject(text: string): Project {
  const value: unknown = JSON.parse(text);
  if (!isProject(value)) {
    const path = structurallyValidProject(value) && scenarioReferencePath(value);
    if (path) throw new InvalidProjectReference('Invalid entity reference at ' + path + '.');
    throw new Error('Invalid project file.');
  }
  return value;
}
export function scenarioMarkdown(p: Project): string {
  const s = p.scenario;
  const lines = [
    '# ' + (s?.title ?? p.title),
    '',
    s?.summary ?? '',
    '',
    scenarioCurrent(p) ? (s?.approved ? 'Approved' : 'Draft') : 'Source requires review',
  ];
  lines.push(
    'Revision ' +
      p.revision +
      ' · Scenario ' +
      p.versions.scenario +
      ' · Source narrative ' +
      (p.basis.scenario?.narrative ?? '—'),
  );
  const places = atlasPlaces(p);
  const names = new Map([
    ...places.map((x) => [x.id, x.name] as const),
    ...p.nodes.map((x) => [x.id, x.title] as const),
  ]);
  for (const chapter of [...(s?.chapters ?? []), undefined]) {
    const nodes = p.nodes.filter((n) => n.chapterId === chapter?.id);
    if (!chapter && !nodes.length) continue;
    lines.push('', '## ' + (chapter?.title ?? 'Story events'), chapter?.purpose ?? '', chapter?.summary ?? '');
    for (const node of nodes) {
      lines.push(
        '',
        '### ' + node.title + ' · ' + node.kind,
        node.description,
        node.purpose ?? '',
        node.objective ?? '',
        node.outcome ?? '',
      );
      if (node.locationId) lines.push('Location · ' + names.get(node.locationId));
      for (const e of p.edges.filter((e) => e.from === node.id)) {
        lines.push('- ' + e.label + ' → ' + names.get(e.to) + ' (' + (e.kind ?? 'progression') + ')');
        for (const t of e.conditions ?? [])
          lines.push('  - Requires ' + t.kind + ' ' + t.key + ' = ' + t.value);
        for (const t of e.consequences ?? []) lines.push('  - Sets ' + t.kind + ' ' + t.key + ' = ' + t.value);
      }
      for (const q of p.quests.filter((q) => q.nodeId === node.id))
        lines.push(
          '',
          '#### ' + (q.title ?? 'Quest'),
          q.description ?? '',
          q.objective,
          q.outcome,
          q.reward ?? '',
        );
      for (const e of p.endings.filter((e) => e.nodeId === node.id)) lines.push('Ending · ' + e.consequence);
    }
  }
  lines.push('', '## Locations', ...places.map((x) => '- ' + x.name + ' (' + x.kind + ', ' + x.id + ')'));
  for (const g of s?.geography ?? [])
    lines.push(
      '- ' +
        names.get(g.from) +
        ' → ' +
        names.get(g.to) +
        (g.via ? ' via ' + names.get(g.via) : '') +
        ' · ' +
        g.relation +
        ' · ' +
        g.description,
    );
  const findings = p.findings.filter((f) => f.status === 'open');
  if (findings.length)
    lines.push(
      '',
      '## Open findings',
      ...findings.map(
        (f) => '- ' + f.severity + ' · ' + f.rule + ' · ' + f.explanation + ' ' + f.suggestedRepair,
      ),
    );
  return lines.join('\n');
}
export function downloadFile(filename: string, data: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
