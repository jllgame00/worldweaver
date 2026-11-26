import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './project.generated';
import ScenarioEditor from './ScenarioEditor';
import ScenarioFindings, { type ScenarioFinding } from './ScenarioFindings';
import ScenarioRelink from './ScenarioRelink';
import { recoveryProject, RelinkRejected, relinkCopy, validateRecoveredDraft } from './referenceRepair';
import { isProject } from './validation';

export default function RejectedScenarioEditor({ project, recovery, findings, disabled, onProposal }: {
  project: Project;
  recovery: unknown;
  findings: ScenarioFinding[];
  disabled: boolean;
  onProposal: (response: unknown, next: Project, original: Project) => void;
}) {
  const original = useMemo(() => {
    try { return recoveryProject(project, recovery); }
    catch { return undefined; }
  }, [project, recovery]);
  const [working, setWorking] = useState<Project>();
  const [issues, setIssues] = useState(findings);
  const [message, setMessage] = useState('');
  const [epoch, setEpoch] = useState(0);
  const [checking, setChecking] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), [project.id, project.revision, recovery]);
  const draft = working ?? original;
  const needsRelink = !working && findings.some(f => f.rule === 'reference');

  async function recheck() {
    if (!draft || !original || request.current || disabled) return;
    const ctl = new AbortController();
    request.current = ctl;
    setChecking(true);
    setMessage('');
    try {
      const checked = await validateRecoveredDraft(project, draft, ctl.signal);
      if (!ctl.signal.aborted) onProposal(checked.response, checked.next, original);
    } catch (error) {
      if (!ctl.signal.aborted) {
        if (error instanceof RelinkRejected) setIssues(error.findings);
        setMessage(error instanceof Error ? error.message : relinkCopy.request);
      }
    } finally {
      request.current = null;
      setChecking(false);
    }
  }

  return <>
    <details open={!original || needsRelink || undefined}>
      <summary>Original rejection findings</summary>
      <ScenarioFindings title="Proposal findings" project={original} findings={findings} />
    </details>
    {!original || !draft ? <p role="status">{relinkCopy.stale}</p> :
      <fieldset disabled={disabled || checking} className="scenario-controls">
        {needsRelink
          ? <ScenarioRelink key={epoch} project={project} recovery={recovery} findings={findings}
              onProposal={(response, next) => onProposal(response, next, original)} onBlocked={(corrected, updated) => {
                setWorking(corrected);
                setIssues(updated);
                setMessage(relinkCopy.failed);
              }} />
          : <section aria-label="Rejected proposal editor">
              <h2>Rejected proposal editor</h2>
              <p>Save changes in this working copy, then revalidate to review them for acceptance.</p>
              <ScenarioEditor key={epoch} project={draft} findings={issues} edit={async mutate => {
                if (disabled || request.current) return false;
                const next = structuredClone(draft);
                mutate(next);
                if (!isProject(next)) {
                  setMessage('This edit contains an invalid field or reference.');
                  return false;
                }
                setWorking(next);
                setMessage('Working copy edited. Revalidate to update its findings.');
                return true;
              }} />
              {message && <p role="status">{message}</p>}
              <button onClick={() => void recheck()}>Revalidate edited proposal</button>
            </section>}
        <button onClick={() => {
          setWorking(undefined);
          setIssues(findings);
          setMessage('');
          setEpoch(epoch + 1);
        }}>Restore original rejected proposal</button>
      </fieldset>}
  </>;
}
