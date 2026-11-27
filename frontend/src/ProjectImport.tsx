import { useEffect, useRef, useState, type ReactNode } from 'react';
import { importedDesign, validateBackup } from './backupProject';
import { newId } from './project';
import { importProject, InvalidProjectReference, downloadFile } from './scenarioWorkflow';
import { readRecoveryProject, readSavedProject, restoreProject, SaveConflict, saveProject, type SavedProject } from './storage';
import { RestoreComparison, type RestorePreview } from './RestoreComparison';
import { useRestoreCopy } from './restoreCopy';
import { useShellCopy } from './workspaceLocale';
import { DiagnosticDetails, useDiagnostic } from './locale';
import { useWorkbenchCopy } from './workbenchCopy';
import { StudioIcon } from './StudioIcon';

export function RecoveryDownload({ databaseName, id }: { databaseName: string; id: string }) {
  const c = useRestoreCopy();
  const [failed, setFailed] = useState(false);
  async function download() {
    try {
      const previous = await readRecoveryProject(databaseName, id);
      if (!previous) throw Error();
      downloadFile(id + '-before-restore.json', JSON.stringify(previous, null, 2), 'application/json');
      setFailed(false);
    } catch { setFailed(true); }
  }
  return <div><button type="button" onClick={() => void download()}>{c.download}</button>
    {failed && <span role="alert">{c.downloadError}</span>}</div>;
}

export function ProjectImport({ databaseName, children, disabled, opened, reopen }: {
  databaseName: string; children: ReactNode; disabled: boolean;
  opened: (saved: SavedProject, restored: boolean) => void; reopen: (id: string) => Promise<void>;
}) {
  const shell = useShellCopy(), c = useRestoreCopy(), diagnostic = useDiagnostic();
  const ui = useWorkbenchCopy();
  const [preview, setPreview] = useState<RestorePreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'conflict' | 'missing' | 'collision' | 'failed' | 'readFailed' | 'large' | 'importError'>();
  const [detail, setDetail] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (preview) heading.current?.focus(); }, [preview]);
  function cancel() {
    setPreview(undefined);
    setError(undefined);
    requestAnimationFrame(() => fileInput.current?.focus());
  }
  async function prepare(file: File) {
    setError(undefined);
    setDetail('');
    if (file.size > 16 * 1024 * 1024) { setError('large'); return; }
    setBusy(true);
    try {
      let backup;
      try {
        backup = importProject(await file.text());
        await validateBackup(backup);
      } catch (e) {
        if (e instanceof InvalidProjectReference) setDetail(e.message);
        setError('importError');
        return;
      }
      let current = await readSavedProject(databaseName, backup.id);
      if (!current) {
        try { opened(await saveProject(databaseName, importedDesign(backup)), false); return; }
        catch (failure) { if (!(failure instanceof SaveConflict)) { setError('failed'); return; } }
        current = await readSavedProject(databaseName, backup.id);
      }
      if (current) setPreview({ current, backup, fileDate: file.lastModified });
      else setError('missing');
    } catch { setError('readFailed'); }
    finally { setBusy(false); }
  }
  async function confirm(duplicate: boolean) {
    if (!preview || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = duplicate
        ? await saveProject(databaseName, importedDesign(preview.backup, newId('project')))
        : await restoreProject(databaseName, preview.backup, preview.current.token);
      opened(saved, !duplicate);
    } catch (failure) {
      setError(failure instanceof SaveConflict ? duplicate ? 'collision' : 'conflict' : 'failed');
    } finally { setBusy(false); }
  }
  async function refresh() {
    if (!preview) return;
    setBusy(true);
    try {
      const current = await readSavedProject(databaseName, preview.backup.id);
      if (!current) { setError('missing'); return; }
      setPreview({ ...preview, current });
      setError(undefined);
    } catch { setError('readFailed'); }
    finally { setBusy(false); }
  }
  const message = error === 'importError' && detail ? diagnostic(detail, 'invalid_project')
    : error === 'large' || error === 'importError' ? shell[error] : error && c[error];
  const alert = message && <div role="alert" className="notice error">{message}{detail && <DiagnosticDetails detail={detail}/>}</div>;
  return <>
    <fieldset className="import-controls" disabled={disabled || busy || !!preview}>
      {children}
      <section className="backup-shelf"><StudioIcon name="import"/><div><h2>{ui.backup}</h2><p>{ui.backupHint}</p></div>
      <label className="backup-picker">{shell.import}<input ref={fileInput} type="file" accept="application/json,.json"
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void prepare(file); }}/></label></section>
    </fieldset>
    {preview ? <section role="dialog" aria-labelledby="restore-heading" className="panel restore-preview"
      onKeyDown={e => { if (e.key === 'Escape' && !busy) cancel(); }}>
      <h2 id="restore-heading" tabIndex={-1} ref={heading}>{c.title}</h2>
      <p>{c.explain}</p>
      <RestoreComparison {...preview}/>
      {alert}
      <div className="actions">
        {error === 'conflict' && <>
          <button disabled={busy} onClick={() => void refresh()}>{c.refresh}</button>
          <button disabled={busy} onClick={() => void reopen(preview.backup.id)}>{c.reopen}</button>
        </>}
        <button disabled={busy || error === 'conflict' || error === 'missing'} onClick={() => void confirm(false)}>{c.restore}</button>
        <button disabled={busy} onClick={() => void confirm(true)}>{c.duplicate}</button>
        <button disabled={busy} onClick={cancel}>{c.cancel}</button>
      </div>
    </section> : alert}
  </>;
}
