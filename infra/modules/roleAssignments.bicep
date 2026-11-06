// Every data-plane role assignment the app needs. All principals are managed
// identities (principalType ServicePrincipal), which the deploy identity's
// conditioned RBAC Administrator role requires.

import { roleIds } from '../shared/roles.bicep'

param storageAccountName string
param translatorName string
param documentIntelligenceName string
param appInsightsName string

@description('Function App system-assigned identity.')
param functionPrincipalId string

@description('Translator system-assigned identity.')
param translatorPrincipalId string

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

resource translator 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: translatorName
}

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2024-10-01' existing = {
  name: documentIntelligenceName
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' existing = {
  name: appInsightsName
}

// --- Function App identity ---

resource functionTranslatorUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(translator.id, functionPrincipalId, roleIds.cognitiveServicesUser)
  scope: translator
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource functionDocumentIntelligenceUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(documentIntelligence.id, functionPrincipalId, roleIds.cognitiveServicesUser)
  scope: documentIntelligence
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.cognitiveServicesUser)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// The app's own blob access (upload/download SAS via user delegation key, cleanup).
resource functionBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionPrincipalId, roleIds.storageBlobDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageBlobDataContributor)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Functions host: identity-based AzureWebJobsStorage needs Blob Data Owner
// (host storage, timer-trigger locks, deployment package container).
resource functionBlobOwner 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionPrincipalId, roleIds.storageBlobDataOwner)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageBlobDataOwner)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Functions host diagnostic events; ticket 08's quota Table uses the same role.
resource functionTableContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, functionPrincipalId, roleIds.storageTableDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageTableDataContributor)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource functionMetricsPublisher 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(appInsights.id, functionPrincipalId, roleIds.monitoringMetricsPublisher)
  scope: appInsights
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.monitoringMetricsPublisher)
    principalId: functionPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// --- Translator identity (batch Document Translation reads/writes containers) ---

resource translatorBlobContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, translatorPrincipalId, roleIds.storageBlobDataContributor)
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.storageBlobDataContributor)
    principalId: translatorPrincipalId
    principalType: 'ServicePrincipal'
  }
}
