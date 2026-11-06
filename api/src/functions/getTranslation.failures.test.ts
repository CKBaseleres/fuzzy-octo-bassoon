import type { TranslationStatusResponse } from '@lingo-lens/shared';
import { describe, expect, it } from 'vitest';
import { AzureServiceError } from '../azure/port';
import { startDocumentTranslation } from '../testing/documentTranslation';
import type { FakeBatchJob } from '../testing/fakeAzureServices';
import { createTestApi, type LogEntry, type TestApi } from '../testing/testApi';
import { createGetTranslationHandler } from './getTranslation';

const poll = (api: TestApi, id: string) =>
  api.call(createGetTranslationHandler, { method: 'GET', path: `/api/translations/${id}`, params: { id } });

/** The structured fields of the `translation.failed` log line. */
const failureLog = (api: TestApi) => {
  const entry = api.logs.find((l: LogEntry) => l.args[0] === 'translation.failed');
  return entry && { level: entry.level, fields: entry.args[1] as Record<string, unknown> };
};

describe('GET /api/translations/{id}: classifying a failed Document', () => {
  it('reports Can\'t translate when the document fails with InvalidRequest and no inner code', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = 'Failed';
    t.job.document = { status: 'Failed', error: { code: 'InvalidRequest' } };

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'cantTranslate' });
    expect(failureLog(api)?.fields).toMatchObject({ ruleId: 'batch.document.invalidRequest', mapped: true });
  });

  type Case = {
    name: string;
    job: Pick<FakeBatchJob, 'status' | 'error' | 'document'>;
    expected: TranslationStatusResponse;
    ruleId: string;
    mapped: boolean;
    level: 'warning' | 'error';
  };
  const cases: Case[] = [
    {
      name: 'document Failed with InvalidArgument',
      job: { status: 'Failed', document: { status: 'Failed', error: { code: 'InvalidArgument' } } },
      expected: { status: 'failed', category: 'cantTranslate' },
      ruleId: 'batch.document.invalidRequest',
      mapped: true,
      level: 'warning',
    },
    {
      name: 'document Failed with InvalidRequest and an inner code no rule knows (fallback: 4 generic)',
      job: {
        status: 'Failed',
        document: { status: 'Failed', error: { code: 'InvalidRequest', innerErrorCode: 'SomethingNew' } },
      },
      expected: { status: 'failed', category: 'cantTranslate' },
      ruleId: 'fallback.document.invalidRequest',
      mapped: false,
      level: 'error',
    },
    ...(['ServiceUnavailable', 'InternalServerError', 'RequestRateTooHigh'] as const).map(
      (code): Case => ({
        name: `document Failed with ${code}`,
        job: { status: 'Failed', document: { status: 'Failed', error: { code } } },
        expected: { status: 'failed', category: 'serviceProblem' },
        ruleId: 'batch.document.serviceBusy',
        mapped: true,
        level: 'warning',
      }),
    ),
    ...(['Unauthorized', 'ResourceNotFound'] as const).map(
      (code): Case => ({
        name: `document Failed with ${code} (our fault: error level)`,
        job: { status: 'Failed', document: { status: 'Failed', error: { code } } },
        expected: { status: 'failed', category: 'serviceProblem' },
        ruleId: 'batch.accessFailed',
        mapped: true,
        level: 'error',
      }),
    ),
    {
      name: 'job Failed with Unauthorized and no document',
      job: { status: 'Failed', error: { code: 'Unauthorized' } },
      expected: { status: 'failed', category: 'serviceProblem' },
      ruleId: 'batch.accessFailed',
      mapped: true,
      level: 'error',
    },
    {
      name: "job ValidationFailed: the document's error decides",
      job: {
        status: 'ValidationFailed',
        error: { code: 'InvalidRequest' },
        document: { status: 'ValidationFailed', error: { code: 'InvalidRequest' } },
      },
      expected: { status: 'failed', category: 'cantTranslate' },
      ruleId: 'batch.document.invalidRequest',
      mapped: true,
      level: 'warning',
    },
    {
      name: 'job ValidationFailed with no document error',
      job: { status: 'ValidationFailed', error: { code: 'InvalidRequest' } },
      expected: { status: 'failed', category: 'serviceProblem' },
      ruleId: 'batch.validationFailed',
      mapped: true,
      level: 'warning',
    },
    {
      name: 'job Cancelled that we did not cancel',
      job: { status: 'Cancelled' },
      expected: { status: 'failed', category: 'serviceProblem' },
      ruleId: 'batch.cancelled',
      mapped: true,
      level: 'warning',
    },
    {
      name: 'document Failed with a code no rule knows (fallback: 6)',
      job: { status: 'Failed', document: { status: 'Failed', error: { code: 'BrandNewCode' } } },
      expected: { status: 'failed', category: 'serviceProblem' },
      ruleId: 'fallback',
      mapped: false,
      level: 'error',
    },
  ];

  it.each(cases)('$name -> $expected.category ($ruleId)', async ({ job, expected, ruleId, mapped, level }) => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    Object.assign(t.job, job);

    const response = await poll(api, t.id);

    expect(response.status).toBe(200);
    expect(response.json<TranslationStatusResponse>()).toEqual(expected);
    expect(failureLog(api)).toMatchObject({ level, fields: { ruleId, mapped, category: expected.status === 'failed' && expected.category } });
  });

  it('reports ready, with no failure logged, when the job succeeds with 0 characters charged', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();
    t.job.document = { status: 'Succeeded', characterCharged: 0 };

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'ready', kind: 'document' });
    expect(failureLog(api)).toBeUndefined();
  });

  it('logs every error field, redacting URLs and SAS parameters in the message and cutting it to 300 characters', async () => {
    const api = createTestApi({ now: '2026-11-05T09:00:00.000Z' });
    const t = await startDocumentTranslation(api, { extension: 'docx' });
    api.clock.advance(30_000);
    const message = `Cannot read https://st.blob.core.windows.net/source/${'x'.repeat(10)}/file.docx?sv=2024-11-04&se=2026-11-05&sp=r&sig=SECRETSIG (see https://trl-x.cognitiveservices.azure.com/translator/document/batches/op-1), sig=LOOSESIG ${'y'.repeat(400)}`;
    Object.assign(t.job, {
      status: 'Failed',
      requestId: 'req-123',
      document: { status: 'Failed', error: { code: 'InvalidRequest', innerErrorCode: 'Mystery', message } },
    });

    await poll(api, t.id);

    const log = failureLog(api);
    expect(log).toEqual({
      level: 'error',
      fields: {
        translationGuid: t.translationGuid,
        format: 'docx',
        durationMs: 30_000,
        category: 'cantTranslate',
        ruleId: 'fallback.document.invalidRequest',
        mapped: false,
        service: 'documentTranslation',
        errorCode: 'InvalidRequest',
        innerErrorCode: 'Mystery',
        jobStatus: 'Failed',
        documentStatus: 'Failed',
        requestId: 'req-123',
        message: expect.any(String) as unknown,
      },
    });
    const logged = log!.fields.message as string;
    expect(logged).toHaveLength(300);
    expect(logged).toMatch(/^Cannot read REDACTED_URL \(see REDACTED_URL\), sig=REDACTED y/);
    expect(logged).not.toMatch(/https:|blob\.core|cognitiveservices|file\.docx|SECRETSIG|LOOSESIG|2024-11-04/);
  });

  // (A 404 means the job is unknown: Expired, ticket 07.)
  it.each([400, 401, 403])(
    'reports Service problem, at error level, when the status call is refused with %i',
    async (httpStatus) => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      api.azure
        .script('documentTranslation', 'getBatchStatus')
        .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus, code: 'Unauthorized', requestId: 'req-9' }));

      const response = await poll(api, t.id);

      expect(response.status).toBe(200);
      expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
      expect(failureLog(api)).toMatchObject({
        level: 'error',
        fields: {
          ruleId: 'batch.request.rejected',
          mapped: true,
          service: 'documentTranslation',
          operation: 'getBatchStatus',
          httpStatus,
          errorCode: 'Unauthorized',
          requestId: 'req-9',
        },
      });
    },
  );
});

describe('GET /api/translations/{id}: retrying Azure hiccups', () => {
  const busy = (httpStatus: number) => new AzureServiceError({ service: 'documentTranslation', httpStatus });

  it.each([429, 500, 503])('retries a %i silently, up to 3 times', async (httpStatus) => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = 'Running';
    api.azure
      .script('documentTranslation', 'getBatchStatus')
      .rejectsOnce(busy(httpStatus))
      .rejectsOnce(busy(httpStatus))
      .rejectsOnce(busy(httpStatus));

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'translating' });
    expect(failureLog(api)).toBeUndefined();
  });

  it('reports Service problem once 3 retries are used up, with exponential backoff between attempts', async () => {
    const api = createTestApi({ now: '2026-11-05T09:00:00.000Z' });
    const t = await startDocumentTranslation(api);
    const attemptsAt: number[] = [];
    api.azure.script('documentTranslation', 'getBatchStatus').handles(() => {
      attemptsAt.push(api.clock.now().getTime());
      return Promise.reject(busy(503));
    });

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    expect(failureLog(api)).toMatchObject({
      level: 'warning',
      fields: { ruleId: 'azure.busy', mapped: true, httpStatus: 503, operation: 'getBatchStatus' },
    });
    const gaps = attemptsAt.slice(1).map((at, i) => at - attemptsAt[i]!);
    expect(gaps).toEqual([1000, 2000, 4000]);
  });

  it('does not retry a 4xx other than 429', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    let attempts = 0;
    api.azure.script('documentTranslation', 'getBatchStatus').handles(() => {
      attempts += 1;
      return Promise.reject(busy(403));
    });

    await poll(api, t.id);

    expect(attempts).toBe(1);
  });

  it("stops retrying when the next wait would overrun the request's 45-second budget", async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    let attempts = 0;
    api.azure.script('documentTranslation', 'getBatchStatus').handles(() => {
      attempts += 1;
      api.clock.advance(20_000); // a slow Azure answer
      return Promise.reject(busy(503));
    });

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
    // 20 s, wait 1 s, 20 s = 41 s; another 2 s wait plus a 20 s attempt cannot fit in 45 s.
    expect(attempts).toBe(2);
  });
});

describe('GET /api/translations/{id}: the Document timeout', () => {
  const MINUTE = 60_000;

  it('keeps translating just before 15 minutes', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = 'Running';
    api.clock.advance(15 * MINUTE - 1);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'translating' });
  });

  it.each(['NotStarted', 'Running'] as const)(
    'cancels a job still %s after 15 minutes and reports Service problem',
    async (status) => {
      const api = createTestApi();
      const t = await startDocumentTranslation(api);
      t.job.status = status;
      api.clock.advance(15 * MINUTE);

      const response = await poll(api, t.id);

      expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
      expect(t.job.status).toBe('Cancelled');
      expect(failureLog(api)).toMatchObject({
        level: 'warning',
        fields: { ruleId: 'document.timeout', mapped: true, jobStatus: status, durationMs: 15 * MINUTE },
      });
    },
  );

  it('reports Service problem on timeout even when the cancel fails', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = 'Running';
    api.azure
      .script('documentTranslation', 'cancelBatch')
      .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus: 500 }));
    api.clock.advance(16 * MINUTE);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
  });

  it('takes the timeout from the app setting', async () => {
    const api = createTestApi({ documentTimeoutMinutes: 5 });
    const t = await startDocumentTranslation(api);
    t.job.status = 'Running';
    api.clock.advance(5 * MINUTE);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'failed', category: 'serviceProblem' });
  });

  it('still reports a job that ended in time as it ended', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.succeed();
    api.clock.advance(20 * MINUTE);

    const response = await poll(api, t.id);

    expect(response.json<TranslationStatusResponse>()).toEqual({ status: 'ready', kind: 'document' });
  });
});
