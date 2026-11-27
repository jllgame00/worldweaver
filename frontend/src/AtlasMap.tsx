import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Compass, defaults, Geography, layerNames, Legend, useAtlasLegend } from './AtlasSheet';
import type { Layer } from './AtlasSheet';
import type { AtlasIssue } from './atlasTypes';
import { displayableGrid } from './atlasPlaces';
import { middle, viewBox } from './atlasGeometry';
import type { View } from './atlasGeometry';
import type { Point, World } from './project.generated';
import { downloadFile } from './scenarioWorkflow';
import { useFormatter, useLocale, useLocalized } from './locale';
import './atlasMap.css';

interface Props {
  world: World;
  projectId?: string;
  selected?: string;
  onSelect: (id: string) => void;
  issues: AtlasIssue[];
  scenarioLocationIds: string[];
  requiredLocationIds?: string[];
  scenarioRouteIds: string[];
}
const mapWidth = 932;
const layersList = Object.keys(layerNames) as Layer[];
const groups = {
  terrain: ['biomes','relief'], hydrology: ['water'], movement: ['routes','infrastructure'],
  politics: ['regions','territories'], sites: ['places','labels'], review: ['scenario','constraints','findings'],
} satisfies Record<string, Layer[]>;
const english = {
  noTerrain: 'No terrain has been generated for this atlas.',
  invalidTerrain: 'The map needs a rectangular terrain grid of up to 128 × 128 cells. Review the terrain finding.',
  exportError: 'The map could not be exported. Try exporting again.',
  interactive: 'Interactive atlas',
  zoomOut: 'Zoom out',
  zoom: 'Map zoom',
  zoomIn: 'Zoom in',
  fitMap: 'Fit map',
  zoomTo: 'Zoom to selection',
  layers: 'Layers',
  mapLayers: 'Map layers',
  groups: { terrain: 'Terrain', hydrology: 'Water system', movement: 'Travel', politics: 'Boundaries', sites: 'Places and names', review: 'Design review' },
  layerNames,
  export: 'Export SVG',
  world: 'World atlas',
  map: 'Atlas map',
  description: (seed: string, version: string) => 'Seed ' + seed + '. Generator ' + version + '. North is up.',
  seed: (seed: string) => 'Seed ' + seed,
};
const korean = {
  noTerrain: '이 지도의 지형이 아직 생성되지 않았습니다.',
  invalidTerrain: '지도에 최대 128 × 128칸의 직사각형 지형 격자가 필요합니다. 지형 검증 결과를 확인하세요.',
  exportError: '지도를 내보내지 못했습니다. 다시 시도하세요.',
  interactive: '대화형 세계 지도',
  zoomOut: '축소',
  zoom: '지도 확대율',
  zoomIn: '확대',
  fitMap: '지도 전체 보기',
  zoomTo: '선택 항목 확대',
  layers: '레이어',
  mapLayers: '지도 레이어',
  groups: { terrain: '지형', hydrology: '수계', movement: '이동', politics: '정치 경계', sites: '장소와 이름', review: '설계 검토' },
  layerNames: {
    biomes: '생물군계', relief: '지형 기복', water: '물길', regions: '지역', territories: '영토',
    places: '정착지와 장소', routes: '경로', infrastructure: '기반 시설', scenario: '시나리오 연결 지점',
    constraints: '공간 제약', findings: '검증 결과', labels: '이름표',
  },
  export: 'SVG 내보내기',
  world: '세계 지도',
  map: '지도',
  description: (seed: string, version: string) => '시드 ' + seed + '. 생성기 ' + version + '. 위쪽이 북쪽입니다.',
  seed: (seed: string) => '시드 ' + seed,
};

// Some print engines ignore nested SVG viewports. Flatten the map onto its sheet for export.
export function standaloneSheet(sheet: SVGSVGElement, full: View) {
  const clone = sheet.cloneNode(true) as SVGSVGElement;
  clone.removeAttribute('class');
  const chart = clone.querySelector('svg')!;
  const doc = clone.ownerDocument;
  const group = doc.createElementNS(clone.namespaceURI, 'g');
  group.setAttribute('data-full-extent', viewBox(full));
  group.setAttribute(
    'transform',
    'translate(14 65) scale(' + mapWidth / full.width + ') translate(' + -full.x + ' ' + -full.y + ')',
  );
  group.append(...Array.from(chart.childNodes));
  const crop = doc.createElementNS(clone.namespaceURI, 'g');
  crop.setAttribute('clip-path', 'url(#atlas-export-frame)');
  crop.append(group);
  const clip = doc.createElementNS(clone.namespaceURI, 'clipPath');
  clip.id = 'atlas-export-frame';
  const frame = doc.createElementNS(clone.namespaceURI, 'rect');
  for (const attr of ['x', 'y', 'width', 'height']) frame.setAttribute(attr, chart.getAttribute(attr)!);
  clip.append(frame);
  clone.querySelector('defs')!.append(clip);
  chart.replaceWith(crop);
  clone.querySelectorAll('[tabindex], [role=button]').forEach((el) => {
    for (const key of ['tabindex', 'role', 'aria-pressed', 'style']) el.removeAttribute(key);
  });
  return new XMLSerializer().serializeToString(clone);
}
function loadPrefs(key: string, full: View) {
  const layers = { ...defaults };
  let view = full;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
    for (const name of layersList)
      if (typeof saved?.layers?.[name] === 'boolean') layers[name] = saved.layers[name];
    const v = saved?.view;
    if (
      v &&
      [v.x, v.y, v.width, v.height].every(Number.isFinite) &&
      v.width >= full.width / 12 &&
      v.width <= full.width &&
      Math.abs(v.height / v.width - full.height / full.width) < 0.001
    )
      view = bounded(v, full);
  } catch {
    /* Browsing without local storage still supports all map controls. */
  }
  return { layers, view };
}
function bounded(v: View, full: View) {
  return {
    ...v,
    x: Math.max(full.x, Math.min(full.x + full.width - v.width, v.x)),
    y: Math.max(full.y, Math.min(full.y + full.height - v.height, v.y)),
  };
}
function focusPoint(world: World, id?: string): Point | undefined {
  if (!id) return;
  const location = world.locations.find((l) => l.id === id);
  if (location) return location.position ?? middle(location.area ?? []);
  const route = world.routes.find((r) => r.id === id);
  if (route) return route.path[Math.floor(route.path.length / 2)];
  const region = world.regions.find((r) => r.id === id) ?? world.features.find((f) => f.id === id);
  if (region) return middle(region.cells);
  const territory = world.territories?.find((t) => t.id === id);
  if (territory)
    return middle(world.regions.filter((r) => territory.regionIds.includes(r.id)).flatMap((r) => r.cells));
}
function zoomed(v: View, full: View, factor: number, ax = 0.5, ay = 0.5): View {
  const width = Math.max(full.width / 12, Math.min(full.width, v.width * factor));
  const height = (width * full.height) / full.width;
  return bounded({ x: v.x + (v.width - width) * ax, y: v.y + (v.height - height) * ay, width, height }, full);
}
export default function AtlasMap(props: Props) {
  const copy = useLocalized(english, korean);
  const { world, projectId } = props;
  if (!world.tiles.length) return <p>{copy.noTerrain}</p>;
  if (!displayableGrid(world.tiles))
    return <p role="alert">{copy.invalidTerrain}</p>;
  const storageKey =
    'worldweaver:atlas-view:' +
    JSON.stringify([projectId ?? world.id, world.id, world.tiles[0]?.length ?? 0, world.tiles.length]);
  return <AtlasViewport key={storageKey} {...props} storageKey={storageKey} />;
}
function AtlasViewport({ world, storageKey, ...props }: Props & { storageKey: string }) {
  const copy = useLocalized(english, korean);
  const locale = useLocale();
  const { number } = useFormatter();
  const full = { x: -1, y: -1, width: (world.tiles[0]?.length || 1) + 2, height: world.tiles.length + 2 };
  const [prefs, setPrefs] = useState(() => loadPrefs(storageKey, full));
  const [printing, setPrinting] = useState(false);
  const [sheetPixels, setSheetPixels] = useState(960);
  const [exportFailed, setExportFailed] = useState(false);
  const chart = useRef<SVGSVGElement>(null),
    sheet = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; start: View; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const view = printing ? full : prefs.view;
  const selectedPoint = focusPoint(world, props.selected);
  const prefix = useId().replace(/:/g, '');
  const chartHeight = (mapWidth * full.height) / full.width;
  const legendY = chartHeight + 104;
  const typeScale = printing ? 1 : Math.max(1, Math.min(3, 960 / sheetPixels));
  const columns = Math.max(1, Math.floor((typeScale > 1.5 ? 910 : 735) / (113 * typeScale)));
  const entries = useAtlasLegend(world, prefs.layers, !!(props.scenarioLocationIds.length || props.scenarioRouteIds.length), !!props.issues.length);
  const rows = Math.ceil(entries.length / columns);
  const sheetHeight = legendY + (typeScale > 1.5 ? 45 + 23 * rows : Math.max(40, 23 * rows)) * typeScale;
  useEffect(() => {
    if (!sheet.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setSheetPixels(width);
    });
    observer.observe(sheet.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(prefs));
    } catch {
      /* Storage can be unavailable in private profiles. */
    }
  }, [prefs, storageKey]);
  function updateView(camera: View) {
    setPrefs((p) => ({ ...p, view: camera }));
  }
  useEffect(() => {
    const element = chart.current;
    if (!element) return;
    const limits = { x: -1, y: -1, width: full.width, height: full.height };
    const wheel = (e: WheelEvent) => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      e.preventDefault();
      const factor = Math.exp(Math.max(-250, Math.min(250, e.deltaY * (e.deltaMode === 1 ? 16 : 1))) * 0.0025);
      setPrefs((p) => ({
        ...p,
        view: zoomed(
          p.view,
          limits,
          factor,
          (e.clientX - box.left) / box.width,
          (e.clientY - box.top) / box.height,
        ),
      }));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [full.width, full.height]);
  function zoomTo() {
    if (!selectedPoint) return;
    const width = full.width / 3,
      height = full.height / 3;
    updateView(
      bounded(
        { x: selectedPoint[0] + 0.5 - width / 2, y: selectedPoint[1] + 0.5 - height / 2, width, height },
        full,
      ),
    );
  }
  function exportSvg() {
    if (!sheet.current) return;
    try {
      flushSync(() => setPrinting(true));
      downloadFile(world.id + '.svg', standaloneSheet(sheet.current, full), 'image/svg+xml;charset=utf-8');
      setExportFailed(false);
    } catch {
      setExportFailed(true);
    } finally {
      setPrinting(false);
    }
  }
  return (
    <section className="atlas-map" aria-label={copy.interactive}>
      <div className="atlas-map-tools">
        <div className="atlas-zoom">
          <button
            aria-label={copy.zoomOut}
            disabled={view.width >= full.width}
            onClick={() => updateView(zoomed(view, full, 1.35))}
          >
            −
          </button>
          <output aria-label={copy.zoom}>{number(full.width / view.width, { style: 'percent' })}</output>
          <button
            aria-label={copy.zoomIn}
            disabled={view.width <= full.width / 12}
            onClick={() => updateView(zoomed(view, full, 1 / 1.35))}
          >
            +
          </button>
        </div>
        <button onClick={() => updateView(full)}>{copy.fitMap}</button>
        <button onClick={zoomTo} disabled={!selectedPoint}>
          {copy.zoomTo}
        </button>
        <details className="atlas-layer-menu" onKeyDown={e => {
          if (e.key === 'Escape') { e.currentTarget.open = false; e.currentTarget.querySelector('summary')?.focus(); }
        }}>
          <summary>{copy.layers}</summary>
          <div className="atlas-layer-groups" role="group" aria-label={copy.mapLayers}>
            {Object.entries(groups).map(([key, names]) => <fieldset key={key}>
              <legend>{copy.groups[key as keyof typeof groups]}</legend>
            {names.map((name) => (
              <label key={name}>
                <input
                  type="checkbox"
                  checked={prefs.layers[name]}
                  onChange={() =>
                    setPrefs((p) => ({
                      ...p,
                      layers: { ...p.layers, [name]: !p.layers[name] },
                    }))
                  }
                />
                {copy.layerNames[name]}
              </label>
            ))}
          </fieldset>)}</div>
        </details>
        <button className="atlas-export" onClick={exportSvg}>
          {copy.export}
        </button>
      </div>
      {exportFailed && <p role="alert">{copy.exportError}</p>}
      <svg
        className="atlas-sheet"
        ref={sheet}
        width="960"
        height={sheetHeight}
        viewBox={'0 0 960 ' + sheetHeight}
        aria-label={world.name ?? copy.world}
        xmlLang={locale}
      >
        <title>{world.name ?? copy.world}</title>
        <desc>{copy.description(number(world.seed), world.generatorVersion)}</desc>
        <defs>
          <linearGradient id={prefix + 'parchment'} x2="1" y2="1">
            <stop stopColor="#f7efd8" />
            <stop offset=".55" stopColor="#e9dfbe" />
            <stop offset="1" stopColor="#f3e8c9" />
          </linearGradient>
        </defs>
        <rect width="960" height={sheetHeight} fill={'url(#' + prefix + 'parchment)'} />
        <rect x="5" y="5" width="950" height={sheetHeight - 10} fill="none" stroke="#968c71" strokeWidth=".8" />
        <text x="24" y="43" fill="#49493c" fontFamily="Georgia, Pretendard, 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif" fontSize="29">
          {(world.name ?? copy.world).slice(0, 42)}
        </text>
        <text x="866" y="40" textAnchor="end" fill="#64634e" fontSize="13" fontFamily="system-ui,sans-serif">
          {copy.seed(number(world.seed))}
        </text>
        <Compass />
        <svg
          ref={chart}
          x="14"
          y="65"
          width={mapWidth}
          height={chartHeight}
          viewBox={viewBox(view)}
          role="group"
          tabIndex={0}
          aria-label={copy.map}
          style={{ touchAction: 'none', cursor: 'grab', userSelect: 'none' }}
          overflow="hidden"
          onKeyDown={(e) => {
            if (e.target !== e.currentTarget) return;
            if (e.key === 'Home') updateView(full);
            else if (e.key === '+' || e.key === '=') updateView(zoomed(view, full, 0.75));
            else if (e.key === '-') updateView(zoomed(view, full, 1.35));
            else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
              updateView(
                bounded(
                  {
                    ...view,
                    x:
                      view.x +
                      (Number(e.key === 'ArrowRight') - Number(e.key === 'ArrowLeft')) * view.width * 0.12,
                    y:
                      view.y +
                      (Number(e.key === 'ArrowDown') - Number(e.key === 'ArrowUp')) * view.height * 0.12,
                  },
                  full,
                ),
              );
            else return;
            e.preventDefault();
          }}
          onPointerDown={(e) => {
            if (e.button === 0) {
              suppressClick.current = false;
              drag.current = { x: e.clientX, y: e.clientY, start: view, moved: false };
            }
          }}
          onPointerMove={(e) => {
            const d = drag.current,
              box = chart.current?.getBoundingClientRect();
            if (!d || !box?.width || !box.height) return;
            const dx = e.clientX - d.x,
              dy = e.clientY - d.y;
            if (!d.moved && Math.hypot(dx, dy) < 4) return;
            if (!d.moved) chart.current?.setPointerCapture?.(e.pointerId);
            d.moved = true;
            updateView(
              bounded(
                {
                  ...d.start,
                  x: d.start.x - (dx * d.start.width) / box.width,
                  y: d.start.y - (dy * d.start.height) / box.height,
                },
                full,
              ),
            );
          }}
          onPointerUp={() => {
            suppressClick.current = !!drag.current?.moved;
            drag.current = null;
          }}
          onPointerLeave={() => {
            if (!drag.current?.moved) drag.current = null;
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onClickCapture={(e) => {
            if (suppressClick.current) {
              e.stopPropagation();
              suppressClick.current = false;
            }
          }}
        >
          <Geography world={world} {...props} layers={prefs.layers} view={view} typeScale={typeScale} />
        </svg>
        <rect
          x="14"
          y="65"
          width={mapWidth}
          height={chartHeight}
          fill="none"
          stroke="#657c70"
          strokeWidth="1.3"
          pointerEvents="none"
        />
        <Legend
          y={legendY}
          mapWidth={mapWidth}
          viewWidth={view.width}
          scale={world.settings?.kmPerCell}
          entries={entries}
          typeScale={typeScale}
          columns={columns}
          rows={rows}
        />
      </svg>
    </section>
  );
}
