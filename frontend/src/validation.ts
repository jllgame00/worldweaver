import Ajv from 'ajv-draft-04';
import schema from '../../docs/project-v1.schema.json';
import type { AgentRun, Project, StoryCandidate, UserContent } from './project.generated';
import { candidatesFresh, mandatoryConflict, narrativeFresh } from './project';
import type { CandidateBatch } from './project';

const ajv = new Ajv({ ownProperties: true });
const structurallyValidProject = ajv.compile<Project>(schema);
const runSchema = { $ref: '#/definitions/AgentRun' };
const validRun = ajv.compile<AgentRun>({ ...runSchema, definitions: schema.definitions });

export interface CandidateResult {
  baseRevision: number;
  candidates: CandidateBatch;
  run: AgentRun;
}

interface CandidateFailure {
  error: { code: string; message: string; run?: AgentRun };
}

const validResult = ajv.compile<CandidateResult>({
  type: 'object', additionalProperties: false, required: ['baseRevision', 'candidates', 'run'],
  properties: {
    baseRevision: { type: 'integer', minimum: 0 }, run: runSchema,
    candidates: { type: 'array', minItems: 3, maxItems: 3, items: { $ref: '#/definitions/StoryCandidate' } },
  },
  definitions: schema.definitions,
});

const validFailure = ajv.compile<CandidateFailure>({
  type: 'object', additionalProperties: false, required: ['error'],
  properties: {
    error: {
      type: 'object', additionalProperties: false, required: ['code', 'message'],
      properties: { code: { type: 'string', minLength: 1 }, message: { type: 'string', minLength: 1 }, run: runSchema },
    },
  },
  definitions: schema.definitions,
});

function entities(project: Project): { id: string }[] {
  const { narrative, world } = project;
  return [
    project, ...project.userContent, ...project.canonicalFacts, ...project.storyCandidates, ...project.characters,
    ...project.factions, ...project.nodes, ...project.edges, ...project.quests, ...project.endings, ...project.findings, ...project.runs,
    ...(narrative ? [narrative] : []),
    ...(world ? [world, ...world.regions, ...world.features, ...world.locations, ...world.routes] : []),
  ];
}

function validCoverage(candidate: StoryCandidate, inputs: UserContent[], fresh: boolean): boolean {
  const byId = new Map(inputs.map((input) => [input.id, input]));
  const seen = new Set<string>();
  for (const { contentId, disposition, reason } of candidate.coverage) {
    const input = byId.get(contentId);
    if (!input || seen.has(contentId) || !reason.trim()) return false;
    seen.add(contentId);
    if (!fresh) continue;
    if (input.treatment === 'excluded' && disposition !== 'excluded') return false;
    if (input.treatment === 'mandatory' && disposition !== 'incorporated' && disposition !== 'conflict') return false;
    if (input.treatment === 'optional' && disposition === 'excluded') return false;
  }
  return (!fresh || seen.size === byId.size)
    && Object.values(candidate.story).flat().every((text: string) => !!text.trim());
}

function allReferencesExist(project: Project): boolean {
  const { nodes, characters, factions, world, runs } = project;
  const contains = (list: { id: string }[], id: string) => list.some((entry) => entry.id === id);
  return project.canonicalFacts.every(({ sourceContentId }) => !sourceContentId || contains(project.userContent, sourceContentId))
    && (!project.narrative || contains(project.storyCandidates, project.narrative.sourceCandidateId))
    && characters.every(({ factionId }) => !factionId || contains(factions, factionId))
    && nodes.every(({ characterIds, locationId, requiresVisited }) => characterIds.every((id) => contains(characters, id))
      && (!locationId || contains(world?.locations ?? [], locationId)) && requiresVisited.every((id) => contains(nodes, id)))
    && project.edges.every(({ from, to, requiresVisited }) => contains(nodes, from) && contains(nodes, to)
      && requiresVisited.every((id) => contains(nodes, id)))
    && project.quests.every(({ nodeId }) => nodes.some(({ id, kind }) => id === nodeId && kind === 'quest'))
    && project.endings.every(({ nodeId }) => nodes.some(({ id, kind }) => id === nodeId && kind === 'ending'))
    && (!world || (world.regions.every(({ controllerId }) => !controllerId || contains(factions, controllerId))
      && world.locations.every(({ regionId }) => !regionId || contains(world.regions, regionId))
      && world.routes.every(({ from, to }) => contains(world.locations, from) && contains(world.locations, to))))
    && (!project.approval || contains(runs, project.approval.runId))
    && project.findings.every(({ runId, entityIds, status }) => contains(runs, runId)
      && (status === 'superseded' || entityIds.every((id) => contains(entities(project), id))));
}

export function isProject(value: unknown): value is Project {
  if (!structurallyValidProject(value)) return false;
  const ids = entities(value).map(({ id }) => id);
  const { basis, versions } = value;
  return ids.length === new Set(ids).size && allReferencesExist(value)
    && (value.storyCandidates.length > 0) === !!basis.candidates
    && !!value.narrative === !!basis.narrative
    && (!basis.candidates || basis.candidates.content <= versions.content)
    && (!basis.narrative || (basis.narrative.content <= versions.content && basis.narrative.candidates <= versions.candidates))
    && value.storyCandidates.every((candidate) => validCoverage(candidate, value.userContent, candidatesFresh(value)))
    && (!value.narrative?.approved || !narrativeFresh(value) || !mandatoryConflict(value));
}

export function isCandidateResult(value: unknown, project: Project): value is CandidateResult {
  if (!validResult(value) || value.baseRevision !== project.revision || !isCandidateRun(value.run, project)
    || value.run.status !== 'proposed' || !value.run.receipts.some(({ tool, outcome }) => tool === 'check_candidates' && outcome === 'passed')) return false;
  const ids = new Set(entities(project).map(({ id }) => id));
  const stories = new Set<string>();
  ids.add(value.run.id);
  for (const candidate of value.candidates) {
    const story = JSON.stringify(Object.entries(candidate.story).sort(([a], [b]) => a.localeCompare(b)));
    if (ids.has(candidate.id) || stories.has(story) || !validCoverage(candidate, project.userContent, true)) return false;
    ids.add(candidate.id);
    stories.add(story);
  }
  return true;
}

function isCandidateRun(run: unknown, project: Project): run is AgentRun {
  return validRun(run) && run.stage === 'candidates' && run.baseRevision === project.revision
    && !entities(project).some(({ id }) => id === run.id);
}

export function generationFailure(value: unknown, project: Project): CandidateFailure['error'] | undefined {
  if (!validFailure(value)) return undefined;
  const { error } = value;
  if (error.run && (!isCandidateRun(error.run, project) || !['failed', 'unresolved', 'cancelled'].includes(error.run.status))) return undefined;
  return error;
}
