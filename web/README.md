# web

The Lingo Lens SPA: React 19 + Fluent UI React v9, built with Vite. Served by Azure Static Web Apps in Azure.

## Run locally

```sh
npm run dev -w web      # http://localhost:5173
```

The dev server proxies `/api` to the Functions host on http://localhost:7071, so start the API too (see `api/README.md`). Without it the shell shows "API status: unreachable".

## Test

```sh
npm test -w web         # once
npm run test:watch -w web
```

Tests use Vitest (jsdom) and React Testing Library, with `/api` faked at the network boundary by MSW (**Seam 2**):

- `src/test/mockApi.ts`: the MSW server plus one helper per endpoint, typed with `@lingo-lens/shared`. Unhandled requests fail the test.
- `src/test/render.tsx`: `renderWithProviders` wraps the UI in the same `FluentProvider` as `main.tsx`.

Assert on what a user observes (text, roles, focus, announcements, network calls), never on component internals.

## Build

```sh
npm run build -w web    # outputs dist/
```
