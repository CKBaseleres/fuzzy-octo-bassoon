import type { TokenCredential } from '@azure/identity';
import { createBlobAdapter } from './blobAdapter';
import { createCountersAdapter } from './countersAdapter';
import type { AzureServices } from './port';
import { createDocumentTranslationAdapter, createLanguagesSource } from './translatorAdapter';

export interface AzureConfig {
  storageAccountName: string;
  /** `STORAGE_BLOB_ENDPOINT`, e.g. `https://stx.blob.core.windows.net/`. */
  blobEndpoint: string;
  /** `TRANSLATOR_ENDPOINT`, the custom-domain endpoint. */
  translatorEndpoint: string;
  /** `DOCUMENT_INTELLIGENCE_ENDPOINT`. */
  documentIntelligenceEndpoint: string;
  /** `STORAGE_TABLE_ENDPOINT`, e.g. `https://stx.table.core.windows.net/`. */
  tableEndpoint: string;
  /** `QUOTA_TABLE_NAME`: the Table that holds the quota counters. */
  quotaTableName: string;
}

/**
 * The production Azure adapter: keyless, through the Function App's managed
 * identity (`DefaultAzureCredential`). Thin by design: it is not unit-tested
 * (Seam 1 uses the fake) and is exercised by hand in ticket 01.
 *
 * Still unwired, and owned by later tickets (replace the `notWiredYet` entries):
 *   - 05: documentIntelligence.*, textTranslation.translate
 */
export function createAzureServices(config: AzureConfig, credential: TokenCredential): AzureServices {
  const notWiredYet = (what: string) => () => Promise.reject(new Error(`Azure adapter not implemented yet: ${what}`));

  return {
    documentTranslation: createDocumentTranslationAdapter({
      translatorEndpoint: config.translatorEndpoint,
      blobEndpoint: config.blobEndpoint,
      credential,
    }),
    documentIntelligence: {
      startRead: notWiredYet('documentIntelligence.startRead'),
      getReadResult: notWiredYet('documentIntelligence.getReadResult'),
      deleteReadResult: notWiredYet('documentIntelligence.deleteReadResult'),
    },
    textTranslation: {
      translate: notWiredYet('textTranslation.translate'),
      listLanguages: createLanguagesSource(),
    },
    blobs: createBlobAdapter({
      blobEndpoint: config.blobEndpoint,
      accountName: config.storageAccountName,
      credential,
    }),
    counters: createCountersAdapter({
      tableEndpoint: config.tableEndpoint,
      tableName: config.quotaTableName,
      credential,
    }),
  };
}
