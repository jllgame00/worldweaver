import { useEnglishTestLocale } from './englishTestLocale';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import Content from './Content';
import { citationOffset, organizeSource } from './intakeModel';
import { createProject } from './project';

test('local extraction preserves unknown lines and honors explicit category and exclusion markers', () => {
  const source = '\n# Open Questions\n';
  expect(organizeSource(source)[0]?.category).toBeNull();
  const classified = organizeSource([
    '# Locations', '- East Gate', 'Other notes:', '* Preserve me.', '[인물] 해온',
    '제외:', '- 예언', 'Exclude: Item: Brass key', '필수: 제약: No resurrection',
  ].join('\n'));
  expect(classified.map(({ category, treatment, text, selected }) => [category, treatment, text, selected])).toEqual([
    ['location', 'optional', 'East Gate', false],
    [null, 'optional', 'Other notes:', false],
    [null, 'optional', '* Preserve me.', false],
    ['character', 'optional', '해온', false],
    ['idea', 'excluded', '예언', false],
    ['item', 'excluded', 'Brass key', false],
    ['constraint', 'mandatory', 'No resurrection', false],
  ]);
  expect(citationOffset('aaaaa', { quote: 'aa', occurrence: 2 })).toBe(2);
  expect(citationOffset('aaaaa', { quote: 'aa', occurrence: 3 })).toBe(-1);
});

test('review highlights the second identical quotation and counts each explicit operation once', async () => {
  const project = createProject('Intake receipt fixture');
  const source = '🌙 첫 번째: 물은 기억한다.\n두 번째: 물은 기억한다.\n';
  const fetch = vi.fn(async () => Response.json({
    projectId: project.id, baseRevision: project.revision,
    fragments: [{ category: 'theme', treatment: 'optional', text: 'A memory motif',
      evidence: { quote: '물은 기억한다.', occurrence: 2 } }],
    operation: { id: 'intake-server', mode: 'live', dispatches: 1, responses: 1 },
  }));
  vi.stubGlobal('fetch', fetch);
  const commit = vi.fn(async () => true);
  render(<Content project={project} disabled={false} commit={commit}
    configuration={{ provider: 'chatkhu', api: 'responses', model: 'fixture', mode: 'live', available: true,
      contentExtractionMaxOutputTokens: 320 }} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('tab', { name: 'Paste ideas' }));
  await user.click(screen.getByRole('textbox', { name: 'Original input' }));
  await user.paste(source);
  await user.click(screen.getByRole('button', { name: 'Suggest with AI' }));
  expect(fetch).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Authorize one extraction' }));

  const review = within(await screen.findByRole('region', { name: 'Review draft fragments' }));
  await user.click(review.getByText('Source evidence · occurrence 2'));
  expect(review.getByRole('mark').previousSibling?.textContent).toContain('두 번째: ');
  await user.click(screen.getByRole('tab', { name: 'Edit fragments' }));
  await user.click(screen.getByRole('tab', { name: 'Paste ideas' }));
  expect(screen.getByRole('textbox', { name: 'Original input' })).toHaveValue(source);
  await user.click(review.getByRole('button', { name: 'Reject draft' }));
  const history = within(screen.getByRole('region', { name: 'Intake history' }));
  expect(history.getAllByRole('listitem')).toHaveLength(2);
  expect(history.getByText(/dispatches: 1.*responses: 1/i)).toBeVisible();
  expect(history.getByText(/live ai extraction.*draft rejected/i)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(commit).not.toHaveBeenCalled();
});

useEnglishTestLocale();
