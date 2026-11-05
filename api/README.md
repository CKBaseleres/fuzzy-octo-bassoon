# api

The Lingo Lens backend: an Azure Functions app (v4 Node programming model, TypeScript, ESM) serving `/api`. In Azure it is the Function App linked to Static Web Apps.

## Layout

- `src/index.ts`: composition root. Builds the production `Deps` and registers every Function with `app.http` / `app.timer`. Nothing else imports it.
- `src/functions/*.ts`: one handler factory per Function, `(deps) => handler`.
- `src/azure/port.ts`: the **Azure services port**, the one seam to Azure (Translator batch, Document Intelligence, Translator text, Blob, Table counters).
- `src/clock.ts`: the injected clock.
- `src/testing/`: the Seam 1 harness (`createTestApi`, the scriptable fake Azure, the fake clock).

## Run locally

Needs [Azure Functions Core Tools](https://learn.microsoft.com/azure/azure-functions/functions-run-local) v4 (4.0.5382 or later, for the v4 Node model).

```sh
cp api/local.settings.example.json api/local.settings.json   # first time only
npm start -w api        # builds, then `func start`; health at http://localhost:7071/api/health
```

Nothing calls real Azure yet: the production adapter is a placeholder that throws.

## Test

```sh
npm test -w api         # once
npm run test:watch -w api
```

Tests call handlers through `createTestApi()` (**Seam 1**): it builds the handler with a fake Azure and a fake clock, sends a real `HttpRequest`, and returns the status, headers and JSON body. Arrange Azure with `api.azure.state` (blobs, counters, jobs) or `api.azure.script(service, method)` (`resolves`, `resolvesOnce`, `rejects(new AzureServiceError(...))`, `handles(fn)`), and assert on the response typed by `@lingo-lens/shared` plus the fake's state. Never assert on call order or internals.

## Build

```sh
npm run build -w api    # esbuild bundles src/index.ts to dist/index.js
```

`@lingo-lens/shared` is bundled in. Packages in `dependencies` stay external, so a deploy package is `dist/`, `host.json`, `package.json` and `npm install --omit=dev`.
