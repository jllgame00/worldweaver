import { Fragment } from 'react';
import { categories, copy, dispositions, storyLabels, treatments } from './copy';
import type { Project, Story, StoryCandidate } from './project.generated';

interface DirectionsProps {
  project: Project;
  fresh: boolean;
  disabled: boolean;
  inspect: (id: string) => void;
  choose: (candidate: StoryCandidate) => void;
}

const fields = ['genre', 'tone', 'premise', 'conflict', 'motivation', 'opposition', 'background', 'progression', 'possibleEndings'] satisfies (keyof Story)[];

export function Directions({ project, fresh, disabled, inspect, choose }: DirectionsProps) {
  return (
    <>
      <div className="page-heading"><h1>{copy.currentDirections}</h1><p>{copy.directionsIntro}</p></div>
      {project.storyCandidates.length === 0 ? <p className="empty panel">{copy.noDirections}</p> : (
        <>
          {!fresh && <p role="status" className="notice">{copy.staleDirections}</p>}
          <div className="comparison-grid">
            {project.storyCandidates.map((candidate) => (
              <article key={candidate.id} className="panel direction-card" aria-labelledby={`title-${candidate.id}`}>
                <div className="direction-title"><h2 id={`title-${candidate.id}`} className="creative">{candidate.story.title}</h2>
                  {project.narrative?.sourceCandidateId === candidate.id && <span className="pill">{copy.selected}</span>}
                </div>
                <StoryFields story={candidate.story} fields={fields} />
                <Coverage candidate={candidate} project={project} fresh={fresh} />
                <div className="actions direction-actions">
                  <button type="button" className="quiet" onClick={() => inspect(candidate.id)}>{copy.inspect}</button>
                  <button type="button" disabled={disabled || (!fresh && project.narrative?.sourceCandidateId !== candidate.id)}
                    className="primary" onClick={() => choose(candidate)}>{copy.choose}</button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </>
  );
}

interface DetailProps {
  project: Project;
  candidate: StoryCandidate;
  fresh: boolean;
  disabled: boolean;
  fromNarrative: boolean;
  back: () => void;
  choose: (candidate: StoryCandidate) => void;
}

export function DirectionDetail({ project, candidate, fresh, disabled, fromNarrative, back, choose }: DetailProps) {
  return (
    <>
      <div className="page-heading">
        <button type="button" className="quiet back-link" onClick={back}>{fromNarrative ? copy.backToNarrative : copy.backToDirections}</button>
        <h1 className="creative">{candidate.story.title}</h1>
      </div>
      <div className="content-grid">
        <section className="panel">
          <StoryFields story={candidate.story} fields={fields} />
          {!fromNarrative && <div className="actions"><button type="button" className="primary" disabled={disabled || !fresh} onClick={() => choose(candidate)}>{copy.choose}</button></div>}
        </section>
        <section className="panel facts-panel"><Coverage candidate={candidate} project={project} fresh={fresh} /><FactList project={project} /></section>
      </div>
    </>
  );
}

export function StoryFields({ story, fields }: { story: Story; fields: (keyof Story)[] }) {
  return <dl className="story-fields">{fields.map((field) => {
    const value = story[field];
    return <Fragment key={field}>
      <dt>{storyLabels[field]}</dt>
      <dd className="creative">{Array.isArray(value) ? <ul>{value.map((entry, index) => <li key={index}>{entry}</li>)}</ul> : value}</dd>
    </Fragment>;
  })}</dl>;
}

export function Coverage({ candidate, project, fresh }: { candidate: StoryCandidate; project: Project; fresh: boolean }) {
  return (
    <section className="coverage">
      <h3>{copy.coverage}</h3>
      {!fresh && <p className="muted">{copy.historicalCoverage}</p>}
      {candidate.coverage.length === 0 ? <p className="muted">{copy.noCoverage}</p> : (
        <ul className="record-list">
          {candidate.coverage.map(({ contentId, disposition, reason }) => {
            const fragment = project.userContent.find(({ id }) => id === contentId);
            return <li key={contentId}>
              <div className="record-header">{fragment && <span className="pill">{categories[fragment.category]}</span>}
                {fragment && fresh && <span className="tag">{treatments[fragment.treatment]}</span>}
                <span className={`tag ${disposition}`}>{dispositions[disposition]}</span></div>
              {fragment && fresh && <p className="creative">{fragment.text}</p>}
              <p className="muted creative">{reason}</p>
            </li>;
          })}
        </ul>
      )}
    </section>
  );
}

export function FactList({ project }: { project: Project }) {
  return <section className="fact-list">
    <h3>{copy.pinnedFacts}</h3>
    {project.canonicalFacts.length ? <ul>{project.canonicalFacts.map(({ id, statement }) => <li key={id} className="creative">{statement}</li>)}</ul>
      : <p className="muted">{copy.emptyFacts}</p>}
  </section>;
}
