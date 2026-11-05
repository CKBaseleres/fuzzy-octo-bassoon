// Composition root: the only place production dependencies are created and
// Functions are registered with the host. Handlers never import from here.
import { app } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { createAzureServices } from './azure/azureServices';
import { withinRequestBudget, withRetries } from './azure/retries';
import { systemClock } from './clock';
import { DEFAULT_TIMEOUTS, type Deps } from './deps';
import { createUploadHandler } from './functions/createUpload';
import { createDeleteTranslationHandler } from './functions/deleteTranslation';
import { createGetLanguagesHandler } from './functions/getLanguages';
import { createGetTranslatedFileHandler } from './functions/getTranslatedFile';
import { createGetTranslationHandler } from './functions/getTranslation';
import { createHealthHandler } from './functions/health';
import { createStartTranslationHandler } from './functions/startTranslation';

/** App settings are read lazily so a missing one fails the request, not host start-up (and /api/health keeps working). */
const setting = (name: string) => process.env[name] ?? '';

/** A positive whole number of minutes, or the spec's default. */
const minutes = (name: string, fallback: number) => {
  const value = Number(setting(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

const deps: Deps = {
  // Silent retries of Azure 429/5xx; see azure/retries.ts.
  azure: withRetries(
    createAzureServices(
      {
        storageAccountName: setting('STORAGE_ACCOUNT_NAME'),
        blobEndpoint: setting('STORAGE_BLOB_ENDPOINT'),
        translatorEndpoint: setting('TRANSLATOR_ENDPOINT'),
        documentIntelligenceEndpoint: setting('DOCUMENT_INTELLIGENCE_ENDPOINT'),
      },
      new DefaultAzureCredential(),
    ),
    systemClock,
  ),
  clock: systemClock,
  timeouts: {
    documentMinutes: minutes('DOCUMENT_TIMEOUT_MINUTES', DEFAULT_TIMEOUTS.documentMinutes),
    imageMinutes: minutes('IMAGE_TIMEOUT_MINUTES', DEFAULT_TIMEOUTS.imageMinutes),
  },
};

// Every HTTP invocation gets its own 45-second retry budget (SWA's /api limit).
app.hook.preInvocation((hook) => {
  if (hook.invocationContext.options.trigger.type !== 'httpTrigger') return;
  const handler = hook.functionHandler;
  hook.functionHandler = (...args: unknown[]): unknown => withinRequestBudget(systemClock, (): unknown => handler(...args));
});

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
