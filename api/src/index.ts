// Composition root: the only place production dependencies are created and
// Functions are registered with the host. Handlers never import from here.
import { app } from '@azure/functions';
import { DefaultAzureCredential } from '@azure/identity';
import { createAzureServices } from './azure/azureServices';
import { systemClock } from './clock';
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

const deps: Deps = {
  azure: createAzureServices(
    {
      storageAccountName: setting('STORAGE_ACCOUNT_NAME'),
      blobEndpoint: setting('STORAGE_BLOB_ENDPOINT'),
      translatorEndpoint: setting('TRANSLATOR_ENDPOINT'),
      documentIntelligenceEndpoint: setting('DOCUMENT_INTELLIGENCE_ENDPOINT'),
    },
    new DefaultAzureCredential(),
  ),
  clock: systemClock,
};

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
