import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AtlasStudio from './AtlasStudio';
import { approvedProject } from './atlasFixture.testdata';
import { acceptAtlas, defaults, generateAtlas } from './atlasWorkflow';
import { LanguageSelector, LocaleProvider, localePreferenceKey } from './locale';
import * as workflow from './scenarioWorkflow';

test('a new scenario link selects its place in an already mounted atlas', async () => {
  const source = approvedProject();
  const world = await generateAtlas(source, 'Estuary', 1234, defaults, []);
  const project = acceptAtlas(source, world, source.revision, true);
  const props = { project, openScenario: vi.fn(), disabled: false, commit: vi.fn(), current: () => project, databaseName: 'atlas-context' };
  const first = world.locations[0]!, second = world.locations[1]!;
  const renderAtlas = (selectedId: string) => <LocaleProvider><AtlasStudio {...props} selectedId={selectedId} /></LocaleProvider>;
  const app = render(renderAtlas(first.id));
  expect(await screen.findByRole('heading', {name: first.name})).toBeVisible();
  app.rerender(renderAtlas(second.id));
  expect(screen.getByRole('heading', {name: second.name})).toBeVisible();
  expect(props.commit).not.toHaveBeenCalled();
});

test('switches Atlas copy and presentation exports with the editor and viewport still mounted', async () => {
  localStorage.removeItem(localePreferenceKey);
  const source = approvedProject();
  const world = await generateAtlas(source, '두 하구 · Estuary', 1234, defaults, []);
  const project = acceptAtlas(source, world, source.revision, true);
  const before = JSON.stringify(project);
  const commit = vi.fn(async () => true);
  const download = vi.spyOn(workflow, 'downloadFile').mockImplementation(() => {});
  try {
    render(
      <LocaleProvider>
        <LanguageSelector />
        <AtlasStudio
          project={project}
          selectedId="vault"
          openScenario={() => {}}
          disabled={false}
          commit={commit}
          current={() => project}
          databaseName="atlas-locale"
        />
      </LocaleProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: '장소 저장' })).toBeEnabled());
    const editor = within(screen.getByRole('region', { name: '지도 상세 정보' }));
    const input = editor.getByRole('textbox', { name: '장소 이름' });
    fireEvent.change(input, { target: { value: '미저장 · Draft' } });
    expect(editor.getByRole('combobox', { name: '장소 유형' })).toHaveValue('dungeon');
    fireEvent.click(screen.getByRole('button', { name: '확대' }));
    const chart = screen.getByRole('group', { name: '지도' });
    const view = chart.getAttribute('viewBox');
    fireEvent.click(screen.getByText('레이어'));
    const layer = screen.getByLabelText('경로', { selector: 'input' });
    fireEvent.click(layer);
    expect(layer).not.toBeChecked();

    fireEvent.change(screen.getByRole('combobox', { name: '인터페이스 언어' }), { target: { value: 'en' } });
    expect(screen.getByRole('heading', { name: 'World Atlas' })).toBeVisible();
    expect(screen.getByRole('group', { name: 'Atlas map' })).toBe(chart);
    expect(chart.getAttribute('viewBox')).toBe(view);
    expect(screen.getByLabelText('Routes', { selector: 'input' })).toBe(layer);
    expect(layer).not.toBeChecked();
    expect(editor.getByRole('textbox', { name: 'Location name' })).toBe(input);
    expect(input).toHaveValue('미저장 · Draft');
    expect(editor.getByRole('combobox', { name: 'Location type' })).toHaveValue('dungeon');
    fireEvent.change(screen.getByRole('combobox', { name: 'Interface language' }), { target: { value: 'ko' } });

    fireEvent.click(screen.getByRole('button', { name: 'SVG 내보내기' }));
    const svg = new DOMParser().parseFromString(download.mock.calls[0]![1], 'image/svg+xml');
    expect(svg.querySelector('parsererror')).toBeNull();
    expect(svg.documentElement.getAttribute('xml:lang')).toBe('ko');
    expect(svg.querySelector('title')?.textContent).toBe('두 하구 · Estuary');
    expect(svg.querySelector('[aria-label="북쪽 나침반"]')).toBeTruthy();
    expect(svg.querySelector('[data-layer="legend"]')?.textContent).toContain('삼림');
    expect(chart.getAttribute('viewBox')).toBe(view);

    fireEvent.click(screen.getByRole('button', { name: '지도 Markdown 내보내기' }));
    const markdown = download.mock.calls[1]![1];
    expect(markdown).toContain('## 지형과 물길');
    expect(markdown).toContain('지하 기록실 (vault, 던전)');
    expect(JSON.stringify(project)).toBe(before);
    expect(commit).not.toHaveBeenCalled();
  } finally {
    download.mockRestore();
  }
});
