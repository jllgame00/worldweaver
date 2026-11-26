import { useId, useRef, useState } from 'react';
import { cardHeight as h, cardWidth as w, arrange } from './scenarioGraph';
import type { Position } from './scenarioGraph';
import { studioCopy as c } from './scenarioCopy';
import type { Project } from './project.generated';

interface Camera { x: number; y: number; width: number; height: number }

export default function ScenarioCanvas({ project, selected, select, move, reset, problems, visibleIds, entityIdPrefix }: {
  project: Project; selected?: string; select: (id: string) => void; move: (point: Position) => void;
  reset: () => void; problems: Set<string>; visibleIds: Set<string>; entityIdPrefix: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const arrow = useId();
  const [camera, setCamera] = useState<Camera>();
  const [preview, setPreview] = useState<Position>();
  const drag = useRef<{ id?: string; startX: number; startY: number; x: number; y: number; camera: Camera; moved: boolean } | undefined>(undefined);
  const positions = new Map(arrange(project).map((p) => [p.nodeId, p]));
  for (const point of project.scenario?.layout ?? []) positions.set(point.nodeId, point);
  if (preview) positions.set(preview.nodeId, preview);
  const points = [...positions.values()].filter((pos) => visibleIds.has(pos.nodeId));
  const x = points.length ? Math.min(...points.map((p) => p.x - 30)) : 0;
  const y = points.length ? Math.min(...points.map((p) => p.y - 30)) : 0;
  const view = camera ?? { x, y, width: Math.max(370, ...points.map((p) => p.x + w + 30 - x)),
    height: Math.max(240, ...points.map((p) => p.y + h + 30 - y)) };
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
    if (e.button !== 0) return;
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
      <button onClick={() => setCamera(undefined)}>{c.fit}</button>
      <button disabled={!project.scenario} onClick={() => { reset(); setCamera(undefined); }}>{c.autoLayout}</button>
    </div>
    <svg ref={svg} viewBox={[view.x, view.y, view.width, view.height].join(' ')} aria-label={c.graphName}
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
      {project.edges.map((edge) => {
        const a = positions.get(edge.from), b = positions.get(edge.to);
        if (!a || !b || !visibleIds.has(edge.from) || !visibleIds.has(edge.to)) return null;
        const forward = a.x <= b.x;
        const x1 = a.x + (forward ? w : 0), y1 = a.y + h / 2;
        const x2 = b.x + (forward ? 0 : w), y2 = b.y + h / 2;
        const bend = Math.max(34, Math.abs(x2 - x1) / 2) * (forward ? 1 : -1);
        const d = 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + bend) + ' ' + y1 + ', ' + (x2 - bend) + ' ' + y2 + ', ' + x2 + ' ' + y2;
        return <g key={edge.id} role="button" tabIndex={0} aria-label={edge.label} aria-pressed={selected === edge.id}
          className={'scenario-wire ' + (edge.kind ?? 'progression') + (problems.has(edge.id) ? ' has-finding' : '')}
          onPointerDown={(e) => e.stopPropagation()} onClick={() => select(edge.id)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(edge.id); } }}>
          <title>{edge.label}</title><path className="wire-target" d={d} /><path className="wire-line" d={d} markerEnd={'url(#' + arrow + ')'} />
          <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 7} textAnchor="middle">{edge.label.length > 22 ? edge.label.slice(0, 21) + '…' : edge.label}</text>
        </g>;
      })}
      {project.nodes.filter((node) => visibleIds.has(node.id)).map((node) => {
        const point = positions.get(node.id)!;
        const quest = project.quests.find((q) => q.nodeId === node.id);
        const kind = node.kind === 'quest' && quest?.kind ? quest.kind + ' quest' : node.kind;
        return <g key={node.id} id={entityIdPrefix + node.id} transform={'translate(' + point.x + ',' + point.y + ')'} role="button" tabIndex={0}
          aria-label={node.title} aria-pressed={selected === node.id} className={'scenario-card type-' + node.kind}
          onClick={() => select(node.id)} onPointerDown={(e) => start(e, point)} onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(node.id); }
            const step = { ArrowLeft: [-12,0], ArrowRight: [12,0], ArrowUp: [0,-12], ArrowDown: [0,12] }[e.key];
            if (step && project.scenario) { e.preventDefault(); move({ ...point, x: point.x + step[0]!, y: point.y + step[1]! }); }
          }}>
          <title>{node.title}</title><rect width={w} height={h} rx="6" />
          <text className="node-kind" x="12" y="20">{kind.toUpperCase()}{problems.has(node.id) ? '  ⚠' : ''}</text>
          <text className="node-title" x="12" y="43">{node.title.length > 21 ? node.title.slice(0, 20) + '…' : node.title}</text>
        </g>;
      })}
    </svg>
  </section>;
}
