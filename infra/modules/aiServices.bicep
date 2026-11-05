// Translator (single-service, S1) and Document Intelligence.
// Both use a custom subdomain, which Microsoft Entra ID auth requires, and have
// key auth disabled. Translator gets a system-assigned identity (user-assigned is
// not supported for batch Document Translation) so it can read and write the
// storage account's containers without SAS tokens.

param location string
param translatorName string
param documentIntelligenceName string
param tags object

@description('Document Intelligence SKU. F0 allows one per subscription and caps pages, so S0 for both environments.')
param documentIntelligenceSku string = 'S0'

resource translator 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: translatorName
  location: location
  tags: tags
  kind: 'TextTranslation'
  sku: {
    name: 'S1'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: translatorName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

resource documentIntelligence 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: documentIntelligenceName
  location: location
  tags: tags
  kind: 'FormRecognizer'
  sku: {
    name: documentIntelligenceSku
  }
  properties: {
    customSubDomainName: documentIntelligenceName
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

output translatorId string = translator.id
output translatorName string = translator.name
output translatorEndpoint string = translator.properties.endpoint
output translatorPrincipalId string = translator.identity.principalId
output documentIntelligenceId string = documentIntelligence.id
output documentIntelligenceName string = documentIntelligence.name
output documentIntelligenceEndpoint string = documentIntelligence.properties.endpoint
