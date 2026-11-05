// One environment's GitHub Actions deploy identity, scoped to its resource group.
// Deployed by ../bootstrap.bicep; not deployed on its own.

import { roleIds, assignableByDeployIdentity } from '../shared/roles.bicep'

param environmentName string
param location string
param githubRepository string

var githubIssuer = 'https://token.actions.githubusercontent.com'
var githubAudiences = ['api://AzureADTokenExchange']

resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'id-lingolens-deploy-${environmentName}'
  location: location
  tags: {
    app: 'lingolens'
    env: environmentName
  }
}

// Jobs that declare `environment: <env>` (infra.yml, app.yml deploy jobs).
resource environmentCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: identity
  name: 'github-environment-${environmentName}'
  properties: {
    issuer: githubIssuer
    subject: 'repo:${githubRepository}:environment:${environmentName}'
    audiences: githubAudiences
  }
}

// pr.yml's Bicep what-if against dev runs without a GitHub Environment (so it is not
// blocked by deployment-branch rules), which gives it the pull_request subject.
// GitHub does not issue OIDC tokens to pull requests from forks.
// Federated credentials on one identity must be written one at a time, hence dependsOn.
resource pullRequestCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = if (environmentName == 'dev') {
  parent: identity
  name: 'github-pull-request'
  properties: {
    issuer: githubIssuer
    subject: 'repo:${githubRepository}:pull_request'
    audiences: githubAudiences
  }
  dependsOn: [environmentCredential]
}

resource contributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, roleIds.contributor)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.contributor)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Lingo Lens ${environmentName} deploy identity (GitHub Actions)'
  }
}

var allowedRoles = join(assignableByDeployIdentity, ', ')

// Format: https://learn.microsoft.com/azure/role-based-access-control/delegate-role-assignments-examples#example-constrain-roles-and-principal-types
var rbacCondition = '((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/write\'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${allowedRoles}} AND @Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {\'ServicePrincipal\'})) AND ((!(ActionMatches{\'Microsoft.Authorization/roleAssignments/delete\'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${allowedRoles}} AND @Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {\'ServicePrincipal\'}))'

resource rbacAdministrator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, identity.id, roleIds.roleBasedAccessControlAdministrator)
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roleIds.roleBasedAccessControlAdministrator)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
    description: 'Lingo Lens ${environmentName} deploy identity: may assign only the app\'s data-plane roles to managed identities'
    conditionVersion: '2.0'
    condition: rbacCondition
  }
}

output clientId string = identity.properties.clientId
output principalId string = identity.properties.principalId
