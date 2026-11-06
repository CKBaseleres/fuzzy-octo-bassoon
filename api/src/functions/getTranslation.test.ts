import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { startDocumentTranslation } from '../testing/documentTranslation';
import { createTestApi, type TestApi } from '../testing/testApi';
import { AzureServiceError } from '../azure/port';
import { createGetTranslationHandler } from './getTranslation';
import { createSweepHandler } from './sweep';

const poll = (api: TestApi, id: string) =>
  api.call(createGetTranslationHandler, { method: 'GET', path: `/api/translations/${id}`, params: { id } });

describe('GET /api/translations/{id}', () => {
  it.each(['NotStarted', 'Running'] as const)('reports translating while the job is %s, keeping the Source file', async (status) => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = status;

    const response = await poll(api, t.id);

    expect(response.status).toBe(200);
    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'translating' });
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(true);
  });

  it('reports ready once the job succeeds, and deletes the Source file but keeps the Translated file', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'ready', kind: 'document' });
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
    expect(api.azure.state.blobs.has(t.targetBlobName)).toBe(true);
  });

  it('stays ready on later polls after the Source file is gone', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();
    await poll(api, t.id);

    const again = await poll(api, t.id);

    expect(again.json<TranslationStatusResponse>()).toEqual({ status: 'ready', kind: 'document' });
  });

  it.each(['Failed', 'ValidationFailed', 'Cancelled'] as const)(
    'reports failed when the job ends %s, and deletes the Source file at once',
    async (status) => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      t.job.status = status;

      const response = await poll(api, t.id);

      expect(response.json<TranslationStatusResponse>()).toMatchObject({ status: 'failed' });
      expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
    },
  );

  it.each(['', 'nonsense', Buffer.from('{"v":1,"k":"d","g":"x","e":"pdf","o":"a","s":0}').toString('base64url')])(
    'answers 404 for an id it did not issue (%j)',
    async (id) => {
      const api = createTestApi();

      const response = await poll(api, id);

      expect(response.status).toBe(404);
    },
  );

  it('logs the job status and duration when the job ends, with no filename or URL', async () => {
    const api = createTestApi({ now: '2026-11-05T09:00:00.000Z' });
    const t = await startDocumentTranslation(api, { extension: 'docx', targetLanguage: 'es' });
    api.clock.advance(42_000);
    t.succeed();

    await poll(api, t.id);

    expect(api.logs).toContainEqual({
      level: 'information',
      args: [
        'translation.batchEnded',
        { translationGuid: t.translationGuid, format: 'docx', jobStatus: 'Succeeded', durationMs: 42_000 },
      ],
    });
    expect(JSON.stringify(api.logs)).not.toMatch(/https?:|sig=/);
  });

  describe('Expired', () => {
    const expired: TranslationStatusResponse = { status: 'failed', category: 'expired' };

    it('reports expired when the sweep cancelled a job still running after the hour', async () => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      t.job.status = 'Running';
      api.clock.advance(61 * 60_000);
      await api.runTimer(createSweepHandler);

      const response = await poll(api, t.id);

      expect(response.status).toBe(200);
      expect(response.json<TranslationStatusResponse>()).toEqual(expired);
    });

    it('reports expired when the job succeeded but the sweep deleted the Translated file before download', async () => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      t.succeed();
      await poll(api, t.id);
      api.clock.advance(61 * 60_000);
      await api.runTimer(createSweepHandler);

      expect((await poll(api, t.id)).json<TranslationStatusResponse>()).toEqual(expired);
    });

    it('reports expired when the sweep deleted the blobs before it could cancel the job', async () => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      t.job.status = 'Running';
      api.azure.state.blobs.delete(t.sourceBlobName);

      expect((await poll(api, t.id)).json<TranslationStatusResponse>()).toEqual(expired);
    });

    it('reports expired when Translator no longer knows the job', async () => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      api.azure
        .script('documentTranslation', 'getBatchStatus')
        .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus: 404, code: 'ResourceNotFound' }));

      expect((await poll(api, t.id)).json<TranslationStatusResponse>()).toEqual(expired);
    });

    it.each(['Failed', 'ValidationFailed'] as const)('keeps reporting a %s job as failed, not expired', async (status) => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      t.job.status = status;
      await poll(api, t.id);

      expect((await poll(api, t.id)).json<TranslationStatusResponse>()).not.toEqual(expired);
    });
  });
});
