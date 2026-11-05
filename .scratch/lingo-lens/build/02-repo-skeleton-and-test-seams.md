# 02: Repo skeleton and test seams

Spec: [../spec.md](../spec.md) (Platform and hosting; Testing Decisions)

**What to build:** The empty repo, turned into a working monorepo that proves both test seams from the spec. A developer can clone it, run the tests, and see the SPA render a health response from the API locally. Every later ticket builds on these seams; none adds new ones.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] The repo is under git with a GitHub remote, and npm workspaces for `web` (React + Fluent UI React v9), `api` (Azure Functions v4, TypeScript on Node), `shared` (request and response types) and `infra` (Bicep, empty for now)
- [x] `GET /api/health` returns a typed response from `shared`, and the SPA shell renders it
- [x] **Seam 1:** all Azure dependencies (Translator batch, Document Intelligence, Translator text, Blob, Table) sit behind one Azure services port. An in-memory fake can be scripted with statuses and error payloads. A clock is injected. One handler test calls a Function handler with an HTTP request and asserts on the response.
- [x] **Seam 2:** a React Testing Library + MSW harness fakes `/api` using the `shared` types, proven by one test of the health render
- [x] The PR workflow (GitHub Actions) runs lint, typecheck, unit tests and build for every workspace
- [x] A short README in each workspace says how to run it and its tests locally

## Comments

**Implementer (ticket-02 branch):** Everything except the GitHub remote is done. The repo is under local git with the four npm workspaces, but by instruction no GitHub repo or remote was created, so the first criterion is left for a human. The PR workflow (`.github/workflows/pr.yml`) has been written but has never run. The local Azure Functions Core Tools here is 4.0.4670, which is too old for the v4 Node model ("0 functions found"); you need 4.0.5382 or later to see `/api/health` under `func start`. The handler is covered by tests, and the built bundle loads.
