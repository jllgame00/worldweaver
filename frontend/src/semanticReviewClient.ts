import { GenerationError, generationIntent } from './api';
import { atlasPlaces } from './atlasPlaces';
import { newId } from './project';
import type { AgentRun, Project, ValidationFinding } from './project.generated';
import { effectiveStateEntities, entities, validRun, type GenerationStatus } from './validation';
import { semanticCopy as c } from './semanticReviewCopy';

export interface ReviewScope {
  mode: 'targeted' | 'full';
  targetId?: string;
}
interface Source {
  kind: string;
  id: string;
  text: string;
}

export function reviewSources(p: Project, scope: ReviewScope): Source[] {
  const rows: (Source & { links: (string | undefined)[] })[] = [];
  const add = (
    kind: string,
    id: string,
    parts: (string | undefined)[],
    links: (string | undefined)[] = [],
  ) => {
    const text = parts
      .filter(Boolean)
      .join('\n')
      .trim()
      .slice(0, 768)
      .replace(/[\uD800-\uDBFF]$/, '');
    if (text) rows.push({ kind, id, text, links });
  };
  for (const r of p.canonicalFacts) add('fact', r.id, [r.statement], [r.sourceContentId]);
  const targetCandidate = p.storyCandidates.find((r) => scope.mode === 'targeted' && r.id === scope.targetId);
  if (targetCandidate) {
    const { id, story, coverage } = targetCandidate;
    add(
      'candidate',
      id,
      [story.title, story.premise, story.conflict, ...story.possibleEndings],
      coverage.map((c) => c.contentId),
    );
  }
  if (p.narrative) {
    const s = p.narrative.story;
    add(
      'narrative',
      p.narrative.id,
      [s.premise, s.conflict, s.motivation, s.opposition, ...s.possibleEndings],
      [p.narrative.sourceCandidateId],
    );
  }
  if (p.scenario)
    add(
      'scenario',
      p.scenario.id,
      [p.scenario.title, p.scenario.summary, ...p.scenario.geography.map((g) => g.description)],
      [p.scenario.sourceNarrativeId, ...p.scenario.geography.flatMap((g) => [g.from, g.to, g.via])],
    );
  for (const r of p.scenario?.chapters ?? []) add('chapter', r.id, [r.title, r.purpose, r.summary]);
  for (const r of p.endings) add('ending', r.id, [r.consequence], [r.nodeId]);
  for (const r of p.quests)
    add(
      'quest',
      r.id,
      [r.objective, r.outcome, r.reward],
      [r.nodeId, ...(r.locationIds ?? []), ...(r.characterIds ?? [])],
    );
  for (const r of p.characters) add('character', r.id, [r.name, r.role], [r.factionId]);
  for (const r of p.factions) add('faction', r.id, [r.name, r.aim]);
  if (p.world)
    add(
      'world',
      p.world.id,
      [p.world.name, p.world.generatorVersion, ...(p.world.constraints?.map((g) => g.description) ?? [])],
      [p.world.sourceScenarioId, ...(p.world.constraints?.flatMap((g) => [g.from, g.to, g.via]) ?? [])],
    );
  for (const r of atlasPlaces(p))
    add('location', r.id, [r.name, r.kind, r.description], [r.regionId, ...(r.factionIds ?? [])]);
  for (const r of p.world?.regions ?? []) add('region', r.id, [r.name, r.description], [r.controllerId]);
  for (const r of p.world?.territories ?? [])
    add('territory', r.id, [r.name, ...r.factionIds, ...r.regionIds], [...r.factionIds, ...r.regionIds]);
  for (const r of p.world?.features ?? []) add('feature', r.id, [r.name, r.kind]);
  for (const r of p.nodes)
    add(
      'node',
      r.id,
      [r.title, r.description, r.objective, r.outcome],
      [
        r.chapterId,
        r.locationId,
        ...r.characterIds,
        ...(r.factionIds ?? []),
        ...(r.conditions?.map((t) => t.key) ?? []),
        ...(r.consequences?.map((t) => t.key) ?? []),
      ],
    );
  for (const r of p.edges) add('edge', r.id, [r.label, r.from, r.to, r.travel], [r.from, r.to]);
  for (const r of p.world?.routes ?? []) add('route', r.id, [r.from, r.to, r.mode], [r.from, r.to]);
  for (const r of p.userContent) add('content', r.id, [r.treatment, r.text]);
  const used = new Set(rows.map((r) => r.id));
  for (const r of effectiveStateEntities(p)) {
    if (!used.has(r.id)) {
      add(r.kind, r.id, [r.name]);
      used.add(r.id);
    }
  }
  const target = rows.find((r) => r.id === scope.targetId);
  const selected =
    scope.mode === 'full'
      ? rows
      : target
        ? [
            target,
            ...rows.filter(
              (r) =>
                r !== target &&
                (r.kind === 'fact' || target.links.includes(r.id) || r.links.includes(target.id)),
            ),
          ]
        : [];
  const result: Source[] = [];
  let bytes = 128;
  for (const { links: _, ...record } of selected) {
    const size = new TextEncoder().encode(JSON.stringify(record)).length + 1;
    if (result.length >= 64 || bytes + size > 24000) break;
    result.push(record);
    bytes += size;
  }
  return result;
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const receiptPatterns: Record<string, RegExp> = {
  provider_config:
    /^provider=(mock|openai|chatkhu) model=[a-z\d.\-:/_]{1,128} maxCalls=1 maxOutputTokens=\d{1,4} startedAt=[\dT:.+Z-]{16,40}$/i,
  provider_model: /^model=[a-z\d.\-:/_]{1,150}$/i,
  provider_usage: /^(inputTokens=\d+ )?(cachedInputTokens=\d+ )?outputTokens=\d+$/,
  provider_reasoning: /^reasoningTokens=\d+$/,
  semantic_review: /^(checkedFindings=[0-6]|[a-z_]{1,64})$/,
};

function checkedRun(
  raw: unknown,
  project: Project,
  config: GenerationStatus,
  success: boolean,
): raw is AgentRun {
  if (
    !validRun(raw) ||
    raw.stage !== 'verify' ||
    raw.baseRevision !== project.revision ||
    raw.mode !== config.mode ||
    raw.status !== (success ? 'proposed' : 'failed') ||
    raw.calls > 1 ||
    (success && raw.calls !== 1) ||
    raw.repairAttempts ||
    entities(project).some((r) => r.id === raw.id)
  )
    return false;
  const expected =
    'provider=' +
    config.provider +
    ' model=' +
    config.model +
    ' maxCalls=1 maxOutputTokens=' +
    config.semanticMaxOutputTokens +
    ' startedAt=';
  return (
    raw.receipts.every(
      (r) => Object.hasOwn(receiptPatterns, r.tool) && receiptPatterns[r.tool]!.test(r.detail),
    ) &&
    raw.receipts.some(
      (r) => r.tool === 'provider_config' && r.outcome === 'passed' && r.detail.startsWith(expected),
    ) &&
    raw.receipts.some((r) => r.tool === 'semantic_review' && r.outcome === (success ? 'advice' : 'failed'))
  );
}

const invalidResponse = c.invalid;
function prose(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 800;
}
function toFinding(raw: unknown, records: Source[], run: AgentRun, scope: ReviewScope): ValidationFinding {
  if (
    !object(raw) ||
    !['possible-conflict', 'creative-suggestion'].includes(String(raw.category)) ||
    (raw.severity !== 'info' && raw.severity !== 'warning') ||
    !prose(raw.explanation) ||
    !prose(raw.suggestedRepair) ||
    !prose(raw.uncertainty) ||
    !Array.isArray(raw.evidence) ||
    !raw.evidence.length ||
    raw.evidence.length > 4
  )
    throw Error(invalidResponse);
  const ids = new Set<string>(),
    statements = new Set<string>();
  const evidence: { id: string; kind: string; excerpt: string }[] = [];
  for (const e of raw.evidence) {
    const source = object(e) && records.find((r) => r.id === e.id && r.kind === e.kind);
    if (!source || !prose(e.excerpt) || !source.text.includes(e.excerpt)) throw Error(invalidResponse);
    ids.add(source.id);
    evidence.push({ id: source.id, kind: source.kind, excerpt: e.excerpt });
    statements.add(source.kind + ' ' + source.id + ' — “' + e.excerpt + '”');
  }
  if (
    (scope.targetId && !ids.has(scope.targetId)) ||
    (raw.category === 'possible-conflict' && statements.size < 2)
  )
    throw Error(invalidResponse);
  const edge = raw.suggestedRelationship;
  let suggestedRelationship: ValidationFinding['suggestedRelationship'];
  if (edge != null) {
    if (
      !object(edge) ||
      typeof edge.fromId !== 'string' ||
      typeof edge.toId !== 'string' ||
      edge.fromId === edge.toId ||
      !ids.has(edge.fromId) ||
      !ids.has(edge.toId) ||
      !prose(edge.label) ||
      edge.label.length > 120
    )
      throw Error(invalidResponse);
    suggestedRelationship = { fromId: edge.fromId, toId: edge.toId, label: edge.label };
  }
  return {
    id: newId('editorial'),
    runId: run.id,
    checkedRevision: run.baseRevision,
    origin: 'editorial',
    status: 'open',
    rule: 'semantic-' + raw.category,
    severity: raw.category === 'creative-suggestion' ? 'info' : raw.severity,
    entityIds: [...ids],
    explanation: [raw.explanation, c.uncertainty + ' — ' + raw.uncertainty, ...statements].join('\n'),
    evidence: evidence as NonNullable<ValidationFinding['evidence']>,
    uncertainty: raw.uncertainty,
    suggestedRepair: raw.suggestedRepair,
    ...(suggestedRelationship && { suggestedRelationship }),
  };
}

export async function requestReview(
  project: Project,
  scope: ReviewScope,
  config: GenerationStatus,
  records: Source[],
  signal: AbortSignal,
): Promise<{ run: AgentRun; findings: ValidationFinding[] }> {
  if (!config.available || !config.semanticMaxOutputTokens || !records.length) throw Error(c.unavailable);
  const response = await fetch('/api/verify/semantic', {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Worldweaver-Generation': generationIntent(config),
      'X-Worldweaver-Semantic-Budget': '1:' + config.semanticMaxOutputTokens,
    },
    body: JSON.stringify({ projectId: project.id, baseRevision: project.revision, ...scope, records }),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const failure = object(body) && object(body.error) ? body.error : undefined;
    throw new GenerationError(
      failure && prose(failure.message) ? failure.message : c.failure,
      checkedRun(failure?.run, project, config, false) ? (failure!.run as AgentRun) : undefined,
      false,
      typeof failure?.code === 'string' && /^[a-z_]{1,80}$/.test(failure.code) ? failure.code : undefined,
    );
  }
  if (
    !object(body) ||
    body.projectId !== project.id ||
    body.baseRevision !== project.revision ||
    !checkedRun(body.run, project, config, true) ||
    !Array.isArray(body.findings) ||
    body.findings.length > 6 ||
    !body.run.receipts.some(
      (r) =>
        r.tool === 'semantic_review' && r.detail === 'checkedFindings=' + (body.findings as unknown[]).length,
    )
  )
    throw Error(invalidResponse);
  const run = body.run;
  return { run, findings: body.findings.map((raw) => toFinding(raw, records, run, scope)) };
}
