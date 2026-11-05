# shared

The `/api` contract: request and response types imported by `api` and `web` as `@lingo-lens/shared`.

It is a source-only TypeScript package (its `exports` point at `src/index.ts`); there is no build step. Vite, Vitest and esbuild compile it as part of whichever workspace imports it. Keep it to types and plain constants, since it is bundled into both the Function App and the SPA.

```sh
npm run typecheck -w shared
```

It has no tests of its own: the contract is exercised by the `api` handler tests and the `web` MSW tests.
