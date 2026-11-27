import { useId, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useCategories, useTreatments, useWorkspaceCopy } from './workspaceLocale';
import { useIntakeCopy } from './intakeLocale';
import { useFormatter, useLocalized } from './locale';
import { editContent, fragmentInUse, newId } from './project';
import type { CanonicalFact, Project, UserContent } from './project.generated';
import { buildWorldBible } from './worldBibleIndex';
import { WorldBibleImpact } from './WorldBibleImpact';
import { bibleCopy } from './worldBibleCopy';
import ContentIntake from './ContentIntake';
import type { GenerationStatus } from './validation';

interface ContentProps {
  project: Project;
  disabled: boolean;
  commit: (project: Project) => Promise<boolean>;
  commitIntake?: (project: Project, afterSave: () => void) => Promise<boolean>;
  databaseName?: string;
  configuration?: GenerationStatus | null;
  refreshConfiguration?: () => void;
}

const blankFragment: Pick<UserContent, 'category' | 'treatment' | 'text'> = { category: 'idea', treatment: 'optional', text: '' };
type Patch = Parameters<typeof editContent>[1];
type SaveContent = (id:string,patch:Patch,onSaved:()=>void)=>void;
type EditorProps = Omit<ContentProps,'commit'> & {save:SaveContent};
const impactFields = ['factStatement', 'sourceFragment', 'fragment', 'category', 'treatment'] as const;

const impactEn = { stale: bibleCopy.stale, applyFact: bibleCopy.applyFact, apply: bibleCopy.apply };
const impactKo = { stale: '프로젝트가 바뀌었습니다. 현재 기록을 다시 검토하세요.', applyFact: '고정 설정 변경 반영', apply: '변경 반영' };

export default function Content(props: ContentProps) {
  const copy = useWorkspaceCopy();
  const categories = useCategories();
  const treatments = useTreatments();
  const intakeCopy = useIntakeCopy();
  const impact = useLocalized(impactEn, impactKo);
  function contentFields(row?: UserContent | CanonicalFact): Partial<Record<typeof impactFields[number], string>> {
    if (!row) return {};
    return 'statement' in row ? { factStatement: row.statement, sourceFragment: row.sourceContentId ?? '' }
      : { fragment: row.text, category: categories[row.category], treatment: treatments[row.treatment] };
  }
  const {project,disabled,commit}=props;
  const [intake, setIntake] = useState(false);
  const id = useId();
  const [pending,setPending]=useState<{id:string;base:Project;patch:Patch;onSaved:()=>void}>();
  const index=useMemo(()=>pending && buildWorldBible(pending.base),[pending]);
  const save:SaveContent=(id,patch,onSaved)=>{
    if(disabled || pending) return;
    if (project.storyCandidates.length || project.scenario || project.world || project.runs.length ||
      fragmentInUse(project,id) || project.canonicalFacts.some(f=>f.id===id)) {
      setPending({id,base:project,patch,onSaved});return;
    }
    void commit(editContent(project,patch)).then(saved=>{if(saved) onSaved();});
  };
  const fact=pending && 'canonicalFacts' in pending.patch;
  const before=pending && (fact?pending.base.canonicalFacts:pending.base.userContent).find(row=>row.id===pending.id);
  const after=pending && ('canonicalFacts' in pending.patch?pending.patch.canonicalFacts:pending.patch.userContent).find(row=>row.id===pending.id);
  const previous=contentFields(before), proposed=contentFields(after);
  const entity=(pending && index?.entities.get(pending.id)) ?? (after && {
    id:after.id,kind:'statement' in after?'fact' as const:after.category,
    label:'statement' in after?after.statement:after.text,source:'content' as const,description:'',
  });
  async function accept() {
    if (!pending || disabled || pending.base.revision!==project.revision || pending.base.id!==project.id) return;
    if (await commit(editContent(project,pending.patch))) {pending.onSaved();setPending(undefined);}
  }
  return (
    <>
      <div className="page-heading"><h1>{copy.contentTitle}</h1><p>{copy.contentIntro}</p></div>
      <div className="actions intake-tabs" role="tablist" aria-label={intakeCopy.inputMode}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === 'Home' ? false : event.key === 'End' ? true : !intake;
          setIntake(next);
          const tabs = event.currentTarget.querySelectorAll('button');
          tabs[Number(next)]?.focus();
        }}>
        <button type="button" role="tab" id={id + '-edit'} aria-controls={id + '-edit-panel'}
          aria-selected={!intake} tabIndex={intake ? -1 : 0} onClick={() => setIntake(false)}>{intakeCopy.edit}</button>
        <button type="button" role="tab" id={id + '-paste'} aria-controls={id + '-paste-panel'}
          aria-selected={intake} tabIndex={intake ? 0 : -1} onClick={() => setIntake(true)}>{intakeCopy.paste}</button>
      </div>
      <div role="tabpanel" id={id + '-edit-panel'} aria-labelledby={id + '-edit'} hidden={intake}>
        <div className="content-grid">
          <Fragments project={project} save={save} disabled={disabled || !!pending}/>
          <Facts project={project} save={save} disabled={disabled || !!pending}/>
        </div>
      </div>
      <div role="tabpanel" id={id + '-paste-panel'} aria-labelledby={id + '-paste'} hidden={!intake}>
        <ContentIntake project={project} disabled={disabled || !!pending} commit={props.commitIntake ?? (async (next, afterSave) => {
          const saved = await commit(next);
          if (saved) afterSave();
          return saved;
        })}
          configuration={props.configuration} refreshConfiguration={props.refreshConfiguration}
          storageKey={JSON.stringify(['worldweaver-content-intake-v1', props.databaseName ?? 'worldweaver-v1', project.id])} />
      </div>
      {!intake && pending && index && entity && <WorldBibleImpact project={pending.base} entity={entity} index={index} changes={
        impactFields.filter(key => previous[key] !== proposed[key])
          .map(key => ({ key, label: copy[key], before: previous[key] ?? '', after: proposed[key] ?? '' }))}>
        {pending.base.revision!==project.revision && <p role="alert">{impact.stale}</p>}
        <div className="actions"><button disabled={disabled || pending.base.revision!==project.revision} onClick={()=>void accept()}>
          {fact?impact.applyFact:impact.apply}</button><button onClick={()=>setPending(undefined)}>{copy.cancel}</button></div>
      </WorldBibleImpact>}
    </>
  );
}

function Fragments({ project, disabled, save }: EditorProps) {
  const copy = useWorkspaceCopy();
  const categories = useCategories();
  const treatments = useTreatments();
  const format = useFormatter();
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
    save(fragment.id,{userContent},reset);
  }

  async function remove(id: string) {
    if (fragmentInUse(project, id) || project.scenario?.contentIds.includes(id)) return;
    save(id,{userContent:project.userContent.filter(item=>item.id!==id)},()=>{
      setRemoving(undefined);
      if (editing === id) reset();
    });
  }

  return (
    <section className="panel" aria-labelledby="fragments-heading">
      <div className="section-heading"><h2 id="fragments-heading">{copy.fragments}</h2><span className="count">{format.number(project.userContent.length)}</span></div>
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
            <li key={item.id} id={'canonical-'+item.id} tabIndex={-1}>
              <div className="record-header"><span className="pill">{categories[item.category]}</span><span className={`tag ${item.treatment}`}>{treatments[item.treatment]}</span></div>
              <p className="creative">{item.text}</p>
              <div className="actions row-actions">
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.editFragment}
                  onClick={() => { setEditing(item.id); setDraft(item); setInvalid(false); }}>{copy.edit}</button>
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.removeFragment}
                  onClick={() => setRemoving(item.id)}>{copy.remove}</button>
              </div>
              {removing === item.id && (fragmentInUse(project, item.id) || project.scenario?.contentIds.includes(item.id) ? (
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

function Facts({ project, disabled, save }: EditorProps) {
  const copy = useWorkspaceCopy();
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
    save(fact.id,{canonicalFacts},reset);
  }

  async function remove(id: string) {
    if(project.scenario?.factIds.includes(id)) return;
    save(id,{canonicalFacts:project.canonicalFacts.filter(item=>item.id!==id)},()=>{
      setRemoving(undefined);
      if (editing === id) reset();
    });
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
            <li key={fact.id} id={'canonical-'+fact.id} tabIndex={-1}>
              <p className="creative">{fact.statement}</p>
              {fact.sourceContentId && <p className="muted creative">{project.userContent.find(({ id }) => id === fact.sourceContentId)?.text}</p>}
              <div className="actions row-actions">
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.editFact} onClick={() => {
                  setEditing(fact.id); setStatement(fact.statement); setSource(fact.sourceContentId ?? ''); setInvalid(false);
                }}>{copy.edit}</button>
                <button type="button" className="quiet" disabled={disabled} aria-label={copy.removeFact}
                  onClick={() => setRemoving(fact.id)}>{copy.remove}</button>
              </div>
              {removing === fact.id && <div className="notice">{project.scenario?.factIds.includes(fact.id)?
                <p role="alert">{bibleCopy.protected}</p>:<p>{copy.removeFactConfirm}</p>}<div className="actions">
                {!project.scenario?.factIds.includes(fact.id) && <button type="button" disabled={disabled} onClick={() => void remove(fact.id)}>{copy.removeFact}</button>}
                <button type="button" className="quiet" onClick={() => setRemoving(undefined)}>{copy.cancel}</button>
              </div></div>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
