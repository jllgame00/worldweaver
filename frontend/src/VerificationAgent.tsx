import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentRun, Project, ValidationFinding, VerificationEntry } from './project.generated';
import type { GenerationStatus } from './validation';
import { verificationIdentity, reportApplies, reserveRepair, updateRepair } from './verificationHistory';
import { confirmWorldReview, persistReport, reportedCalls, verificationMarkdown } from './verificationReport';
import {
  runVerification,
  verificationPlan,
  type VerificationMode,
  type VerificationToolReceipt,
} from './verificationEngine';
import { downloadFile } from './scenarioWorkflow';
import { buildWorldBible } from './worldBibleIndex';
import { simulateRepairs, incomplete } from './repairSimulation';
import { VerificationRepairReview, type RepairAction } from './VerificationRepairReview';
import SemanticReview from './SemanticReview';
import { reviewSources } from './semanticReviewClient';
import {
  useVerificationCopy,
  useVerificationDetail,
  useVerificationStatus,
  useVerificationTool,
  verificationCopy as raw,
} from './verificationCopy';
import { DiagnosticDetails, useFormatter, useLocale } from './locale';
import { useBibleKinds } from './worldBibleCopy';
import './evidenceWorkspace.css';

type Props = {
  project: Project;
  current: () => Project | undefined;
  commit: (p: Project) => Promise<boolean>;
  disabled: boolean;
  targetId?: string;
  inspect: (id: string) => void;
  configuration?: GenerationStatus | null;
};

export default function VerificationAgent({
  project,
  current,
  commit,
  disabled,
  targetId,
  inspect,
  configuration,
}: Props) {
  const c = useVerificationCopy();
  const kinds = useBibleKinds();
  const locale = useLocale();
  const { date, number } = useFormatter();
  const detail = useVerificationDetail();
  const status = useVerificationStatus();
  const tool = useVerificationTool();
  const [mode, setMode] = useState<VerificationMode>(targetId ? 'targeted' : 'quick');
  const [target, setTarget] = useState(targetId ?? '');
  const [picked, setPicked] = useState('');
  const [editing, setEditing] = useState('');
  const [filter, setFilter] = useState('all');
  const [ownerReview, setOwnerReview] = useState('');
  const [busy, setBusy] = useState(false);
  const [semanticBusy, setSemanticBusy] = useState(false);
  const [progress, setProgress] = useState<VerificationToolReceipt[]>([]);
  const [activeTool, setActiveTool] = useState('');
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState('');
  const task = useRef<AbortController | null>(null);
  const index = useMemo(() => buildWorldBible(project), [project]);
  const plan = useMemo(() => verificationPlan(mode, target, project), [mode, target, project]);
  const label = (id: string) => index.entities.get(id)?.label ?? id;
  const history = project.verificationHistory ?? [];
  const entry = history.find((e) => e.runId === picked) ?? history.at(-1);
  const run = project.runs.find((r) => r.id === entry?.runId);
  const calls = run && reportedCalls(run);
  const fresh = !!entry && reportApplies(entry, identity);
  const available =
    !!entry &&
    !!run &&
    fresh &&
    !entry.omittedFindings &&
    !entry.revalidation &&
    !incomplete({ run, tools: entry.tools as VerificationToolReceipt[] });
  const finding = entry?.findings.find((f) => f.id === editing);
  useEffect(() => {
    if (targetId) {
      setMode('targeted');
      setTarget(targetId);
      setEditing('');
    }
  }, [targetId]);
  useEffect(
    () => () => {
      task.current?.abort();
      task.current = null;
    },
    [],
  );
  useEffect(() => {
    let mounted = true;
    setIdentity('');
    verificationIdentity(project)
      .then((id) => {
        if (mounted) setIdentity(id);
      })
      .catch(() => {
        if (mounted) setError(raw.failed);
      });
    return () => {
      mounted = false;
    };
  }, [project]);
  function begin() {
    if (task.current || disabled || semanticBusy || current() !== project) return;
    const controller = new AbortController();
    task.current = controller;
    setBusy(true);
    setError('');
    setProgress([]);
    setActiveTool('');
    return controller;
  }
  function finish(controller: AbortController) {
    if (task.current === controller) {
      task.current = null;
      setBusy(false);
    }
  }
  async function check(kind: VerificationMode = mode, id = target) {
    const ctl = begin();
    if (!ctl) return;
    setEditing('');
    try {
      const fingerprint = await verificationIdentity(project);
      const report = await runVerification(project, {
        mode: kind,
        ...(kind === 'targeted' && { targetId: id }),
        signal: ctl.signal,
        isCurrent: () => current() === project,
        onStart: (t) => {
          if (task.current === ctl) setActiveTool(t);
        },
        onTool: (t) => {
          if (task.current === ctl) setProgress((prev) => [...prev, t]);
        },
      });
      if (task.current !== ctl) return;
      if (current() !== project) throw Error(raw.expired);
      if (await commit(persistReport(project, report, fingerprint))) setPicked(report.run.id);
    } catch (e) {
      if (task.current === ctl) setError(e instanceof Error ? e.message : raw.failed);
    } finally {
      finish(ctl);
    }
  }
  async function semanticResult(ai: AgentRun, findings: ValidationFinding[]) {
    if (!configuration || !entry || !fresh || mode === 'quick' || current() !== project || task.current)
      return false;
    const next = persistReport(
      project,
      {
        run: ai,
        mode,
        targetId: mode === 'targeted' ? target : undefined,
        findings,
        tools: [],
        paths: [],
        statesExplored: 0,
      },
      entry.fingerprint,
      {
        provider: configuration.provider,
        model: configuration.model,
        sourceRunId: entry.runId,
        submittedIds: reviewSources(project, {
          mode,
          targetId: mode === 'targeted' ? target : undefined,
        }).map((r) => r.id),
      },
    );
    if (await commit(next)) {
      setPicked(ai.id);
      setEditing('');
      return true;
    }
    return false;
  }
  async function approve() {
    if (!entry || ownerReview !== entry.runId) return;
    const ctl = begin();
    if (!ctl) return;
    try {
      const next = await confirmWorldReview(project, entry.runId, ctl.signal);
      if (current() !== project || ctl.signal.aborted || task.current !== ctl) throw Error(raw.expired);
      if (await commit(next)) {
        setPicked(next.approval.runId);
        setOwnerReview('');
      }
    } catch (e) {
      if (task.current === ctl) setError(e instanceof Error ? e.message : raw.failed);
    } finally {
      finish(ctl);
    }
  }
  const act: RepairAction = async (action, edits, saved) => {
    if (!entry || !finding || !available || !edits.length) return;
    const ctl = begin();
    if (!ctl) return;
    try {
      if ((await verificationIdentity(project)) !== entry.fingerprint || current() !== project)
        throw Error(raw.expired);
      const classification = edits.every((e) => ['distanceKm', 'corridor'].includes(e.field))
        ? 'technical'
        : 'creative';
      let base = project;
      if (!saved) {
        base = reserveRepair(project, entry.runId, edits, classification);
        if (!(await commit(base))) return;
      } else if (saved.sourceRevision !== project.revision || !entry.proposals?.some((s) => s === saved))
        throw Error(raw.expired);
      const id = edits[0]!.proposalId;
      if (action === 'accept' && saved?.status !== 'ready') throw Error(raw.expired);
      let next = base;
      if (action !== 'reject') {
        let verified: Awaited<ReturnType<typeof simulateRepairs>> | undefined;
        let failure: string | undefined;
        try {
          verified = await simulateRepairs(base, edits, finding, entry.fingerprint, ctl.signal);
          failure = verified.problem;
        } catch (e) {
          failure = e instanceof Error ? e.message : raw.failed;
        }
        if (current() !== base || task.current !== ctl) throw Error(raw.expired);
        if (ctl.signal.aborted) failure = raw.incomplete;
        const updated = updateRepair(base, entry.runId, id, {
          status: failure ? 'blocked' : 'ready',
          detail: failure,
          beforeTools: verified?.before.tools ?? [],
          afterTools: verified?.after.tools ?? [],
        });
        if (action === 'simulate' || failure || !verified) {
          await commit(updated);
          return;
        }
        next = { ...verified.draft, verificationHistory: updated.verificationHistory };
      }
      if (current() !== base || task.current !== ctl || ctl.signal.aborted) throw Error(raw.expired);
      const accepted = action === 'accept';
      const prior = next.verificationHistory
        ?.find((e) => e.runId === entry.runId)
        ?.proposals?.find((s) => s.edits[0].proposalId === id);
      next = updateRepair(next, entry.runId, id, {
        status: accepted ? 'accepted' : 'rejected',
        beforeTools: prior?.beforeTools ?? [],
        afterTools: prior?.afterTools ?? [],
      });
      const stamp = new Date().toISOString();
      next = {
        ...next,
        verificationHistory: next.verificationHistory?.map((h) =>
          h.runId !== entry.runId
            ? h
            : {
                ...h,
                findings: h.findings.map((f) =>
                  f.id === finding.id && accepted && f.origin === 'deterministic'
                    ? { ...f, status: 'resolved' }
                    : f,
                ),
                decisions: [
                  ...h.decisions,
                  ...edits.map(({ requires: _, ...edit }) => ({
                    ...edit,
                    revision: next.revision,
                    timestamp: stamp,
                    decision: accepted ? ('accepted' as const) : ('rejected' as const),
                  })),
                ],
              },
        ),
      };
      if (accepted)
        downloadFile(
          project.id + '-before-repair-r' + project.revision + '.json',
          JSON.stringify(project),
          'application/json',
        );
      if (!(await commit(next))) return;
      setEditing('');
      if (accepted && task.current === ctl && current() === next) {
        const fingerprint = await verificationIdentity(next);
        const checked = await runVerification(next, {
          mode: 'full',
          signal: ctl.signal,
          isCurrent: () => current() === next,
          onStart: (t) => {
            if (task.current === ctl) setActiveTool(t);
          },
          onTool: (t) => {
            if (task.current === ctl) setProgress((prev) => [...prev, t]);
          },
        });
        if (
          task.current === ctl &&
          current() === next &&
          (await commit(
            persistReport(
              next,
              checked,
              fingerprint,
              { revalidation: true, sourceRunId: entry.runId },
              entry.runId,
            ),
          ))
        )
          setPicked(checked.run.id);
      }
    } catch (e) {
      if (task.current === ctl) setError(e instanceof Error ? e.message : raw.failed);
    } finally {
      finish(ctl);
    }
  };
  const inspectButtons = (ids: string[]) =>
    [...new Set(ids)]
      .filter((id) => index.entities.has(id))
      .map((id) => (
        <button type="button" className="quiet" key={id} onClick={() => inspect(id)}>
          {label(id)}
        </button>
      ));
  function findingsList(report: VerificationEntry) {
    const category = (f: ValidationFinding) => f.origin === 'editorial' && f.severity === 'info' ? 'editorial' : f.severity;
    if (filter !== 'all' && !report.findings.some(f => category(f) === filter)) return <p>{c.filterEmpty}</p>;
    return (['error', 'warning', 'editorial', 'info'] as const).map((key) => {
      if (filter !== 'all' && filter !== key) return null;
      const rows = report.findings.filter(f => category(f) === key);
      const domains = [...new Set(rows.map((f) => f.rule.split('.')[0] ?? f.rule))];
      function card(f: ValidationFinding) {
        const explanation = f.origin === 'editorial' ? f.explanation : detail(f.explanation, f.rule);
        const affected = [...new Set(f.entityIds)];
        return (
          <article key={f.id} className="finding-card" aria-label={explanation}>
            <h5><strong>{explanation}</strong></h5>
            <div className="finding-state">{status(f.severity)} · {status(f.status)} · {f.origin === 'editorial' ? c.severity.editorial : c.mode[report.mode]}</div>
            {f.causeNodeId && <p>{c.cause} · {label(f.causeNodeId)}</p>}
            {affected.length > 0 && <div className="actions">
              <span>{locale === 'ko' ? '영향받는 기록' : 'Affected records'} · {number(affected.length)}</span>
              {inspectButtons(affected)}
              {affected.filter(id => !index.entities.has(id)).map(id => <code key={id}>{id}</code>)}
            </div>}
            {f.suggestedRepair && (
              <p>{f.origin === 'editorial' ? f.suggestedRepair : detail(f.suggestedRepair, undefined, f.suggestedRepair)}</p>
            )}
            {!!f.blockedTransitions?.length && (
              <ul aria-label={c.related}>
                {f.blockedTransitions.map((b, i) => (
                  <li key={i}>
                    {label(b.key)} · {b.actual ?? '∅'} → {b.required} {inspectButtons([b.key])}
                  </li>
                ))}
              </ul>
            )}
            <details>
              <summary>
                {c.details} · {status(f.status)}
              </summary>
              <dl className="operations-details">
                <dt>{locale === 'ko' ? '검사 규칙' : 'Check rule'}</dt><dd><code>{f.rule}</code></dd>
                {f.fieldPath && <><dt>{c.fieldPath}</dt><dd><code>{f.fieldPath}</code></dd></>}
                {f.witnessPath?.length ? <><dt>{c.witness}</dt><dd>{f.witnessPath.map(label).join(' → ')}</dd></> : null}
                {f.referenceId && <><dt>{c.record}</dt><dd>{label(f.referenceId)} · <code>{f.referenceId}</code></dd></>}
              </dl>
              {f.evidence?.map((source, i) => <div key={i}><b>{label(source.id)}</b><blockquote>{source.excerpt}</blockquote></div>)}
              <details><summary>{locale === 'ko' ? '전체 기술 기록' : 'Full technical record'}</summary>
                <pre className="verification-evidence">{JSON.stringify(f, null, 2)}</pre></details>
            </details>
            <button type="button" disabled={!available || busy || disabled} onClick={() => setEditing(f.id)}>
              {c.revise}
            </button>
            {editing === f.id && available && (
              <VerificationRepairReview
                key={report.runId + f.id}
                project={project}
                entry={report}
                finding={f}
                disabled={disabled || busy}
                act={act}
              />
            )}
          </article>
        );
      }
      return (
        rows.length > 0 && (
          <section key={key}>
            <h3>
              {c.severity[key]} ({number(rows.length)})
            </h3>
            {domains.map((domain) => {
              const group = rows.filter((f) => f.rule.split('.')[0] === domain);
              const repeated = new Map<string, ValidationFinding[]>();
              const primary = group.filter((f) => {
                if (
                  !f.causeNodeId ||
                  !group.some((root) => !root.causeNodeId && root.entityIds.includes(f.causeNodeId!))
                )
                  return true;
                const linked = repeated.get(f.causeNodeId) ?? [];
                linked.push(f);
                repeated.set(f.causeNodeId, linked);
                return false;
              });
              return (
                <section key={domain}>
                  <h4 title={domain}>
                    {locale === 'ko' && (domain === 'scenario' || domain === 'world') ? kinds[domain] : tool(domain)}
                  </h4>
                  {primary.map(card)}
                  {[...repeated].map(([id, linked]) => (
                    <details key={id}>
                      <summary>
                        {c.downstream} · {label(id)} ({number(linked.length)})
                      </summary>
                      {linked.map(card)}
                    </details>
                  ))}
                </section>
              );
            })}
          </section>
        )
      );
    });
  }
  const scopeMatches = entry?.mode === mode && (mode !== 'targeted' || entry.targetId === target);
  return (
    <>
      <div className="page-heading">
        <h1>{c.title}</h1>
        <p>{c.cost}</p>
      </div>
      <section className="panel">
        <label>
          {c.scope}
          <select
            disabled={busy || semanticBusy}
            value={mode}
            onChange={(e) => setMode(e.target.value as VerificationMode)}
          >
            {Object.entries(c.mode).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{mode === 'quick'
          ? (locale === 'ko' ? '저장된 설계의 기본 구조와 참조를 확인합니다.' : 'Inspect the saved design’s structure and references.')
          : mode === 'targeted'
            ? (locale === 'ko' ? '선택한 기록과 연결된 의존성을 검사합니다.' : 'Check the selected record and its connected dependencies.')
            : (locale === 'ko' ? '현재 프로젝트 전체의 적용 가능한 도구를 실행합니다.' : 'Run the applicable tools across the current project.')}</p>
        {mode === 'targeted' && (
          <label>
            {c.target}
            <select
              value={target}
              disabled={busy || semanticBusy}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">{c.select}</option>
              {[...index.entities.values()].map((r) => (
                <option value={r.id} key={r.id}>
                  {r.label} · {locale === 'ko' ? kinds[r.kind] : r.kind}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={disabled || busy || semanticBusy || (mode === 'targeted' && !target)}
            onClick={() => void check()}
          >
            {c.run[mode]}
          </button>
          {busy && <button onClick={() => task.current?.abort()}>{c.cancel}</button>}
          <button
            onClick={() => downloadFile(project.id + '.json', JSON.stringify(project), 'application/json')}
          >
            {c.project}
          </button>
        </div>
        {mode === 'targeted' && !target && <p>{c.select}</p>}
        {disabled && <p>{c.disabled}</p>}
        <details open={busy || undefined}>
          <summary>{c.plan}</summary>
          <ol aria-live="polite">
            {plan.map((id) => {
              const toolStatus = busy && progress.find((t) => t.tool === id)?.status;
              return (
                <li key={id} title={id}>
                  {tool(id)} ·{' '}
                  {toolStatus ? status(toolStatus) : busy && activeTool === id ? c.running : c.waiting}
                </li>
              );
            })}
          </ol>
        </details>
      </section>
      {error && <><p role="alert">{detail(error)}</p><DiagnosticDetails detail={error} /></>}
      <section className="panel">
        <h2>{c.history}</h2>
        {entry && run ? (
          <>
            <select
              disabled={busy || semanticBusy}
              aria-label={c.history}
              value={entry.runId}
              onChange={(e) => {
                setPicked(e.target.value);
                setEditing('');
                setFilter('all');
              }}
            >
              {[...history].reverse().map((h) => {
                const time = Date.parse(h.timestamp);
                return (
                  <option value={h.runId} key={h.runId} title={h.timestamp}>
                    {Number.isFinite(time) ? date(time, { dateStyle: 'medium', timeStyle: 'medium' }) : h.timestamp}
                    {' · '}{c.mode[h.mode]} · {h.provider ?? (locale === 'ko' ? '결정론적 검사' : 'deterministic')} ·{' '}
                    {h.targetId ? label(h.targetId) : c.scopeAll}
                  </option>
                );
              })}
            </select>
            <p role="status">
              {identity ? (fresh ? c.current : c.stale) : c.checking} · r{number(run.baseRevision)} · {status(run.status)}
              {run.durationMs !== undefined && <> · {number(run.durationMs)} ms</>}
            </p>
            <p>
              {c.attempts} · {number(run.repairAttempts)}/2 · {c.runUsage} · {typeof calls === 'number' ? number(calls) : c.unknown}
              {run.tokens !== undefined && (
                <>
                  {' '}
                  · {c.reportedTokens} · {number(run.tokens)}
                </>
              )}
            </p>
            <div className="actions">
              <button
                onClick={() =>
                  downloadFile(
                    run.id + '.md',
                    verificationMarkdown(project, entry, run, fresh, locale),
                    'text/markdown',
                  )
                }
              >
                {c.markdown}
              </button>
              <button
                onClick={() =>
                  downloadFile(
                    run.id + '.json',
                    JSON.stringify({ run, ...entry }, null, 2),
                    'application/json',
                  )
                }
              >
                {c.json}
              </button>
              <button
                disabled={
                  disabled || busy || (entry.mode === 'targeted' && !index.entities.has(entry.targetId ?? ''))
                }
                onClick={() => {
                  setMode(entry.mode);
                  setTarget(entry.targetId ?? '');
                  void check(entry.mode, entry.targetId);
                }}
              >
                {c.revalidate}
              </button>
            </div>
            <h3>{c.receipts}</h3>
            <ul>
              {entry.tools.map((t) => (
                <li key={t.tool}>
                  <b title={t.tool}>
                    {tool(t.tool)} · {status(t.status)}
                  </b>{' '}
                  · {detail(t.detail)}
                  <DiagnosticDetails detail={t.detail} code={t.tool} />
                </li>
              ))}
              {!entry.tools.length &&
                run.receipts.map((r, i) => (
                  <li key={i} title={r.tool}>
                    {tool(r.tool)} · {status(r.outcome)} · {detail(r.detail, undefined, r.detail)}
                  </li>
                ))}
            </ul>
            <p className="finding-state">{entry.provider
              ? (run.status === 'proposed' ? (locale === 'ko' ? '의미 검토 완료' : 'Editorial review completed')
                : (locale === 'ko' ? '의미 검토 미완료' : 'Editorial review incomplete'))
              : (locale === 'ko' ? '의미 검토 안 함' : 'Editorial review not run')}</p>
            <p>{entry.provider ? c.semanticLimit : c.unreviewed}</p>
            {entry.submittedIds && (
              <details>
                <summary>
                  {c.submitted} ({number(entry.submittedIds.length)})
                </summary>
                {inspectButtons(entry.submittedIds)}
              </details>
            )}
            {fresh &&
              entry.mode === 'full' &&
              run.status === 'verified' &&
              run.mode === 'deterministic' &&
              (project.approval?.runId === run.id ? (
                <p>{c.approvedDesign}</p>
              ) : (
                <div className="actions">
                  <label>
                    <input
                      type="checkbox"
                      checked={ownerReview === run.id}
                      onChange={(e) => setOwnerReview(e.target.checked ? run.id : '')}
                    />
                    {c.finalReview}
                  </label>
                  <button
                    disabled={ownerReview !== run.id || busy || disabled}
                    onClick={() => void approve()}
                  >
                    {c.finalApprove}
                  </button>
                </div>
              ))}
            {entry.paths.length > 0 && (
              <details>
                <summary>
                  {c.paths} ({number(entry.statesExplored)} {c.states})
                </summary>
                {entry.paths.map((p) => (
                  <p key={p.endingId}>{p.nodeIds.map(label).join(' → ')}</p>
                ))}
              </details>
            )}
            <h2>{c.findings}</h2>
            {entry.findings.length > 0 && <label>{c.filterFindings}
              <select value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="all">{c.allFindings}</option>
                {Object.entries(c.severity).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>}
            {!available && <p>{entry.revalidation ? c.reviewAgain : c.gate}</p>}
            {entry.omittedFindings && (
              <p>
                {c.limit} ({number(entry.omittedFindings)})
              </p>
            )}
            {entry.findings.length ? findingsList(entry) : <p>{c.noFindings}</p>}
            {!!entry.decisions.length && (
              <section>
                <h3>{c.actions}</h3>
                {entry.decisions.map((d) => (
                  <p key={d.proposalId}>
                    {status(d.decision)} · {label(d.recordId)} · {d.field} · {d.before} → {d.after}
                  </p>
                ))}
              </section>
            )}
          </>
        ) : (
          <p>{c.empty}</p>
        )}
      </section>
      {mode !== 'quick' && scopeMatches && fresh && run?.mode === 'deterministic' && (
        <SemanticReview
          project={project}
          scope={{ mode, targetId: mode === 'targeted' ? target : undefined }}
          configuration={configuration}
          disabled={busy || disabled}
          onResult={semanticResult}
          onBusy={setSemanticBusy}
        />
      )}
      {mode !== 'quick' && !scopeMatches && <p>{c.missingReview}</p>}
    </>
  );
}
