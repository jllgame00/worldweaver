import { useEffect, useRef, useState } from 'react';
import { categories, copy, treatments } from './copy';
import {
  citationOffset, decodeIntake, ExtractionError, extractionMaxBytes, maxFragmentLength, organizeSource, requestExtraction,
} from './intakeModel';
import type { DraftFragment, IntakeDraft, IntakeMethod, IntakeOutcome, IntakeReceipt, IntakeState } from './intakeModel';
import { editContent, newId } from './project';
import type { Project } from './project.generated';
import type { GenerationStatus } from './validation';

const methodLabel: Record<IntakeMethod, string> = {
  local: 'Local extraction', fallback: 'Deterministic fallback', mock: 'Development mock extraction', live: 'Live AI extraction',
};
const outcomeLabel: Record<IntakeOutcome, string> = {
  pending: 'awaiting receipt', completed: 'completed', timeout: 'timed out', authentication: 'authentication failed',
  invalid: 'invalid output rejected', failed: 'failed', unconfirmed: 'dispatch and response unconfirmed',
  accepted: 'selected fragments added', rejected: 'draft rejected', stale: 'discarded as stale',
};

interface IntakeProps {
  project: Project;
  disabled: boolean;
  storageKey: string;
  configuration?: GenerationStatus | null;
  commit: (project: Project, afterSave: () => void) => Promise<boolean>;
  refreshConfiguration?: () => void;
}

function readStorage(key: string) {
  try { return localStorage.getItem(key); }
  catch { return null; }
}

export default function ContentIntake({ project, disabled, storageKey, configuration, commit, refreshConfiguration }: IntakeProps) {
  const [initial] = useState(() => readStorage(storageKey));
  const lastStored = useRef(initial);
  const [state, setState] = useState(() => decodeIntake(initial));
  const [storageIssue, setStorageIssue] = useState(false);
  const [error, setError] = useState<string>();
  const [confirmation, setConfirmation] = useState(false);
  const [fallbackOffered, setFallbackOffered] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const saving = useRef(false);
  const current = useRef({ project, state });
  current.current = { project, state };

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  function store(next: IntakeState) {
    current.current.state = next;
    setState(next);
    try {
      if (localStorage.getItem(storageKey) !== lastStored.current) throw new Error('Changed in another tab');
      const serialized = JSON.stringify(next);
      localStorage.setItem(storageKey, serialized);
      lastStored.current = serialized;
      setStorageIssue(false);
    } catch {
      setStorageIssue(true);
    }
  }

  function addEvent(history: IntakeReceipt[], event: IntakeReceipt) {
    return [event, ...history.filter(row => row.id !== event.id)].slice(0, 50);
  }

  const { source, draft } = state;
  const validSource = !!source.trim();
  const sourceSize = new TextEncoder().encode(JSON.stringify({ sourceText: source })).length;
  const aiAllowed = configuration?.available && validSource && sourceSize <= extractionMaxBytes;
  const selected = draft?.fragments.filter(fragment => fragment.selected) ?? [];
  const validSelection = selected.length > 0 && selected.every(fragment =>
    fragment.category !== null && !!fragment.text.trim() && Array.from(fragment.text).length <= maxFragmentLength);

  function organize() {
    const method = !configuration?.available || fallbackOffered ? 'fallback' : 'local';
    const id = newId('intake');
    store({ ...state, draft: { id, baseRevision: project.revision, method, fragments: organizeSource(source) },
      history: addEvent(state.history, { id, method, outcome: 'completed', dispatches: 0, responses: 0 }) });
    setConfirmation(false);
    setError(undefined);
  }

  async function runAI() {
    if (disabled || !configuration || !aiAllowed || active.current || saving.current) return;
    const controller = new AbortController();
    active.current = controller;
    const method = configuration.mode;
    const id = newId('intake');
    const event = { id, method } as const;
    const baseRevision = project.revision;
    setConfirmation(false);
    setError(undefined);
    setFallbackOffered(false);
    setBusy(true);
    const pending = { ...state, history: addEvent(state.history, { ...event, outcome: 'pending' }) };
    store(pending);
    try {
      const { fragments, counts } = await requestExtraction(source, project.id, baseRevision, configuration, controller.signal);
      if (controller.signal.aborted) return;
      const now = current.current;
      const stale = now.project.revision !== baseRevision || now.state.source !== source;
      store({ ...now.state, ...(stale ? {} : { draft: { id, baseRevision, method, fragments } }),
        history: addEvent(now.state.history, { ...event, ...counts, outcome: stale ? 'stale' : 'completed' }) });
      if (stale) setError('The source or project changed. Organize the current text to review a fresh draft.');
    } catch (cause) {
      if (controller.signal.aborted) return;
      const failure = cause instanceof ExtractionError ? cause : new ExtractionError(copy.requestFailed, 'failed');
      const now = current.current.state;
      store({ ...now, history: addEvent(now.history, { ...event, ...failure.counts, outcome: failure.outcome }) });
      setError(failure.message);
      setFallbackOffered(true);
      if (failure.configurationChanged) refreshConfiguration?.();
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  }

  function updateFragment(index: number, patch: Partial<DraftFragment>) {
    if (!draft) return;
    store({ ...state, draft: { ...draft, fragments: draft.fragments.map((fragment, row) =>
      index === row ? { ...fragment, ...patch } : fragment) } });
  }

  function finish(outcome: 'accepted' | 'rejected') {
    if (!draft) return;
    const now = current.current.state;
    store({ ...now, draft: undefined,
      history: addEvent(now.history, { id: newId('intake'), method: draft.method, outcome }) });
  }

  async function accept() {
    if (!draft || disabled || busy || saving.current || !validSelection) return;
    if (draft.baseRevision !== project.revision) {
      setError('The project changed since this draft was created. Organize the original again to review against the current revision.');
      return;
    }
    saving.current = true;
    try {
      const additions = selected.flatMap(({ category, text, treatment }) =>
        category === null ? [] : [{ id: newId('fragment'), category, text, treatment }]);
      await commit(editContent(project, { userContent: [...project.userContent, ...additions] }), () => finish('accepted'));
    } finally {
      saving.current = false;
    }
  }

  return <section className="panel intake-panel" aria-label="Paste ideas">
    <label>Original input
      <textarea className="creative" rows={10} value={source} onChange={event => {
        store({ ...state, source: event.target.value, draft: undefined });
        setConfirmation(false);
        setError(undefined);
        setFallbackOffered(false);
      }} readOnly={busy || disabled} />
    </label>
    {storageIssue && <p role="status">This tab could not save the intake draft. Copy the original and draft before closing.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    <div className="actions">
      <button type="button" onClick={organize} disabled={!validSource || busy || disabled}>Organize with rules</button>
      <button type="button" onClick={() => setConfirmation(true)} disabled={!aiAllowed || busy || disabled}>Suggest with AI</button>
    </div>
    {!validSource && <p>Enter original text to start.</p>}
    {sourceSize > extractionMaxBytes && <p>The input exceeds the AI limit. Local organization and manual editing are available.</p>}
    {!configuration?.available && <p>Organize with rules or edit fragments while AI is unavailable.</p>}
    {busy && <p role="status">Waiting for the extraction result…</p>}
    {confirmation && configuration && <section aria-label="Extraction confirmation">
      <p>{configuration.provider} · {configuration.model} · {configuration.mode === 'mock' ? 'Development mock' : 'Live AI'}</p>
      <p>The original text above will be submitted once. Maximum output: {configuration.contentExtractionMaxOutputTokens ?? 1600} tokens.
        {configuration.mode === 'live' && ' Provider pricing is unavailable here.'}</p>
      <div className="actions">
        <button type="button" onClick={() => void runAI()} disabled={!aiAllowed || busy || disabled}>Authorize one extraction</button>
        <button type="button" onClick={() => setConfirmation(false)}>{copy.cancel}</button>
      </div>
    </section>}
    {draft && <section className="intake-review" aria-label="Review draft fragments">
      <h2>Review draft fragments</h2>
      <p>{methodLabel[draft.method]}</p>
      <p>Selected fragments will be added to the project and source-dependent approvals may require review.</p>
      {draft.fragments.length === 0 && <p>No supported fragments were proposed. Your original is still available.</p>}
      <DraftRows draft={draft} source={source} update={updateFragment} disabled={disabled || busy} />
      <div className="actions">
        <button type="button" className="primary" disabled={disabled || busy || !validSelection} onClick={() => void accept()}>
          Add selected fragments
        </button>
        <button type="button" disabled={disabled || busy} onClick={() => finish('rejected')}>Reject draft</button>
      </div>
      {!validSelection && <p>Select at least one classified, nonblank fragment up to {maxFragmentLength} characters.</p>}
    </section>}
    {!!state.history.length && <section aria-label="Intake history">
      <h2>Intake history</h2>
      <ol>{state.history.map(({ id, method, outcome, dispatches, responses }) => <li key={id}>
        <span>{methodLabel[method]} · {outcomeLabel[outcome]}</span>
        {outcome !== 'accepted' && outcome !== 'rejected' &&
          <> · Dispatches: {dispatches ?? 'unconfirmed'} · Responses: {responses ?? 'unconfirmed'}</>}
      </li>)}</ol>
    </section>}
  </section>;
}

function DraftRows({ draft, source, update, disabled }: {
  draft: IntakeDraft; source: string; update: (index: number, patch: Partial<DraftFragment>) => void; disabled: boolean;
}) {
  const entries = draft.fragments.map((fragment, index) => ({ fragment, index }));
  const needsReview = entries.filter(({ fragment }) => fragment.category === null);
  return <>
    {entries.filter(({ fragment }) => fragment.category !== null).map(({ fragment, index }) =>
      <fieldset key={index} className="intake-row" disabled={disabled}>
        <legend>{fragment.text || 'Untitled fragment'}</legend>
        <label className="checkbox-label"><input type="checkbox" checked={fragment.selected}
          onChange={event => update(index, { selected: event.target.checked })} />Include fragment</label>
        <label>{copy.fragment}<textarea value={fragment.text}
          onChange={event => update(index, { text: event.target.value })} /></label>
        <label>{copy.category}<select value={fragment.category ?? 'idea'}
          onChange={event => update(index, { category: event.target.value as DraftFragment['category'] })}>
          {Object.entries(categories).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        <label>{copy.treatment}<select value={fragment.treatment}
          onChange={event => update(index, { treatment: event.target.value as DraftFragment['treatment'] })}>
          {Object.entries(treatments).map(([value, name]) => <option key={value} value={value}>{name}</option>)}
        </select></label>
        <SourceCitation source={source} fragment={fragment} />
      </fieldset>)}
    {!!needsReview.length && <fieldset disabled={disabled}>
      <legend>Needs review</legend>
      {needsReview.map(({ fragment, index }) => <div key={index} className="intake-row">
        <p className="creative">{fragment.evidence.quote}</p>
        <label>{copy.fragment}<input value={fragment.text}
          onChange={event => update(index, { text: event.target.value })} /></label>
        <button type="button" onClick={() => update(index, { category: 'idea' })}>Review as free-form idea</button>
      </div>)}
    </fieldset>}
  </>;
}

function SourceCitation({ source, fragment }: { source: string; fragment: DraftFragment }) {
  const { quote, occurrence } = fragment.evidence;
  const start = citationOffset(source, fragment.evidence);
  const end = start + quote.length;
  return <details>
    <summary>Source evidence · occurrence {occurrence}</summary>
    <blockquote className="creative intake-source">
      {source.slice(Math.max(0, start - 36), start)}<mark>{quote}</mark>{source.slice(end, end + 36)}
    </blockquote>
  </details>;
}
