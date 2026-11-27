import { useState } from 'react';
import type { Project } from './project.generated';
import type { ScenarioFinding } from './ScenarioFindings';
import { downloadFile } from './scenarioWorkflow';
import { diagnosticMaxBytes, readRecoveryFile, writeRecoveryFile, type RejectedDraft } from './rejectedStorage';

import { DiagnosticDetails } from './locale';
import { scenarioRecoveryCopy, useRecoveryDiagnostic, useScenarioRecoveryCopy } from './scenarioRecoveryCopy';

export default function RecoveryFile({
  project,
  rejected,
  onRestore,
  disabled,
}: {
  project: Project;
  rejected?: { findings: ScenarioFinding[]; recovery?: unknown };
  onRestore: (value: RejectedDraft) => void;
  disabled?: boolean;
}) {
  const { file: c } = useScenarioRecoveryCopy();
  const translate = useRecoveryDiagnostic();
  const [error, setError] = useState('');
  const original = rejected?.recovery;
  const feedback = error && translate(error);
  return (
    <details className="panel">
      <summary>{c.title}</summary>
      <p>{c.help}</p>
      {original != null && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            try {
              const text = writeRecoveryFile(project.id, { findings: rejected!.findings, recovery: original });
              downloadFile(project.id + '.rejected-scenario.json', text, 'application/json');
              setError('');
            } catch (e) {
              setError(e instanceof Error ? e.message : scenarioRecoveryCopy.file.exportFailed);
            }
          }}
        >
          {c.export}
        </button>
      )}
      {!original && (
        <label>
          {c.open}
          <input
            type="file"
            accept=".json,application/json"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > diagnosticMaxBytes) throw Error(scenarioRecoveryCopy.file.large);
                onRestore(readRecoveryFile(project, await file.text()));
                setError('');
              } catch (e) {
                setError(e instanceof Error ? e.message : scenarioRecoveryCopy.file.openFailed);
              }
            }}
          />
        </label>
      )}
      {feedback && <><p role="alert">{feedback.message}</p>{feedback.raw && <DiagnosticDetails detail={feedback.raw} />}</>}
    </details>
  );
}
