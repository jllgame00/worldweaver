import { expect, test } from 'vitest';
import { isGenerationStatus } from './validation';

test('a malformed semantic output cap cannot be used to authorize a live review', () => {
  const config = { available: true, mode: 'live', provider: 'chatkhu', api: 'responses', model: 'reviewer' };
  expect(isGenerationStatus({ ...config, semanticMaxOutputTokens: 1601 })).toBe(false);
  expect(isGenerationStatus({ ...config, semanticMaxOutputTokens: 128 })).toBe(true);
});
