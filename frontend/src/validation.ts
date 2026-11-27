import Ajv from 'ajv-draft-04';
import schema from '../../docs/project-v1.schema.json';
import type { AgentRun, Project, StateEntity, StateTerm, StoryCandidate, UserContent } from './project.generated';
import { candidatesFresh, mandatoryConflict, narrativeFresh } from './project';
import type { CandidateBatch } from './project';

const ajv = new Ajv({ ownProperties: true });
export const structurallyValidProject = ajv.compile<Project>(schema);
export const structurallyValidWorld = ajv.compile<NonNullable<Project['world']>>({$ref:'#/definitions/World',definitions:schema.definitions});
export const validAtlasSettings = ajv.compile({$ref:'#/definitions/AtlasSettings',definitions:schema.definitions});
const runSchema = { $ref: '#/definitions/AgentRun' };
export const validRun = ajv.compile<AgentRun>({ ...runSchema, definitions: schema.definitions });

export interface CandidateResult {
  baseRevision: number;
  candidates: CandidateBatch;
  run: AgentRun;
}

export type GenerationStatus = {
  deploymentMode?: 'public-demo';
  available: boolean;
  model: string;
  semanticMaxOutputTokens?: number;
  contentExtractionMaxOutputTokens?: number;
  message?: string;
  limits?: { scenarioMaxOutputTokens?: number; timeoutSeconds?: number };
} & (
  | { mode: 'mock'; provider: 'mock' }
  | { mode: 'live'; provider: 'openai' }
  | { mode: 'live'; provider: 'chatkhu'; api: 'responses' | 'chat_completions' }
);

const validGenerationStatus = ajv.compile<GenerationStatus>({
  type: 'object', required: ['mode', 'available', 'provider', 'model'],
  properties: {
    mode: { enum: ['mock', 'live'] }, available: { type: 'boolean' }, provider: { enum: ['mock', 'openai', 'chatkhu'] },
    deploymentMode: { enum: ['public-demo'] },
    api: { enum: ['responses', 'chat_completions'] },
    model: { type: 'string', pattern: '^[A-Za-z0-9_.:/-]{1,128}$' },
    semanticMaxOutputTokens: { type: 'integer', minimum: 128, maximum: 1600 },
    contentExtractionMaxOutputTokens: { type: 'integer', minimum: 128, maximum: 1600 },
    message: { type: 'string', minLength: 1, maxLength: 400 },
    limits: {
      type: 'object', properties: {
        scenarioMaxOutputTokens: { type: 'integer', minimum: 128, maximum: 16000 },
        timeoutSeconds: { type: 'number', minimum: 0, exclusiveMinimum: true, maximum: 120 },
      },
    },
  },
});

export function isGenerationStatus(value: unknown): value is GenerationStatus {
  if (!validGenerationStatus(value)) return false;
  if (value.provider === 'chatkhu') {
    return value.mode === 'live' && value.api !== undefined && !value.model.startsWith('sk-');
  }
  return value.provider === (value.mode === 'live' ? 'openai' : 'mock') && !value.model.includes('/');
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

export function entities(project: Project): { id: string }[] {
  const { narrative, world } = project;
  return [
    project, ...project.userContent, ...project.canonicalFacts, ...project.storyCandidates, ...project.characters,
    ...project.factions, ...(project.stateEntities ?? []), ...project.nodes, ...project.edges, ...project.quests, ...project.endings, ...project.findings, ...project.runs,
    ...(narrative ? [narrative] : []),
    ...(project.scenario ? [project.scenario, ...project.scenario.chapters, ...project.scenario.locations] : []),
    ...(world ? [world, ...world.regions, ...world.features, ...world.locations, ...world.routes, ...(world.territories ?? [])] : []),
  ];
}

type TermFields = Partial<Record<'conditions' | 'consequences' | 'completion' | 'failure', StateTerm[]>>;

function* stateTerms(project: Project) {
  function* terms(rows: TermFields[], path: string, fields: (keyof TermFields)[]) {
    for (const [i, row] of rows.entries()) {
      for (const field of fields) {
        for (const [j, term] of (row[field] ?? []).entries()) {
          yield { term, path: `/${path}/${i}/${field}/${j}/key` };
        }
      }
    }
  }
  yield* terms(project.nodes, 'nodes', ['conditions', 'consequences']);
  yield* terms(project.edges, 'edges', ['conditions', 'consequences']);
  yield* terms(project.quests, 'quests', ['completion', 'failure']);
}

export function effectiveStateEntities(project: Project): StateEntity[] {
  if (project.stateEntities) return project.stateEntities;
  const legacy = new Map<string, StateEntity>();
  for (const { term: { kind, key } } of stateTerms(project)) {
    if (kind === 'item' || kind === 'decision' || kind === 'flag') {
      legacy.set(`${kind}:${key}`, { id: key, name: key, kind });
    }
  }
  return [...legacy.keys()].sort().map(key => legacy.get(key)!);
}

export function preparedStateEntities(project: Project): StateEntity[] {
  if (project.stateEntities) return project.stateEntities;
  const rows = effectiveStateEntities(project);
  const existing = new Set(entities(project).map(row => row.id));
  const counts = new Map<string, number>();
  for (const { id } of rows) counts.set(id, (counts.get(id) ?? 0) + 1);
  const reserved = new Set([...existing, ...counts.keys()]);
  return rows.map(row => {
    if (!existing.has(row.id) && counts.get(row.id) === 1) return row;
    const base = `${row.kind}-${row.id}`;
    let id = base.slice(0, 96);
    for (let i = 2; reserved.has(id); i++) {
      const suffix = `-${i}`;
      id = base.slice(0, 96 - suffix.length) + suffix;
    }
    reserved.add(id);
    return { ...row, id };
  });
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

type ReferenceFields<T> = Partial<Record<keyof T, Set<string>>>;

function missingField<T extends object>(row: T, path: string, targets: ReferenceFields<T>) {
  for (const field in targets) {
    const ids = targets[field]!;
    const value = row[field];
    if (typeof value === 'string' && !ids.has(value)) return `${path}/${field}`;
    if (Array.isArray(value)) {
      const index = value.findIndex(key => !ids.has(key));
      if (index >= 0) return `${path}/${field}/${index}`;
    }
  }
}

function missingIn<T extends object>(rows: T[], path: string, targets: ReferenceFields<T>) {
  for (const [index, row] of rows.entries()) {
    const field = missingField(row, `${path}/${index}`, targets);
    if (field) return field;
  }
}

export function scenarioReferencePath(project: Project): string | undefined {
  const { scenario, nodes, edges, quests, endings, characters, factions } = project;
  const ids = (rows: { id: string }[]) => new Set(rows.map(row => row.id));
  const node = ids(nodes), character = ids(characters), faction = ids(factions), quest = ids(quests);
  const location = ids([...project.world?.locations ?? [], ...scenario?.locations ?? []]);
  const basis = project.basis.scenario;
  if (scenario) {
    const source = missingField(scenario, '/scenario', {
      ...(basis?.narrative === project.versions.narrative && {sourceNarrativeId: ids(project.narrative ? [project.narrative] : [])}),
      ...(basis?.content === project.versions.content && {factIds: ids(project.canonicalFacts), contentIds: ids(project.userContent)}),
    });
    const path = source
      ?? missingIn(scenario.geography, '/scenario/geography', { from: location, to: location, via: location })
      ?? missingIn(scenario.layout, '/scenario/layout', { nodeId: node });
    if (path) return path;
  }
  const path = missingIn(characters, '/characters', { factionId: faction })
    ?? missingIn(nodes, '/nodes', { chapterId: ids(scenario?.chapters ?? []), locationId: location,
      characterIds: character, factionIds: faction, requiresVisited: node })
    ?? missingIn(edges, '/edges', { from: node, to: node, requiresVisited: node })
    ?? missingIn(quests, '/quests', { nodeId: ids(nodes.filter(n => n.kind === 'quest')), prerequisiteIds: quest,
      locationIds: location, characterIds: character, factionIds: faction })
    ?? missingIn(endings, '/endings', { nodeId: ids(nodes.filter(n => n.kind === 'ending')) });
  if (path) return path;
  const states = effectiveStateEntities(project);
  const targets = {
    quest, location, character, relationship: faction,
    item: ids(states.filter(e => e.kind === 'item')), flag: ids(states.filter(e => e.kind === 'flag')),
    decision: ids(states.filter(e => e.kind === 'decision')),
  };
  for (const { term, path } of stateTerms(project)) {
    if (!targets[term.kind].has(term.key)) return path;
  }
}

function allReferencesExist(project: Project): boolean {
  const { factions, world, runs, scenario } = project;
  const contains = (list: { id: string }[], id: string) => list.some((entry) => entry.id === id);
  if (world?.approved) {
    const spatial = new Map<string, Pick<(typeof world.locations)[number], 'position' | 'regionId'>>(
      world.locations.map(site => [site.id, site])
    );
    for (const site of world.placements ?? []) spatial.set(site.locationId, site);
    for (const route of world.routes) {
      const endpoints = [[route.from, route.path[0]], [route.to, route.path.at(-1)]] as const;
      for (const [id, point] of endpoints) {
        const site = spatial.get(id);
        if (!site?.regionId || !site.position || !point ||
            site.position[0] !== point[0] || site.position[1] !== point[1]) return false;
      }
    }
  }
  if (scenario) {
    const basis = project.basis.scenario;
    if (!basis || basis.narrative > project.versions.narrative || basis.content > project.versions.content ||
        new Set(scenario.layout.map(point => point.nodeId)).size !== scenario.layout.length) return false;
  }
  return !scenarioReferencePath(project)
    && project.canonicalFacts.every(({ sourceContentId }) => !sourceContentId || contains(project.userContent, sourceContentId))
    && (!project.narrative || contains(project.storyCandidates, project.narrative.sourceCandidateId))
    && (!world || (world.regions.every(({ controllerId }) => !controllerId || contains(factions, controllerId))
      && world.locations.every(({ regionId }) => !regionId || contains(world.regions, regionId))
      && (world.placements ?? []).every(v=>contains(scenario?.locations ?? [],v.locationId) && (!v.regionId || contains(world.regions,v.regionId)))
      && new Set(world.placements?.map(v=>v.locationId)).size === (world.placements?.length ?? 0)
      && [...world.locations,...world.placements ?? []].every(v=>(v.factionIds ?? []).every(id=>contains(factions,id)))
      && (world.territories ?? []).every(t=>t.regionIds.every(id=>contains(world.regions,id)) && t.factionIds.every(id=>contains(factions,id)))
      && world.routes.every(({ from, to }) => [from,to].every(id=>contains(world.locations,id) || world.placements?.some(v=>v.locationId===id)))))
    && (!project.approval || contains(runs, project.approval.runId))
    && project.findings.every(({ runId, entityIds, status }) => contains(runs, runId)
      && (status === 'superseded' || entityIds.every((id) => contains(entities(project), id))));
}

export function isProject(value: unknown): value is Project {
  if (!structurallyValidProject(value)) return false;
  const ids = entities(value).map(({ id }) => id);
  const { basis, versions } = value;
  const history = value.verificationHistory ?? [];
  return history.length === new Set(history.map(entry => entry.runId)).size
    && history.every(entry => {
      const findings = new Set(entry.findings.map(f=>f.id));
      const run=value.runs.find(r=>r.id===entry.runId && r.stage==='verify');
      if(!run)return false;
      if(run.status==='verified' && (entry.mode!=='full' || run.mode!=='deterministic' || run.calls!==0
        || !entry.paths.length || !entry.statesExplored || entry.findings.some(f=>f.severity==='error')
        || !schema.definitions.VerificationToolReceipt.properties.tool.enum.every(tool=>
          entry.tools.some(t=>t.tool===tool && t.status==='passed' && t.checkedRevision===run.baseRevision) &&
          run.receipts.some(r=>r.tool===tool && r.outcome==='passed'))))return false;
      return findings.size === entry.findings.length
        && entry.findings.every(f=>f.runId===entry.runId && (f.evidence??[]).every(e=>f.entityIds.includes(e.id))
          && (!f.suggestedRelationship || (f.origin==='editorial' && f.suggestedRelationship.fromId!==f.suggestedRelationship.toId
            && [f.suggestedRelationship.fromId,f.suggestedRelationship.toId].every(id=>f.entityIds.includes(id)))))
        && (entry.proposals??[]).every(s=>s.edits.every(e=>findings.has(e.findingId) &&
          e.requires.every(id=>s.edits.some(peer=>peer.proposalId===id))))
        && entry.decisions.every(d=>findings.has(d.findingId));
    })
    && ids.length === new Set(ids).size && allReferencesExist(value)
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
