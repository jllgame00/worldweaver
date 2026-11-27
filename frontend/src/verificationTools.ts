import { verificationMessages as v } from './verificationCopy';
import Ajv from 'ajv-draft-04';
import projectSchema from '../../docs/project-v1.schema.json';
import { atlasSourceProblem, sourceIssues, worldIssues } from './atlasWorkflow';
import { resolvedWorld } from './atlasPlaces';
import { narrativeFresh, sourceDirection } from './project';
import type { Project, ValidationFinding } from './project.generated';
import { entities, isProject, scenarioReferencePath } from './validation';
import { buildWorldBible, dependencyImpact } from './worldBibleIndex';

export type Issue = Omit<ValidationFinding, 'id' | 'runId' | 'origin' | 'checkedRevision' | 'status'>;
export interface Witness {
  endingId: string;
  nodeIds: string[];
}
export interface ToolOutput {
  issues: Issue[];
  detail: string;
  status?: 'skipped' | 'incomplete';
  paths?: Witness[];
  statesExplored?: number;
  feasibleEdgeIds?: string[];
  blockedByPrerequisite?: boolean;
}

const findingSchema = projectSchema.definitions.ValidationFinding;
const receiptFields = new Set(['id', 'origin', 'status', 'checkedRevision', 'runId']);
const validIssues = new Ajv({ ownProperties: true }).compile<Issue[]>({
  type: 'array',
  items: {
    ...findingSchema,
    properties: Object.fromEntries(
      Object.entries(findingSchema.properties).filter(([k]) => !receiptFields.has(k)),
    ),
    required: findingSchema.required.filter((k) => !receiptFields.has(k)),
  },
  definitions: projectSchema.definitions,
});

export const issue = (
  rule: string,
  entityIds: string[],
  explanation: string,
  suggestedRepair: string,
): Issue => ({ rule, entityIds, explanation, suggestedRepair, severity: 'error' });

export function targetScope(project: Project, id: string, index = buildWorldBible(project)) {
  if (!index.entities.has(id)) return;
  const impact = dependencyImpact(index, id);
  const related = new Set([id, ...impact.direct, ...impact.transitive]);
  const owners = new Set(related);
  for (const link of index.links) if (owners.has(link.from)) related.add(link.to);
  return {
    ids: related,
    scenario: [...related].some((key) => index.entities.get(key)?.source === 'scenario'),
    atlas: [...related].some(
      (key) => index.entities.get(key)?.source === 'atlas' || index.entities.get(key)?.kind === 'location',
    ),
  };
}

export function references(p: Project): ToolOutput {
  const issues: Issue[] = [],
    seen = new Set<string>();
  for (const { id } of entities(p)) {
    if (seen.has(id)) issues.push(issue('references.duplicate_id', [id], v.duplicateId, v.relinkDuplicate));
    seen.add(id);
  }
  const fieldPath = scenarioReferencePath(p);
  if (fieldPath) {
    const [, group, index] = fieldPath.split('/');
    const rows = p[group as keyof Project];
    const row = Array.isArray(rows) ? rows[Number(index)] : p.scenario;
    const owner = row && 'id' in row ? row.id : p.id;
    issues.push({
      ...issue('references.typed', [owner ?? p.id], v.unresolvedReference + fieldPath, v.selectExpectedType),
      fieldPath,
    });
  }
  const projectId = p.id;
  if (!issues.length && !isProject(p))
    issues.push(issue('references.project', [projectId], v.inconsistentLinks, v.inspectDomains));
  return { issues, detail: seen.size + v.checkedIds };
}

export function sources(p: Project, fingerprint?: string): ToolOutput {
  const issues: Issue[] = [];
  const pending = [];
  if (!p.narrative?.approved) pending.push(v.narrativeApproval);
  else if (!narrativeFresh(p))
    issues.push(issue('sources.narrative', [p.narrative.id], v.narrativeStale, v.approveNarrative));
  const scenarioProblem = atlasSourceProblem(p);
  if (!p.scenario?.approved) pending.push(v.scenarioApproval);
  else if (scenarioProblem)
    issues.push(issue('sources.scenario', [p.scenario.id], scenarioProblem, v.reviewScenario));
  const basis = p.basis.world;
  if (!p.world?.approved) pending.push(v.atlasApproval);
  else if (
    !basis ||
    basis.content !== p.versions.content ||
    basis.narrative !== p.versions.narrative ||
    basis.scenario !== p.versions.scenario ||
    sourceIssues(p, p.world).length
  ) {
    issues.push(issue('sources.world', [p.world?.id ?? p.id], v.atlasStale, v.reconcileAtlas));
  }
  if (p.approval) {
    const run = p.runs.find((r) => r.id === p.approval?.runId);
    const entry = p.verificationHistory?.find((e) => e.runId === run?.id);
    if (
      issues.length ||
      pending.length ||
      p.approval.revision > p.revision ||
      run?.baseRevision !== p.approval.revision ||
      run.stage !== 'verify' ||
      run.status !== 'verified' ||
      entry?.mode !== 'full' ||
      entry.archived || entry.fingerprint !== fingerprint ||
      !['schema', 'references', 'sources', 'progression', 'atlas', 'coverage'].every((t) =>
        entry.tools.some(
          (r) => r.tool === t && r.status === 'passed' && r.checkedRevision === run.baseRevision,
        ),
      )
    ) {
      issues.push(issue('sources.approval', [p.id], v.invalidFinalApproval, v.reviewFinal));
    }
  }
  return {
    issues,
    ...(pending.length && !issues.length ? { status: 'incomplete' as const } : {}),
    detail: pending.length ? 'Awaiting ' + pending.join(', ') + '.' : v.comparedSources,
  };
}

export function coverage(p: Project): ToolOutput {
  const issues: Issue[] = [];
  const selected = sourceDirection(p);
  for (const fragment of p.userContent) {
    const entry = selected?.coverage.find((c) => c.contentId === fragment.id);
    if (
      !entry ||
      (fragment.treatment === 'mandatory' && entry.disposition !== 'incorporated') ||
      (fragment.treatment === 'excluded' && entry.disposition !== 'excluded')
    ) {
      issues.push(issue('coverage.fragment', [fragment.id], v.incompatibleCoverage, v.reviewCoverage));
    }
  }
  if (p.scenario) {
    for (const record of [...p.canonicalFacts, ...p.userContent]) {
      if (![...p.scenario.factIds, ...p.scenario.contentIds].includes(record.id))
        issues.push(
          issue('coverage.scenario', [p.scenario.id, record.id], v.missingSource, v.consultDesigner),
        );
    }
  }
  return {
    issues,
    detail: p.userContent.length + v.fragmentCount + p.canonicalFacts.length + v.factCount,
  };
}

export async function progression(p: Project, signal?: AbortSignal): Promise<ToolOutput> {
  const timeout = AbortSignal.timeout(15000);
  const response = await fetch('/api/scenario/validate?verification=true', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    body: JSON.stringify({ ...p, verificationHistory: undefined }),
  });
  if (!response.ok) throw Error(v.progressionUnavailable);
  const data = await response.json();
  if (
    !data ||
    typeof data.valid !== 'boolean' ||
    typeof data.complete !== 'boolean' ||
    !Number.isInteger(data.statesExplored) ||
    data.statesExplored < 0 ||
    data.statesExplored > 2048 ||
    !Array.isArray(data.paths) ||
    data.paths.length > p.endings.length
  )
    throw Error(v.invalidProgression);
  const rows: unknown = data.findings;
  if (!validIssues(rows)) throw Error(v.invalidFindings);
  const edgeIds = data.feasibleEdgeIds;
  const edges = new Map(p.edges.filter((e) => e.kind !== 'reference').map((e) => [e.id, e]));
  if (
    edgeIds !== undefined &&
    (!Array.isArray(edgeIds) ||
      edgeIds.length > edges.size ||
      edgeIds.some((id) => !edges.has(id)) ||
      new Set(edgeIds).size !== edgeIds.length)
  )
    throw Error(v.invalidTraversal);
  const endpoints = new Set<string>();
  for (const id of edgeIds ?? []) {
    const e = edges.get(id)!;
    endpoints.add(e.from + '/' + e.to);
  }
  const starts = new Set(p.nodes.filter((n) => n.kind === 'prologue').map((n) => n.id));
  const ends = new Map(p.endings.map((e) => [e.id, e.nodeId]));
  const witnessed = new Set<string>();
  for (const path of data.paths) {
    if (
      !path ||
      !ends.has(path.endingId) ||
      witnessed.has(path.endingId) ||
      !Array.isArray(path.nodeIds) ||
      path.nodeIds.length > p.nodes.length ||
      !starts.has(path.nodeIds[0]) ||
      path.nodeIds.at(-1) !== ends.get(path.endingId) ||
      path.nodeIds.some((id: string, i: number) => i > 0 && !endpoints.has(path.nodeIds[i - 1] + '/' + id))
    )
      throw Error(v.invalidEnding);
    witnessed.add(path.endingId);
  }
  if (
    data.valid &&
    (!data.complete ||
      !edgeIds ||
      !data.statesExplored ||
      !witnessed.size ||
      witnessed.size !== ends.size ||
      rows.some((f) => f.severity === 'error'))
  )
    throw Error(v.missingProof);
  if (!data.valid && data.complete && !rows.some((f) => f.severity === 'error'))
    throw Error(v.missingFailure);
  const issues = rows
    .filter((f) => !['geography_pending', 'narrative_review'].includes(f.rule))
    .map((f) => ({ ...f, rule: 'scenario.' + f.rule }));
  return {
    issues,
    ...(data.complete ? {} : { status: 'incomplete' as const }),
    paths: data.paths,
    feasibleEdgeIds: edgeIds,
    blockedByPrerequisite: edgeIds === undefined,
    statesExplored: data.statesExplored,
    detail:
      edgeIds === undefined
        ? v.graphBlocked
        : data.statesExplored + v.exploredBudget + witnessed.size + v.endingCount,
  };
}

export function atlas(p: Project, traversal?: ToolOutput): ToolOutput {
  const world = resolvedWorld(p);
  if (!world) return { status: 'skipped', issues: [], detail: v.noAtlas };
  const traversed = new Set(traversal?.feasibleEdgeIds);
  const journeyProject = {
    ...p,
    edges: p.edges.filter((e) => e.travel !== 'required' || traversed.has(e.id)),
  };
  const issues: Issue[] = worldIssues(journeyProject, world)
    .filter((f) => f.code !== 'source')
    .map((f) => {
      const involved = new Set(f.ids);
      if (f.code === 'journey_unreachable') {
        for (const e of journeyProject.edges.filter((e) => e.travel === 'required')) {
          const stops = [e.from, e.to].map((id) => p.nodes.find((n) => n.id === id)?.locationId);
          if (stops.every((s) => s && f.ids.includes(s)))
            [e.id, e.from, e.to].forEach((id) => involved.add(id));
        }
      }
      return {
        rule: 'world.' + f.code,
        severity: f.severity,
        entityIds: [...involved],
        explanation: f.message,
        suggestedRepair: f.repair,
        ...(f.cell && { spatialCell: f.cell }),
      };
    });
  const physicalFailure = issues.some(
    (f) => f.rule.startsWith('world.terrain-') || f.rule === 'world.world_format',
  );
  const incomplete =
    (!traversal?.feasibleEdgeIds || traversal.status === 'incomplete') &&
    p.edges.some((e) => e.kind !== 'reference' && e.travel === 'required');
  return {
    issues,
    blockedByPrerequisite: physicalFailure,
    ...(incomplete ? { status: 'incomplete' as const } : {}),
    detail:
      world.locations.length +
      ' locations, ' +
      world.routes.length +
      v.routeCount +
      (physicalFailure
        ? v.physicalBlocked
        : incomplete
          ? v.journeysIncomplete
          : journeyProject.edges.filter((e) => e.travel === 'required' && e.kind !== 'reference').length +
            v.feasibleJourneys),
  };
}
