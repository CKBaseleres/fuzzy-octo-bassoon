// Composition root: the only place production dependencies are created and
// Functions are registered with the host. Handlers never import from here.
import { app } from '@azure/functions';
import { createUnwiredAzureServices } from './azure/unwiredAzureServices';
import { systemClock } from './clock';
import type { Deps } from './deps';
import { createHealthHandler } from './functions/health';

const deps: Deps = {
  azure: createUnwiredAzureServices(),
  clock: systemClock,
};

app.http('health', {
  route: 'health',
  methods: ['GET'],
  authLevel: 'anonymous',
  handler: createHealthHandler(deps),
});
