import type { TimerHandlerFactory } from '../deps';
import { SOURCE_CONTAINER, TARGET_CONTAINER } from '../translations/blobNames';
import { logSweepCompleted, logSweepFailed } from '../translations/log';

/** The hour runs from upload. */
export const RETENTION_MINUTES = 60;

/** Quota counters are only read for the current hour and UTC day; older rows are kept 2 days, then deleted. */
export const COUNTER_RETENTION_DAYS = 2;

/** NCRONTAB (with seconds): every 5 minutes, so nothing outlives about 65 minutes. */
export const SWEEP_SCHEDULE = '0 */5 * * * *';

/**
 * Timer Function: nothing a staff member leaves behind outlives about an hour.
 *
 * 1. Cancels every batch still NotStarted/Running that was created before the
 *    cutoff. A batch is created after its upload, so such a batch's Source file is
 *    older than the cutoff too. (A batch created just inside the window whose blob
 *    is swept now gets cancelled by the next run, 5 minutes later.)
 * 2. Deletes every blob in `source/` and `target/` uploaded before the cutoff.
 *    Generic over blobs (by container prefix and age), so it covers Images too.
 * 3. Deletes quota counter rows last written more than 2 days ago.
 *
 * One failure never stops the rest of the sweep: it is logged and the next run retries.
 */
export const createSweepHandler: TimerHandlerFactory =
  ({ azure, clock }) =>
  async (_timer, context) => {
    const now = clock.now().getTime();
    const cutoff = new Date(now - RETENTION_MINUTES * 60_000);
    const counterCutoff = new Date(now - COUNTER_RETENTION_DAYS * 24 * 60 * 60_000);
    let cancelledBatches = 0;
    let deletedBlobs = 0;
    let deletedCounters = 0;
    let failures = 0;
    const attempt = async (work: () => Promise<void>) => {
      try {
        await work();
        return true;
      } catch (error) {
        failures++;
        logSweepFailed(context, error);
        return false;
      }
    };

    await attempt(async () => {
      for (const operationId of await azure.documentTranslation.listActiveBatches(cutoff)) {
        if (await attempt(() => azure.documentTranslation.cancelBatch(operationId))) cancelledBatches++;
      }
    });

    for (const container of [SOURCE_CONTAINER, TARGET_CONTAINER]) {
      await attempt(async () => {
        for (const blob of await azure.blobs.listBlobs(`${container}/`)) {
          if (blob.createdOn < cutoff && (await attempt(() => azure.blobs.deleteBlob(blob.name)))) deletedBlobs++;
        }
      });
    }

    await attempt(async () => {
      deletedCounters = await azure.counters.deleteOlderThan(counterCutoff);
    });

    logSweepCompleted(context, { cancelledBatches, deletedBlobs, deletedCounters, failures });
  };
