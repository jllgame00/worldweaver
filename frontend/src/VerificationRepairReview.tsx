import { useMemo, useState } from 'react';
import type { Project, SavedRepair, ValidationFinding, VerificationEntry } from './project.generated';
import { newId } from './project';
import { repairDraft, repairFields, routeCorrection, type RepairEdit } from './verificationRepair';
import { buildWorldBible, dependencyImpact } from './worldBibleIndex';
import { verificationCopy as c } from './verificationCopy';

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
            k +
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
              <p key={e.proposalId}>
                {label(e.recordId)} · {e.field} · {e.before} → {e.after}
              </p>
            ))}
            <p>
              {c.dependency} · {impacted(s.edits.map((e) => e.recordId))}
            </p>
            <p>
              {c.approvals} · {approvals(s.edits)}
            </p>
            <h4>{c.result}</h4>
            {!!s.afterTools.length && (
              <table>
                <thead>
                  <tr>
                    <th>{c.tool}</th>
                    <th>{c.before}</th>
                    <th>{c.after}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.afterTools.map((t) => (
                    <tr key={t.tool}>
                      <td>{t.tool}</td>
                      <td>
                        {s.beforeTools.find((b) => b.tool === t.tool)?.status} ·{' '}
                        {s.beforeTools.find((b) => b.tool === t.tool)?.findings}
                      </td>
                      <td>
                        {t.status} · {t.findings} · {t.detail}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p role="status">{s.detail ?? (ready ? c.available : c.waitingForSimulation)}</p>
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
                      {label(o.recordId)} · {o.field}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                {c.before} · <code>{option.before}</code>
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
                {label(e.recordId)} · {e.field} · {e.before} → {e.after}
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
