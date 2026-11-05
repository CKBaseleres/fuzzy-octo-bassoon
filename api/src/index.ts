// Composition root: the only place production dependencies are created and
// Functions are registered with the host. Handlers never import from here.
import { app } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { createAzureServices } from './azure/azureServices';
import { systemClock } from './clock';
import { apiHeadersHook } from './guardrails/apiHeaders';
import type { Deps } from './deps';
import { createUploadHandler } from './functions/createUpload';
import { createDeleteTranslationHandler } from './functions/deleteTranslation';
import { createGetLanguagesHandler } from './functions/getLanguages';
import { createGetTranslatedFileHandler } from './functions/getTranslatedFile';
import { createGetTranslationHandler } from './functions/getTranslation';
import { createHealthHandler } from './functions/health';
import { createStartTranslationHandler } from './functions/startTranslation';

/** App settings are read lazily so a missing one fails the request, not host start-up (and /api/health keeps working). */
const setting = (name: string) => process.env[name] ?? '';

/** A quota setting; anything but a whole number >= 0 fails safe to 0 (refuse every Translation). */
const quota = (name: string) => {
  const value = Number(setting(name).trim() || NaN);
  return Number.isInteger(value) && value >= 0 ? value : 0;
};

const deps: Deps = {
  azure: createAzureServices(
    {
      storageAccountName: setting('STORAGE_ACCOUNT_NAME'),
      blobEndpoint: setting('STORAGE_BLOB_ENDPOINT'),
      translatorEndpoint: setting('TRANSLATOR_ENDPOINT'),
      documentIntelligenceEndpoint: setting('DOCUMENT_INTELLIGENCE_ENDPOINT'),
      tableEndpoint: setting('STORAGE_TABLE_ENDPOINT'),
      quotaTableName: setting('QUOTA_TABLE_NAME'),
    },
    new DefaultAzureCredential(),
  ),
  clock: systemClock,
  // Changing an app setting restarts the app, so reading these once is enough.
  limits: {
    translationsEnabled: setting('TRANSLATIONS_ENABLED').trim().toLowerCase() === 'true',
    dailyQuota: quota('DAILY_TRANSLATION_QUOTA'),
    hourlyPerIpQuota: quota('HOURLY_PER_IP_QUOTA'),
  },
};

// X-Robots-Tag: noindex on every /api response (SWA globalHeaders skip the API).
app.hook.postInvocation(apiHeadersHook);

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: createHealthHandler(deps),
});

app.http('languages', {
  route: 'languages',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: createGetLanguagesHandler(deps),
});

app.http('createUpload', {
  route: 'translations/uploads',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: createUploadHandler(deps),
});

app.http('startTranslation', {
  route: 'translations',
  methods: ['POST'],
  authLevel: 'anonymous',
  handler: createStartTranslationHandler(deps),
});

app.http('getTranslation', {
  route: 'translations/{id}',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: createGetTranslationHandler(deps),
});

app.http('deleteTranslation', {
  route: 'translations/{id}',
  methods: ['DELETE'],
  authLevel: 'anonymous',
  handler: createDeleteTranslationHandler(deps),
});

app.http('getTranslatedFile', {
  route: 'translations/{id}/file',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: createGetTranslatedFileHandler(deps),
});
