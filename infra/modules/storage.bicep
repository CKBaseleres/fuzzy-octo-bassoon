// The one storage account: Functions host storage, the Flex Consumption deployment
// package container, and (later tickets) translation blobs and the quota Table.
// Shared-key access is disabled: everything authenticates with Microsoft Entra ID.
//
// Extension points for later tickets:
//   - ticket 07: the 1-day lifecycle rule (managementPolicies) for the source/target
//     containers belongs here. CORS and soft delete / versioning / point-in-time
//     restore live on blobServices 'default', which is declared in exactly ONE place:
//     modules/blobService.bicep (deployed after the SWA, whose origin CORS needs).
// The quota Table (ticket 08) is under `tableServices` below.

param location string
param name string
param tags object

@description('Blob container that holds the Function App deployment package (Flex Consumption).')
param deploymentContainerName string = 'app-package'

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' = {
  name: name
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// Always present on a StorageV2 account; its settings are owned elsewhere (see above).
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' existing = {
  parent: storage
  name: 'default'
}

resource deploymentContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: deploymentContainerName
  properties: {
    publicAccess: 'None'
  }
}

// Translation blobs (ticket 04): `source/<guid>/file.<ext>` is the uploaded Source file,
// `target/<guid>/file.<ext>` the Translated file. Names carry no personal data.
resource sourceContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: 'source'
  properties: {
    publicAccess: 'None'
  }
}

resource targetContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2024-01-01' = {
  parent: blobService
  name: 'target'
  properties: {
    publicAccess: 'None'
  }
}

// Quota counters (ticket 08): one entity per counter, holding only a count.
// Keys are 'daily'/<UTC date> and 'hourly-<UTC hour>'/<truncated SHA-256 of the IP>.
resource tableService 'Microsoft.Storage/storageAccounts/tableServices@2024-01-01' existing = {
  parent: storage
  name: 'default'
}

resource quotaTable 'Microsoft.Storage/storageAccounts/tableServices/tables@2024-01-01' = {
  parent: tableService
  name: 'quotacounters'
}

output id string = storage.id
output name string = storage.name
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output tableEndpoint string = storage.properties.primaryEndpoints.table
output quotaTableName string = quotaTable.name
output sourceContainerName string = sourceContainer.name
output targetContainerName string = targetContainer.name
output deploymentContainerUrl string = '${storage.properties.primaryEndpoints.blob}${deploymentContainer.name}'
