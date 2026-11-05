// The one storage account: Functions host storage, the Flex Consumption deployment
// package container, and (later tickets) translation blobs and the quota Table.
// Shared-key access is disabled: everything authenticates with Microsoft Entra ID.
//
// Extension points for later tickets:
//   - ticket 04/07: translation blob container(s) and the 1-day lifecycle rule
//     (managementPolicies) belong here. The CORS rule and soft delete / versioning /
//     point-in-time restore live on blobServices/default, which needs the SWA origin,
//     and the SWA is deployed after this module (SWA -> Function App -> storage).
//     So add a separate module (e.g. modules/blobService.bicep) that main.bicep deploys
//     after staticWebApp and that declares blobServices 'default' with cors +
//     deleteRetentionPolicy/containerDeleteRetentionPolicy/isVersioningEnabled/
//     restorePolicy. Keep blobServices 'default' declared in exactly ONE place.
//   - ticket 08: the quota Table under a `tableServices` child.

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

output id string = storage.id
output name string = storage.name
output blobEndpoint string = storage.properties.primaryEndpoints.blob
output deploymentContainerUrl string = '${storage.properties.primaryEndpoints.blob}${deploymentContainer.name}'
