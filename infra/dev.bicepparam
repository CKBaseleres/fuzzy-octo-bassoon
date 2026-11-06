using 'main.bicep'

param environmentName = 'dev'
param location = 'westeurope'
param functionMaximumInstanceCount = 10

// Kill switch: see the runbook in infra/README.md before changing.
param translationsEnabled = true

// Dev runs lower quotas than prod.
param dailyTranslationQuota = 50
param hourlyPerIpQuota = 10

// Budget: alerts at 50/80/100% of actual spend and 100% of forecast.
// While the recipient list is empty, no Budget is deployed.
param budgetAmount = 25
param budgetAlertEmails = []

// Dev uses the SWA default host name only.
param customDomain = ''
