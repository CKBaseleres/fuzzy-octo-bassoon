// Log Analytics workspace + workspace-based Application Insights.
// Local (instrumentation-key) auth is off: the Function App sends telemetry with its
// managed identity (Monitoring Metrics Publisher, see roleAssignments.bicep).
// Ticket 07 adds the "never record content or filenames" settings here and in host.json.

param location string
param logAnalyticsName string
param appInsightsName string
param tags object

@description('Days Log Analytics keeps data.')
param retentionInDays int = 30

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    retentionInDays: retentionInDays
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
    DisableLocalAuth: true
  }
}

output appInsightsId string = appInsights.id
output appInsightsName string = appInsights.name
output connectionString string = appInsights.properties.ConnectionString
output logAnalyticsId string = logAnalytics.id
