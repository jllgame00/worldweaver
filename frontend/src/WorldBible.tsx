import { useEffect, useMemo, useState } from 'react';
import type { Project } from './project.generated';
import { narrativeFresh } from './project';
import { scenarioCurrent } from './scenarioWorkflow';
import { sourceIssues } from './atlasWorkflow';
import { WorldBibleEditor } from './WorldBibleEditor';
import { WorldBibleGraph } from './WorldBibleGraph';
import { bibleCopy as t, bibleKinds, bibleSources } from './worldBibleCopy';
import { buildWorldBible, dependencyImpact, type BibleEntity } from './worldBibleIndex';
import './worldBible.css';
import { bibleFindings, suggestedLinks, useVerificationIdentity } from './worldBibleEvidence';

export interface BibleProps {
  project: Project;
  selectedId?: string;
  disabled: boolean;
  current: () => Project | undefined;
  commit: (project: Project) => Promise<boolean>;
  navigate: (view: 'atlas' | 'scenario' | 'content' | 'narrative', id: string) => void;
  review: (id: string) => void;
}
function sourceStatus(p: Project, e: BibleEntity) {
  if (e.kind === 'fact') return t.locked;
  if (e.source === 'content') return t.sourceInput;
  if (e.source === 'atlas')
    return p.world?.approved ? (sourceIssues(p, p.world).length ? t.staleSource : t.approved) : t.draft;
  if (e.source === 'scenario')
    return p.scenario?.approved ? (scenarioCurrent(p) ? t.approved : t.staleSource) : t.draft;
  if (['character', 'faction', 'item', 'flag', 'decision'].includes(e.kind)) return t.saved;
  return p.narrative?.approved && e.kind === 'narrative'
    ? narrativeFresh(p)
      ? t.approved
      : t.staleSource
    : t.saved;
}

export function WorldBible(props: BibleProps) {
  const { project, selectedId, navigate, review } = props;
  const index = useMemo(() => buildWorldBible(project), [project]);
  const all = Array.from(index.entities.values());
  const [selection, setSelection] = useState<string | undefined>(
    selectedId ?? project.canonicalFacts[0]?.id ?? all[0]?.id,
  );
  const [query, setQuery] = useState(''),
    [kind, setKind] = useState('');
  useEffect(() => {
    if (selectedId) {
      setSelection(selectedId);
      setQuery('');
      setKind('');
    }
  }, [selectedId, project.id]);
  const filter = query.trim().toLowerCase(),
    rows = all.filter(
      (e) =>
        (!kind || e.kind === kind) &&
        (!filter || [e.id, e.label, e.description].some((val) => val.toLowerCase().includes(filter))),
    );
  const entity = index.entities.get(selection ?? '') ?? rows[0];
  const impact = useMemo(
    () => (entity ? dependencyImpact(index, entity.id) : { direct: [], transitive: [] }),
    [index, entity],
  );
  const fingerprint = useVerificationIdentity(project);
  const findings = entity ? bibleFindings(project, entity.id, fingerprint) : [];
  function select(id: string) {
    setQuery('');
    setKind('');
    setSelection(id);
  }
  return (
    <>
      <div className="page-heading">
        <h1>{t.title}</h1>
      </div>
      <div className="bible-layout">
        <aside className="panel bible-register">
          <div className="section-heading">
            <h2>{t.records}</h2>
            <span className="count">{rows.length}</span>
          </div>
          <label>
            {t.search}
            <input type="search" value={query} onChange={(ev) => setQuery(ev.target.value)} />
          </label>
          <label>
            {t.type}
            <select value={kind} onChange={(ev) => setKind(ev.target.value)}>
              <option value="">{t.all}</option>
              {[...new Set(all.map((e) => e.kind))]
                .sort((a, b) => bibleKinds[a].localeCompare(bibleKinds[b]))
                .map((k) => (
                  <option key={k} value={k}>
                    {bibleKinds[k]}
                  </option>
                ))}
            </select>
          </label>
          <ul aria-label={t.records} className="bible-records">
            {rows.map((e) => (
              <li key={e.id}>
                <button
                  aria-current={entity?.id === e.id ? 'true' : undefined}
                  className="quiet"
                  onClick={() => setSelection(e.id)}
                >
                  <span>{e.label}</span>
                  <small>{bibleKinds[e.kind]}</small>
                </button>
              </li>
            ))}
          </ul>
          {!rows.length && <p className="muted">{all.length ? t.empty : t.noRecords}</p>}
          {!!index.ambiguousStateIds.length && (
            <p className="notice">
              {t.legacy} <code>{index.ambiguousStateIds.join(', ')}</code>
            </p>
          )}
        </aside>
        {entity && (
          <div className="bible-detail">
            <section className="panel" aria-label="Record details">
              <span className="pill">{bibleKinds[entity.kind]}</span>
              <h2>{entity.label}</h2>
              <code>{entity.id}</code>
              {entity.description && entity.description !== entity.label && <p>{entity.description}</p>}
              <dl className="bible-meta">
                <div>
                  <dt>{t.source}</dt>
                  <dd>{bibleSources[entity.source]}</dd>
                </div>
                <div>
                  <dt>{t.status}</dt>
                  <dd>{sourceStatus(project, entity)}</dd>
                </div>
              </dl>
              <div className="actions">
                <button className="quiet" onClick={() => navigate(entity.source, entity.id)}>
                  Open in {bibleSources[entity.source]}
                </button>
                <button className="quiet" disabled={props.disabled} onClick={() => review(entity.id)}>
                  {t.review}
                </button>
              </div>
              <WorldBibleEditor key={entity.id} {...props} entity={entity} index={index} />
            </section>
            <WorldBibleGraph
              key={entity.id}
              entity={entity}
              index={index}
              suggestions={suggestedLinks(findings, index)}
              select={select}
            />
            <section className="panel">
              <h2>{t.indirect}</h2>
              {impact.transitive.length ? (
                <ul className="bible-links">
                  {impact.transitive.map((id) => (
                    <li key={id}>
                      <button className="quiet" onClick={() => select(id)}>
                        {index.entities.get(id)?.label ?? id}
                      </button>
                      <code>{id}</code>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t.none}</p>
              )}
            </section>
            <section className="panel">
              <h2>{t.findings}</h2>
              {findings.length ? (
                <ul>
                  {findings.map(({ finding: f, current }) => (
                    <li key={f.id}>
                      <strong>
                        {f.origin === 'editorial' ? t.semantic : t.structural} · {f.severity} · {f.status}
                      </strong>
                      <p>{f.explanation}</p>
                      <p>{f.suggestedRepair}</p>
                      <code>{f.rule}</code>
                      <p className="muted">
                        {current === undefined ? t.checked : current ? t.current : t.historical} · {f.runId} ·{' '}
                        {f.checkedRevision}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{t.noFindings}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </>
  );
}
