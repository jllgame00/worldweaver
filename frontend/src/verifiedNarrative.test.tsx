import { useEnglishTestLocale } from './englishTestLocale';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Narrative from './Narrative';
import { approvedProject } from './atlasFixture.testdata';

it('reflects a repaired narrative and protects unsaved text from overwriting a newer repair', () => {
  const p = approvedProject();
  const view = (premise: string) => (
    <Narrative
      project={p}
      narrative={{ ...p.narrative!, story: { ...p.narrative!.story, premise } }}
      disabled={false}
      inspect={vi.fn()}
      commit={vi.fn()}
    />
  );
  const app = render(view('Original'));
  app.rerender(view('Accepted correction'));
  expect(screen.getByLabelText('Premise')).toHaveValue('Accepted correction');
  fireEvent.change(screen.getByLabelText('Premise'), { target: { value: 'Unsaved owner text' } });
  app.rerender(view('Newer correction'));
  expect(screen.getByLabelText('Premise')).toHaveValue('Unsaved owner text');
  expect(screen.getByRole('button', { name: 'Save narrative edits' })).toBeDisabled();
});

useEnglishTestLocale();
