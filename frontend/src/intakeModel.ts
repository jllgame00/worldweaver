import { generationIntent } from './api';
import { categories, treatments } from './copy';
import type { UserContent } from './project.generated';
import type { GenerationStatus } from './validation';

type Category = UserContent['category'];
type Treatment = UserContent['treatment'];
export type Citation = { quote: string; occurrence: number };
export type DraftFragment = {
  category: Category | null; treatment: Treatment; text: string; evidence: Citation; selected: boolean;
};
export type IntakeMethod = 'local' | 'fallback' | 'live' | 'mock';
export type IntakeOutcome = 'pending' | 'completed' | 'timeout' | 'authentication' | 'invalid' |
  'failed' | 'unconfirmed' | 'accepted' | 'rejected' | 'stale';
export type IntakeReceipt = {
  id: string; method: IntakeMethod; outcome: IntakeOutcome; dispatches?: number; responses?: number;
};
export type IntakeDraft = {
  id: string; baseRevision: number; method: IntakeMethod; fragments: DraftFragment[];
};
export type IntakeState = { source: string; draft?: IntakeDraft; history: IntakeReceipt[] };

export const maxFragmentLength = 4096;
export const extractionMaxBytes = 24576;

const categoryLabels: Record<Category, string[]> = {
  idea: ['idea', 'ideas', 'free-form idea', '아이디어'],
  genre: ['genre', '장르'],
  theme: ['theme', 'themes', 'atmosphere', 'tone', '주제', '테마', '분위기'],
  character: ['character', 'characters', '인물', '등장인물', '캐릭터'],
  faction: ['faction', 'factions', '세력', '진영'],
  creature: ['creature', 'creatures', '생물', '크리처'],
  item: ['item', 'items', 'artifact', 'artifacts', '아이템', '유물'],
  location: ['location', 'locations', 'place', 'places', '장소', '지역'],
  history: ['history', 'historical event', 'historical events', '역사', '역사 사건', '사건'],
  mechanic: ['mechanic', 'mechanics', 'game mechanics', '기제', '게임 기제', '시스템'],
  ending: ['ending', 'endings', 'desired endings', '결말', '엔딩', '희망 결말'],
  constraint: ['constraint', 'constraints', 'narrative constraints', '제약', '서사 제약'],
};
const aliases = new Map(Object.keys(categories).flatMap((key) =>
  categoryLabels[key as Category].map(label => [label, key as Category] as const)));
const exclusion = /^(?:exclude|excluded|제외)(?:[：:]\s*|$)/i;
const requirement = /^(?:mandatory|required|필수)(?:[：:]\s*|$)/i;

export function citationOffset(source: string, { quote, occurrence }: Citation): number {
  if (!quote.trim() || !Number.isSafeInteger(occurrence) || occurrence < 1) return -1;
  let offset = 0;
  for (let index = 1; index <= occurrence; index++) {
    const found = source.indexOf(quote, offset);
    if (found < 0 || index === occurrence) return found;
    offset = found + quote.length;
  }
  return -1;
}

export function organizeSource(source: string): DraftFragment[] {
  const fragments: DraftFragment[] = [];
  let category: Category | null = null;
  let sectionTreatment: Treatment = 'optional';
  let start = 0;
  for (const line of source.split('\n')) {
    const lineStart = start;
    start += line.length + 1;
    const quote = line.trim();
    if (!quote) continue;
    const bullet = /^[-*]\s+/.exec(quote);
    let content = bullet ? quote.slice(bullet[0].length) : quote.replace(/^#{1,6}\s+/, '');
    const marked = exclusion.test(content) ? 'excluded' : requirement.test(content) ? 'mandatory' : undefined;
    if (marked) content = content.replace(marked === 'excluded' ? exclusion : requirement, '');
    const marker = /^(?:\[([^\]]+)\]\s*(?:[：:]\s*)?|([^：:]+)[：:]\s*)(.*)$/.exec(content);
    const inlineCategory = aliases.get((marker?.[1] ?? marker?.[2] ?? '').trim().toLowerCase());
    const heading = !bullet && !marker && aliases.get(content.toLowerCase());
    if (heading || (!bullet && !content && marked) || (!bullet && inlineCategory && !marker?.[3]?.trim())) {
      category = heading || inlineCategory || (marked ? 'idea' : null);
      sectionTreatment = marked ?? 'optional';
      continue;
    }
    const kind = inlineCategory ?? (marked && !marker ? category ?? 'idea' : bullet && !marker ? category : null);
    const treatment = marked ?? (bullet && kind ? sectionTreatment : 'optional');
    const text = (inlineCategory ? marker?.[3] : kind ? content : quote)?.trim() ?? '';
    if (text) {
      const end = lineStart + line.indexOf(quote);
      let occurrence = 1;
      for (let found = source.indexOf(quote); found >= 0 && found < end;
        found = source.indexOf(quote, found + quote.length)) occurrence++;
      fragments.push({ category: kind, treatment, text, selected: false, evidence: { quote, occurrence } });
    }
    if (!bullet && !inlineCategory && !marked) {
      category = null;
      sectionTreatment = 'optional';
    }
  }
  return fragments;
}

const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

function isFragment(value: unknown, source: string, allowUnclassified: boolean): value is DraftFragment {
  if (!record(value) || typeof value.text !== 'string' || !record(value.evidence)) return false;
  const { quote, occurrence } = value.evidence;
  return (typeof value.category === 'string' && Object.hasOwn(categories, value.category)
      || allowUnclassified && value.category === null)
    && typeof value.treatment === 'string' && Object.hasOwn(treatments, value.treatment)
    && (allowUnclassified ? typeof value.selected === 'boolean' : value.text.trim() !== '' && value.text.length <= maxFragmentLength * 2)
    && typeof quote === 'string' && typeof occurrence === 'number'
    && citationOffset(source, { quote, occurrence }) >= 0;
}

const methods = new Set(['local', 'fallback', 'live', 'mock']);
const outcomes = new Set(['pending', 'completed', 'timeout', 'authentication', 'invalid', 'failed',
  'unconfirmed', 'accepted', 'rejected', 'stale']);
const isCount = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

export function decodeIntake(raw: string | null): IntakeState {
  const empty = { source: '', history: [] };
  if (!raw) return empty;
  try {
    const state: unknown = JSON.parse(raw);
    if (!record(state) || typeof state.source !== 'string' || !Array.isArray(state.history)) return empty;
    const source = state.source;
    const draft = state.draft;
    return {
      source,
      history: state.history.filter((event): event is IntakeReceipt =>
        record(event) && typeof event.id === 'string' && methods.has(String(event.method))
        && outcomes.has(String(event.outcome)) && (event.dispatches === undefined || isCount(event.dispatches))
        && (event.responses === undefined || isCount(event.responses)))
        .map(event => event.outcome === 'pending' ? { ...event, outcome: 'unconfirmed' } : event),
      ...(record(draft) && typeof draft.id === 'string' && Number.isSafeInteger(draft.baseRevision)
        && methods.has(String(draft.method)) && Array.isArray(draft.fragments)
        && draft.fragments.every(fragment => isFragment(fragment, source, true))
        ? { draft: draft as IntakeDraft } : {}),
    };
  } catch {
    return empty;
  }
}

function readOperation(value: unknown, mode: 'live' | 'mock') {
  if (record(value) && value.mode === mode && typeof value.id === 'string'
    && isCount(value.dispatches) && isCount(value.responses) && value.responses <= value.dispatches) {
    const { dispatches, responses } = value;
    return { dispatches, responses };
  }
  return {};
}

export class ExtractionError extends Error {
  constructor(message: string, readonly outcome: IntakeOutcome, readonly counts = {}, readonly configurationChanged = false) {
    super(message);
  }
}

export async function requestExtraction(
  sourceText: string, projectId: string, baseRevision: number, configuration: GenerationStatus, signal: AbortSignal,
) {
  let response: Response;
  try {
    response = await fetch('/api/content/extract', {
      method: 'POST', signal, headers: {
        'Content-Type': 'application/json',
        'X-Worldweaver-Generation': generationIntent(configuration),
        ...(configuration.mode === 'live' ? {
          'X-Worldweaver-Content-Budget': `1:${configuration.contentExtractionMaxOutputTokens ?? 1600}`,
        } : {}),
      },
      body: JSON.stringify({ sourceText, projectId, baseRevision }),
    });
  } catch {
    throw new ExtractionError('Extraction did not return a receipt. Your original is available for local review.', 'unconfirmed');
  }
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = record(body) && record(body.error) ? body.error : undefined;
    const code = error?.code;
    const outcome = code === 'provider_timeout' ? 'timeout'
      : code === 'provider_authentication' ? 'authentication'
      : code === 'invalid_provider_response' || code === 'provider_refused' || code === 'provider_incomplete'
        || code === 'provider_output_limit' || code === 'provider_content_filter' ? 'invalid' : 'failed';
    const blocked = typeof code === 'string' && [
      'provider_not_configured', 'provider_configuration_invalid', 'generation_configuration_changed',
      'generation_in_progress', 'duplicate_generation', 'live_local_only', 'json_required', 'project_too_large',
      'invalid_extraction_input',
    ].includes(code);
    const counts = blocked && !error?.operation ? { dispatches: 0, responses: 0 } : readOperation(error?.operation, configuration.mode);
    throw new ExtractionError(typeof error?.message === 'string' ? error.message
      : 'Extraction failed. Organize with rules or edit fragments directly.', outcome, counts,
    code === 'generation_configuration_changed');
  }
  const counts = readOperation(record(body) ? body.operation : undefined, configuration.mode);
  if (!record(body) || body.projectId !== projectId || body.baseRevision !== baseRevision
    || !Array.isArray(body.fragments) || body.fragments.length > 24
    || !body.fragments.every(fragment => isFragment(fragment, sourceText, false))) {
    throw new ExtractionError('Extraction returned an invalid proposal or source citation.', 'invalid', counts);
  }
  return { fragments: body.fragments.map(fragment => ({ ...fragment, selected: false }) as DraftFragment), counts };
}
