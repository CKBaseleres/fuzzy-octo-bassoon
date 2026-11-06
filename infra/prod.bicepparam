using 'main.bicep'

param environmentName = 'prod'
param location = 'westeurope'
param functionMaximumInstanceCount = 10

// Kill switch: see the runbook in infra/README.md before changing.
param translationsEnabled = true

param dailyTranslationQuota = 300
param hourlyPerIpQuota = 20

// Still to fill in before the first prod deploy (later tickets add the params):
//   - custom domain: set customDomain below (e.g. 'lingolens.<org-domain>'); it is
//     added to the storage CORS origins

// Budget: alerts at 50/80/100% of actual spend and 100% of forecast.
// Fill in the recipients (a shared mailbox or distribution list) before the first
// prod deploy: while the list is empty, no Budget is deployed.
param budgetAmount = 100
param budgetAlertEmails = []

// Fill in before the first prod deploy (host name only, no https://).
param customDomain = ''
