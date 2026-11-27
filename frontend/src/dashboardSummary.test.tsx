import { render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import example from '../public/examples/salt-census.json';
import Dashboard from './Dashboard';
import { localePreferenceKey } from './locale';
import { importProject } from './scenarioWorkflow';
import { placeLabels } from './atlasGeometry';
import { titleLines } from './scenarioGraph';
import type { Project } from './project.generated';

afterEach(() => localStorage.removeItem(localePreferenceKey));

const saved = () => importProject(JSON.stringify(example));
function dashboard(project?: Project) {
  return <Dashboard projects={project ? [{project, token:'test', savedAt:100}] : []}
    loading={false} disabled={false} open={vi.fn()} create={vi.fn()} openExample={vi.fn()}/>;
}
function value(label: string) { return screen.getByText(label, {selector:'dt'}).nextElementSibling?.textContent; }

it('distinguishes scenario declarations, unique canonical places and actual atlas placements', () => {
  const p = saved();
  const place = p.world!.locations[0]!;
  p.world!.locations.push({...place, id:'unplaced', position:undefined, area:undefined});
  p.world!.placements![0]!.position = undefined;
  p.world!.placements![0]!.area = [[13,12]];
  localStorage.setItem(localePreferenceKey,'en');
  const before = JSON.stringify(p);
  render(dashboard(p));
  expect(value('Scenario locations')).toBe('1');
  expect(value('World locations')).toBe('8');
  expect(value('Placed on atlas')).toBe('7');
  expect(screen.getByRole('img',{name:'Saved terrain · Salt Census'})).toHaveAttribute('viewBox','0 0 72 48');
  expect(JSON.stringify(p)).toBe(before);
});

it('shows declared places and an explicit empty atlas while the example remains secondary', () => {
  const p = saved();
  delete p.world;
  localStorage.setItem(localePreferenceKey,'ko');
  render(dashboard(p));
  const library = screen.getByRole('region',{name:'내 프로젝트'});
  expect(within(library).getByText('저장된 지도 없음')).toBeVisible();
  expect(value('시나리오 장소')).toBe('1');
  expect(screen.queryByText('지도 배치 장소')).toBeNull();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('예제 프로젝트')).toBeVisible();
  expect(screen.getByRole('button',{name:'작업용 사본 만들기'})).toBeEnabled();
});

it('keeps stored terrain visible across a source revision change and reports its approval separately', () => {
  const p = saved();
  localStorage.setItem(localePreferenceKey,'en');
  const {rerender} = render(dashboard(p));
  expect(value('Atlas')).toBe('Approved');
  p.world!.approved = false;
  rerender(dashboard({...p}));
  expect(value('Atlas')).toBe('Saved draft');
  p.versions.scenario++;
  rerender(dashboard({...p}));
  expect(value('Atlas')).toBe('Source changed');
  expect(value('Placed on atlas')).toBe('7');
});

it('gives a long Korean place a readable abbreviated label inside a narrow map without changing its name', () => {
  const name = '무너진 수문 아래의 잃어버린 증인들을 위한 지하 기록 보관소';
  const label = {id:'vault', text:name, kind:'place' as const, point:[6,4] as [number,number]};
  const placed = placeLabels([label], {x:0,y:0,width:12,height:8}, 1, 'vault');
  expect(placed[0]?.text).toMatch(/^무너진.*…$/);
  expect(label.text).toBe(name);
});

it('retains a complete Unicode character when abbreviating a Korean graph title on its second line', () => {
  const lines = titleLines('물'.repeat(11)+'달'.repeat(10)+'🌙의 증언');
  expect(lines).toHaveLength(2);
  expect(lines[1]).toMatch(/…$/);
  expect(lines[1]).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
});

it('shows the example map to first-time designers and keeps the full Korean project name on returning', () => {
  localStorage.setItem(localePreferenceKey,'ko');
  const {rerender} = render(dashboard());
  expect(screen.getByRole('img',{name:/Salt Census/})).toBeVisible();
  const p = saved();
  p.title = '기억을 잃어버린 증인들의 지하 기록 보관소 🌙';
  rerender(dashboard(p));
  expect(screen.getByRole('heading',{name:p.title})).toBeVisible();
  expect(screen.getByRole('button',{name:p.title+' 열기'})).toBeEnabled();
  expect(screen.getAllByRole('img')).toHaveLength(1);
  expect(screen.getByRole('img',{name:'저장된 지형 · '+p.title})).toBeVisible();
});

it('distinguishes an empty terrain payload with saved atlas settings from a project without an atlas', () => {
  const p = saved();
  p.world!.tiles = [];
  localStorage.setItem(localePreferenceKey,'en');
  render(dashboard(p));
  expect(value('Atlas')).toBe('Terrain unavailable');
  expect(screen.queryByRole('img')).toBeNull();
});

it('asks for review when narrative approval changes without a source revision change', () => {
  const p = saved();
  p.narrative!.approved = false;
  localStorage.setItem(localePreferenceKey,'en');
  render(dashboard(p));
  expect(value('Atlas')).toBe('Needs review');
  expect(value('Scenario')).toBe('Needs review');
});
