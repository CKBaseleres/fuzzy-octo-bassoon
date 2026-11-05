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

// Ticket 09: failures no classifier rule matched (`mapped: false` on `translation.failed`).
// The Node worker writes `context.warn/error('translation.failed', fields)` as one message,
// so the fields are pulled out of the text. Check the extracts against real rows in ticket 13.
var unmappedAzureErrorsQuery = '''
AppTraces
| where TimeGenerated > ago(7d)
| where Message startswith "translation.failed"
| where Message matches regex @"mapped['\"]?\s*:\s*false"
| extend ruleId = extract(@"ruleId['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message),
         service = extract(@"service['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message),
         operation = extract(@"operation['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message),
         httpStatus = extract(@"httpStatus['\"]?\s*:\s*(\d+)", 1, Message),
         errorCode = extract(@"errorCode['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message),
         innerErrorCode = extract(@"innerErrorCode['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message),
         jobStatus = extract(@"jobStatus['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message),
         translationGuid = extract(@"translationGuid['\"]?\s*:\s*['\"]([^'\"]+)", 1, Message)
| summarize occurrences = count(), lastSeen = max(TimeGenerated), exampleGuid = any(translationGuid)
    by ruleId, service, operation, httpStatus, errorCode, innerErrorCode, jobStatus
| order by occurrences desc
'''

resource unmappedAzureErrors 'Microsoft.OperationalInsights/workspaces/savedSearches@2023-09-01' = {
  parent: logAnalytics
  name: 'lingolens-unmapped-azure-errors'
  properties: {
    category: 'Lingo Lens'
    displayName: 'Unmapped Azure errors (7 days)'
    query: unmappedAzureErrorsQuery
    version: 2
  }
}

output appInsightsId string = appInsights.id
output appInsightsName string = appInsights.name
output connectionString string = appInsights.properties.ConnectionString
output logAnalyticsId string = logAnalytics.id
