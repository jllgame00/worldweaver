import { useEffect, useRef, useState } from 'react';
import type { Project } from './project.generated';
import {
  additionsFromDraft,
  recoveryProject,
  relinkCopy,
  repairReferenceProposal,
  replacementOptions,
  type ReferenceFinding,
} from './referenceRepair';
import NarrativeRegistry from './NarrativeRegistry';
import { designOf } from './scenarioWorkflow';
import ScenarioFindings, { type ScenarioFinding } from './ScenarioFindings';
import { RelinkRejected } from './referenceRepair';
import { DiagnosticDetails } from './locale';
import { useRecoveryDiagnostic, useScenarioRecoveryCopy } from './scenarioRecoveryCopy';
import { useScenarioKind } from './scenarioCopy';

export default function ScenarioRelink({
  project,
  recovery,
  findings,
  onProposal,
  onBlocked,
}: {
  project: Project;
  recovery: unknown;
  findings: ReferenceFinding[];
  onProposal: (response: unknown, next: Project) => void;
  onBlocked?: (draft: Project, findings: ScenarioFinding[]) => void;
}) {
  const { relink: c } = useScenarioRecoveryCopy();
  const translate = useRecoveryDiagnostic();
  const kindLabel = useScenarioKind();
  const [replacements, setReplacements] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<ScenarioFinding[]>([]);
  const [local, setLocal] = useState<{ source: unknown; draft: Project }>();
  const candidate = local?.source === recovery && local ? local.draft : undefined;
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [project.id, project.revision, recovery]);
  let draft: Project;
  try {
    draft = candidate ?? recoveryProject(project, recovery);
  } catch {
    return null;
  }
  async function check() {
    if (request.current) return;
    const ctl = new AbortController();
    request.current = ctl;
    setBusy(true);
    setMessage('');
    setIssues([]);
    try {
      const input = candidate
        ? {
            baseRevision: project.revision,
            design: designOf(candidate),
            additions: additionsFromDraft(project, candidate),
          }
        : recovery;
      const proposal = await repairReferenceProposal(project, input, findings, replacements, ctl.signal);
      if (!ctl.signal.aborted) onProposal(proposal.response, proposal.next);
    } catch (e) {
      if (!ctl.signal.aborted) {
        setMessage(e instanceof Error ? e.message : relinkCopy.request);
        if (e instanceof RelinkRejected) {
          setIssues(e.findings);
          onBlocked?.(e.draft, e.findings);
        }
      }
    } finally {
      request.current = null;
      setBusy(false);
    }
  }
  const feedback = message && translate(message);
  return (
    <details className="panel">
      <summary>{c.title}</summary>
      {findings.some((f) =>
        ['character', 'faction', 'flag', 'item', 'decision'].includes(f.expectedType ?? ''),
      ) && (
        <NarrativeRegistry
          project={draft}
          disabled={busy}
          proposal
          commit={async (updated) => {
            setLocal({ source: recovery, draft: updated });
            return true;
          }}
        />
      )}
      <fieldset disabled={busy}>
        {findings.map((f) => {
          const path = f.fieldPath;
          if (!path) return null;
          return (
            <label key={path}>
              {path} · {f.referenceId} → {f.expectedType && kindLabel(f.expectedType)}
              <select
                value={replacements[path] ?? ''}
                onChange={(e) => setReplacements({ ...replacements, [path]: e.target.value })}
              >
                <option value="">{c.choose}</option>
                {replacementOptions(draft, f.expectedType).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.id}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
        <button
          type="button"
          disabled={!findings.length || findings.some((f) => !f.fieldPath || !replacements[f.fieldPath])}
          onClick={() => void check()}
        >
          {c.validate}
        </button>
      </fieldset>
      {feedback && <><p role="alert">{feedback.message}</p>{feedback.raw && <DiagnosticDetails detail={feedback.raw} />}</>}
      <ScenarioFindings title={c.failed} findings={issues} />
    </details>
  );
}
