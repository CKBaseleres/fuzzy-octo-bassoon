# infra

Bicep for Lingo Lens. Two environments, **dev** and **prod**, each a full and separate set of resources in its own resource group (`rg-lingolens-dev`, `rg-lingolens-prod`) in one subscription. The default region is West Europe, with Sweden Central as the fallback.

| File | What it is | Who runs it |
|---|---|---|
| `bootstrap.bicep` (+ `bootstrap/deployIdentity.bicep`) | Subscription scope. Creates the resource groups, one deploy identity per environment, their GitHub federated credentials and their role assignments. | A subscription admin, **once**, by hand |
| `main.bicep` (+ `modules/*.bicep`) | Resource group scope. Everything the app needs in one environment. | `.github/workflows/infra.yml` |
| `dev.bicepparam`, `prod.bicepparam` | Per-environment values (quotas, kill switch, region). | |
| `shared/roles.bicep` | Role GUIDs, plus the list of roles the deploy identities may assign. Both templates import it. | |

## What `main.bicep` creates

- **Static Web App** (Standard), with preview environments off. The **Function App** is linked to it as its backend, so `/api/*` is served through the SWA proxy. Linking turns on the "Azure Static Web Apps (Linked)" identity provider on the Function App, so it rejects direct calls.
- **Function App** on **Flex Consumption** (Node 22, system-assigned identity, at most 10 instances). FTP and SCM publishing credentials are off.
- A **storage account** with shared-key access disabled. It holds the Functions host storage and the deployment package container (`app-package`).
- **Translator** (S1, custom-domain endpoint, system-assigned identity, key auth off) and **Document Intelligence** (S0, custom-domain endpoint, key auth off).
- **Application Insights** (workspace-based, local auth off) and its Log Analytics workspace.
- **Role assignments**, all to managed identities:

  | Identity | Role | Scope | Why |
  |---|---|---|---|
  | Function App | Cognitive Services User | Translator, Document Intelligence | Calls both services keylessly |
  | Function App | Storage Blob Data Contributor | Storage | App blobs, user delegation SAS |
  | Function App | Storage Blob Data Owner | Storage | Required by the Functions host for identity-based `AzureWebJobsStorage` (timer locks) |
  | Function App | Storage Table Data Contributor | Storage | Functions host diagnostic events; the quota Table (ticket 08) |
  | Function App | Monitoring Metrics Publisher | Application Insights | Entra ID auth for telemetry |
  | Translator | Storage Blob Data Contributor | Storage | Batch Document Translation reads and writes containers without SAS |

- **App settings** on the Function App: `STORAGE_ACCOUNT_NAME`, `STORAGE_BLOB_ENDPOINT`, `TRANSLATOR_ENDPOINT`, `DOCUMENT_INTELLIGENCE_ENDPOINT`, `TRANSLATIONS_ENABLED`, `DAILY_TRANSLATION_QUOTA`, `HOURLY_PER_IP_QUOTA`, `DOCUMENT_TIMEOUT_MINUTES` and `IMAGE_TIMEOUT_MINUTES`, plus the platform settings. An infra deploy **rewrites all app settings**, so set them only in Bicep.

## Validate locally

You need the Bicep CLI: the standalone `bicep` binary, or the Azure CLI's copy (`az bicep install`, which puts it at `~/.azure/bin/bicep`). If the binary is anywhere else, set `BICEP_BIN=/path/to/bicep`.

```sh
npm test -w infra        # compiles both templates and checks them; skips if no Bicep CLI is found
bicep lint infra/main.bicep
bicep build-params infra/dev.bicepparam --stdout
```

CI (`pr.yml`) installs the CLI and sets `REQUIRE_BICEP=1`, so these tests never skip there. `pr.yml` also runs `az deployment group what-if` against dev once the bootstrap is done.

## Bootstrap runbook (once, by a subscription admin)

The admin needs the **Owner** role on the subscription, or Contributor plus User Access Administrator. They also need admin rights on the GitHub repository.

1. **Sign in and pick the subscription.**

   ```sh
   az login
   az account set --subscription <subscription-id>
   ```

2. **Register the resource providers.** The deploy identities are scoped to their resource groups, so they cannot do this themselves.

   ```sh
   for ns in Microsoft.Web Microsoft.Storage Microsoft.CognitiveServices Microsoft.Insights \
             Microsoft.OperationalInsights Microsoft.ManagedIdentity Microsoft.Consumption; do
     az provider register --namespace "$ns"
   done
   ```

3. **Check the region.** Flex Consumption must be available in West Europe:

   ```sh
   az functionapp list-flexconsumption-locations --query "[].name" -o tsv | grep -i westeurope
   ```

   If it is not, use `swedencentral`: pass `location=swedencentral` in step 4, and change `location` in both `.bicepparam` files.

4. **Deploy the bootstrap.**

   ```sh
   az deployment sub create \
     --name lingolens-bootstrap \
     --location westeurope \
     --template-file infra/bootstrap.bicep \
     --parameters githubRepository=<owner>/<repo>
   ```

   Note the outputs `tenantId`, `subscriptionId` and `deployIdentities[].clientId`.

5. **Create the GitHub Environments.** GitHub Environments are not Azure resources, so Bicep cannot create them. Create them with `gh` or in the repository settings (Settings → Environments).

   ```sh
   REPO=<owner>/<repo>
   gh api -X PUT "repos/$REPO/environments/dev"
   # prod needs a required reviewer. Get each reviewer's numeric user id with: gh api users/<login> --jq .id
   gh api -X PUT "repos/$REPO/environments/prod" \
     -F "reviewers[][type]=User" -F "reviewers[][id]=<reviewer-user-id>" \
     -F "deployment_branch_policy[protected_branches]=false" \
     -F "deployment_branch_policy[custom_branch_policies]=true"
   gh api -X POST "repos/$REPO/environments/prod/deployment-branch-policies" -f name=main
   ```

   Optionally, restrict `dev` to `main` in the same way. `pr.yml`'s what-if job does not use the `dev` environment, so this restriction does not block pull requests.

6. **Set the GitHub variables.** These are variables, not secrets: none of them is a credential.

   ```sh
   gh variable set AZURE_TENANT_ID       --repo "$REPO" --body <tenantId>
   gh variable set AZURE_SUBSCRIPTION_ID --repo "$REPO" --body <subscriptionId>
   gh variable set AZURE_DEV_CLIENT_ID   --repo "$REPO" --body <dev clientId>   # used by pr.yml what-if
   gh variable set AZURE_CLIENT_ID --repo "$REPO" --env dev  --body <dev clientId>
   gh variable set AZURE_CLIENT_ID --repo "$REPO" --env prod --body <prod clientId>
   ```

7. **Do the first deploy, in this order.**
   1. Actions → **Infra** → Run workflow on `main`. It deploys dev; the prod job then waits for approval.
   2. Actions → **App** → Run workflow on `main`. It builds, deploys to dev, and smoke-tests `https://<dev-swa-host>/api/health`.
   3. Open the dev URL (it is shown on the run's `dev` environment) and check that `/api/health` returns `{"status":"ok",...}`.

   After the first deploy, merges to `main` deploy on their own. `infra.yml` runs when `infra/` changes, and `app.yml` runs on every other change. Both share a `deploy-<env>` concurrency group, so their deploys never overlap.

### Changing which roles the deploy identity may assign

The deploy identity's RBAC Administrator role is conditioned on `assignableByDeployIdentity` in `shared/roles.bicep`. If `main.bicep` needs a new role, add it there **and have an admin re-run step 4**. Until then, `infra.yml` fails with `AuthorizationFailed`. The infra tests fail if `main.bicep` assigns a role that is not on the list.

## Kill switch runbook

`TRANSLATIONS_ENABLED` is a Bicep parameter, because an infra deploy rewrites every app setting.

1. **Emergency:** in the portal, open Function App → Settings → Environment variables, set `TRANSLATIONS_ENABLED` to `false`, and apply. The app restarts with translations off.
2. **Straight after:** set `param translationsEnabled = false` in that environment's `.bicepparam` and merge. Otherwise the next `infra.yml` run switches translations back on.

## Before the first prod deploy

Fill in these values; later tickets add the parameters for them:

- the Budget alert recipients (ticket 08)
- the required reviewer(s) for the `prod` GitHub Environment (step 5)
- the prod custom domain `lingolens.<org-domain>`, which is a CNAME from the organisation's DNS team
