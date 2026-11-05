# Lingo Lens

An internal tool that lets staff translate files into another language while keeping their original layout. See `GLOSSARY.md` for the domain language and `.scratch/lingo-lens/spec.md` for the spec.

## Workspaces

| Workspace | What it is |
|---|---|
| [`shared`](shared/README.md) | `/api` request and response types used by both sides |
| [`api`](api/README.md) | Azure Functions v4 app (TypeScript on Node) serving `/api` |
| [`web`](web/README.md) | React + Fluent UI React v9 SPA |
| [`infra`](infra/README.md) | Bicep templates |

## Quick start

Requires Node 22 (see `.nvmrc`; 20.19+ also works locally).

```sh
npm install
npm run check        # lint, typecheck, test, build: the same steps as the PR workflow
```

To see the SPA render the API's health locally, run the API (`npm start -w api`, needs Azure Functions Core Tools v4) and, in another terminal, the SPA (`npm run dev -w web`), then open http://localhost:5173.
