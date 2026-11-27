import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { cardHeight as h, cardWidth as w, arrange, edgeDrawing, titleLines } from './scenarioGraph';
import type { Position } from './scenarioGraph';
import { useScenarioKind, useStudioCopy } from './scenarioCopy';
import type { Project } from './project.generated';

export interface Camera { x: number; y: number; width: number; height: number }

const glyphs = { prologue: '◉', chapter: '▤', event: '●', quest: '⚑', choice: '◇', ending: '◎',
  dialogue: '◌', encounter: '✦', condition: '△', transition: '→' };

function bounds(points: Position[]): Camera {
  if (!points.length) return { x: 0, y: 0, width: 370, height: 240 };
  const x = Math.min(...points.map(p => p.x)) - 30, y = Math.min(...points.map(p => p.y)) - 30;
  return { x, y, width: Math.max(270, ...points.map(p => p.x + w + 30 - x)),
    height: Math.max(170, ...points.map(p => p.y + h + 30 - y)) };
}

function asViewBox(view: Camera) { return [view.x, view.y, view.width, view.height].join(' '); }

function fitAspect(view: Camera, ratio: number): Camera {
  const width = Math.max(view.width, view.height * ratio), height = width / ratio;
  return { width, height, x: view.x - (width - view.width) / 2, y: view.y - (height - view.height) / 2 };
}

export default function ScenarioCanvas({ project, selected, select, move, reset, problems, visibleIds, entityIdPrefix, path, camera, setCamera }: {
  project: Project; selected?: string; select: (id: string) => void; move: (point: Position) => void;
  reset: () => void; problems: Set<string>; visibleIds: Set<string>; entityIdPrefix: string;
  path?: string[]; camera?: Camera; setCamera: (camera?: Camera) => void;
}) {
  const c = useStudioCopy();
  const labelKind = useScenarioKind();
  const svg = useRef<SVGSVGElement>(null);
  const arrow = useId();
  const tip = useId();
  const [autoPreview, setAutoPreview] = useState(false);
  const [focusedEdge, setFocusedEdge] = useState<string>();
  const [size, setSize] = useState<{ width: number; height: number }>();
  useEffect(() => {
    if (!svg.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box?.width && box.height) setSize({ width: box.width, height: box.height });
    });
    observer.observe(svg.current);
    return () => observer.disconnect();
  }, []);
  const [preview, setPreview] = useState<Position>();
  const drag = useRef<{ id?: string; startX: number; startY: number; x: number; y: number; camera: Camera; moved: boolean } | undefined>(undefined);
  const automatic = useMemo(() => arrange(project), [project]);
  const positions = useMemo(() => {
    const result = new Map(automatic.map(p => [p.nodeId, p]));
    if (!autoPreview) for (const point of project.scenario?.layout ?? []) result.set(point.nodeId, point);
    if (preview) result.set(preview.nodeId, preview);
    return result;
  }, [automatic, project.scenario?.layout, autoPreview, preview]);
  const points = useMemo(() => [...positions.values()].filter(p => visibleIds.has(p.nodeId)), [positions, visibleIds]);
  const full = useMemo(() => bounds(points), [points]);
  const fit = (box: Camera) => size ? fitAspect(box, size.width / size.height) : box;
  const overview = fit(full);
  const opening = size && overview.width > size.width
    ? { x: full.x, y: full.y - Math.max(0, (size.height - full.height) / 2), width: size.width, height: size.height } : overview;
  const view = camera ? fit(camera) : opening;
  const wires = useMemo(() => {
    const occupied = points.map(p => ({ x: p.x - 3, y: p.y - 3, width: w + 6, height: h + 6 }));
    return project.edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to))
      .map(edge => ({ edge, ...edgeDrawing(positions.get(edge.from)!, positions.get(edge.to)!, edge.label, occupied) }));
  }, [project.edges, points, positions, visibleIds]);
  const pathNodes = new Set(path);
  const pathEdges = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 1; path && i < path.length; i++) {
      const candidates = project.edges.filter(e => e.kind !== 'reference' && e.from === path[i - 1] && e.to === path[i]);
      // The validator reports node IDs. Parallel transitions cannot be distinguished.
      if (candidates.length === 1) ids.add(candidates[0]!.id);
    }
    return ids;
  }, [path, project.edges]);
  const selectedEdge = project.edges.find(e => e.id === selected);
  const selection = project.nodes.filter(node => visibleIds.has(node.id) && selected !== undefined &&
    (node.id === selected || node.chapterId === selected || node.id === selectedEdge?.from || node.id === selectedEdge?.to))
    .map(node => positions.get(node.id)!);
  const showLabel = project.edges.find(e => e.id === (focusedEdge ?? selected));
  const zoom = (scale: number) => {
    const width = Math.max(150, Math.min(30000, view.width * scale));
    const height = width / view.width * view.height;
    setCamera({ width, height, x: view.x + (view.width - width) / 2, y: view.y + (view.height - height) / 2 });
  };
  function coordinate(e: React.PointerEvent) {
    if (!svg.current?.getScreenCTM) return { x: e.clientX, y: e.clientY };
    const point = svg.current.createSVGPoint();
    point.x = e.clientX; point.y = e.clientY;
    return point.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  }
  function start(e: React.PointerEvent, point?: Position) {
    if (e.button !== 0 || (autoPreview && point)) return;
    const mouse = coordinate(e);
    const cam = { ...view };
    setCamera(cam);
    drag.current = { id: point?.nodeId, startX: mouse.x, startY: mouse.y, x: point?.x ?? 0, y: point?.y ?? 0, camera: cam, moved: false };
    svg.current?.setPointerCapture?.(e.pointerId);
    e.stopPropagation();
  }
  function update(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    const mouse = coordinate(e);
    const dx = mouse.x - d.startX, dy = mouse.y - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    d.moved = true;
    if (d.id && project.scenario) {
      setPreview({ nodeId: d.id, x: Math.round(d.x + dx), y: Math.round(d.y + dy) });
    } else if (!d.id) {
      setCamera({ ...d.camera, x: view.x - dx, y: view.y - dy });
    }
  }
  function finish() {
    const d = drag.current;
    drag.current = undefined;
    if (d?.id) {
      if (preview && d.moved) move(preview);
      select(d.id);
    }
    setPreview(undefined);
  }
  return <section className="scenario-canvas" aria-label={c.graphName}>
    <div className="actions canvas-tools">
      <button onClick={() => zoom(0.8)} aria-label={c.zoomIn}>+</button>
      <button onClick={() => zoom(1.25)} aria-label={c.zoomOut}>−</button>
      <button onClick={() => setCamera(overview)}>{c.fit}</button>
      <button disabled={!selection.length} onClick={() => setCamera(bounds(selection))}>{c.fitSelection}</button>
      {autoPreview ? <><span>{c.layoutPreview}</span><button onClick={() => { reset(); setAutoPreview(false); }}>{c.applyLayout}</button>
        <button onClick={() => setAutoPreview(false)}>{c.cancel}</button></> :
        <button disabled={!project.scenario} onClick={() => {
          if (project.scenario?.layout.length) setAutoPreview(true); else reset();
          setCamera(undefined);
        }}>{c.autoLayout}</button>}
    </div>
    <div className="scenario-plot">
    <svg ref={svg} className="graph-drawing" viewBox={asViewBox(view)} aria-label={c.graphName}
      onPointerDown={(e) => start(e)} onPointerMove={update} onPointerUp={finish}
      onPointerCancel={() => { drag.current = undefined; setPreview(undefined); }}>
      <defs><marker id={arrow} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 0 L 9 5 L 0 10 z" fill="currentColor" /></marker></defs>
      {project.scenario?.chapters.map((chapter) => {
        const group = project.nodes.filter((n) => n.chapterId === chapter.id && visibleIds.has(n.id)).map((n) => positions.get(n.id)!);
        if (!group.length) return null;
        const left = Math.min(...group.map((p) => p.x)) - 12, top = Math.min(...group.map((p) => p.y)) - 24;
        return <g key={chapter.id} className="canvas-chapter" pointerEvents="none">
          <rect x={left} y={top} width={Math.max(...group.map((p) => p.x)) + w + 12 - left}
            height={Math.max(...group.map((p) => p.y)) + h + 12 - top} rx="8" />
          <text x={left + 8} y={top + 15}>{chapter.title}</text>
        </g>;
      })}
      {wires.map(({ edge, d, labelAt }) => {
        return <g key={edge.id} role="button" tabIndex={0} aria-label={edge.label} aria-pressed={selected === edge.id}
          className={'scenario-wire ' + (edge.kind ?? 'progression') + (problems.has(edge.id) ? ' has-finding' : '') +
            (edge.travel === 'required' && edge.kind !== 'reference' ? ' travel' : '') + (pathEdges.has(edge.id) ? ' on-witness' : '')}
          onFocus={() => setFocusedEdge(edge.id)} onBlur={() => setFocusedEdge(undefined)}
          onPointerDown={(e) => e.stopPropagation()} onClick={() => select(edge.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(edge.id); } }}>
          <title>{edge.label}</title><path className="wire-target" d={d} /><path className="wire-line" d={d} markerEnd={'url(#' + arrow + ')'} />
          {labelAt && <text {...labelAt} textAnchor="middle">{edge.label}</text>}
        </g>;
      })}
      {project.nodes.filter((node) => visibleIds.has(node.id)).map((node) => {
        const point = positions.get(node.id)!;
        const quest = project.quests.find((q) => q.nodeId === node.id);
        const kind = node.kind === 'quest' && quest?.kind ? quest.kind + ' quest' : node.kind;
        return <g key={node.id} id={entityIdPrefix + node.id} transform={'translate(' + point.x + ',' + point.y + ')'} role="button" tabIndex={0}
          aria-label={node.title} aria-pressed={selected === node.id} className={'scenario-card type-' + node.kind + (pathNodes.has(node.id) ? ' on-witness' : '')}
          onClick={() => select(node.id)} onPointerDown={(e) => start(e, point)} onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(node.id); }
            const step = { ArrowLeft: [-12,0], ArrowRight: [12,0], ArrowUp: [0,-12], ArrowDown: [0,12] }[e.key];
            if (step && project.scenario && !autoPreview) { e.preventDefault(); move({ ...point, x: point.x + step[0]!, y: point.y + step[1]! }); }
          }}>
          <title>{node.title}</title><rect width={w} height={h} rx="6" />
          <text x="12" y="20" className="node-glyph">{glyphs[node.kind]}</text>
          <text className="node-kind" x="32" y="20">{labelKind(kind).toUpperCase()}{problems.has(node.id) ? '  ⚠' : ''}</text>
          <text className="node-title">{titleLines(node.title).map((line,i) => <tspan key={i} x="12" y={42 + 17*i}>{line}</tspan>)}</text>
        </g>;
      })}
    </svg>
    <svg className="scenario-minimap" role="group" tabIndex={0} aria-label={c.minimap} aria-describedby={tip} viewBox={asViewBox(full)}
      onClick={e => {
        const mini = e.currentTarget, matrix = mini.getScreenCTM?.();
        if (!matrix) return;
        const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
        setCamera({ ...view, x: point.x - view.width / 2, y: point.y - view.height / 2 });
      }} onKeyDown={e => {
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (dx || dy) { e.preventDefault(); setCamera({ ...view, x: view.x + dx * view.width / 5, y: view.y + dy * view.height / 5 }); }
        if (e.key === 'Home') { e.preventDefault(); setCamera(overview); }
      }}>
      <title>{c.minimapKeys}</title>
      {wires.map(({edge,d}) => <path key={edge.id} d={d} />)}
      {points.map(p => <rect key={p.nodeId} className={p.nodeId === selected ? 'mini-selected' : ''} x={p.x} y={p.y} width={w} height={h} />)}
      <rect className="mini-view" {...view} />
    </svg></div>
    <span className="scenario-sr" id={tip}>{c.minimapKeys}</span>
    {showLabel && <p className="wire-caption">{showLabel.label}</p>}
    <ul className="scenario-legend" aria-label={c.connectionsLegend}>
      {(['progression','optional','reference','travel'] as const).map(kind =>
        <li key={kind} className={kind}>{kind === 'travel' ? c.travelLine : labelKind(kind)}</li>)}
    </ul>
  </section>;
}
