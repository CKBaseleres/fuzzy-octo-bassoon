import type { ApiErrorResponse, StartTranslationResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { createTestApi } from '../testing/testApi';
import { createStartTranslationHandler } from './startTranslation';

const UPLOAD_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';

describe('POST /api/translations', () => {
  const start = (body: unknown) => ({ method: 'POST' as const, path: '/api/translations', body });

  it('starts one batch job from the uploaded Source file into a GUID-named target blob and returns an opaque id', async () => {
    const api = createTestApi();
    api.azure.state.putBlob(`source/${UPLOAD_ID}/file.pdf`, 120_000);

    const response = await api.call(
      createStartTranslationHandler,
      start({ uploadId: UPLOAD_ID, extension: 'pdf', targetLanguage: 'fr' }),
    );

    expect(response.status).toBe(202);
    const { id } = response.json<StartTranslationResponse>();
    expect(id).toEqual(expect.any(String));
    const jobs = [...api.azure.state.batchJobs.values()];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.request).toEqual({
      sourceBlobName: `source/${UPLOAD_ID}/file.pdf`,
      targetBlobName: `target/${UPLOAD_ID}/file.pdf`,
      targetLanguage: 'fr',
    });
  });

  it('names the target blob with the converted extension for legacy formats', async () => {
    const api = createTestApi();
    api.azure.state.putBlob(`source/${UPLOAD_ID}/file.doc`, 1000);

    await api.call(createStartTranslationHandler, start({ uploadId: UPLOAD_ID, extension: 'doc', targetLanguage: 'de' }));

    expect([...api.azure.state.batchJobs.values()][0]!.request.targetBlobName).toBe(`target/${UPLOAD_ID}/file.docx`);
  });

  it('gives different Translations different ids', async () => {
    const api = createTestApi();
    api.azure.state.putBlob(`source/${UPLOAD_ID}/file.pdf`, 1000);
    const body = { uploadId: UPLOAD_ID, extension: 'pdf', targetLanguage: 'fr' };

    const a = (await api.call(createStartTranslationHandler, start(body))).json<StartTranslationResponse>();
    const b = (await api.call(createStartTranslationHandler, start(body))).json<StartTranslationResponse>();

    expect(a.id).not.toBe(b.id);
  });

  it('refuses to start when nothing was uploaded', async () => {
    const api = createTestApi();

    const response = await api.call(
      createStartTranslationHandler,
      start({ uploadId: UPLOAD_ID, extension: 'pdf', targetLanguage: 'fr' }),
    );

    expect(response.status).toBe(400);
    expect(api.azure.state.batchJobs.size).toBe(0);
  });

  it.each([
    { uploadId: 'not-a-guid', extension: 'pdf', targetLanguage: 'fr' },
    { uploadId: UPLOAD_ID, extension: 'exe', targetLanguage: 'fr' },
    { uploadId: UPLOAD_ID, extension: 'pdf', targetLanguage: '' },
    { uploadId: UPLOAD_ID, extension: 'pdf', targetLanguage: 'fr; drop' },
    { uploadId: UPLOAD_ID, extension: 'pdf' },
  ])('rejects a malformed request %j', async (body) => {
    const api = createTestApi();
    api.azure.state.putBlob(`source/${UPLOAD_ID}/file.pdf`, 1000);

    const response = await api.call(createStartTranslationHandler, start(body));

    expect(response.status).toBe(400);
    expect(response.json<ApiErrorResponse>().error).toBe('badRequest');
    expect(api.azure.state.batchJobs.size).toBe(0);
  });

  it('logs the GUID, format, size and target language and nothing else', async () => {
    const api = createTestApi();
    api.azure.state.putBlob(`source/${UPLOAD_ID}/file.xlsx`, 4242);

    await api.call(
      createStartTranslationHandler,
      start({ uploadId: UPLOAD_ID, extension: 'xlsx', targetLanguage: 'ja' }),
    );

    expect(api.logs).toContainEqual({
      level: 'information',
      args: [
        'translation.started',
        { translationGuid: UPLOAD_ID, format: 'xlsx', sizeInBytes: 4242, targetLanguage: 'ja' },
      ],
    });
  });
});
