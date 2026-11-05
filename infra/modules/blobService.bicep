// The storage account's blob service settings: the ONE place blobServices 'default'
// is declared. main.bicep deploys it after the Static Web App, because the CORS
// rule needs the SWA's origin.
//
// - CORS: the browser PUTs the Source file straight to Blob Storage with a write-only
//   SAS, and GETs the Translated file with a read-only SAS. Only this environment's
//   own origin(s) may do so.
// - Retention: soft delete, versioning and point-in-time restore are off, so a
//   deleted blob is really gone (spec: "Files and retention").

param storageAccountName string

@description('Browser origins allowed to upload and download blobs, e.g. https://<swa>.azurestaticapps.net.')
param allowedOrigins string[]

resource storage 'Microsoft.Storage/storageAccounts@2024-01-01' existing = {
  name: storageAccountName
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2024-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    cors: {
      corsRules: [
        {
          allowedOrigins: allowedOrigins
          allowedMethods: ['GET', 'HEAD', 'PUT', 'OPTIONS']
          allowedHeaders: ['content-type', 'x-ms-blob-type', 'x-ms-version', 'x-ms-date', 'x-ms-client-request-id']
          exposedHeaders: ['content-length', 'content-type', 'etag', 'x-ms-request-id']
          maxAgeInSeconds: 3600
        }
      ]
    }
    deleteRetentionPolicy: {
      enabled: false
    }
    containerDeleteRetentionPolicy: {
      enabled: false
    }
    isVersioningEnabled: false
    restorePolicy: {
      enabled: false
    }
  }
}
