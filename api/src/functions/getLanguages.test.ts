import type { LanguagesResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { createTestApi } from '../testing/testApi';
import { createGetLanguagesHandler } from './getLanguages';

describe('GET /api/languages', () => {
  it('lists every Translator target language, sorted by English name', async () => {
    const api = createTestApi();
    api.azure.script('textTranslation', 'listLanguages').resolves([
      { code: 'fr', name: 'French' },
      { code: 'zh-Hans', name: 'Chinese Simplified' },
      { code: 'de', name: 'German' },
    ]);

    const response = await api.call(createGetLanguagesHandler, { method: 'GET', path: '/api/languages' });

    expect(response.status).toBe(200);
    expect(response.json<LanguagesResponse>()).toEqual({
      languages: [
        { code: 'zh-Hans', name: 'Chinese Simplified' },
        { code: 'fr', name: 'French' },
        { code: 'de', name: 'German' },
      ],
    });
    expect(response.headers.get('cache-control')).toBe('public, max-age=86400');
  });
});
