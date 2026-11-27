import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import Operations from './Operations';
import { useEnglishTestLocale } from './englishTestLocale';

useEnglishTestLocale();

it('shows the immutable commit returned by the checked service', async () => {
  const commit = 'ab'.repeat(20);
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({status: 'ok', commit})));
  render(<Operations databaseName="public-demo"/>);
  fireEvent.click(screen.getByRole('button', {name: 'Check service health'}));
  expect(await screen.findByText(commit)).toBeVisible();
});
