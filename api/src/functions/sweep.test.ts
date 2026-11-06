import { describe, expect, it } from 'vitest';
import { AzureServiceError } from '../azure/port';
import { startDocumentTranslation } from '../testing/documentTranslation';
import { createTestApi } from '../testing/testApi';
import { createSweepHandler } from './sweep';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('retention sweep (timer)', () => {
  it('deletes every blob uploaded more than 60 minutes ago, in both containers, and keeps younger ones', async () => {
    const api = createTestApi({ now: '2026-03-01T12:00:00.000Z' });
    const at = (minutesAgo: number) => new Date(api.clock.now().getTime() - minutesAgo * MINUTE);
    api.azure.state.putBlob('source/old-doc/file.pdf', 10, at(61));
    api.azure.state.putBlob('target/old-doc/file.pdf', 10, at(61));
    api.azure.state.putBlob('source/old-image/file.png', 10, at(90));
    api.azure.state.putBlob('source/young/file.pdf', 10, at(59));
    api.azure.state.putBlob('target/young/file.pdf', 10, at(1));

    await api.runTimer(createSweepHandler);

    expect([...api.azure.state.blobs.keys()].sort()).toEqual(['source/young/file.pdf', 'target/young/file.pdf']);
  });

  it('cancels a batch job still running for a swept Translation, and leaves younger and finished jobs alone', async () => {
    const api = createTestApi({ now: '2026-03-01T12:00:00.000Z' });
    const stuck = await startDocumentTranslation(api);
    stuck.job.status = 'Running';
    const finished = await startDocumentTranslation(api);
    finished.succeed();
    api.clock.advance(30 * MINUTE);
    const young = await startDocumentTranslation(api);
    young.job.status = 'Running';
    api.clock.advance(31 * MINUTE);

    await api.runTimer(createSweepHandler);

    expect(stuck.job.status).toBe('Cancelled');
    expect(finished.job.status).toBe('Succeeded');
    expect(young.job.status).toBe('Running');
    expect(api.azure.state.blobs.has(stuck.sourceBlobName)).toBe(false);
    expect(api.azure.state.blobs.has(finished.targetBlobName)).toBe(false);
    expect(api.azure.state.blobs.has(young.sourceBlobName)).toBe(true);
  });

  it('also cancels a job Translator has not started yet', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    api.clock.advance(61 * MINUTE);

    await api.runTimer(createSweepHandler);

    expect(t.job.status).toBe('Cancelled');
  });

  it('still deletes the blobs when Translator refuses the cancel', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    api.clock.advance(61 * MINUTE);
    api.azure
      .script('documentTranslation', 'cancelBatch')
      .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus: 503, code: 'ServiceUnavailable' }));

    await api.runTimer(createSweepHandler);

    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
  });

  it('carries on when listing jobs fails', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    api.clock.advance(61 * MINUTE);
    api.azure
      .script('documentTranslation', 'listActiveBatches')
      .rejects(new AzureServiceError({ service: 'documentTranslation', httpStatus: 500 }));

    await api.runTimer(createSweepHandler);

    expect(api.azure.state.blobs.has(t.sourceBlobName)).toBe(false);
  });

  it('deletes quota counter rows last written more than 2 days ago and keeps newer ones', async () => {
    const api = createTestApi({ now: '2026-03-01T12:00:00.000Z' });
    await startDocumentTranslation(api);
    api.clock.advance(47 * HOUR);
    await startDocumentTranslation(api);
    const recent = [...api.azure.state.counters.keys()].filter((key) => key.includes('2026-03-03'));
    api.clock.advance(2 * HOUR);

    await api.runTimer(createSweepHandler);

    expect(recent).toHaveLength(2);
    expect([...api.azure.state.counters.keys()].sort()).toEqual(recent.sort());
  });

  it('logs its summary and each failure with the log contract fields only', async () => {
    const api = createTestApi();
    const t = await startDocumentTranslation(api);
    t.job.status = 'Running';
    api.clock.advance(61 * MINUTE);
    api.azure
      .script('blobs', 'deleteBlob')
      .rejects(new AzureServiceError({ service: 'blobs', httpStatus: 403, code: 'AuthorizationFailure' }));

    await api.runTimer(createSweepHandler);

    const lines = api.logs.filter((l) => String(l.args[0]).startsWith('sweep.'));
    expect(lines).toEqual([
      {
        level: 'warning',
        args: ['sweep.failed', { service: 'blobs', httpStatus: 403, errorCode: 'AuthorizationFailure' }],
      },
      {
        level: 'information',
        args: ['sweep.completed', { cancelledBatches: 1, deletedBlobs: 0, deletedCounters: 0, failures: 1 }],
      },
    ]);
  });
});
