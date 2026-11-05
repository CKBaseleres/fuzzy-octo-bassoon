// Lingo Lens: everything one environment (dev or prod) needs, in one resource group.
// Deployed by .github/workflows/infra.yml with dev.bicepparam / prod.bicepparam:
//   az deployment group create -g rg-lingolens-<env> -f infra/main.bicep -p infra/<env>.bicepparam
//
// Later tickets extend this file rather than adding new templates:
//   - 07: Blob lifecycle rule -> modules/storage.bicep (CORS and retention-off are in
//         modules/blobService.bicep, deployed after the SWA; ticket 04)
//   - 07: Application Insights "no content, no filenames" settings -> modules/monitoring.bicep
//   - 08 (done): quota Table (modules/storage.bicep), Budget + alerts (modules/budget.bicep),
//         kill switch (translationsEnabled)
//   - 09: saved Log Analytics query (modules/monitoring.bicep)

targetScope = 'resourceGroup'

@description('Environment name; drives resource names and tags.')
@allowed(['dev', 'prod'])
param environmentName string

@description('Region for every resource. West Europe by default; Sweden Central is the agreed fallback.')
param location string = 'westeurope'

@description('Flex Consumption on-demand instance cap.')
@minValue(1)
param functionMaximumInstanceCount int = 10

// --- App settings consumed by later tickets (stubbed now so the shape is fixed) ---

@description('Kill switch. false makes the API refuse new Translations. Flip in the portal in an emergency, then commit here.')
param translationsEnabled bool = true

@description('Global Translations per UTC day.')
@minValue(0)
param dailyTranslationQuota int

@description('Translations per client IP per hour.')
@minValue(0)
param hourlyPerIpQuota int

@description('A Document Translation times out this many minutes after it starts.')
@minValue(1)
param documentTimeoutMinutes int = 15

@description('An Image Translation times out this many minutes after it starts.')
@minValue(1)
param imageTimeoutMinutes int = 3

@description('Prod custom domain (host name only, e.g. lingolens.example.org). Empty: the SWA default host name only.')
param customDomain string = ''

@description('Monthly Budget amount for the resource group, in the billing currency. Dev 25, prod 100.')
@minValue(1)
param budgetAmount int

@description('Budget alert recipients (a shared mailbox or distribution list). Empty: no Budget is deployed.')
param budgetAlertEmails array

@description('Extra tags merged onto every resource.')
param extraTags object = {}

var tags = union({ app: 'lingolens', env: environmentName }, extraTags)

// Globally unique names get a short, stable suffix derived from the resource group.
var suffix = take(uniqueString(resourceGroup().id), 6)
var names = {
  logAnalytics: 'log-lingolens-${environmentName}'
  appInsights: 'appi-lingolens-${environmentName}'
  storage: 'stlingolens${environmentName}${suffix}'
  translator: 'trl-lingolens-${environmentName}-${suffix}'
  documentIntelligence: 'di-lingolens-${environmentName}-${suffix}'
  plan: 'asp-lingolens-${environmentName}'
  functionApp: 'func-lingolens-${environmentName}-${suffix}'
  staticWebApp: 'swa-lingolens-${environmentName}'
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    logAnalyticsName: names.logAnalytics
    appInsightsName: names.appInsights
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  params: {
    location: location
    name: names.storage
    tags: tags
  }
}

module aiServices 'modules/aiServices.bicep' = {
  name: 'aiServices'
  params: {
    location: location
    translatorName: names.translator
    documentIntelligenceName: names.documentIntelligence
    tags: tags
  }
}

module functionApp 'modules/functionApp.bicep' = {
  name: 'functionApp'
  params: {
    location: location
    planName: names.plan
    name: names.functionApp
    tags: tags
    storageAccountName: storage.outputs.name
    deploymentContainerUrl: storage.outputs.deploymentContainerUrl
    appInsightsConnectionString: monitoring.outputs.connectionString
    maximumInstanceCount: functionMaximumInstanceCount
    // The app's configuration contract. api/src/index.ts reads these.
    appSettings: {
      STORAGE_ACCOUNT_NAME: storage.outputs.name
      STORAGE_BLOB_ENDPOINT: storage.outputs.blobEndpoint
      STORAGE_TABLE_ENDPOINT: storage.outputs.tableEndpoint
      QUOTA_TABLE_NAME: storage.outputs.quotaTableName
      TRANSLATOR_ENDPOINT: aiServices.outputs.translatorEndpoint
      DOCUMENT_INTELLIGENCE_ENDPOINT: aiServices.outputs.documentIntelligenceEndpoint
      TRANSLATIONS_ENABLED: translationsEnabled ? 'true' : 'false'
      DAILY_TRANSLATION_QUOTA: dailyTranslationQuota
      HOURLY_PER_IP_QUOTA: hourlyPerIpQuota
      DOCUMENT_TIMEOUT_MINUTES: documentTimeoutMinutes
      IMAGE_TIMEOUT_MINUTES: imageTimeoutMinutes
    }
  }
}

module roleAssignments 'modules/roleAssignments.bicep' = {
  name: 'roleAssignments'
  params: {
    storageAccountName: storage.outputs.name
    translatorName: aiServices.outputs.translatorName
    documentIntelligenceName: aiServices.outputs.documentIntelligenceName
    appInsightsName: monitoring.outputs.appInsightsName
    functionPrincipalId: functionApp.outputs.principalId
    translatorPrincipalId: aiServices.outputs.translatorPrincipalId
  }
}

module staticWebApp 'modules/staticWebApp.bicep' = {
  name: 'staticWebApp'
  params: {
    location: location
    name: names.staticWebApp
    tags: tags
    backendResourceId: functionApp.outputs.id
    backendRegion: functionApp.outputs.location
  }
}

// Needs the SWA origin, so it runs after staticWebApp (and so after storage).
module blobService 'modules/blobService.bicep' = {
  name: 'blobService'
  params: {
    storageAccountName: storage.outputs.name
    allowedOrigins: concat(
      ['https://${staticWebApp.outputs.defaultHostName}'],
      empty(customDomain) ? [] : ['https://${customDomain}']
    )
  }
}

// Alerts at 50/80/100% of actual spend and 100% of forecast. It needs a recipient,
// so it is skipped until budgetAlertEmails is filled in.
module budget 'modules/budget.bicep' = if (!empty(budgetAlertEmails)) {
  name: 'budget'
  params: {
    name: 'budget-lingolens-${environmentName}'
    amount: budgetAmount
    contactEmails: budgetAlertEmails
  }
}

output staticWebAppName string = staticWebApp.outputs.name
output staticWebAppUrl string = 'https://${staticWebApp.outputs.defaultHostName}'
output functionAppName string = functionApp.outputs.name
output storageAccountName string = storage.outputs.name
