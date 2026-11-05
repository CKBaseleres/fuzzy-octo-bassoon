# 03: Infrastructure bootstrap and dev deploy

Spec: [../spec.md](../spec.md) (Platform and hosting; Infrastructure and CI)

**What to build:** Dev runs in Azure from a merge to `main`, with no stored secrets: the health check from ticket 02 works at the dev SWA URL. This is HITL in part, because a subscription admin runs the one-off bootstrap and sets up the GitHub Environments.

**Blocked by:** [02: Repo skeleton and test seams](02-repo-skeleton-and-test-seams.md)

**Status:** ready-for-agent

- [x] **The bootstrap Bicep** (subscription scope, run once by hand) creates `rg-lingolens-dev` and `rg-lingolens-prod`, one user-assigned deploy identity per environment with a federated credential scoped to its GitHub Environment, and Contributor plus an RBAC Administrator role conditioned to assign only Cognitive Services User and Storage Blob Data Contributor. A runbook covers creating the `dev` and `prod` GitHub Environments.
- [x] **The main Bicep** with dev and prod parameter files creates:
  - SWA Standard with a linked Flex Consumption Function App (system-assigned MI, max 10 instances)
  - a storage account with key access disabled
  - Translator S1 (custom-domain endpoint, system-assigned MI)
  - Document Intelligence
  - Application Insights
  - all role assignments: the Function MI → Cognitive Services User on both AI resources and Storage Blob Data Contributor; the Translator MI → Storage Blob Data Contributor
- [x] Region is a parameter, defaulting to West Europe
- [x] The API is reachable only through the SWA proxy (the linked backend)
- [x] The infra workflow deploys the Bicep on changes under infra; the PR workflow adds Bicep what-if against dev
- [x] The app workflow builds once, deploys the SPA and Function App to dev on merge to `main` (fetching the SWA token during the run), and keeps the artifacts for promotion to prod later
- [ ] The dev URL shows the health response

## Comments

Code only: there was no Azure CLI login and no GitHub remote, so nothing has been deployed or pushed. Both templates compile and lint clean with Bicep CLI 0.48.1. `infra/tests/*.test.ts` (29 tests, run by `npm test`) check the compiled ARM JSON against this ticket. The workflows parse as YAML but have not been run or checked with actionlint. The ticked items are met in code; each one is proven only by the deploy below.

**Deviation (needs a human OK):** the deploy identity's conditioned RBAC Administrator can assign 5 roles, not 2. A keyless Function App also needs:
- **Storage Blob Data Owner**, for identity-based `AzureWebJobsStorage`. Timer triggers take their locks there.
- **Storage Table Data Contributor**, for host diagnostics and the quota Table in ticket 08.
- **Monitoring Metrics Publisher**, for Entra ID auth to Application Insights, whose local auth is off.

The list is `assignableByDeployIdentity` in `infra/shared/roles.bicep`. The condition also restricts assignments to service principals, for both assign and remove.

**Also:** the dev deploy identity has a second federated credential for this repo's `pull_request` subject, so `pr.yml` can run what-if without the `dev` Environment. GitHub issues no OIDC tokens to pull requests from forks.

**What the human must run** (full commands in `infra/README.md` → "Bootstrap runbook"):
1. A subscription admin registers the resource providers and checks that Flex Consumption is available in West Europe (`az functionapp list-flexconsumption-locations`).
2. They run `az deployment sub create -l westeurope -f infra/bootstrap.bicep -p githubRepository=<owner>/<repo>`.
3. Create the GitHub Environments `dev` and `prod`. `prod` gets a required reviewer and the `main`-only branch policy.
4. Set the repo variables `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` and `AZURE_DEV_CLIENT_ID`, plus the environment variable `AZURE_CLIENT_ID` on both `dev` and `prod`, from the bootstrap outputs.
5. Push to GitHub, then run **Infra** (workflow_dispatch) followed by **App** (workflow_dispatch) on `main`.
6. App's smoke step curls `https://<dev-swa>/api/health` through the SWA. When it passes, tick "The dev URL shows the health response". Also check that `https://<func>.azurewebsites.net/api/health` is refused (401), which proves the API is reachable only through the proxy.

