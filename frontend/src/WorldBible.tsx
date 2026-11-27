import { useEffect, useMemo, useState } from 'react';
import type { Project } from './project.generated';
import { narrativeFresh } from './project';
import { scenarioCurrent } from './scenarioWorkflow';
import { sourceIssues } from './atlasWorkflow';
import { WorldBibleEditor } from './WorldBibleEditor';
import { WorldBibleGraph } from './WorldBibleGraph';
import { useBibleCopy, useBibleKinds, useBibleSources } from './worldBibleCopy';
import { DiagnosticDetails, useFormatter, useLocale } from './locale';
import { useVerificationDetail, useVerificationStatus } from './verificationCopy';
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
function sourceStatus(p: Project, e: BibleEntity, t: ReturnType<typeof useBibleCopy>) {
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
  const t = useBibleCopy();
  const kinds = useBibleKinds();
  const sources = useBibleSources();
  const locale = useLocale();
  const { number } = useFormatter();
  const detail = useVerificationDetail();
  const status = useVerificationStatus();
  const { project, selectedId, navigate, review } = props;
  const index = useMemo(() => buildWorldBible(project), [project]);
  const all = Array.from(index.entities.values());
  const context = useMemo(() => {
    const names = new Map<string, string>();
    for (const link of index.links) {
      if (!['Faction membership', 'Chapter', 'Located in region', 'Quest node', 'Ending node'].includes(link.kind)) continue;
      const owner = index.entities.get(link.to);
      if (owner) names.set(link.from, owner.label);
    }
    for (const link of index.links) {
      const use = index.entities.get(link.from);
      if (!names.has(link.to) && use && ['quest', 'node', 'location'].includes(use.kind)) names.set(link.to, use.label);
    }
    const seen = new Map<string, string>(), ambiguous = new Set<string>();
    for (const entity of index.entities.values()) {
      const key = JSON.stringify([entity.kind, entity.source, entity.label, names.get(entity.id)]);
      const prior = seen.get(key);
      if (prior) { ambiguous.add(prior); ambiguous.add(entity.id); }
      else seen.set(key, entity.id);
    }
    return { names, ambiguous };
  }, [index]);
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
        (!filter || [e.id, e.label, e.description, context.names.get(e.id) ?? ''].some((val) => val.toLowerCase().includes(filter))),
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
            <span className="count">{number(rows.length)}</span>
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
                .sort((a, b) => kinds[a].localeCompare(kinds[b], locale))
                .map((k) => (
                  <option key={k} value={k}>
                    {kinds[k]}
                  </option>
                ))}
            </select>
          </label>
          <ul aria-label={t.records} className="bible-records">
            {Object.entries(sources).map(([source, label]) => {
              const records = rows.filter(e => e.source === source);
              return records.length > 0 && <li key={source}><h3>{label} <span>{number(records.length)}</span></h3><ul>
              {records.map((e) => (
              <li key={e.id}>
                <button
                  aria-current={entity?.id === e.id ? 'true' : undefined}
                  className="quiet"
                  onClick={() => setSelection(e.id)}
                >
                  <span>{e.label}</span>
                  <small>{[kinds[e.kind], context.names.get(e.id)].filter(Boolean).join(' · ')}</small>
                  {context.ambiguous.has(e.id) && <code>{e.id}</code>}
                </button>
              </li>
              ))}
              </ul></li>;
            })}
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
            <section className="panel" aria-label={t.details}>
              <span className="pill">{kinds[entity.kind]}</span>
              <h2>{entity.label}</h2>
              {entity.description && entity.description !== entity.label && <p>{entity.description}</p>}
              <dl className="bible-meta">
                <div>
                  <dt>{t.source}</dt>
                  <dd>{sources[entity.source]}</dd>
                </div>
                <div>
                  <dt>{t.status}</dt>
                  <dd>{sourceStatus(project, entity, t)}</dd>
                </div>
              </dl>
              <details><summary>{locale === 'ko' ? '기록 ID' : 'Record ID'}</summary><code>{entity.id}</code></details>
              <div className="actions">
                <button className="quiet" onClick={() => navigate(entity.source, entity.id)}>
                  {t.openIn(sources[entity.source])}
                </button>
                <button className="quiet" disabled={props.disabled} onClick={() => review(entity.id)}>
                  {t.review}
                </button>
              </div>
              <WorldBibleEditor key={entity.id} {...props} entity={entity} index={index} />
            </section>
            <section className="panel" aria-label={t.usedBy}>
              <h2>{t.usedBy}</h2>
              {impact.direct.length ? <ul className="bible-links">
                {impact.direct.map(id => {
                  const owner = index.entities.get(id);
                  return owner ? <li key={id}><button className="quiet" onClick={() => select(id)}>{owner.label}</button>
                    <span>{kinds[owner.kind]}</span></li> : null;
                })}
              </ul> : <p className="muted">{t.none}</p>}
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
                      {index.entities.get(id) && <span>{kinds[index.entities.get(id)!.kind]}</span>}
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
                        {f.origin === 'editorial' ? t.semantic : t.structural} · {status(f.severity)} · {status(f.status)}
                      </strong>
                      <p>{f.origin === 'editorial' ? f.explanation : detail(f.explanation, f.rule)}</p>
                      {f.suggestedRepair && (
                        <p>{f.origin === 'editorial' ? f.suggestedRepair : detail(f.suggestedRepair, undefined, f.suggestedRepair)}</p>
                      )}
                      {locale === 'ko' && f.origin === 'deterministic' && (
                        <DiagnosticDetails detail={[f.explanation, f.suggestedRepair].filter(Boolean).join('\n')} code={f.rule} />
                      )}
                      <p className="muted">{current === undefined ? t.checked : current ? t.current : t.historical}</p>
                      <details><summary>{locale === 'ko' ? '검사 기록' : 'Check record'}</summary>
                        <p><code>{f.rule}</code> · <code>{f.runId}</code> · {locale === 'ko' ? '리비전' : 'Revision'} {number(f.checkedRevision)}</p>
                      </details>
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
