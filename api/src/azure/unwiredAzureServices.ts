import type { AzureServices } from './port';

/**
 * Placeholder production adapter until the real Azure SDK adapter lands
 * (it replaces this file). Every call fails loudly so nothing silently no-ops.
 */
export function createUnwiredAzureServices(): AzureServices {
  const fail = (what: string) => () => Promise.reject(new Error(`Azure adapter not implemented yet: ${what}`));
  return {
    documentTranslation: {
      startBatch: fail('documentTranslation.startBatch'),
      getBatchStatus: fail('documentTranslation.getBatchStatus'),
      cancelBatch: fail('documentTranslation.cancelBatch'),
    },
    documentIntelligence: {
      startRead: fail('documentIntelligence.startRead'),
      getReadResult: fail('documentIntelligence.getReadResult'),
      deleteReadResult: fail('documentIntelligence.deleteReadResult'),
    },
    textTranslation: {
      translate: fail('textTranslation.translate'),
    },
    blobs: {
      createUploadUrl: fail('blobs.createUploadUrl'),
      createReadUrl: fail('blobs.createReadUrl'),
      getBlob: fail('blobs.getBlob'),
      listBlobs: fail('blobs.listBlobs'),
      deleteBlob: fail('blobs.deleteBlob'),
    },
    counters: {
      get: fail('counters.get'),
      increment: fail('counters.increment'),
    },
  };
}
