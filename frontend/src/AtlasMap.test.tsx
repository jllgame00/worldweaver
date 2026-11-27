import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import AtlasMap from './AtlasMap';
import type { World } from './project.generated';
import { terrain } from './atlasTerrain';
import { outline } from './atlasGeometry';
import * as workflow from './scenarioWorkflow';

test('an oversized or ragged imported grid remains available for inspection without drawing it', () => {
  const {rerender}=render(<AtlasMap {...props} world={{...world,tiles:['p'.repeat(129)]}}/>);
  expect(Boolean(screen.queryByRole('group',{name:'Atlas map'}))).toBe(false);
  expect(screen.getByText(/128 × 128/)).toBeVisible();
  rerender(<AtlasMap {...props} world={{...world,tiles:['ppp','pp']}}/>);
  expect(Boolean(screen.queryByRole('group',{name:'Atlas map'}))).toBe(false);
});

const world: World = {
  id: 'world-bay',
  seed: 42,
  generatorVersion: 'atlas-v1',
  tiles: ['~~~~~~', '~mfpl~', '~pppd~', '~~~~~~'],
  locations: [
    { id: 'loc-elm', name: 'Elm Port', kind: 'port', preference: 'any-land', position: [1, 2] },
    { id: 'loc-ash', name: 'Ash Hall', kind: 'city', preference: 'any-land', position: [3, 2] },
  ],
  features: [
    {
      id: 'river-elm',
      name: 'Elm River',
      kind: 'river',
      cells: [
        [2, 1],
        [2, 2],
        [2, 3],
      ],
    },
  ],
  regions: [
    {
      id: 'region-elm',
      name: 'Elm Vale',
      cells: [
        [1, 2],
        [2, 2],
        [3, 2],
      ],
    },
  ],
  routes: [
    {
      id: 'route-elm',
      from: 'loc-elm',
      to: 'loc-ash',
      mode: 'road',
      path: [
        [1, 2],
        [2, 2],
        [3, 2],
      ],
    },
  ],
};
const props = {
  world,
  selected: 'loc-elm',
  onSelect: vi.fn(),
  issues: [],
  scenarioLocationIds: ['loc-elm'],
  scenarioRouteIds: ['route-elm'],
};
beforeEach(() => localStorage.clear());

test('the atlas exposes the actual terrain, journeys, and selectable geography', () => {
  const { container } = render(<AtlasMap {...props} />);
  const chart = screen.getByRole('group', { name: 'Atlas map' });
  const road = within(chart).getByRole('button', { name: /Elm Port.*Ash Hall/ });
  fireEvent.click(road);
  expect(props.onSelect).toHaveBeenCalledWith('route-elm');
  expect(within(chart).getByRole('button', { name: 'Elm Port' })).toHaveAttribute('aria-pressed', 'true');
  expect(within(chart).getByRole('button', { name: 'Elm River' })).toBeInTheDocument();
  expect(container.querySelector('[data-terrain="m"]')).toHaveAttribute('d');
  expect(container.querySelector('[data-layer="scenario"]')).toBeInTheDocument();
  expect(container.querySelector('[data-layer="legend"]')).toHaveTextContent('Road');
});

test('fit, selection zoom, and project-scoped layers survive reopening without mutating the world', () => {
  const original = JSON.stringify(world);
  const view = render(<AtlasMap {...props} projectId="first" />);
  const chart = screen.getByRole('group', { name: 'Atlas map' });
  const fullExtent = chart.getAttribute('viewBox');
  fireEvent.click(screen.getByRole('button', { name: 'Zoom to selection' }));
  expect(chart.getAttribute('viewBox')).not.toEqual(fullExtent);
  fireEvent.click(screen.getByRole('button', { name: 'Fit map' }));
  expect(chart.getAttribute('viewBox')).toEqual(fullExtent);
  fireEvent.click(screen.getByLabelText('Routes'));
  expect(view.container.querySelector('[data-layer="routes"]')).toBeNull();
  view.unmount();
  const next = render(<AtlasMap {...props} projectId="first" />);
  expect(screen.getByLabelText('Routes')).not.toBeChecked();
  next.rerender(<AtlasMap {...props} projectId="second" />);
  expect(screen.getByLabelText('Routes')).toBeChecked();
  expect(JSON.stringify(world)).toEqual(original);
});

test('exports the full extent, escape-safe names, actual layers, compass, and calibrated scale after zoom', () => {
  const text = '<North & South>';
  const settings = {
    size: 'small',
    kmPerCell: 6,
    land: 54,
    ruggedness: 2,
    climate: 'temperate',
    settlements: 1,
    roads: 1,
    politics: 1,
  } as const;
  const download = vi.spyOn(workflow, 'downloadFile').mockImplementation(() => {});
  try {
    render(<AtlasMap {...props} world={{ ...world, name: text, settings }} />);
    const chart = screen.getByRole('group', { name: 'Atlas map' });
    const full = chart.getAttribute('viewBox');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    const zoomed = chart.getAttribute('viewBox');
    fireEvent.click(screen.getByRole('button', { name: 'Export SVG' }));
    expect(chart.getAttribute('viewBox')).toBe(zoomed);
    const [filename, svg, mime] = download.mock.calls[0]!;
    expect(filename).toBe('world-bay.svg');
    expect(mime).toContain('image/svg+xml');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(doc.querySelector('title')?.textContent).toBe(text);
    expect(doc.querySelector('[data-full-extent]')?.getAttribute('data-full-extent')).toEqual(full);
    expect(doc.querySelector('[data-full-extent]')?.getAttribute('transform')).toBe(
      'translate(14 65) scale(116.5) translate(1 1)',
    );
    expect(doc.querySelector('svg svg')).toBeNull();
    expect(doc.querySelector('[data-terrain="m"]')?.getAttribute('fill')).toBeTruthy();
    expect(doc.querySelector('[aria-label="North compass"]')).toBeTruthy();
    expect(doc.querySelector('[data-scale]')?.textContent).toContain('6 km');
    expect(doc.querySelector('[data-layer="legend"]')?.textContent).toContain('Road');
    expect(doc.querySelector('script,foreignObject,link')).toBeNull();
  } finally {
    download.mockRestore();
  }
});

test('cell outlines keep diagonally touching islands apart and include inland holes', () => {
  expect(
    outline([
      [0, 0],
      [1, 1],
    ]).match(/Z/g),
  ).toHaveLength(2);
  expect(
    outline([
      [0, 0],
      [1, 0],
      [2, 0],
      [0, 1],
      [2, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ]).match(/Z/g),
  ).toHaveLength(2);
  expect(
    outline([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]).match(/Q/g),
  ).toHaveLength(4);
});

test('biomes show an authored regional climate exception with its own rule and location', () => {
  const region = {
    ...world.regions[0]!,
    climateException: { biome: 'Ember tundra', rule: 'Warm springs keep this valley thawed.' },
  };
  const { container } = render(<AtlasMap {...props} world={{ ...world, regions: [region] }} />);
  const exception = container.querySelector('[data-climate-exception="region-elm"]');
  expect(exception).toHaveTextContent('Ember tundra');
  expect(exception).toHaveTextContent('Warm springs keep this valley thawed.');
  expect(exception?.querySelector('path')?.getAttribute('d')).toEqual(
    container.querySelector('[data-entity="region-elm"]')?.getAttribute('d'),
  );
  fireEvent.click(screen.getByLabelText('Biomes'));
  expect(container.querySelector('[data-climate-exception]')).toBeNull();
});

test('cursor-centered wheel zoom and a drag preserve the pointed-at geography', () => {
  render(<AtlasMap {...props} />);
  const chart = screen.getByRole('group', { name: 'Atlas map' });
  vi.spyOn(chart, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 800, 600));
  const camera = () => chart.getAttribute('viewBox')!.split(' ').map(Number);
  fireEvent.wheel(chart, { clientX: 610, clientY: 170, deltaY: -120 });
  const [x, y, w, h] = camera();
  expect(x! + 0.75 * w!).toBeCloseTo(5);
  expect(y! + 0.25 * h!).toBeCloseTo(0.5);
  expect(w).toBeLessThan(8);
  fireEvent.pointerDown(chart, { button: 0, clientX: 400, clientY: 300, pointerId: 1 });
  fireEvent.pointerMove(chart, { buttons: 1, clientX: 480, clientY: 360, pointerId: 1 });
  fireEvent.pointerUp(chart, { button: 0, clientX: 480, clientY: 360, pointerId: 1 });
  const panned = camera();
  expect(panned[0]).toBeCloseTo(x! - 0.1 * w!);
  expect(panned[1]).toBeLessThan(y!);
  expect(panned[2]).toBe(w);
});

test('an underground site shares the surface coordinate and has its own visible symbol and depth', () => {
  const locations: World['locations'] = [
    ...world.locations,
    {
      id: 'vault',
      name: 'Submerged vault',
      kind: 'dungeon',
      preference: 'any-land',
      position: [1, 2],
      level: -2,
    },
  ];
  const { container } = render(<AtlasMap {...props} world={{ ...world, locations }} />);
  const vault = container.querySelector('[data-entity="vault"]');
  expect(vault?.querySelector('[data-depth]')).toHaveTextContent('−2');
  expect(vault?.querySelector('g')?.getAttribute('transform')).not.toBe(
    container.querySelector('[data-entity="loc-elm"] g')?.getAttribute('transform'),
  );
});

test('a narrow map keeps text at reading size and reduces label density', () => {
  let resize: ((entries: { contentRect: { width: number } }[]) => void) | undefined;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: typeof resize) {
        resize = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
  const { container } = render(<AtlasMap {...props} />);
  const firstScale = () =>
    Number(
      container
        .querySelector('[data-layer="labels"] g')
        ?.getAttribute('transform')
        ?.match(/scale\(([^)]+)\)/)?.[1],
    );
  const desktop = firstScale();
  act(() => resize?.([{ contentRect: { width: 384 } }]));
  expect(firstScale()).toBeGreaterThan(desktop * 2);
});

test('standard physical geography is batched into vector paths at the public renderer', () => {
  const settings = {
    size: 'standard',
    kmPerCell: 5,
    land: 55,
    ruggedness: 2,
    climate: 'temperate',
    settlements: 1,
    roads: 1,
    politics: 1,
  } as const;
  const geography = terrain(37, settings);
  expect(geography.tiles).toHaveLength(48);
  const { container } = render(<AtlasMap {...props} world={{ ...world, ...geography, settings }} />);
  const sheet = container.querySelector('svg')!;
  const cells = geography.tiles.join('').length;
  const elements = sheet.querySelectorAll('*').length;
  const bytes = new TextEncoder().encode(sheet.outerHTML).length;
  console.info('Atlas renderer metrics', { seed: 37, cells, elements, bytes });
  expect(sheet.querySelector('[data-layer="relief"] path')).toHaveAttribute('d');
  expect(elements).toBeLessThan(cells / 4);
  expect(bytes).toBeLessThan(1024 * 1024);
});
