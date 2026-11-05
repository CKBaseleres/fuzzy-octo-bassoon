import { AzureServiceError } from '../azure/port';
import type { TimerHandlerFactory } from '../deps';
import { SOURCE_CONTAINER, TARGET_CONTAINER } from '../translations/blobNames';

/** The hour runs from upload. */
export const RETENTION_MINUTES = 60;

/** NCRONTAB (with seconds): every 5 minutes, so nothing outlives about 65 minutes. */
export const SWEEP_SCHEDULE = '0 */5 * * * *';

/**
 * Timer Function: nothing a staff member leaves behind outlives about an hour.
 *
 * 1. Cancels every batch job still NotStarted/Running that was created before the
 *    cutoff. A job is created after its upload, so such a job's Source file is
 *    older than the cutoff too. (A job created just inside the window whose blob
 *    is swept now gets cancelled by the next run, 5 minutes later.)
 * 2. Deletes every blob in `source/` and `target/` uploaded before the cutoff.
 *    Generic over blobs (by container prefix and age), so it covers Images too.
 *
 * One failure never stops the rest of the sweep: it is logged and the next run retries.
 */
export const createSweepHandler: TimerHandlerFactory =
  ({ azure, clock }) =>
  async (_timer, context) => {
    const cutoff = new Date(clock.now().getTime() - RETENTION_MINUTES * 60_000);
    let cancelled = 0;
    let deleted = 0;
    let failures = 0;
    const attempt = async (work: () => Promise<void>) => {
      try {
        await work();
        return true;
      } catch (error) {
        failures++;
        context.warn('sweep.failed', { errorCode: errorCode(error) });
        return false;
      }
    };

    await attempt(async () => {
      for (const operationId of await azure.documentTranslation.listActiveBatches(cutoff)) {
        if (await attempt(() => azure.documentTranslation.cancelBatch(operationId))) cancelled++;
      }
    });

    for (const container of [SOURCE_CONTAINER, TARGET_CONTAINER]) {
      await attempt(async () => {
        for (const blob of await azure.blobs.listBlobs(`${container}/`)) {
          if (blob.createdOn < cutoff && (await attempt(() => azure.blobs.deleteBlob(blob.name)))) deleted++;
        }
      });
    }

    context.log('sweep.completed', { cancelledJobs: cancelled, deletedBlobs: deleted, failures });
  };

const errorCode = (error: unknown) =>
  error instanceof AzureServiceError ? `${error.service}:${error.httpStatus}:${error.code ?? ''}` : 'unknown';
