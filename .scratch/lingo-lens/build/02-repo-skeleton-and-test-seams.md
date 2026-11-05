# 02: Repo skeleton and test seams

Spec: [../spec.md](../spec.md) (Platform and hosting; Testing Decisions)

**What to build:** The empty repo, turned into a working monorepo that proves both test seams from the spec. A developer can clone it, run the tests, and see the SPA render a health response from the API locally. Every later ticket builds on these seams; none adds new ones.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The repo is under git with a GitHub remote, and npm workspaces for `web` (React + Fluent UI React v9), `api` (Azure Functions v4, TypeScript on Node), `shared` (request and response types) and `infra` (Bicep, empty for now)
- [ ] `GET /api/health` returns a typed response from `shared`, and the SPA shell renders it
- [ ] **Seam 1:** all Azure dependencies (Translator batch, Document Intelligence, Translator text, Blob, Table) sit behind one Azure services port. An in-memory fake can be scripted with statuses and error payloads. A clock is injected. One handler test calls a Function handler with an HTTP request and asserts on the response.
- [ ] **Seam 2:** a React Testing Library + MSW harness fakes `/api` using the `shared` types, proven by one test of the health render
- [ ] The PR workflow (GitHub Actions) runs lint, typecheck, unit tests and build for every workspace
- [ ] A short README in each workspace says how to run it and its tests locally
