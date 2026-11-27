import type { Point, World } from './project.generated';

export interface View {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const viewBox = (v: View) => [v.x, v.y, v.width, v.height].join(' ');
export const line = (cells: Point[]) =>
  cells.map(([x, y], i) => (i ? 'L' : 'M') + (x + 0.5) + ' ' + (y + 0.5)).join('');

// Keep the mapped course inside its recorded cells while softening grid-aligned bends.
function riverLine(cells: Point[]) {
  const points = cells.map(([x, y], i): Point => [
    x + 0.5 + (i && i < cells.length - 1 ? 0.13 * Math.sin(x * 0.8 + y * 0.91) : 0),
    y + 0.5 + (i && i < cells.length - 1 ? 0.13 * Math.cos(x * 0.72 - y * 0.89) : 0),
  ]);
  if (!points.length) return '';
  const fmt = (v: number) => +v.toFixed(2);
  let d = 'M' + points[0]![0] + ' ' + points[0]![1];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i]!,
      b = points[i + 1]!;
    d += 'Q' + fmt(a[0]) + ' ' + fmt(a[1]) + ' ' + fmt((a[0] + b[0]) / 2) + ' ' + fmt((a[1] + b[1]) / 2);
  }
  const last = points[points.length - 1]!;
  return d + 'L' + last[0] + ' ' + last[1];
}

// Trace exposed cell edges only. Clockwise turns keep diagonally touching islands separate.
export function outline(cells: Point[]): string {
  if (!cells.length) return '';
  let stride = 3;
  for (const [x] of cells) stride = Math.max(stride, x + 3);
  const ids = new Set(cells.map(([x, y]) => (y + 1) * stride + x + 1));
  const edges = new Map<number, number[]>();
  function edge(a: number, b: number) {
    const list = edges.get(a);
    if (list) list.push(b);
    else edges.set(a, [b]);
  }
  for (const id of ids) {
    if (!ids.has(id - stride)) edge(id, id + 1);
    if (!ids.has(id + 1)) edge(id + 1, id + stride + 1);
    if (!ids.has(id + stride)) edge(id + stride + 1, id + stride);
    if (!ids.has(id - 1)) edge(id + stride, id);
  }
  const parts: string[] = [];
  while (edges.size) {
    const start = edges.keys().next().value!;
    let current = start,
      previous = start;
    const loop: number[] = [];
    do {
      const next = edges.get(current)!;
      const direction = current - previous;
      const right = direction === 1 ? stride : direction === stride ? -1 : direction === -1 ? -stride : 1;
      const index = Math.max(0, next.indexOf(current + right));
      const destination = next.splice(index, 1)[0]!;
      if (!next.length) edges.delete(current);
      loop.push(current);
      previous = current;
      current = destination;
    } while (current !== start);
    const corners = loop.filter(
      (p, i) => p - loop[(i + loop.length - 1) % loop.length]! !== loop[(i + 1) % loop.length]! - p,
    );
    const point = (id: number): Point => [(id % stride) - 1, Math.floor(id / stride) - 1];
    corners.forEach((id, i) => {
      const [x, y] = point(id);
      const [ax, ay] = point(corners[(i + corners.length - 1) % corners.length]!);
      const [bx, by] = point(corners[(i + 1) % corners.length]!);
      const prior = Math.min(0.88, Math.hypot(ax - x, ay - y) * 0.48);
      const next = Math.min(0.88, Math.hypot(bx - x, by - y) * 0.48);
      parts.push(
        i ? 'L' : 'M',
        String(x + Math.sign(ax - x) * prior),
        ' ',
        String(y + Math.sign(ay - y) * prior),
        'Q',
        String(x),
        ' ',
        String(y),
        ' ',
        String(x + Math.sign(bx - x) * next),
        ' ',
        String(y + Math.sign(by - y) * next),
      );
    });
    parts.push('Z');
  }
  return parts.join('');
}

export function middle(cells: Point[]): Point | undefined {
  if (!cells.length) return;
  const sum = cells.reduce<Point>((s, [x, y]) => [s[0] + x, s[1] + y], [0, 0]);
  const cx = sum[0] / cells.length,
    cy = sum[1] / cells.length;
  const distance = ([x, y]: Point) => (x - cx) ** 2 + (y - cy) ** 2;
  return cells.reduce((a, b) => (distance(a) <= distance(b) ? a : b));
}

export function geometry(world: World) {
  const land: Point[] = [];
  const kinds = new Map<string, Point[]>();
  const high: Point[][] = [[], [], []];
  const trees: string[] = [],
    trunks: string[] = [],
    peaks: string[] = [],
    facets: string[] = [],
    hills: string[] = [];
  const elevations = world.elevation?.flat() ?? [];
  const peak = elevations.reduce((a, b) => Math.max(a, b), 0);
  world.tiles.forEach((row, y) =>
    Array.from(row).forEach((kind, x) => {
      if (kind === '~') return;
      const cell: Point = [x, y];
      if (kind !== 'l') land.push(cell);
      if (!kinds.has(kind)) kinds.set(kind, []);
      kinds.get(kind)!.push(cell);
      const meters = world.elevation?.[y]?.[x] ?? 0;
      if (peak && meters > 0)
        high.forEach((cells, i) => {
          if (meters > peak * (0.27 + 0.22 * i)) cells.push(cell);
        });
      // An ink symbol's placement and silhouette vary within its source cell.
      const h =
        Math.imul((world.seed ^ Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663)) >>> 0, 1597334677) >>>
        0;
      const cx = x + 0.2 + (0.6 * ((h >>> 8) % 101)) / 100,
        cy = y + 0.43 + (0.35 * ((h >>> 16) % 101)) / 100;
      const k = 0.64 + (0.52 * ((h >>> 23) % 101)) / 100;
      const pt = (dx: number, dy: number) => +(cx + dx * k).toFixed(2) + ' ' + +(cy + dy * k).toFixed(2);
      if (kind === 'f' && h % 100 < 48) {
        trees.push(
          'M' +
            pt(-0.29, 0.14) +
            'L' +
            pt(-0.12, -0.12) +
            ' ' +
            pt(-0.2, -0.1) +
            ' ' +
            pt(0.02, -0.53) +
            ' ' +
            pt(0.23, -0.13) +
            ' ' +
            pt(0.14, -0.14) +
            ' ' +
            pt(0.32, 0.16) +
            'Q' +
            pt(0.03, 0.28) +
            ' ' +
            pt(-0.29, 0.14) +
            'Z',
        );
        trunks.push('M' + pt(0.03, -0.08) + 'L' + pt(0.03, 0.34));
      } else if ((kind === 'm' || kind === 's') && h % 100 < 67) {
        peaks.push(
          'M' +
            pt(-0.68, 0.27) +
            'L' +
            pt(-0.29, -0.13) +
            ' ' +
            pt(-0.14, -0.1) +
            ' ' +
            pt(0.12, -0.86) +
            ' ' +
            pt(0.41, -0.26) +
            ' ' +
            pt(0.8, 0.28),
        );
        facets.push(
          'M' +
            pt(0.12, -0.86) +
            'L' +
            pt(0.025, -0.34) +
            ' ' +
            pt(0.2, -0.41) +
            ' ' +
            pt(0.26, -0.11) +
            ' ' +
            pt(0.8, 0.28) +
            ' ' +
            pt(0.41, -0.26) +
            'Z',
        );
      } else if (kind === 'h' && h % 100 < 24) {
        hills.push('M' + pt(-0.46, 0.07) + 'Q' + pt(0.02, -0.35) + ' ' + pt(0.47, 0.07));
      }
    }),
  );
  const areas = new Map<string, string>();
  const anchors = new Map<string, Point>();
  const area = (id: string, cells: Point[]) => {
    const visible = cells.filter(
      ([x, y]) =>
        Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < (world.tiles[y]?.length ?? 0),
    );
    areas.set(id, outline(visible));
    const center = middle(visible);
    if (center) anchors.set(id, center);
  };
  world.regions.forEach((r) => area(r.id, r.cells));
  world.territories?.forEach((t) =>
    area(
      t.id,
      world.regions.filter((r) => t.regionIds.includes(r.id)).flatMap((r) => r.cells),
    ),
  );
  world.features.forEach((f) => {
    if (f.kind === 'river') {
      areas.set(f.id, riverLine(f.cells));
      anchors.set(f.id, f.cells[Math.floor(f.cells.length / 2)]!);
    } else area(f.id, f.cells);
  });
  world.routes.forEach((r) => {
    areas.set(r.id, line(r.path));
    anchors.set(r.id, r.path[Math.floor(r.path.length / 2)]!);
  });
  world.locations.forEach((loc) => {
    if (loc.area?.length) area(loc.id, loc.area);
    if (loc.position) anchors.set(loc.id, loc.position);
  });
  return {
    coast: outline(land),
    biomes: Array.from(kinds, ([kind, cells]) => [kind, outline(cells)] as const),
    contours: high.map(outline),
    trees: trees.join(''),
    trunks: trunks.join(''),
    peaks: peaks.join(''),
    facets: facets.join(''),
    hills: hills.join(''),
    areas,
    anchors,
  };
}

export interface MapLabel {
  id: string;
  text: string;
  kind: 'place' | 'region' | 'territory' | 'feature';
  point: Point;
}
export function placeLabels(labels: MapLabel[], view: View, size: number, selected?: string) {
  const occupied: View[] = [];
  const result: (MapLabel & { x: number; y: number })[] = [];
  for (const item of labels) {
    const [px, py] = item.point;
    const cx = px + 0.5,
      cy = py + 0.5;
    const width = Array.from(item.text).reduce((n, c) => n + (/[^\x00-\x7f]/.test(c) ? 1 : 0.58), 0) * size;
    const height = size * 1.3;
    const offsets =
      item.kind === 'place'
        ? [
            [size * 0.8, -0.2 * size],
            [-width - 0.8 * size, -0.2 * size],
            [-width / 2, -1.05 * size],
            [-width / 2, 1.6 * size],
          ]
        : [
            [-width / 2, -0.4 * size],
            [-width / 2, size],
          ];
    for (const [dx, dy] of offsets) {
      const x = cx + dx!,
        y = cy + dy!;
      if (x + width > view.x + view.width || x < view.x || y - height < view.y || y > view.y + view.height)
        continue;
      if (
        item.id !== selected &&
        occupied.some((b) => x < b.x + b.width && x + width > b.x && y - height < b.y + b.height && y > b.y)
      )
        continue;
      occupied.push({
        x: x - 0.12 * size,
        y: y - height,
        width: width + 0.24 * size,
        height: height + 0.2 * size,
      });
      result.push({ ...item, x, y });
      break;
    }
  }
  return result;
}
