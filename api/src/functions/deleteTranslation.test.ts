import { describe, expect, it } from 'vitest';
import { AzureServiceError } from '../azure/port';
import { startDocumentTranslation } from '../testing/documentTranslation';
import { createTestApi, type TestApi } from '../testing/testApi';
import { createDeleteTranslationHandler } from './deleteTranslation';

const remove = (api: TestApi, id: string) =>
  api.call(createDeleteTranslationHandler, { method: 'DELETE', path: `/api/translations/${id}`, params: { id } });

describe('DELETE /api/translations/{id}', () => {
  it('removes every blob of the Translation and leaves other Translations alone', async () => {
    const api = createTestApi();
    const mine = await startDocumentTranslation(api);
    const other = await startDocumentTranslation(api);
    mine.succeed();
    other.succeed();

    const response = await remove(api, mine.id);

    expect(response.status).toBe(204);
    const names = [...api.azure.state.blobs.keys()];
    expect(names.filter((n) => n.includes(mine.translationGuid))).toEqual([]);
    expect(names.filter((n) => n.includes(other.translationGuid))).toHaveLength(2);
  });

  it('cancels a job that is still running', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = 'Running';

    await remove(api, t.id);

    expect(t.job.status).toBe('Cancelled');
    expect([...api.azure.state.blobs.keys()].filter((n) => n.includes(t.translationGuid))).toEqual([]);
  });

  it('leaves a finished job as it is', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();

    await remove(api, t.id);

    expect(t.job.status).toBe('Succeeded');
  });

  it('still deletes the blobs when Azure no longer knows the job', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    api.azure
      .script('documentTranslation', 'getBatchStatus')
      .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus: 404, code: 'ResourceNotFound' }));

    const response = await remove(api, t.id);

    expect(response.status).toBe(204);
    expect([...api.azure.state.blobs.keys()].filter((n) => n.includes(t.translationGuid))).toEqual([]);
  });

  it('is safe to repeat', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();
    await remove(api, t.id);

    expect((await remove(api, t.id)).status).toBe(204);
  });

  it('answers 404 for an id it did not issue', async () => {
    const api = createTestApi();

    expect((await remove(api, 'bogus')).status).toBe(404);
  });
});
