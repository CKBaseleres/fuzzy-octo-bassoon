# Deployment and CI

Type: grilling
Status: resolved
Map: ../map.md

## Question

How is Lingo Lens deployed? [Backend and hosting architecture](04-backend-and-hosting-architecture.md) fixed the resources: SWA Standard, a linked Flex Consumption Function App, a single-service Translator (S1) and Document Intelligence, and a Storage account, all keyless via Managed Identity in one region. Decide:

- Which Azure region the organisation uses for data residency
- Which environments exist (dev/test/prod?) and how they are kept separate (subscriptions, resource groups). SWA pull-request environments cannot link a backend.
- How the infrastructure is written as code (Bicep or Terraform), including the role assignments
- Which pipeline builds and deploys the SPA and the Function App separately (GitHub Actions or Azure DevOps)

Constraints from [How file handling works](05-file-handling.md): the storage account needs a CORS rule for the app origin (for the browser upload). It also needs a 1-day lifecycle rule as a backstop, with soft delete, versioning and point-in-time restore off, and Application Insights configured so it never records content or filenames.

Inputs from [Limits, cost and abuse guardrails](06-limits-and-cost-guardrails.md): the monthly Azure Budget amount and the alert recipients (still to be named); a Table Storage table for quota counters; app settings `DAILY_TRANSLATION_QUOTA=300`, `HOURLY_PER_IP_QUOTA=20` and `TRANSLATIONS_ENABLED`; a Flex Consumption maximum of 10 instances; `noindex` headers and `robots.txt` in `staticwebapp.config.json`.

## Answer

Decided with the user on 2026-11-05 (grilling). The user accepted every recommendation.

- **Region:** **West Europe** for every resource; the SWA static content is global. Fallback: **Sweden Central**, if West Europe cannot host Flex Consumption or Translator batch. Microsoft Learn has no static list of Flex Consumption regions, so check during [Azure spike: latency, error payloads, OCR quality](09-azure-spike.md): the portal shows only supported regions, or run `az functionapp list-flexconsumption-locations`.
- **Environments:** **dev** and **prod**, as `rg-lingolens-dev` and `rg-lingolens-prod` in one subscription. Each has a full, separate set of resources; nothing is shared.
  - SWA pull-request preview environments are **off**, because they cannot link the backend.
  - Dev is public like prod, with the same `noindex`, but has lower quotas (`DAILY_TRANSLATION_QUOTA=50`, `HOURLY_PER_IP_QUOTA=10`).
- **URL:** prod uses a **custom domain** (`lingolens.<org-domain>`, a CNAME from the organisation's DNS team). Dev uses the default `*.azurestaticapps.net` hostname. Each storage account's CORS rule allows only its own environment's origin.
- **Repository:** a single repo with npm workspaces: `web/` (SPA), `api/` (Function App), `shared/` (request and response types) and `infra/` (Bicep).
- **Infrastructure as code: Bicep.** `infra/main.bicep` plus `dev.bicepparam` and `prod.bicepparam`. Bicep owns everything listed in this ticket's question:
  - the CORS rule, 1-day lifecycle rule, and soft delete, versioning and point-in-time restore turned off
  - the Table for quota counters, the app settings, Flex Consumption max 10 instances, and the role assignments
  - Application Insights, the Budget and its alerts
  - **One-off setup:** `infra/bootstrap.bicep` at subscription scope, run once by hand by a subscription admin. It creates the two resource groups, the two deploy identities, their federated credentials and their role assignments. GitHub Environments are not Azure resources, so they are created in that same runbook step with `gh`/the GitHub UI rather than Bicep.
- **CI/CD: GitHub + GitHub Actions**, with no stored Azure secrets.
  - Each environment has a **user-assigned managed identity** with a federated credential scoped to the matching GitHub Environment. On its own resource group it has **Contributor** and **Role Based Access Control Administrator**, conditioned to assign only Cognitive Services User and Storage Blob Data Contributor.
  - The SWA deployment token is fetched during the run (`az staticwebapp secrets list`).
  - Workflows:
    - `pr.yml`: lint, typecheck, unit tests, build, and Bicep `what-if` against dev.
    - `infra.yml`: Bicep deploy, on changes under `infra/`.
    - `app.yml`: builds the SPA and the Function App and deploys them separately.
  - **Release flow:** a merge to `main` deploys to dev automatically. The **same build artifacts** are then promoted to prod through the GitHub Environment `prod`, which needs a required reviewer. There are no release branches or tags.
- **Kill switch:** `TRANSLATIONS_ENABLED` is a Bicep parameter, because an infrastructure deploy rewrites all app settings. Runbook: flip it in the portal in an emergency, then commit the parameter change so the next `infra.yml` run does not undo it.
- **Budget:** prod $100/month and dev $25/month. Alerts fire at 50%, 80% and 100% of actual spend and at 100% of forecast.
- **Parameters to fill in before the first prod deploy:** the Budget alert recipients (a shared mailbox or distribution list), the required reviewer(s) for the `prod` GitHub Environment, and the prod custom domain.
