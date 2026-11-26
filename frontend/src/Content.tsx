import { useState } from 'react';
import type { FormEvent } from 'react';
import { categories, copy, treatments } from './copy';
import { editContent, fragmentInUse, newId } from './project';
import type { CanonicalFact, Project, UserContent } from './project.generated';

interface ContentProps {
  project: Project;
  disabled: boolean;
  commit: (project: Project) => Promise<boolean>;
}

const blankFragment: Pick<UserContent, 'category' | 'treatment' | 'text'> = { category: 'idea', treatment: 'optional', text: '' };

export default function Content(props: ContentProps) {
  return (
    <>
      <div className="page-heading"><h1>{copy.contentTitle}</h1><p>{copy.contentIntro}</p></div>
      <div className="content-grid">
        <Fragments {...props} />
        <Facts {...props} />
      </div>
    </>
  );
}

function Fragments({ project, disabled, commit }: ContentProps) {
  const [draft, setDraft] = useState(blankFragment);
  const [editing, setEditing] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const [invalid, setInvalid] = useState(false);

  function reset() {
    setDraft(blankFragment);
    setEditing(undefined);
    setInvalid(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.text.trim()) {
      setInvalid(true);
      event.currentTarget.querySelector('textarea')?.focus();
      return;
    }
    const fragment = { ...draft, id: editing ?? newId('fragment'), text: draft.text.trim() };
    const userContent = editing ? project.userContent.map((item) => item.id === editing ? fragment : item) : [...project.userContent, fragment];
    if (await commit(editContent(project, { userContent }))) reset();
  }

  async function remove(id: string) {
    if (fragmentInUse(project, id)) return;
    if (await commit(editContent(project, { userContent: project.userContent.filter((item) => item.id !== id) }))) {
      setRemoving(undefined);
      if (editing === id) reset();
    }
  }

  return (
    <section className="panel" aria-labelledby="fragments-heading">
      <div className="section-heading"><h2 id="fragments-heading">{copy.fragments}</h2><span className="count">{project.userContent.length}</span></div>
      <form onSubmit={submit} aria-label={editing ? copy.editFragment : copy.addFragment}>
        <fieldset disabled={disabled}>
          <div className="paired-fields">
            <label>{copy.category}
              <select value={draft.category} onChange={({ target }) => setDraft({ ...draft, category: target.value as UserContent['category'] })}>
                {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>{copy.treatment}
              <select value={draft.treatment} onChange={({ target }) => setDraft({ ...draft, treatment: target.value as UserContent['treatment'] })}>
                {Object.entries(treatments).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          </div>
          <label>{copy.fragment}
            <textarea value={draft.text} required placeholder={copy.fragmentPlaceholder} rows={4}
              aria-invalid={invalid} aria-describedby={invalid ? 'fragment-error' : undefined}
              onChange={({ target }) => { setDraft({ ...draft, text: target.value }); setInvalid(false); }} />
          </label>
          {invalid && <p id="fragment-error" className="error">{copy.blank}</p>}
          <div className="actions">
            <button type="submit">{editing ? copy.save : copy.addFragment}</button>
            {editing && <button type="button" className="quiet" onClick={reset}>{copy.cancel}</button>}
          </div>
        </fieldset>
      </form>
      {project.userContent.length === 0 ? <p className="empty">{copy.emptyFragments}</p> : (
        <ul className="record-list">
          {project.userContent.map((item) => (
            <li key={item.id}>
              <div className="record-header"><span className="pill">{categories[item.category]}</span><span className={`tag ${item.treatment}`}>{treatments[item.treatment]}</span></div>
              <p className="creative">{item.text}</p>
              <div className="actions row-actions">
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.editFragment}
                  onClick={() => { setEditing(item.id); setDraft(item); setInvalid(false); }}>{copy.edit}</button>
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.removeFragment}
                  onClick={() => setRemoving(item.id)}>{copy.remove}</button>
              </div>
              {removing === item.id && (fragmentInUse(project, item.id) ? (
                <div className="notice"><p role="alert">{copy.fragmentInUse}</p><button type="button" className="quiet" onClick={() => setRemoving(undefined)}>{copy.cancel}</button></div>
              ) : (
                <div className="notice"><p>{copy.removeFragmentConfirm}</p><div className="actions">
                  <button type="button" disabled={disabled} onClick={() => void remove(item.id)}>{copy.removeFragment}</button>
                  <button type="button" className="quiet" onClick={() => setRemoving(undefined)}>{copy.cancel}</button>
                </div></div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Facts({ project, disabled, commit }: ContentProps) {
  const [statement, setStatement] = useState('');
  const [source, setSource] = useState('');
  const [editing, setEditing] = useState<string>();
  const [removing, setRemoving] = useState<string>();
  const [invalid, setInvalid] = useState(false);

  function reset() {
    setStatement('');
    setSource('');
    setEditing(undefined);
    setInvalid(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statement.trim()) {
      setInvalid(true);
      event.currentTarget.querySelector('textarea')?.focus();
      return;
    }
    const fact: CanonicalFact = { id: editing ?? newId('fact'), statement: statement.trim() };
    if (project.userContent.some(({ id }) => id === source)) fact.sourceContentId = source;
    const canonicalFacts = editing ? project.canonicalFacts.map((item) => item.id === editing ? fact : item) : [...project.canonicalFacts, fact];
    if (await commit(editContent(project, { canonicalFacts }))) reset();
  }

  async function remove(id: string) {
    if (await commit(editContent(project, { canonicalFacts: project.canonicalFacts.filter((item) => item.id !== id) }))) {
      setRemoving(undefined);
      if (editing === id) reset();
    }
  }

  return (
    <section className="panel facts-panel" aria-labelledby="facts-heading">
      <div className="section-heading"><h2 id="facts-heading">{copy.pinnedFacts}</h2><span className="count">{project.canonicalFacts.length}</span></div>
      <p className="muted">{copy.factIntro}</p>
      <form onSubmit={submit} aria-label={editing ? copy.editFact : copy.pinFact}>
        <fieldset disabled={disabled}>
          <label>{copy.factStatement}
            <textarea value={statement} required rows={3} aria-invalid={invalid} aria-describedby={invalid ? 'fact-error' : undefined}
              onChange={({ target }) => { setStatement(target.value); setInvalid(false); }} />
          </label>
          {invalid && <p id="fact-error" className="error">{copy.blank}</p>}
          <label>{copy.sourceFragment}
            <select value={project.userContent.some(({ id }) => id === source) ? source : ''} onChange={({ target }) => setSource(target.value)}>
              <option value="">{copy.standalone}</option>
              {project.userContent.map(({ id, text }) => <option key={id} value={id}>{text}</option>)}
            </select>
          </label>
          <div className="actions">
            <button type="submit">{editing ? copy.save : copy.pinFact}</button>
            {editing && <button type="button" className="quiet" onClick={reset}>{copy.cancel}</button>}
          </div>
        </fieldset>
      </form>
      {project.canonicalFacts.length === 0 ? <p className="empty">{copy.emptyFacts}</p> : (
        <ul className="record-list">
          {project.canonicalFacts.map((fact) => (
            <li key={fact.id}>
              <p className="creative">{fact.statement}</p>
              {fact.sourceContentId && <p className="muted creative">{project.userContent.find(({ id }) => id === fact.sourceContentId)?.text}</p>}
              <div className="actions row-actions">
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.editFact} onClick={() => {
                  setEditing(fact.id); setStatement(fact.statement); setSource(fact.sourceContentId ?? ''); setInvalid(false);
                }}>{copy.edit}</button>
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.removeFact}
                  onClick={() => setRemoving(fact.id)}>{copy.remove}</button>
              </div>
              {removing === fact.id && <div className="notice"><p>{copy.removeFactConfirm}</p><div className="actions">
                <button type="button" disabled={disabled} onClick={() => void remove(fact.id)}>{copy.removeFact}</button>
                <button type="button" className="quiet" onClick={() => setRemoving(undefined)}>{copy.cancel}</button>
              </div></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
