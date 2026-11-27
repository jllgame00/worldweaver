import { useEnglishTestLocale } from './englishTestLocale';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { approvedProject } from './atlasFixture.testdata';
import { WorldBible } from './WorldBible';
import { buildWorldBible, dependencyImpact } from './worldBibleIndex';
import { changeBibleRecord, deleteProtected } from './worldBibleEdits';
import { isProject } from './validation';
import { atlasPlaces } from './atlasPlaces';
import Content from './Content';

function fixture() {
  const p = approvedProject();
  p.stateEntities = [{ id: 'item-seal', name: 'Ward seal', kind: 'item' }];
  p.quests[0]!.completion = [{ kind: 'item', key: 'item-seal', value: 'held' }];
  p.edges[3]!.conditions = [{ kind: 'quest', key: p.quests[0]!.id, value: 'complete' }];
  p.world!.placements = [{ locationId: 'vault', label: 'Cartographic vault' }];
  return p;
}

it('derives canonical item, quest, choice and ending dependencies without storing an inverse or guessing prose', () => {
  const p = fixture();
  p.nodes[0]!.description = 'Ward seal';
  const before = JSON.stringify(p);
  const index = buildWorldBible(p);
  expect(index.entities.get('vault')?.label).toBe('Cartographic vault');
  const impact = dependencyImpact(index, 'item-seal');
  expect(impact.direct).toEqual(['q-rubbing']);
  expect(impact.transitive).toEqual(expect.arrayContaining(['e-4', 'n-public', 'end-public']));
  expect(impact.transitive).not.toContain('n-start');
  expect(JSON.stringify(p)).toBe(before);
});

function mount(id: string) {
  const project = fixture(),
    commit = vi.fn(async () => true),
    review = vi.fn(),
    navigate = vi.fn();
  const current = vi.fn(() => project);
  render(<WorldBible {...{ project, commit, current, review, navigate }} selectedId={id} disabled={false} />);
  return { project, current, commit, review, navigate };
}

it('exposes a keyboard list of stored relationships, source navigation and a scoped review', () => {
  const { review, navigate } = mount('item-seal');
  const list = screen.getByRole('list', { name: 'Related records' });
  fireEvent.click(within(list).getByRole('button', { name: /Take a rubbing/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Open in Scenario Studio' }));
  expect(navigate).toHaveBeenCalledWith('scenario', 'q-rubbing');
  fireEvent.click(screen.getByRole('button', { name: 'Review this record' }));
  expect(review).toHaveBeenCalledWith('q-rubbing');
});

it('protects referenced entities and previews before accepting an edit against the current revision', () => {
  const { project, current, commit } = mount('item-seal');
  expect(screen.getByRole('button', { name: 'Delete record' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Edit record' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Royal seal' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview change' }));
  expect(screen.getByRole('heading', { name: 'Change impact' })).toBeVisible();
  expect(screen.getByText('Royal seal')).toBeVisible();
  expect(commit).not.toHaveBeenCalled();
  current.mockReturnValue({ ...project, revision: project.revision + 1 });
  fireEvent.click(screen.getByRole('button', { name: 'Apply change' }));
  expect(commit).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(/changed/i);
});

it('requires explicit direct fact editing and preserves locked identity and revision history', () => {
  const firstFact = fixture().canonicalFacts[0]!;
  const { project, commit } = mount(firstFact.id);
  expect(screen.queryByRole('button', { name: 'Edit record' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit locked fact' }));
  fireEvent.change(screen.getByLabelText('Statement'), { target: { value: 'Amended by the designer.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Preview change' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply fact edit' }));
  expect(commit).toHaveBeenCalledOnce();
  const next = commit.mock.calls[0] as unknown as [typeof project];
  expect(next[0].canonicalFacts[0]).toEqual({ ...firstFact, statement: 'Amended by the designer.' });
  expect(next[0].versions.content).toBe(project.versions.content + 1);
  expect(project.canonicalFacts[0]).toEqual(firstFact);
});

it('traces the chapter and owner node of an affected quest while leaving an unrelated chapter alone', () => {
  const p = fixture();
  p.scenario!.chapters.push({
    id: 'different-chapter',
    title: 'Another chapter',
    purpose: 'Elsewhere',
    summary: 'Unrelated',
  });
  const index = buildWorldBible(p),
    impact = dependencyImpact(index, 'item-seal');
  expect(impact.transitive).toContain('n-witness');
  expect(impact.transitive).toContain('ch-water');
  expect(impact.transitive).not.toContain('different-chapter');
  expect(deleteProtected(p, index, 'q-rubbing')).toBe(true);
});

it('preserves the authored dependency domain even when a legacy state key collides with a character ID', () => {
  const p = fixture();
  delete p.stateEntities;
  p.nodes[0]!.conditions = [{ kind: 'item', key: p.characters[0]!.id, value: 'held' }];
  p.nodes[0]!.characterIds = [];
  expect(isProject(p)).toBe(true);
  const index = buildWorldBible(p);
  expect(index.links).not.toContainEqual({
    from: p.nodes[0]!.id,
    to: p.characters[0]!.id,
    kind: 'Condition',
    stored: true,
  });
});

it('renames a scenario-owned place once while preserving its atlas position and distinct editorial overrides', () => {
  const p = fixture();
  p.world!.placements![0]!.position = [3, 2];
  const next = changeBibleRecord(p, 'vault', {
    name: 'Witness archive',
    description: '증거 보관',
    factionId: '',
  });
  expect(isProject(next)).toBe(true);
  expect(next.scenario!.locations[0]!.name).toBe('Witness archive');
  expect(atlasPlaces(next).find((l) => l.id === 'vault')).toMatchObject({
    name: 'Witness archive',
    position: [3, 2],
  });
  expect(next.world!.placements![0]).not.toHaveProperty('label');
  expect(next.scenario!.approved).toBe(false);
  expect(p.world!.placements![0]!.label).toBe('Cartographic vault');
});

it('guards facts and referenced deletion at the mutation boundary, and allows an unused registry edit', () => {
  const p = fixture(),
    values = { name: 'Owner statement', description: '', factionId: '' };
  expect(() => changeBibleRecord(p, p.canonicalFacts[0]!.id, values)).toThrow(/direct fact editor/);
  expect(() => changeBibleRecord(p, 'item-seal', null)).toThrow(/relinked/);
  p.stateEntities!.push({ id: 'unused', kind: 'flag', name: 'Unused flag' });
  const next = changeBibleRecord(p, 'unused', null);
  expect(isProject(next)).toBe(true);
  expect(next.stateEntities).toEqual(p.stateEntities!.filter((e) => e.id !== 'unused'));
  expect(next.versions.scenario).toBe(p.versions.scenario + 1);
  expect(next.world).toEqual(p.world);
});

it('previews a source studio fact change and blocks removal of facts still cited by the scenario', () => {
  const project = fixture(),
    commit = vi.fn(async () => true);
  render(<Content project={project} commit={commit} disabled={false} />);
  const fact = project.canonicalFacts[0]!;
  const row = screen.getByText(fact.statement).closest('li')!;
  fireEvent.click(within(row).getByRole('button', { name: /remove/i }));
  expect(within(row).getByRole('alert')).toHaveTextContent(/relinked/i);
  fireEvent.click(within(row).getByRole('button', { name: /cancel/i }));
  fireEvent.click(within(row).getByRole('button', { name: /edit/i }));
  const form = screen.getByRole('form', { name: /edit/i });
  fireEvent.change(within(form).getByRole('textbox'), { target: { value: 'Explicit owner revision.' } });
  fireEvent.click(within(form).getByRole('button', { name: /save/i }));
  expect(commit).not.toHaveBeenCalled();
  const preview = screen.getByRole('region', { name: 'Change impact' });
  expect(within(preview).getByText('Explicit owner revision.')).toBeVisible();
  fireEvent.click(within(preview).getByRole('button', { name: 'Apply fact edit' }));
  expect(commit).toHaveBeenCalledOnce();
});

it('searches and filters canon, pans and fits a neighborhood without a design write', () => {
  const { commit } = mount('ch-iven');
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Gauge' } });
  fireEvent.change(screen.getByLabelText('Record type'), { target: { value: 'location' } });
  expect(within(screen.getByRole('list', { name: 'Records' })).getAllByRole('button')).toHaveLength(1);
  fireEvent.change(screen.getByLabelText('Related record type'), { target: { value: 'faction' } });
  const related = screen.getByRole('list', { name: 'Related records' });
  expect(within(related).getAllByRole('button')).toHaveLength(1);
  const svg = screen.getByRole('region', { name: 'Relationship graph' }).querySelector('svg')!;
  const fit = svg.getAttribute('viewBox');
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  const zoomed = svg.getAttribute('viewBox');
  expect(zoomed).not.toBe(fit);
  fireEvent.click(screen.getByRole('button', { name: 'Pan left' }));
  expect(svg.getAttribute('viewBox')).not.toBe(zoomed);
  fireEvent.click(screen.getByRole('button', { name: 'Fit graph' }));
  expect(svg.getAttribute('viewBox')).toBe(fit);
  expect(commit).not.toHaveBeenCalled();
});

useEnglishTestLocale();
