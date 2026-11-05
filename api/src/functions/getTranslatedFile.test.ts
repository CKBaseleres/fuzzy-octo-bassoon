import type { ApiErrorResponse, TranslatedFileResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { startDocumentTranslation } from '../testing/documentTranslation';
import { createTestApi, type TestApi } from '../testing/testApi';
import { createGetTranslatedFileHandler } from './getTranslatedFile';
import { createSweepHandler } from './sweep';

const getFile = (api: TestApi, id: string) =>
  api.call(createGetTranslatedFileHandler, { method: 'GET', path: `/api/translations/${id}/file`, params: { id } });

describe('GET /api/translations/{id}/file', () => {
  it('returns a read-only SAS for the Translated file that expires in 5 minutes', async () => {
    const api = createTestApi({ now: '2026-11-05T10:00:00.000Z' });
    const t = await startDocumentTranslation(api, { extension: 'pdf' });
    t.succeed();
    api.clock.set('2026-11-05T10:03:00.000Z');

    const response = await getFile(api, t.id);

    expect(response.status).toBe(200);
    const body = response.json<TranslatedFileResponse>();
    expect(body.expiresOn).toBe('2026-11-05T10:08:00.000Z');
    expect(body.extension).toBe('pdf');
    const url = new URL(body.url);
    expect(url.pathname).toBe(`/target/${t.guid}/file.pdf`);
    expect(url.searchParams.get('sp')).toBe('r');
  });

  it('reports the converted extension for a legacy format', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api, { extension: 'ppt' });
    t.succeed();

    const body = (await getFile(api, t.id)).json<TranslatedFileResponse>();

    expect(body.extension).toBe('pptx');
    expect(new URL(body.url).pathname).toBe(`/target/${t.guid}/file.pptx`);
  });

  it('answers 404 while there is no Translated file', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);

    expect((await getFile(api, t.id)).status).toBe(404);
  });

  it('answers 410 expired once the sweep has deleted the Translated file', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();
    api.clock.advance(61 * 60_000);
    await api.runTimer(createSweepHandler);

    const response = await getFile(api, t.id);

    expect(response.status).toBe(410);
    expect(response.json<ApiErrorResponse>()).toEqual({ error: 'expired' });
  });

  it('answers 404 for an id it did not issue', async () => {
    const api = createTestApi();

    expect((await getFile(api, 'bogus')).status).toBe(404);
  });
});
