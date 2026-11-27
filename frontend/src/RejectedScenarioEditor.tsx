import { useEffect, useMemo, useRef, useState } from 'react';
import type { Project } from './project.generated';
import ScenarioEditor from './ScenarioEditor';
import ScenarioFindings, { type ScenarioFinding } from './ScenarioFindings';
import ScenarioRelink from './ScenarioRelink';
import { recoveryProject, RelinkRejected, relinkCopy, validateRecoveredDraft } from './referenceRepair';
import { isProject } from './validation';
import { DiagnosticDetails } from './locale';
import { scenarioRecoveryCopy, useRecoveryDiagnostic, useScenarioRecoveryCopy } from './scenarioRecoveryCopy';

export default function RejectedScenarioEditor({ project, recovery, findings, disabled, onProposal }: {
  project: Project;
  recovery: unknown;
  findings: ScenarioFinding[];
  disabled: boolean;
  onProposal: (response: unknown, next: Project, original: Project) => void;
}) {
  const { editor: c, relink } = useScenarioRecoveryCopy();
  const translate = useRecoveryDiagnostic();
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

  const feedback = message && translate(message);
  return <>
    <details open={!original || needsRelink || undefined}>
      <summary>{c.original}</summary>
      <ScenarioFindings title={c.findings} project={original} findings={findings} />
    </details>
    {!original || !draft ? <p role="status">{relink.stale}</p> :
      <fieldset disabled={disabled || checking} className="scenario-controls">
        {needsRelink
          ? <ScenarioRelink key={epoch} project={project} recovery={recovery} findings={findings}
              onProposal={(response, next) => onProposal(response, next, original)} onBlocked={(corrected, updated) => {
                setWorking(corrected);
                setIssues(updated);
                setMessage(relinkCopy.failed);
              }} />
          : <section aria-label={c.title}>
              <h2>{c.title}</h2>
              <p>{c.help}</p>
              <ScenarioEditor key={epoch} project={draft} findings={issues} edit={async mutate => {
                if (disabled || request.current) return false;
                const next = structuredClone(draft);
                mutate(next);
                if (!isProject(next)) {
                  setMessage(scenarioRecoveryCopy.editor.invalid);
                  return false;
                }
                setWorking(next);
                setMessage(scenarioRecoveryCopy.editor.edited);
                return true;
              }} />
              {feedback && <><p role="status">{feedback.message}</p>{feedback.raw && <DiagnosticDetails detail={feedback.raw} />}</>}
              <button onClick={() => void recheck()}>{c.revalidate}</button>
            </section>}
        <button onClick={() => {
          setWorking(undefined);
          setIssues(findings);
          setMessage('');
          setEpoch(epoch + 1);
        }}>{c.restore}</button>
      </fieldset>}
  </>;
}
