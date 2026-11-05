import type { TokenCredential } from '@azure/identity';
import { createBlobAdapter } from './blobAdapter';
import { createDocumentIntelligenceAdapter, createTextTranslateAdapter } from './imageAdapters';
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
}

/**
 * The production Azure adapter: keyless, through the Function App's managed
 * identity (`DefaultAzureCredential`). Thin by design: it is not unit-tested
 * (Seam 1 uses the fake) and is exercised by hand in ticket 01.
 *
 * Image pipeline adapters live in `imageAdapters.ts`.
 * Still unwired, and owned by later tickets (replace the `notWiredYet` entries):
 *   - 05: documentIntelligence.*, textTranslation.translate
 *   - 08: counters.*
 */
export function createAzureServices(config: AzureConfig, credential: TokenCredential): AzureServices {
  const notWiredYet = (what: string) => () => Promise.reject(new Error(`Azure adapter not implemented yet: ${what}`));

  return {
    documentTranslation: createDocumentTranslationAdapter({
      translatorEndpoint: config.translatorEndpoint,
      blobEndpoint: config.blobEndpoint,
      credential,
    }),
    documentIntelligence: createDocumentIntelligenceAdapter({
      endpoint: config.documentIntelligenceEndpoint,
      credential,
    }),
    textTranslation: {
      translate: createTextTranslateAdapter({ translatorEndpoint: config.translatorEndpoint, credential }),
      listLanguages: createLanguagesSource(),
    },
    blobs: createBlobAdapter({
      blobEndpoint: config.blobEndpoint,
      accountName: config.storageAccountName,
      credential,
    }),
    counters: {
      get: notWiredYet('counters.get'),
      increment: notWiredYet('counters.increment'),
    },
  };
}
