import { useRef, useState } from 'react';
import type { BibleProps } from './WorldBible';
import { WorldBibleImpact } from './WorldBibleImpact';
import { bibleCopy, useBibleCopy } from './worldBibleCopy';
import { DiagnosticDetails, useDiagnostic } from './locale';
import { changeBibleRecord, deleteProtected, editFields, type BibleValues } from './worldBibleEdits';
import type { BibleIndex, BibleEntity } from './worldBibleIndex';

type Props = Pick<BibleProps, 'project' | 'disabled' | 'current' | 'commit'> & {
  entity: BibleEntity;
  index: BibleIndex;
};

const fieldLabels = ['name', 'description', 'statement', 'text', 'objective', 'role', 'aim', 'faction', 'controller'] as const;
const errors = ['invalid', 'stale', 'protected', 'duplicate', 'directOnly', 'noChange', 'legacy'] as const;

export function WorldBibleEditor({ project, entity: e, index, disabled, current, commit }: Props) {
  const t = useBibleCopy();
  const diagnostic = useDiagnostic();
  const [mode, setMode] = useState<'idle' | 'edit' | 'preview' | 'delete'>('idle');
  const fields = editFields(project, e);
  const blank = (): BibleValues =>
    Object.assign(
      { name: '', description: '', factionId: '' },
      Object.fromEntries(fields.map((f) => [f.key, f.value])),
    );
  const [values, setValues] = useState(blank),
    [error, setError] = useState('');
  const base = useRef(project.revision);
  const writing = useRef(false);
  if (!fields.length) return null;
  const fact = e.kind === 'fact',
    protectedRecord = deleteProtected(project, index, e.id);
  const knownError = errors.find((key) => bibleCopy[key] === error);
  function fieldLabel(label: string) {
    const key = fieldLabels.find((field) => bibleCopy[field] === label);
    return key ? t[key] : label;
  }
  function begin(next: 'edit' | 'delete') {
    base.current = project.revision;
    setValues(blank());
    setError('');
    setMode(next);
  }
  function preview() {
    try {
      changeBibleRecord(project, e.id, values, fact);
      setMode('preview');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : bibleCopy.invalid);
    }
  }
  async function save() {
    const latest = current();
    if (disabled || writing.current) return;
    if (!latest || latest.id !== project.id || latest.revision !== base.current) {
      setError(bibleCopy.stale);
      return;
    }
    writing.current = true;
    try {
      const next = changeBibleRecord(latest, e.id, mode === 'delete' ? null : values, fact);
      if (await commit(next)) {
        setMode('idle');
        setError('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : bibleCopy.invalid);
    } finally {
      writing.current = false;
    }
  }
  return (
    <div className="bible-edit">
      {mode === 'idle' ? (
        <>
          <div className="actions">
            <button disabled={disabled} onClick={() => begin('edit')}>
              {fact ? t.editFact : t.edit}
            </button>
            {!fact && (
              <button
                className="quiet"
                disabled={disabled || protectedRecord}
                onClick={() => begin('delete')}
              >
                {t.delete}
              </button>
            )}
          </div>
          {!fact && protectedRecord && <p className="muted">{t.protected}</p>}
        </>
      ) : mode === 'edit' ? (
        <form
          onSubmit={(ev) => {
            ev.preventDefault();
            preview();
          }}
        >
          <fieldset disabled={disabled}>
            {fields.map((f) => (
              <label key={f.key}>
                {fieldLabel(f.label)}
                {f.key === 'factionId' ? (
                  <select
                    value={values[f.key]}
                    onChange={(ev) => setValues({ ...values, [f.key]: ev.target.value })}
                  >
                    <option value="">{t.none}</option>
                    {project.factions.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <textarea
                    rows={f.key === 'name' && !fact && e.source !== 'content' ? 1 : 3}
                    required={!f.optional}
                    value={values[f.key]}
                    onChange={(ev) => setValues({ ...values, [f.key]: ev.target.value })}
                  />
                )}
              </label>
            ))}
            <div className="actions">
              <button type="submit">{t.preview}</button>
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  setError('');
                  setMode('idle');
                }}
              >
                {t.cancel}
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <WorldBibleImpact
          project={project}
          entity={e}
          index={index}
          changes={fields
            .filter((f) => mode === 'delete' || f.value !== values[f.key].trim())
            .map((f) => ({
              key: f.key,
              label: fieldLabel(f.label),
              before: f.value,
              after: mode === 'delete' ? t.deleted : values[f.key].trim(),
            }))}
        >
          <div className="actions">
            <button disabled={disabled} onClick={() => void save()}>
              {fact ? t.applyFact : t.apply}
            </button>
            <button
              className="quiet"
              onClick={() => {
                setError('');
                setMode('idle');
              }}
            >
              {t.cancel}
            </button>
          </div>
        </WorldBibleImpact>
      )}
      {error && (
        <>
          <p role="alert" className="error">{knownError ? t[knownError] : diagnostic(error)}</p>
          {!knownError && <DiagnosticDetails detail={error} />}
        </>
      )}
    </div>
  );
}
