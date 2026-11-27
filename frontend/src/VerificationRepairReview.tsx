import { useMemo, useState } from 'react';
import type { Project, SavedRepair, ValidationFinding, VerificationEntry } from './project.generated';
import { newId } from './project';
import { repairDraft, repairFields, routeCorrection, type RepairEdit } from './verificationRepair';
import { buildWorldBible, dependencyImpact } from './worldBibleIndex';
import { useVerificationCopy, useVerificationDetail, useVerificationStatus, useVerificationTool } from './verificationCopy';
import { DiagnosticDetails, useFormatter, useLocale } from './locale';
import { useBibleKinds } from './worldBibleCopy';
import { useScenarioFieldLabel } from './scenarioCopy';

type Action = 'simulate' | 'accept' | 'reject';
export type RepairAction = (action: Action, edits: RepairEdit[], saved?: SavedRepair) => Promise<void>;
export function VerificationRepairReview({
  project,
  entry,
  finding,
  act,
  disabled,
}: {
  project: Project;
  entry: VerificationEntry;
  finding: ValidationFinding;
  disabled: boolean;
  act: RepairAction;
}) {
  const c = useVerificationCopy();
  const kinds = useBibleKinds();
  const locale = useLocale();
  const { number } = useFormatter();
  const detail = useVerificationDetail();
  const status = useVerificationStatus();
  const tool = useVerificationTool();
  const scenarioField = useScenarioFieldLabel();
  const fieldLabel = (path: string) => path.split('.').map(part => {
    if (/^\d+$/.test(part)) return '#' + number(Number(part) + 1);
    const extra: Record<string, string> = { distanceKm: '거리 (km)', corridor: '경로 좌표', premise: '전제', motivation: '동기',
      opposition: '대립 세력', background: '배경', conflict: '갈등', constraints: '지리 조건', via: '경유지', key: '대상', value: '값' };
    const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
    return scenarioField(part, locale === 'ko' && extra[part] ? extra[part] : words);
  }).join(' · ');
  const automatic = useMemo(() => routeCorrection(project, finding), [project, finding]);
  const options = useMemo(() => repairFields(project, finding), [project, finding]);
  const [selected, setSelected] = useState(
    Math.max(
      0,
      options.findIndex((o) => o.recordId === automatic?.recordId && o.field === automatic.field),
    ),
  );
  const [value, setValue] = useState(automatic?.after ?? '');
  const [batch, setBatch] = useState<RepairEdit[]>([]);
  const [confirmed, setConfirmed] = useState('');
  const index = useMemo(() => buildWorldBible(project), [project]);
  const option = options[selected];
  const label = (id: string) => index.entities.get(id)?.label ?? id;
  function displayValue(field: string, value: string) {
    const record = index.entities.get(value);
    const reference = /(?:Id$|Ids\.\d+$|^requiresVisited\.\d+$|(?:^|\.)(from|to|via|key)$)/.test(field);
    return reference && record ? record.label + ' (' + value + ')' : value;
  }
  const saved =
    entry.proposals?.filter(
      (p) => p.edits[0].findingId === finding.id && ['ready', 'pending', 'blocked'].includes(p.status),
    ) ?? [];
  const remaining = 2 - (project.runs.find((r) => r.id === entry.runId)?.repairAttempts ?? 0);
  const makeEdit = (): RepairEdit | undefined =>
    option && value.trim() && value !== option.before
      ? { ...option, proposalId: newId('repair'), findingId: finding.id, after: value, requires: [] }
      : undefined;
  function selection() {
    const extra = makeEdit();
    const selected = extra ? [...batch, extra] : batch;
    return selected.map((edit) => ({
      ...edit,
      requires: selected.filter((peer) => peer !== edit).map((peer) => peer.proposalId),
    }));
  }
  const canRequest =
    remaining > 0 &&
    !disabled &&
    (batch.length > 0 || (!!option && value.trim() !== '' && value !== option.before));
  const impacted = (ids: string[]) =>
    [
      ...new Set(
        ids.flatMap((id) => {
          const effect = dependencyImpact(index, id);
          return [...effect.direct, ...effect.transitive];
        }),
      ),
    ]
      .map(label)
      .join(', ') || '—';
  function approvals(edits: RepairEdit[]) {
    try {
      const next = repairDraft(project, edits, project.revision);
      return (['narrative', 'scenario', 'world'] as const)
        .filter(
          (k) =>
            next.versions[k] !== project.versions[k] ||
            (k === 'world' && next.versions.scenario !== project.versions.scenario) ||
            (k !== 'narrative' && next.versions.narrative !== project.versions.narrative),
        )
        .map(
          (k) =>
            (locale === 'ko' ? kinds[k] : k) +
            ' · ' +
            (project[k]?.approved ? c.approved : c.noApproval) +
            ' → ' +
            (next[k]?.approved ? c.openApprovals : c.noApproval),
        )
        .join(' · ');
    } catch {
      return c.blocked;
    }
  }
  return (
    <section className="panel" aria-label={c.compare}>
      <h3>{c.compare}</h3>
      {saved.map((s) => {
        const id = s.edits[0].proposalId;
        const ready = s.status === 'ready' && s.sourceRevision === project.revision;
        return (
          <section key={id} className="notice">
            <h4>
              {c.savedProposal} · {s.classification === 'technical' ? c.technical : c.creative}
            </h4>
            {s.edits.map((e) => (
              <section key={e.proposalId}>
                <h5>{label(e.recordId)} · {fieldLabel(e.field)}</h5>
                <dl className="evidence-comparison">
                  <div><dt>{c.before}</dt><dd>{displayValue(e.field, e.before)}</dd></div>
                  <div><dt>{c.after}</dt><dd>{displayValue(e.field, e.after)}</dd></div>
                </dl>
              </section>
            ))}
            <p>
              {c.dependency} · {impacted(s.edits.map((e) => e.recordId))}
            </p>
            <p>
              {c.approvals} · {approvals(s.edits)}
            </p>
            <h4>{c.result}</h4>
            {!!s.afterTools.length && (
              <table className="verification-tool-table">
                <thead>
                  <tr>
                    <th>{c.tool}</th>
                    <th>{c.before}</th>
                    <th>{c.after}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.afterTools.map((t) => {
                    const before = s.beforeTools.find((b) => b.tool === t.tool);
                    return (
                      <tr key={t.tool}>
                        <td title={t.tool}>{tool(t.tool)}</td>
                        <td>{before ? `${status(before.status)} · ${number(before.findings)}` : c.notChecked}</td>
                        <td>
                          {status(t.status)} · {number(t.findings)} · {detail(t.detail)}
                          <DiagnosticDetails detail={t.detail} code={t.tool} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            <p role="status">{s.detail ? detail(s.detail) : ready ? c.available : c.waitingForSimulation}</p>
            {s.detail && <DiagnosticDetails detail={s.detail} />}
            {s.sourceRevision !== project.revision && <p>{c.expired}</p>}
            {ready && (
              <>
                <p>{c.recover}</p>
                <label>
                  <input
                    type="checkbox"
                    checked={confirmed === id}
                    onChange={(e) => setConfirmed(e.target.checked ? id : '')}
                  />
                  {c.ownerConfirm}
                </label>
                <button
                  disabled={disabled || confirmed !== id}
                  onClick={() => void act('accept', s.edits, s)}
                >
                  {c.accept}
                </button>
              </>
            )}
            <button disabled={disabled} onClick={() => void act('reject', s.edits, s)}>
              {c.reject}
            </button>
          </section>
        );
      })}
      {!saved.length && (
        <>
          <p>
            {automatic ? c.technical : c.creative} · {finding.rule}
          </p>
          {option ? (
            <>
              <label>
                {c.field}
                <select
                  value={selected}
                  disabled={disabled}
                  onChange={(e) => {
                    setSelected(Number(e.target.value));
                    setValue('');
                  }}
                >
                  {options.map((o, i) => (
                    <option key={o.recordId + o.field} value={i}>
                      {label(o.recordId)} · {fieldLabel(o.field)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {c.before} · {displayValue(option.field, option.before)}
              </p>
              <label>
                {c.replace}
                <input value={value} disabled={disabled} onChange={(e) => setValue(e.target.value)} />
              </label>
              <button
                disabled={disabled || !value.trim() || value === option.before || batch.length >= 11}
                onClick={() => {
                  const edit = makeEdit();
                  if (edit) {
                    setBatch([...batch, edit]);
                    setValue('');
                  }
                }}
              >
                {c.queue}
              </button>
            </>
          ) : (
            <p>{c.openEditor}</p>
          )}
          <ul>
            {batch.map((e) => (
              <li key={e.proposalId}>
                {label(e.recordId)} · {fieldLabel(e.field)} · {displayValue(e.field, e.before)} → {displayValue(e.field, e.after)}
                <button
                  className="quiet"
                  disabled={disabled}
                  onClick={() => setBatch(batch.filter((x) => x !== e))}
                >
                  {c.remove}
                </button>
              </li>
            ))}
          </ul>
          <p>
            {c.dependency} ·{' '}
            {impacted([...batch.map((e) => e.recordId), ...(option ? [option.recordId] : [])])}
          </p>
          <p>{batch.length ? c.grouped : c.previewOnly}</p>
          <button disabled={!canRequest} onClick={() => void act('simulate', selection())}>
            {c.simulate}
          </button>
          <button disabled={!canRequest} onClick={() => void act('reject', selection())}>
            {c.reject}
          </button>
          {!remaining ? <p>{c.budget}</p> : !canRequest && <p>{c.addValue}</p>}
        </>
      )}
    </section>
  );
}
