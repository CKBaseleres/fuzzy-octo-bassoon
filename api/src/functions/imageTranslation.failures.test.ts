import type { FailedTranslationResponse, TranslationStatusResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { AzureServiceError, type ReadResult } from '../azure/port';
import { startImageTranslation, type StartedImageTranslation } from '../testing/imageTranslation';
import { createTestApi, type LogEntry, type TestApi } from '../testing/testApi';
import { createGetTranslationHandler } from './getTranslation';
import { createStartTranslationHandler } from './startTranslation';
import { createUploadHandler } from './createUpload';

const poll = (api: TestApi, id: string) =>
  api.call(createGetTranslationHandler, { method: 'GET', path: `/api/translations/${id}`, params: { id } });

/** The structured fields of the `translation.failed` log line. */
const failureLog = (api: TestApi) => {
  const entry = api.logs.find((l: LogEntry) => l.args[0] === 'translation.failed');
  return entry && { level: entry.level, fields: entry.args[1] as Record<string, unknown> };
};

/** Nothing of the Translation is left in Azure. */
const expectCleanedUp = (api: TestApi, t: StartedImageTranslation) => {
  expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
  expect(api.azure.state.readOperations.get(t.operationId)!.resultDeleted).toBe(true);
};

const SIGN: ReadResult = {
  page: { width: 1024, height: 768 },
  paragraphs: [
    { content: 'Plat du jour', polygon: [102, 88, 470, 92, 469, 142, 101, 138] },
    { content: 'Fermé le lundi', polygon: [96, 190, 610, 196, 608, 252, 95, 246] },
  ],
  isHandwritten: false,
};

describe('Image Translation: Document Intelligence could not read the Image', () => {
  it.each([
    ['InvalidContent as the error code', { code: 'InvalidContent' }, 'damaged', 'image.damaged'],
    ['UnsupportedContent as the error code', { code: 'UnsupportedContent' }, 'damaged', 'image.damaged'],
    ['InvalidContent as the inner code', { code: 'InvalidRequest', innerErrorCode: 'InvalidContent' }, 'damaged', 'image.damaged'],
    [
      'InvalidContentDimensions as the inner code',
      { code: 'InvalidRequest', innerErrorCode: 'InvalidContentDimensions' },
      'badDimensions',
      'image.badDimensions',
    ],
    ['InvalidContentDimensions as the error code', { code: 'InvalidContentDimensions' }, 'badDimensions', 'image.badDimensions'],
  ] as const)('a failed read with %s is Can’t translate (%s)', async (_name, error, reason, ruleId) => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.read.status = 'failed';
    t.read.error = error;

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'cantTranslate', reason });
    expect(failureLog(api)).toMatchObject({ level: 'warning', fields: { ruleId, mapped: true, service: 'documentIntelligence' } });
    expectCleanedUp(api, t);
  });

  it('a read that fails for an unknown reason is Service problem, logged as unmapped', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.read.status = 'failed';
    t.read.error = { code: 'SomethingNew' };

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)).toMatchObject({ level: 'error', fields: { mapped: false, errorCode: 'SomethingNew' } });
    expectCleanedUp(api, t);
  });

  it('a start refused with InvalidContentDimensions answers 502 badDimensions and deletes the Image', async () => {
    const api = createTestApi();
    api.azure
      .script('documentIntelligence', 'startRead')
      .rejects(
        new AzureServiceError({
          service: 'documentIntelligence',
          httpStatus: 400,
          code: 'InvalidRequest',
          innerErrorCode: 'InvalidContentDimensions',
        }),
      );
    const upload = await api.call(createUploadHandler, { method: 'POST', path: '/api/translations/uploads', body: { extension: 'png' } });
    const { translationGuid, uploadUrl } = upload.json<{ translationGuid: string; uploadUrl: string }>();
    const blobName = new URL(uploadUrl).pathname.slice(1);
    api.azure.state.putBlob(blobName, 300_000);

    const response = await api.call(createStartTranslationHandler, {
      method: 'POST',
      path: '/api/translations',
      body: { translationGuid, extension: 'png', targetLanguage: 'fr' },
    });

    expect(response.status).toBe(502);
    expect(response.json<FailedTranslationResponse>()).toEqual({
      status: 'failed',
      category: 'cantTranslate',
      reason: 'badDimensions',
    });
    expect(failureLog(api)?.fields).toMatchObject({ ruleId: 'image.badDimensions', operation: 'startRead' });
    expect(api.azure.state.blobs.has(blobName)).toBe(false);
  });

  it('a read result Document Intelligence keeps failing to return is Service problem, and everything is deleted', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure
      .script('documentIntelligence', 'getReadResult')
      .rejects(new AzureServiceError({ service: 'documentIntelligence', httpStatus: 503, code: 'ServiceUnavailable' }));

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)?.fields).toMatchObject({ ruleId: 'azure.busy', operation: 'getReadResult' });
    expectCleanedUp(api, t);
  });
});

describe('Image Translation: No text found', () => {
  it.each([
    ['no paragraphs at all', []],
    [
      'paragraphs with no letter or digit',
      [
        { content: '— · —', polygon: [1, 1, 9, 1, 9, 9, 1, 9] },
        { content: '!!', polygon: [10, 10, 19, 10, 19, 19, 10, 19] },
      ],
    ],
  ])('OCR that succeeds with %s is No text found, without calling Translator', async (_name, paragraphs) => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure.script('textTranslation', 'translate').rejects(new Error('should not be called'));
    t.succeed({ page: { width: 800, height: 600 }, paragraphs, isHandwritten: false });

    const response = await poll(api, t.id);

    expect(response.status).toBe(200);
    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'noTextFound' });
    expect(failureLog(api)).toMatchObject({ level: 'warning', fields: { ruleId: 'image.noTextFound' } });
    expectCleanedUp(api, t);
  });

  it('a single digit or a letter in any script is text', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    t.succeed({
      page: { width: 800, height: 600 },
      paragraphs: [
        { content: '— 7 —', polygon: [1, 1, 9, 1, 9, 9, 1, 9] },
        { content: '出口', polygon: [10, 10, 19, 10, 19, 19, 10, 19] },
      ],
      isHandwritten: false,
    });

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toMatchObject({ status: 'ready', kind: 'image' });
  });
});

describe('Image Translation: Translator failures fail the whole Image', () => {
  it.each([
    ['400050', 'translator.ourBug'],
    ['400077', 'translator.ourBug'],
    ['400035', 'translator.rejected'],
  ])('Translator 400 %s is Service problem, logged at error level as our fault', async (code, ruleId) => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure
      .script('textTranslation', 'translate')
      .rejects(new AzureServiceError({ service: 'textTranslation', httpStatus: 400, code }));
    t.succeed(SIGN);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)).toMatchObject({ level: 'error', fields: { ruleId, errorCode: code, service: 'textTranslation' } });
    expectCleanedUp(api, t);
  });

  it('any other Translator 4xx is Service problem at error level', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure
      .script('textTranslation', 'translate')
      .rejects(new AzureServiceError({ service: 'textTranslation', httpStatus: 403, code: '403001' }));
    t.succeed(SIGN);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)).toMatchObject({ level: 'error', fields: { ruleId: 'translator.rejected' } });
  });

  it('a later Translator call that still fails after retries fails the whole Image, with no partial result', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    let calls = 0;
    api.azure.script('textTranslation', 'translate').handles(({ texts }) => {
      calls++;
      if (calls === 1) return Promise.resolve(texts.map((text) => ({ text, detectedLanguage: 'fr' })));
      return Promise.reject(new AzureServiceError({ service: 'textTranslation', httpStatus: 503, code: '503000' }));
    });
    // Over 1,000 paragraphs: two Translator calls.
    const paragraphs = Array.from({ length: 1_200 }, (_, i) => ({ content: `Ligne ${i}`, polygon: [i, i, i + 1, i, i + 1, i + 1, i, i + 1] }));
    t.succeed({ page: { width: 4000, height: 3000 }, paragraphs, isHandwritten: false });

    const response = await poll(api, t.id);

    expect(calls).toBe(5); // 1 good call, then 1 attempt + 3 retries
    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)?.fields).toMatchObject({ ruleId: 'azure.busy', operation: 'translate' });
    expectCleanedUp(api, t);
  });

  it('a failure even Delete Analyze Result cannot complete still deletes the Image', async () => {
    const api = createTestApi();
    const t = await startImageTranslation(api);
    api.azure
      .script('textTranslation', 'translate')
      .rejects(new AzureServiceError({ service: 'textTranslation', httpStatus: 400, code: '400050' }));
    api.azure
      .script('documentIntelligence', 'deleteReadResult')
      .rejects(new AzureServiceError({ service: 'documentIntelligence', httpStatus: 500, code: 'InternalServerError' }));
    t.succeed(SIGN);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
  });
});

describe('Image Translation: the Image timeout', () => {
  it('keeps translating just before 3 minutes', async () => {
    const api = createTestApi({ now: '2026-03-01T10:00:00.000Z' });
    const t = await startImageTranslation(api);
    t.read.status = 'running';
    api.clock.advance(3 * 60_000 - 1);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'translating' });
    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(true);
  });

  it('reports Service problem once OCR is still running 3 minutes after the start, and deletes everything', async () => {
    const api = createTestApi({ now: '2026-03-01T10:00:00.000Z' });
    const t = await startImageTranslation(api);
    t.read.status = 'running';
    api.clock.advance(3 * 60_000);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)?.fields).toMatchObject({ ruleId: 'image.timeout', durationMs: 180_000 });
    expectCleanedUp(api, t);
  });

  it('takes the timeout from the app setting', async () => {
    const api = createTestApi({ now: '2026-03-01T10:00:00.000Z', imageTimeoutMinutes: 1 });
    const t = await startImageTranslation(api);
    t.read.status = 'notStarted';
    api.clock.advance(60_000);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
  });

  it('still returns a read that finished in time, even when polled late', async () => {
    const api = createTestApi({ now: '2026-03-01T10:00:00.000Z' });
    const t = await startImageTranslation(api);
    t.succeed(SIGN);
    api.clock.advance(5 * 60_000);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toMatchObject({ status: 'ready', kind: 'image' });
  });
});
