import { useState } from 'react';
import type { Project } from './project.generated';
import type { ScenarioFinding } from './ScenarioFindings';
import { downloadFile } from './scenarioWorkflow';
import { diagnosticMaxBytes, readRecoveryFile, writeRecoveryFile, type RejectedDraft } from './rejectedStorage';

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
  const [error, setError] = useState('');
  const original = rejected?.recovery;
  return (
    <details className="panel">
      <summary>Rejected scenario file</summary>
      <p>
        Save a local copy of the original rejected graph and its findings. The file includes creative content.
        Reopen it with the same project revision to continue reviewing it.
      </p>
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
              setError(e instanceof Error ? e.message : 'Could not export the rejected proposal.');
            }
          }}
        >
          Export original rejected graph
        </button>
      )}
      {!original && (
        <label>
          Open rejected scenario file
          <input
            type="file"
            accept=".json,application/json"
            disabled={disabled}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              try {
                if (file.size > diagnosticMaxBytes) throw Error('Diagnostic file is too large.');
                onRestore(readRecoveryFile(project, await file.text()));
                setError('');
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not open the rejected proposal.');
              }
            }}
          />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
