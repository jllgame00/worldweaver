import { useState } from 'react';
import NarrativeRegistry from './NarrativeRegistry';
import type { FormEvent } from 'react';
import { copy, storyLabels } from './copy';
import { Coverage, FactList } from './Direction';
import { approveNarrative, candidateBatchMode, editNarrative, mandatoryConflict, narrativeFresh, sourceDirection } from './project';
import type { Narrative as NarrativeRecord, Project, Story } from './project.generated';

interface NarrativeProps {
  project: Project;
  narrative: NarrativeRecord;
  disabled: boolean;
  inspect: (id: string) => void;
  commit: (project: Project) => Promise<boolean>;
}

const textFields = ['title', 'genre', 'tone', 'premise', 'conflict', 'motivation', 'opposition', 'background'] as const;
const listFields = ['progression', 'possibleEndings'] as const;

export default function Narrative({ project, narrative, disabled, inspect, commit }: NarrativeProps) {
  const [story, setStory] = useState<Story>(narrative.story);
  const [reviewed, setReviewed] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const fresh = narrativeFresh(project);
  const conflict = mandatoryConflict(project);
  const source = sourceDirection(project);
  const dirty = JSON.stringify(story) !== JSON.stringify(narrative.story);
  const reviewDisabled = disabled || dirty || !fresh || conflict || narrative.approved;

  function update(next: Story) {
    setStory(next);
    setReviewed(false);
    setInvalid(false);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (Object.values(story).flat().some((value: string) => !value.trim())) {
      setInvalid(true);
      Array.from(event.currentTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'))
        .find((field) => !field.value.trim())?.focus();
      return;
    }
    if (await commit(editNarrative(project, story))) setReviewed(false);
  }

  async function approve() {
    if (!reviewed || reviewDisabled) return;
    const next = approveNarrative(project);
    if (next !== project && await commit(next)) setReviewed(false);
  }

  return (
    <>
      <div className="page-heading heading-actions">
        <div><h1>{copy.narrative}</h1><p>{copy.editorIntro}</p></div>
        <span className={`pill stage-state ${fresh && narrative.approved ? 'positive' : ''}`}>
          {!fresh ? copy.stale : narrative.approved ? copy.approved : copy.draft}
        </span>
      </div>
      {!fresh && <p role="status" className="notice">{copy.staleNarrative}</p>}
      <div className="content-grid">
        <form className="panel narrative-form" onSubmit={submit}>
          <fieldset disabled={disabled}>
            <div className="narrative-fields">
              {textFields.map((field) => (
                <label key={field} className={field === 'genre' || field === 'tone' ? 'short-field' : undefined}>
                  {storyLabels[field]}
                  {field === 'title' || field === 'genre' || field === 'tone'
                    ? <input required value={story[field]} aria-invalid={invalid && !story[field].trim()}
                      onChange={({ target }) => update({ ...story, [field]: target.value })} />
                    : <textarea required rows={3} value={story[field]} aria-invalid={invalid && !story[field].trim()}
                      onChange={({ target }) => update({ ...story, [field]: target.value })} />}
                </label>
              ))}
            </div>
            {listFields.map((field) => (
              <fieldset className="list-field" key={field}>
                <legend>{storyLabels[field]}</legend>
                {story[field].map((entry, index) => (
                  <div className="list-edit-row" key={index}>
                    <textarea required rows={2} value={entry} aria-invalid={invalid && !entry.trim()}
                      aria-label={copy.numberedEntry(storyLabels[field], index + 1)}
                      onChange={({ target }) => update({ ...story, [field]: story[field].map((value, i) => i === index ? target.value : value) })} />
                    {story[field].length > 1 && <button type="button" className="quiet" aria-label={copy.removeEntry(storyLabels[field], index + 1)}
                      onClick={() => update({ ...story, [field]: story[field].filter((_, i) => i !== index) })}>{copy.remove}</button>}
                  </div>
                ))}
                <button type="button" className="quiet" onClick={() => update({ ...story, [field]: [...story[field], ''] })}>
                  {field === 'progression' ? copy.addBeat : copy.addEnding}
                </button>
              </fieldset>
            ))}
            {invalid && <p className="error" role="alert">{copy.blank}</p>}
            <div className="actions"><button type="submit" className="primary" disabled={!dirty}>{copy.saveEdits}</button></div>
          </fieldset>
        </form>
        <aside className="narrative-sidebar">
          <section className="panel review-panel">
            <h2>{copy.review}</h2>
            {conflict && fresh && <p className="notice error">{copy.mandatoryConflict}</p>}
            {dirty ? <p className="muted">{copy.unsavedNarrative}</p> : <p className="muted">{copy.needsReview}</p>}
            <label className="checkbox-label"><input type="checkbox" checked={reviewed || (fresh && narrative.approved && !dirty)}
              disabled={reviewDisabled} onChange={({ target }) => setReviewed(target.checked)} />{copy.reviewed}</label>
            <button type="button" className="primary" disabled={reviewDisabled || !reviewed} onClick={() => void approve()}>{copy.approve}</button>
          </section>
          {fresh && narrative.approved && <NarrativeRegistry project={project} disabled={disabled || dirty} commit={commit}/>}
          <section className="panel facts-panel">
            {source && <>
              <div className="source-heading"><h2>{copy.sourceDirection}</h2><p className="creative">{source.story.title}</p>
                <p className="direction-source">{copy.directionSource(candidateBatchMode(project))}</p>
                <button type="button" className="quiet" onClick={() => inspect(source.id)}>{copy.viewSource}</button></div>
              <Coverage candidate={source} project={project} fresh={fresh} />
            </>}
            <FactList project={project} />
          </section>
        </aside>
      </div>
    </>
  );
}
