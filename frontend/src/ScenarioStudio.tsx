import { useEffect, useRef, useState } from 'react';
import { generationIntent } from './api';
import { designSnapshot } from './project';
import { narrativeFresh, newId } from './project';
import type { Project, ScenarioSettings } from './project.generated';
import type { GenerationStatus } from './validation';
import { entities, isProject } from './validation';
import ScenarioEditor from './ScenarioEditor';
import ScenarioFindings, { findingsOf, type ScenarioFinding } from './ScenarioFindings';
import RejectedScenarioEditor from './RejectedScenarioEditor';
import RecoveryFile from './RecoveryFile';
import RecoveryChanges from './RecoveryChanges';
import { checkedRejection, dismissRejection, keepRejection, loadRejection, type RejectedDraft } from './rejectedStorage';
import { recoveryProject } from './referenceRepair';
import ProposalEntities from './ProposalEntities';
import ScenarioBrief from './ScenarioBrief';
import { scenarioCopy as c } from './studioWorkflowCopy';
import { validationRun } from './scenarioApproval';
import {
  applyProposal,
  designOf,
  downloadFile,
  editDesign,
  reconcileSource,
  scenarioCurrent,
  scenarioMarkdown,
  targetFields,
} from './scenarioWorkflow';

interface Props {
  selectedId?:string;
  openAtlas?:(id:string)=>void;
  project: Project;
  generation: GenerationStatus | null | undefined;
  commit: (p: Project, checkedRunId?: string) => Promise<boolean>;
  checkedRunId?: string;
  disabledReasons: string[];
  disabled: boolean;
  current: () => Project | undefined;
  refreshGeneration: () => void;
}
const defaults: ScenarioSettings = {
  scale: 'short',
  chapterCount: 2,
  branching: 'branching',
  mainQuests: 'strong',
  sideQuests: 'some',
  endings: 'single',
  instructions: '',
};
const options = {
  scale: ['short', 'standard'],
  branching: ['linear', 'branching'],
  mainQuests: ['light', 'strong'],
  sideQuests: ['none', 'some'],
  endings: ['single', 'multiple'],
} as const;
interface Entry {
  project: Project;
  layout: boolean;
}
interface Proposal {
  response: unknown;
  next: Project;
  base: number;
  target?: string;
  rejectedOriginal?: Project;
}

export default function ScenarioStudio({
  project: p,
  selectedId,openAtlas,
  commit,
  checkedRunId, disabledReasons,
  current,
  disabled,
  generation,
  refreshGeneration,
}: Props) {
  const [settings, setSettings] = useState(p.scenario?.settings ?? defaults);
  const [target, setTarget] = useState('');
  const [instructions, setInstructions] = useState('');
  const [pending, setPending] = useState<Proposal>();
  const [failedProposal, setFailedProposal] = useState<{ findings: ScenarioFinding[]; recovery?: unknown }>();
  const [loadingRecovery, setLoadingRecovery] = useState(true);
  const [storageNotice, setStorageNotice] = useState('');
  const tabOnlyRecovery = useRef<RejectedDraft | undefined>(undefined);
  const [busy, setBusy] = useState<false | 'generate' | 'revise' | 'validate'>(false);
  const [message, setMessage] = useState('');
  const [reviewed, setReviewed] = useState(false);
  const [witnesses, setWitnesses] = useState<{ runId: string; paths: string[][] }>();
  const [validationError, setValidationError] = useState('');
  const [undo, setUndo] = useState<Entry[]>([]),
    [redo, setRedo] = useState<Entry[]>([]);
  const controller = useRef<AbortController | null>(null);
  const historyRevision = useRef(p.revision);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    setReviewed(false);
    setValidationError('');
  }, [p.id, p.scenario?.id, p.versions.scenario, p.versions.narrative, p.versions.content, p.versions.candidates]);
  useEffect(() => { setValidationError(''); }, [checkedRunId]);
  useEffect(() => {
    let active = true;
    loadRejection(p.id).then(saved => {
      if (active && saved) setFailedProposal(saved);
    }).catch(() => {
      if (active) setStorageNotice('Could not open the saved diagnostic. You can reopen an exported copy.');
    }).finally(() => { if (active) setLoadingRecovery(false); });
    return () => { active = false; };
  }, [p.id]);
  const fresh = scenarioCurrent(p);
  const locked = disabled || !!busy;
  const source = !!p.narrative?.approved && narrativeFresh(p);
  const checked = validationRun(p, checkedRunId);
  const paths = witnesses?.runId === checked?.id ? witnesses?.paths : undefined;
  const hasRecovery = failedProposal?.recovery != null;

  async function retain(value: RejectedDraft) {
    checkedRejection(value);
    recoveryProject(p, value.recovery);
    try {
      const saved = await keepRejection(p, value);
      tabOnlyRecovery.current = undefined;
      setFailedProposal(saved);
      setStorageNotice('');
    } catch {
      tabOnlyRecovery.current = value;
      setFailedProposal(value);
      setStorageNotice('The diagnostic is available in this tab. Export a copy before closing it.');
    }
  }
  async function dismiss() {
    if (failedProposal?.recovery != null && failedProposal !== tabOnlyRecovery.current) {
      try {
        if (!await dismissRejection(p.id, { recovery: failedProposal.recovery, findings: failedProposal.findings })) {
          const saved = await loadRejection(p.id);
          if (saved) {
            setFailedProposal(saved);
            setStorageNotice('Another tab changed the saved diagnostic. Review it before discarding.');
            return;
          }
        }
      } catch {
        setStorageNotice('Could not discard the saved diagnostic. Try again.');
        return;
      }
    }
    tabOnlyRecovery.current = undefined;
    setFailedProposal(undefined);
    setStorageNotice('');
    setMessage('');
  }

  async function persist(next: Project, layout = false) {
    if (current()?.revision !== p.revision) {
      setMessage(c.changed);
      return false;
    }
    if (next === p) return true;
    if (await commit(next)) {
      const history = historyRevision.current === p.revision ? undo : [];
      setUndo([...history.slice(-29), { project: p, layout }]);
      historyRevision.current = next.revision;
      setRedo([]);
      setMessage('');
      return true;
    }
    return false;
  }
  async function edit(mutate: (next: Project) => void, layout = false) {
    try {
      return await persist(editDesign(p, mutate, layout), layout);
    } catch (e) {
      setMessage(String(e));
      return false;
    }
  }
  async function restore(direction: 'undo' | 'redo') {
    const prev = direction === 'undo' ? undo : redo;
    const entry = prev.at(-1);
    if (!entry || historyRevision.current !== p.revision) return;
    const next = editDesign(
      p,
      (draft) => {
        if (entry.layout) {
          draft.scenario!.layout = structuredClone(entry.project.scenario!.layout);
          return;
        }
        Object.assign(draft, structuredClone(designOf(entry.project)));
        draft.characters = structuredClone(entry.project.characters);
        draft.factions = structuredClone(entry.project.factions);
        if (entry.project.stateEntities) draft.stateEntities = structuredClone(entry.project.stateEntities);
        else delete draft.stateEntities;
        if (entry.project.basis.scenario) draft.basis.scenario = entry.project.basis.scenario;
        else delete draft.basis.scenario;
      },
      entry.layout,
    );
    if (await commit(next)) {
      historyRevision.current = next.revision;
      const inverse = { project: p, layout: entry.layout };
      if (direction === 'undo') {
        setUndo(prev.slice(0, -1));
        setRedo([...redo, inverse]);
      } else {
        setRedo(prev.slice(0, -1));
        setUndo([...undo, inverse]);
      }
    }
  }
  async function request(action: 'generate' | 'revise' | 'validate') {
    if (controller.current || disabled || (action !== 'validate' && (loadingRecovery || hasRecovery))) return;
    const ctl = new AbortController();
    controller.current = ctl;
    setBusy(action);
    setMessage('');
    if (action === 'validate') setValidationError('');
    if (!hasRecovery && action !== 'validate') {
      setPending(undefined);
      setFailedProposal(undefined);
    }
    try {
      const path = action === 'generate' ? '' : action === 'revise' ? '/revise' : '/validate';
      const snapshot=designSnapshot(p);
      const body =
        action === 'generate'
          ? { project: snapshot, settings }
          : action === 'revise'
            ? { project: snapshot, targetId: target, instructions }
            : snapshot;
      const res = await fetch('/api/scenario' + path, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(action === 'generate' && generation?.mode === 'live' && generation.limits?.scenarioMaxOutputTokens
            ? { 'X-Worldweaver-Scenario-Output-Limit': String(generation.limits.scenarioMaxOutputTokens) } : {}),
          ...(generation && action !== 'validate'
            ? { 'X-Worldweaver-Generation': generationIntent(generation) }
            : {}),
        },
        body: JSON.stringify(body),
        signal: ctl.signal,
      });
      const data = await res.json();
      if (ctl.signal.aborted) return;
      if (current()?.revision !== p.revision || current()?.id !== p.id) throw Error(action === 'validate' ? c.staleCheck : c.changed);
      if (!res.ok) {
        if (res.status === 409 && data?.error?.code === 'generation_configuration_changed') refreshGeneration();
        const run = data?.error?.run;
        let usage = '';
        if (
          run?.baseRevision === p.revision &&
          run.stage === 'scenario' &&
          run.mode === (action === 'validate' ? 'deterministic' : generation?.mode) &&
          ['failed', 'unresolved'].includes(run.status)
        ) {
          const failed = { ...p, runs: [...p.runs, run] };
          if (isProject(failed)) {
            const receipts = failed.runs.at(-1)!.receipts;
            const output = receipts.find(r => r.tool === 'provider_usage')?.detail.match(/\boutputTokens=(\d+)$/)?.[1];
            const reasoning = receipts.find(r => r.tool === 'provider_reasoning')?.detail.match(/^reasoningTokens=(\d+)$/)?.[1];
            if (output !== undefined) usage = c.reportedUsage(output, reasoning);
            await commit(failed);
          }
        }
        const detail = data?.error?.findings ?? data?.findings;
        if (detail && !ctl.signal.aborted && current()?.revision === p.revision && current()?.id === p.id) {
          const findings = findingsOf(detail);
          if (findings.length && !hasRecovery) {
            const recovery = action === 'generate' ? data?.error?.recovery : undefined;
            setFailedProposal(previous => previous?.recovery != null ? previous : { findings });
            if (recovery != null) await retain({ findings, recovery });
          }
        }
        throw Error([data?.error?.message ?? c.requestFailed, usage].filter(Boolean).join(' '));
      }
      if (action === 'validate') {
        if (typeof data?.valid !== 'boolean' || typeof data.complete !== 'boolean' || !Array.isArray(data.paths))
          throw Error(c.invalidCheckResponse);
        const findings = findingsOf(data.findings);
        const ok = data.valid === true && data.complete === true && !findings.some((f) => f.severity === 'error');
        const runId = newId('check');
        const knownIds = new Set(entities(p).map((entity) => entity.id));
        const saved: Project = {
          ...p,
          ...(p.scenario?.approved && !ok && {scenario: {...p.scenario, approved: false}}),
          runs: [
            ...p.runs,
            {
              id: runId,
              stage: 'scenario',
              baseRevision: p.revision,
              mode: 'deterministic',
              status: ok ? 'verified' : 'unresolved',
              calls: 0,
              repairAttempts: 0,
              receipts: [
                { tool: 'validate_scenario', outcome: ok ? 'passed' : 'failed', detail: !data.complete ? c.incompleteCheck : ok ? c.valid : c.invalid },
              ],
            },
          ],
          findings: [
            ...p.findings.map((f) =>
              f.rule.startsWith('scenario.') ? { ...f, status: 'superseded' as const } : f,
            ),
            ...findings.map(({ rule, severity, entityIds, explanation, suggestedRepair,
              fieldPath, referenceId, expectedType, actualType, witnessPath, blockedTransitions, causeNodeId }) => {
              const missing = entityIds.filter((id) => !knownIds.has(id));
              return {
                rule: 'scenario.' + rule,
                severity,
                entityIds: entityIds.filter((id) => knownIds.has(id)),
                explanation: [explanation, ...missing].join(' '),
                suggestedRepair,
                ...(fieldPath && { fieldPath }), ...(referenceId && { referenceId }),
                ...(expectedType && { expectedType }), ...(actualType && { actualType }),
                ...(witnessPath?.length && { witnessPath }),
                ...(blockedTransitions && { blockedTransitions }), ...(causeNodeId && { causeNodeId }),
                id: newId('finding'),
                runId,
                origin: 'deterministic' as const,
                status: 'open' as const,
                checkedRevision: p.revision,
              };
            }),
          ],
        };
        if (!isProject(saved)) throw Error(c.invalidCheckRecord);
        const paths: string[][] = [];
        if (Array.isArray(data.paths))
          for (const route of data.paths) {
            if (
              !Array.isArray(route?.nodeIds) ||
              !route.nodeIds.every((id: unknown) => p.nodes.some((n) => n.id === id))
            )
              throw Error(c.invalidCheckResponse);
            paths.push(route.nodeIds);
          }
        if (await commit(saved, runId)) setWitnesses({ runId, paths });
        else setValidationError(c.checkSaveFailed);
      } else {
        const id = action === 'revise' ? target : undefined;
        const next = applyProposal(p, data, id);
        if (data.run.mode !== generation?.mode) throw Error(c.requestFailed);
        setPending({ response: data, next, base: p.revision, target: id });
        setTarget('');
      }
    } catch (error) {
      if (!ctl.signal.aborted) {
        const detail = error instanceof Error ? error.message : c.requestFailed;
        if (action === 'validate') setValidationError(detail);
        else setMessage(detail);
      }
    } finally {
      if (controller.current === ctl) {
        controller.current = null;
        setBusy(false);
      }
    }
  }
  const findings = p.findings.filter(f => f.rule.startsWith('scenario.') &&
    (checked ? f.runId === checked.id : f.status === 'open' && f.checkedRevision === p.revision));
  const blockers = findings.filter(f => f.severity === 'error');
  const checkFailed = checked?.status === 'unresolved' || !!blockers.length;
  const checkDetail = checked?.receipts.find(r => r.tool === 'validate_scenario')?.detail;
  function approvalReasons() {
    const reasons = [...disabledReasons];
    if (busy) reasons.push(busy === 'validate' ? c.checking : c.generating);
    if (validationError) reasons.push(validationError);
    if (!source) reasons.push(c.approveSource);
    if (p.scenario && (p.scenario.sourceNarrativeId !== p.narrative?.id ||
        p.basis.scenario?.narrative !== p.versions.narrative || p.basis.scenario?.content !== p.versions.content))
      reasons.push(c.reconcileForApproval);
    if (pending) reasons.push(c.pendingApproval);
    if (checkFailed && checked) {
      const rules = [...new Set(blockers.map(f => f.rule.replace(/^scenario\./, '')))];
      if (!blockers.length || checkDetail === c.incompleteCheck) reasons.push(checkDetail || c.invalid);
      if (blockers.length) reasons.push(c.blocking(blockers.length, rules));
      for (const finding of blockers.filter(f => f.rule === 'scenario.blocked_start')) {
        const titleOf = (id: string) => p.nodes.find(n => n.id === id)?.title || id;
        const visits = (finding.blockedTransitions ?? []).filter(b => b.kind === 'visited');
        if (visits.length && finding.entityIds[0])
          reasons.push(c.startingVisits(titleOf(finding.entityIds[0]), visits.map(b => titleOf(b.key))));
      }
    }
    if (p.scenario?.approved) reasons.push(c.alreadyApproved);
    else {
      if (!checked) reasons.push(c.validationMissing(p.versions.scenario));
      if (!reviewed) reasons.push(c.reviewRequired);
    }
    return [...new Set(reasons)];
  }
  const reasons = approvalReasons();
  const renderPreview = (project: Project, id?: string) => {
    if (!id)
      return (
        <>
          <strong>{project.scenario?.title}</strong>
          <p>{project.scenario?.summary}</p>
          <p>{c.counts(project.nodes.length, project.edges.length, project.quests.length)}</p>
          <ol>
            {project.scenario?.chapters.map((ch) => (
              <li key={ch.id}>
                {ch.title} · {ch.summary}
              </li>
            ))}
          </ol>
          <details>
            <summary>{c.compare}</summary>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{scenarioMarkdown(project)}</pre>
          </details>
        </>
      );
    const fields = targetFields(project, id);
    return (
      <dl>
        {Object.entries(fields ?? {})
          .filter(
            ([k, v]) => typeof v === 'string' && !['id', 'chapterId', 'nodeId', 'kind', 'locationId'].includes(k),
          )
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
      </dl>
    );
  };
  return (
    <section className="scenario-studio">
      <div className="page-heading">
        <h1>{c.title}</h1>
        <p>
          {c.sourceLabel} · {p.narrative?.story.title ?? c.source}
        </p>
      </div>
      {p.scenario && (
        <strong>
          {fresh
            ? p.scenario.approved
              ? c.approved
              : c.draft
            : c.stale(p.basis.scenario?.narrative, p.basis.scenario?.content ?? 0)}
        </strong>
      )}
      {p.scenario && !fresh && source && p.narrative && (
        <details className="panel">
          <summary>{c.reconcile}</summary>
          <h3>{p.narrative.story.title}</h3>
          <p>{p.narrative.story.premise}</p>
          <p>{p.narrative.story.conflict}</p>
          <ol>
            {p.narrative.story.progression.map((beat, i) => (
              <li key={i}>{beat}</li>
            ))}
          </ol>
          <ul>
            {p.userContent.map((f) => (
              <li key={f.id}>
                {f.treatment} · {f.text}
              </li>
            ))}
            {p.canonicalFacts.map((f) => (
              <li key={f.id}>{f.statement}</li>
            ))}
          </ul>
          <button
            disabled={locked}
            onClick={() => {
              if (window.confirm(c.confirmReconcile)) void persist(reconcileSource(p));
            }}
          >
            {c.keepGraph}
          </button>
        </details>
      )}
      {!p.scenario && <p>{source ? c.empty : c.source}</p>}
      {source && !p.characters.length && !p.factions.length && <p>{c.legacyEntities}</p>}
      <details open={!p.scenario || undefined} className="panel">
        <summary>{c.configure}</summary>
        <fieldset disabled={locked}>
          <div className="scenario-settings">
            {Object.entries(options).map(([name, values]) => {
              const k = name as keyof typeof options;
              return (
                <label key={k}>
                  {c.labels[k]}
                  <select value={settings[k]} onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}>
                    {values.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              );
            })}
            <label>
              {c.labels.chapterCount}
              <select
                value={settings.chapterCount}
                onChange={(e) => setSettings({ ...settings, chapterCount: Number(e.target.value) })}
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              {c.instructions}
              <textarea
                maxLength={1200}
                value={settings.instructions}
                onChange={(e) => setSettings({ ...settings, instructions: e.target.value })}
              />
            </label>
          </div>
          <p>{generation?.available && generation.mode==='live' && generation.limits?.scenarioMaxOutputTokens && generation.limits.timeoutSeconds
            ? c.liveBudget(generation.limits.scenarioMaxOutputTokens, generation.limits.timeoutSeconds) : c.limit}</p>
          {hasRecovery && <p>Discard the original rejected proposal to enable generation. You can export it first.</p>}
          <button
            disabled={!source || !generation?.available || !!pending || hasRecovery || loadingRecovery}
            onClick={() => void request('generate')}
          >
            {c.generate}
          </button>
        </fieldset>
      </details>
      {message && (
        <p className="notice" role="alert">
          {message}
        </p>
      )}
      {storageNotice && <p role="status">{storageNotice}</p>}
      <RecoveryFile project={p} rejected={failedProposal} disabled={locked || !!pending || loadingRecovery}
        onRestore={value => { if (!hasRecovery) void retain(value).catch(() => setMessage(c.requestFailed)); }} />
      {failedProposal && <section className="panel">
        {failedProposal.recovery != null ? <RejectedScenarioEditor project={p} recovery={failedProposal.recovery}
          disabled={locked || !!pending}
          findings={failedProposal.findings} onProposal={(response, next, rejectedOriginal) => {
            if (current()?.id !== p.id || current()?.revision !== p.revision) {
              setMessage(c.changed);
              return;
            }
            setMessage('');
            setPending({ response, next, base: p.revision, rejectedOriginal });
          }} /> : <ScenarioFindings title={c.proposalFindings} findings={failedProposal.findings} />}
        <button disabled={locked || !!pending} onClick={() => void dismiss()}>
          {hasRecovery ? 'Discard original rejected proposal' : c.dismiss}
        </button>
      </section>}
      {busy && (
        <div role="status">
          {busy === 'validate' ? c.checking : c.generating}{' '}
          <button onClick={() => controller.current?.abort()}>{c.cancel}</button>
        </div>
      )}
      {pending && (
        <section className="panel">
          <h2>{c.compare}</h2>
          {pending.rejectedOriginal && <RecoveryChanges original={pending.rejectedOriginal} edited={pending.next} />}
          <div className="replacement-grid">
            <section>
              <h3>{c.before}</h3>
              {renderPreview(p, pending.target)}
            </section>
            <section>
              <h3>{c.after}</h3>
              {renderPreview(pending.next, pending.target)}
            </section>
          </div>
          {!pending.target && <ProposalEntities before={p} after={pending.next} />}
          <button
            disabled={locked || pending.base !== p.revision}
            onClick={async () => {
              try {
                const next = applyProposal(p, pending.response, pending.target);
                if (await persist(next)) setPending(undefined);
              } catch (e) {
                setMessage(String(e));
              }
            }}
          >
            {c.accept}
          </button>
          <button
            disabled={locked}
            onClick={async () => {
              const run = pending.next.runs.at(-1);
              if (run && current()?.revision === pending.base)
                await commit({
                  ...p,
                  runs: [
                    ...p.runs,
                    {
                      ...run,
                      status: 'cancelled',
                      receipts: [
                        ...run.receipts,
                        { tool: 'review_proposal', outcome: 'cancelled', detail: c.rejected },
                      ],
                    },
                  ],
                });
              setPending(undefined);
            }}
          >
            {c.reject}
          </button>
        </section>
      )}
      {target && (
        <div className="panel">
          <h2>
            {c.revision} · {target}
          </h2>
          <label>
            {c.instructions}
            <textarea maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
          </label>
          <button
            disabled={locked || hasRecovery || loadingRecovery || !fresh || !generation?.available || !instructions.trim()}
            onClick={() => void request('revise')}
          >
            {c.revise}
          </button>
          <button onClick={() => setTarget('')}>{c.cancel}</button>
        </div>
      )}
      <fieldset disabled={locked} className="scenario-controls">
        <div className="actions">
          <button
            disabled={!undo.length || historyRevision.current !== p.revision}
            onClick={() => void restore('undo')}
          >
            {c.undo}
          </button>
          <button
            disabled={!redo.length || historyRevision.current !== p.revision}
            onClick={() => void restore('redo')}
          >
            {c.redo}
          </button>
          <button onClick={() => downloadFile(p.id + '.json', JSON.stringify(p, null, 2), 'application/json')}>
            {c.json}
          </button>
          {p.scenario && (
            <>
              <button onClick={() => downloadFile(p.id + '.md', scenarioMarkdown(p), 'text/markdown')}>
                {c.markdown}
              </button>
              <button onClick={() => void request('validate')}>{c.validate}</button>
            </>
          )}
        </div>
        {p.scenario && (
          <>
            <ScenarioBrief
              key={[p.scenario.id, p.scenario.title, p.scenario.summary].join('/')}
              project={p}
              edit={edit}
            />
            <ScenarioEditor
              selectedId={selectedId} openAtlas={openAtlas}
              project={p}
              edit={edit}
              revise={hasRecovery ? undefined : (id) => {
                setTarget(id);
                setPending(undefined);
                setInstructions('');
              }}
              findings={findings}
            />
            <section className="panel">
              <h2>{c.approval}</h2>
              {checked && !reasons.includes(checkDetail ?? '') && <p>{checkFailed ? checkDetail : c.valid}</p>}
              <div id="scenario-approval-reason" aria-live="polite">
                {reasons.length > 0 && <ul>{reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
              </div>
              {!!paths?.length && (
                <details>
                  <summary>{c.paths}</summary>
                  <ol>
                    {paths.map((ids, i) => (
                      <li key={i}>{ids.map((id) => p.nodes.find((n) => n.id === id)?.title).join(' → ')}</li>
                    ))}
                  </ol>
                </details>
              )}
              <details>
                <summary>{c.reviewCanon}</summary>
                <p>{p.narrative?.story.premise}</p>
                <p>{p.narrative?.story.conflict}</p>
                <ul>
                  {p.canonicalFacts.map((f) => (
                    <li key={f.id}>{f.statement}</li>
                  ))}
                </ul>
              </details>
              <label className="checkbox-label">
                <input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
                {c.reviewed}
              </label>
              <button
                disabled={locked || reasons.length > 0}
                aria-describedby="scenario-approval-reason"
                onClick={() => {
                  if (locked || reasons.length || checked?.status !== 'verified' || !p.scenario) return;
                  if (current() !== p) { setValidationError(c.staleCheck); return; }
                  void commit({ ...p, scenario: { ...p.scenario, approved: true } });
                }}
              >
                {c.approve}
              </button>
            </section>
          </>
        )}
      </fieldset>
    </section>
  );
}
