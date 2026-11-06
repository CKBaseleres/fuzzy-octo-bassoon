// Flex Consumption plan + Function App (Node, Functions v4 programming model).
// Keyless: the system-assigned identity reaches host storage, the deployment
// container and Application Insights; role assignments live in roleAssignments.bicep.
// The app is reachable only through the Static Web App it is linked to
// (staticWebApp.bicep): linking turns on the "Azure Static Web Apps (Linked)"
// identity provider, so direct calls to *.azurewebsites.net are rejected.

param location string
param planName string
param name string
param tags object

param storageAccountName string
param deploymentContainerUrl string
param appInsightsConnectionString string

@description('Flex Consumption on-demand instance cap (spec: 10).')
@minValue(1)
@maxValue(1000)
param maximumInstanceCount int

@allowed([512, 2048, 4096])
param instanceMemoryMB int = 2048

@description('Node.js major version of the Functions runtime.')
param nodeVersion string = '22'

@description('App-specific settings (name -> value). main.bicep owns the list.')
param appSettings object

var platformSettings = {
  // Identity-based host storage: only the account name, no connection string.
  AzureWebJobsStorage__accountName: storageAccountName
  APPLICATIONINSIGHTS_CONNECTION_STRING: appInsightsConnectionString
  // Microsoft Entra auth to Application Insights (local auth is disabled there).
  APPLICATIONINSIGHTS_AUTHENTICATION_STRING: 'Authorization=AAD'
}

var allSettings = union(platformSettings, appSettings)

resource plan 'Microsoft.Web/serverfarms@2024-11-01' = {
  name: planName
  location: location
  tags: tags
  kind: 'functionapp'
  sku: {
    name: 'FC1'
    tier: 'FlexConsumption'
  }
  properties: {
    reserved: true
  }
}

resource functionApp 'Microsoft.Web/sites@2024-11-01' = {
  name: name
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    functionAppConfig: {
      deployment: {
        storage: {
          type: 'blobContainer'
          value: deploymentContainerUrl
          authentication: {
            type: 'SystemAssignedIdentity'
          }
        }
      }
      scaleAndConcurrency: {
        maximumInstanceCount: maximumInstanceCount
        instanceMemoryMB: instanceMemoryMB
      }
      runtime: {
        name: 'node'
        version: nodeVersion
      }
    }
    siteConfig: {
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [for setting in items(allSettings): {
        name: setting.key
        value: string(setting.value)
      }]
    }
  }
}

// No publishing credentials: deployments use Microsoft Entra ID (OIDC in GitHub Actions).
resource ftpCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: functionApp
  name: 'ftp'
  properties: {
    allow: false
  }
}

resource scmCredentials 'Microsoft.Web/sites/basicPublishingCredentialsPolicies@2024-11-01' = {
  parent: functionApp
  name: 'scm'
  properties: {
    allow: false
  }
}

output id string = functionApp.id
output name string = functionApp.name
output location string = functionApp.location
output principalId string = functionApp.identity.principalId
output defaultHostName string = functionApp.properties.defaultHostName
