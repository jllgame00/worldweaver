import { afterEach, beforeEach } from 'vitest';
import { localePreferenceKey } from './locale';

/** Legacy suites whose accessible names deliberately exercise the English dictionaries. */
export function useEnglishTestLocale() {
  beforeEach(() => localStorage.setItem(localePreferenceKey, 'en'));
  afterEach(() => localStorage.removeItem(localePreferenceKey));
}
