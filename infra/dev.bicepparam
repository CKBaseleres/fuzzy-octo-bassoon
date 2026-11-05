using 'main.bicep'

param environmentName = 'dev'
param location = 'westeurope'
param functionMaximumInstanceCount = 10

// Kill switch: see the runbook in infra/README.md before changing.
param translationsEnabled = true

// Dev runs lower quotas than prod.
param dailyTranslationQuota = 50
param hourlyPerIpQuota = 10

// Dev uses the SWA default host name only.
param customDomain = ''
