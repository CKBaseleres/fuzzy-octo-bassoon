# 03: Infrastructure bootstrap and dev deploy

Spec: [../spec.md](../spec.md) (Platform and hosting; Infrastructure and CI)

**What to build:** Dev runs in Azure from a merge to `main`, with no stored secrets: the health check from ticket 02 works at the dev SWA URL. This is HITL in part, because a subscription admin runs the one-off bootstrap and sets up the GitHub Environments.

**Blocked by:** [02: Repo skeleton and test seams](02-repo-skeleton-and-test-seams.md)

**Status:** ready-for-agent

- [ ] **The bootstrap Bicep** (subscription scope, run once by hand) creates `rg-lingolens-dev` and `rg-lingolens-prod`, one user-assigned deploy identity per environment with a federated credential scoped to its GitHub Environment, and Contributor plus an RBAC Administrator role conditioned to assign only Cognitive Services User and Storage Blob Data Contributor. A runbook covers creating the `dev` and `prod` GitHub Environments.
- [ ] **The main Bicep** with dev and prod parameter files creates:
  - SWA Standard with a linked Flex Consumption Function App (system-assigned MI, max 10 instances)
  - a storage account with key access disabled
  - Translator S1 (custom-domain endpoint, system-assigned MI)
  - Document Intelligence
  - Application Insights
  - all role assignments: the Function MI → Cognitive Services User on both AI resources and Storage Blob Data Contributor; the Translator MI → Storage Blob Data Contributor
- [ ] Region is a parameter, defaulting to West Europe
- [ ] The API is reachable only through the SWA proxy (the linked backend)
- [ ] The infra workflow deploys the Bicep on changes under infra; the PR workflow adds Bicep what-if against dev
- [ ] The app workflow builds once, deploys the SPA and Function App to dev on merge to `main` (fetching the SWA token during the run), and keeps the artifacts for promotion to prod later
- [ ] The dev URL shows the health response
