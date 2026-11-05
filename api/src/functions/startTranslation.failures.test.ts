import type { FailedTranslationResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { AzureServiceError } from '../azure/port';
import { createTestApi, type TestApi } from '../testing/testApi';
import { createStartTranslationHandler } from './startTranslation';

const UPLOAD_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b';
const SOURCE = `source/${UPLOAD_ID}/file.pdf`;

const start = (api: TestApi) =>
  api.call(createStartTranslationHandler, {
    method: 'POST',
    path: '/api/translations',
    body: { uploadId: UPLOAD_ID, extension: 'pdf', targetLanguage: 'fr' },
  });

const failureLog = (api: TestApi) => {
  const entry = api.logs.find((l) => l.args[0] === 'translation.failed');
  return entry && { level: entry.level, fields: entry.args[1] as Record<string, unknown> };
};

describe('POST /api/translations: when Azure refuses the batch submit', () => {
  it.each([400, 401, 403, 404])(
    'answers 502 with Service problem, logs %i at error level as our fault, and deletes the Source file',
    async (httpStatus) => {
      const api = createTestApi();
      api.azure.state.putBlob(SOURCE, 1000);
      api.azure
        .script('documentTranslation', 'startBatch')
        .rejects(
          new AzureServiceError({ service: 'documentTranslation', httpStatus, code: 'InvalidRequest', requestId: 'r-1' }),
        );

      const response = await start(api);

      expect(response.status).toBe(502);
      expect(response.json<FailedTranslationResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
      expect(failureLog(api)).toMatchObject({
        level: 'error',
        fields: {
          translationGuid: UPLOAD_ID,
          format: 'pdf',
          ruleId: 'batch.request.rejected',
          mapped: true,
          service: 'documentTranslation',
          operation: 'startBatch',
          httpStatus,
          errorCode: 'InvalidRequest',
          requestId: 'r-1',
        },
      });
      expect(api.azure.state.blobs.has(SOURCE)).toBe(false);
    },
  );

  it('retries a busy submit silently and starts the Translation', async () => {
    const api = createTestApi();
    api.azure.state.putBlob(SOURCE, 1000);
    api.azure
      .script('documentTranslation', 'startBatch')
      .rejectsOnce(new AzureServiceError({ service: 'documentTranslation', httpStatus: 429 }));

    const response = await start(api);

    expect(response.status).toBe(202);
    expect(api.azure.state.batchJobs.size).toBe(1);
  });

  it('answers 502 with Service problem when the submit is still busy after 3 retries', async () => {
    const api = createTestApi();
    api.azure.state.putBlob(SOURCE, 1000);
    api.azure
      .script('documentTranslation', 'startBatch')
      .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus: 503 }));

    const response = await start(api);

    expect(response.status).toBe(502);
    expect(response.json<FailedTranslationResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)).toMatchObject({ level: 'warning', fields: { ruleId: 'azure.busy', httpStatus: 503 } });
  });
});
