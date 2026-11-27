import { useRef, useState } from 'react';
import { bibleCopy as t, bibleKinds } from './worldBibleCopy';
import type { BibleEntity, BibleIndex } from './worldBibleIndex';
import type { GraphLink } from './worldBibleEvidence';

export function WorldBibleGraph({
  index,
  entity,
  select,
  suggestions,
}: {
  index: BibleIndex;
  entity: BibleEntity;
  select: (id: string) => void;
  suggestions: GraphLink[];
}) {
  const [kind, setKind] = useState(''),
    [relation, setRelation] = useState(''),
    [page, setPage] = useState(0);
  const [source, setSource] = useState('');
  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const adjacent: GraphLink[] = [...index.links, ...suggestions].filter(
    (l) => l.from === entity.id || l.to === entity.id,
  );
  const related = adjacent.flatMap((link) => {
    const outgoing = link.from === entity.id,
      other = index.entities.get(outgoing ? link.to : link.from);
    return other ? [{ link, other, outgoing }] : [];
  });
  const visible = related.filter(
    (r) =>
      (!relation || r.link.kind === relation) &&
      (!kind || r.other.kind === kind) &&
      (!source || source === (r.link.suggested ? 'suggested' : 'canonical')),
  );
  const neighbors = [...new Map(visible.map((r) => [r.other.id, r])).values()];
  const pages = Math.max(1, Math.ceil(neighbors.length / 6)),
    active = Math.min(page, pages - 1);
  const slice = neighbors.slice(active * 6, active * 6 + 6);
  const width = 720,
    height = 268,
    ox = view.x + (width - width / view.zoom) / 2,
    oy = view.y + (height - height / view.zoom) / 2;
  function pan(x: number, y: number) {
    setView((v) => ({ ...v, x: v.x + x / v.zoom, y: v.y + y / v.zoom }));
  }
  function zoom(multiplier: number) {
    setView((v) => ({ ...v, zoom: Math.min(3, Math.max(0.5, v.zoom * multiplier)) }));
  }
  const origin = { x: width / 2, y: height / 2 };
  const positions = slice.map((item, i) => ({
    ...item,
    x: i % 2 === 0 ? 125 : 595,
    y: ((Math.floor(i / 2) + 1) * height) / (Math.ceil(slice.length / 2) + 1),
  }));
  return (
    <section className="panel bible-graph" aria-label={t.graph}>
      <h2>{t.graph}</h2>
      <div className="paired-fields">
        <label>
          {t.graphFilter}
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t.all}</option>
            {[...new Set(related.map((r) => r.other.kind))].map((k) => (
              <option key={k} value={k}>
                {bibleKinds[k]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.relation}
          <select
            value={relation}
            onChange={(e) => {
              setRelation(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t.relations}</option>
            {[...new Set(related.map((r) => r.link.kind))].sort().map((k) => (
              <option key={k}>{k}</option>
            ))}
          </select>
        </label>
      </div>
      {suggestions.length > 0 && (
        <label>
          {t.evidence}
          <select
            value={source}
            onChange={(e) => {
              setSource(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t.allSources}</option>
            <option value="canonical">{t.canonical}</option>
            <option value="suggested">{t.suggested}</option>
          </select>
        </label>
      )}
      {visible.length > 0 ? (
        <>
          <div className="actions bible-toolbar">
            <button aria-label={t.zoomOut} onClick={() => zoom(1 / 1.25)}>
              −
            </button>
            <button aria-label={t.zoomIn} onClick={() => zoom(1.25)}>
              +
            </button>
            <button aria-label={t.panLeft} onClick={() => pan(-52, 0)}>
              ←
            </button>
            <button aria-label={t.panRight} onClick={() => pan(52, 0)}>
              →
            </button>
            <button aria-label={t.panUp} onClick={() => pan(0, -40)}>
              ↑
            </button>
            <button aria-label={t.panDown} onClick={() => pan(0, 40)}>
              ↓
            </button>
            <button onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>{t.fit}</button>
          </div>
          <svg
            className="bible-network"
            aria-label={t.graph}
            viewBox={[ox, oy, width / view.zoom, height / view.zoom].join(' ')}
            onPointerDown={(e) => {
              if ((e.target as Element).closest('[role="button"]')) return;
              drag.current = { x: e.clientX, y: e.clientY };
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const scale = width / (e.currentTarget.getBoundingClientRect().width || width);
              pan((drag.current.x - e.clientX) * scale, (drag.current.y - e.clientY) * scale);
              drag.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={() => {
              drag.current = null;
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
          >
            {positions.map((r) => (
              <line
                key={r.other.id}
                x1={origin.x}
                y1={origin.y}
                x2={r.x}
                y2={r.y}
                className={r.link.suggested ? 'bible-suggestion' : undefined}
                strokeDasharray={r.link.suggested ? '2 5' : r.link.stored ? undefined : '5 4'}
              >
                <title>
                  {r.link.kind} · {r.link.suggested ? t.suggested : r.link.stored ? t.stored : t.derived}
                </title>
              </line>
            ))}
            {[...positions.map((r) => ({ ...r, node: r.other })), { ...origin, node: entity }].map(
              ({ x, y, node }) => {
                const selected = node.id === entity.id;
                return (
                  <g
                    key={node.id}
                    transform={'translate(' + x + ' ' + y + ')'}
                    className={selected ? 'bible-center' : ''}
                    role={selected ? undefined : 'button'}
                    tabIndex={selected ? undefined : 0}
                    aria-label={node.label}
                    onClick={selected ? undefined : () => select(node.id)}
                    onKeyDown={(e) => {
                      if (!selected && ['Enter', ' '].includes(e.key)) {
                        e.preventDefault();
                        select(node.id);
                      }
                    }}
                  >
                    <title>
                      {node.label} · {node.id}
                    </title>
                    <rect x="-91" y="-21" width="182" height="42" rx="8" />
                    <text textAnchor="middle" y="-1">
                      {node.label.length > 21 ? node.label.slice(0, 20) + '…' : node.label}
                    </text>
                    <text className="bible-svg-kind" textAnchor="middle" y="14">
                      {bibleKinds[node.kind]}
                    </text>
                  </g>
                );
              },
            )}
          </svg>
          {pages > 1 && (
            <div className="actions">
              <button disabled={!active} onClick={() => setPage(active - 1)}>
                {t.previous}
              </button>
              <span>
                {active + 1} / {pages}
              </span>
              <button disabled={active === pages - 1} onClick={() => setPage(active + 1)}>
                {t.next}
              </button>
            </div>
          )}
        </>
      ) : (
        <p className="muted">{t.emptyRelationships}</p>
      )}
      <ul aria-label={t.related} className="bible-links">
        {visible.map(({ other, link, outgoing }) => (
          <li key={JSON.stringify(link)}>
            <button className="quiet" onClick={() => select(other.id)}>
              {other.label}
            </button>
            <span>
              {outgoing ? t.uses : t.usedBy} · {link.kind} ·{' '}
              {link.suggested ? t.suggested : link.stored ? t.stored : t.derived}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
