using 'main.bicep'

param environmentName = 'prod'
param location = 'westeurope'
param functionMaximumInstanceCount = 10

// Kill switch: see the runbook in infra/README.md before changing.
param translationsEnabled = true

param dailyTranslationQuota = 300
param hourlyPerIpQuota = 20

// Still to fill in before the first prod deploy (later tickets add the params):
//   - Budget alert recipients (ticket 08)
//   - custom domain: set customDomain below (e.g. 'lingolens.<org-domain>'); it is
//     added to the storage CORS origins

// Fill in before the first prod deploy (host name only, no https://).
param customDomain = ''
