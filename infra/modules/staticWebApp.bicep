// Static Web App (Standard) serving the SPA, with the Function App linked as its
// "bring your own" backend for /api. Content is deployed by app.yml with a
// deployment token fetched at run time, so there is no repository integration here.
// Preview (pull-request) environments are off: they cannot link a backend.

param location string
param name string
param tags object

@description('Resource id of the Function App to link as the /api backend.')
param backendResourceId string

@description('Region of the Function App (the linked backend).')
param backendRegion string

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: name
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
    buildProperties: {
      skipGithubActionWorkflowGeneration: true
    }
  }
}

resource linkedBackend 'Microsoft.Web/staticSites/linkedBackends@2024-11-01' = {
  parent: staticWebApp
  name: 'api'
  properties: {
    backendResourceId: backendResourceId
    region: backendRegion
  }
}

output id string = staticWebApp.id
output name string = staticWebApp.name
output defaultHostName string = staticWebApp.properties.defaultHostname
