// One-off bootstrap, run ONCE BY HAND by a subscription admin (Owner, or
// Contributor + Role Based Access Control Administrator / User Access Administrator).
// See infra/README.md "Bootstrap runbook". Never run from CI.
//
// Creates, per environment (dev, prod):
//   - resource group rg-lingolens-<env>
//   - user-assigned deploy identity id-lingolens-deploy-<env>, federated with the
//     repo's GitHub Environment <env> (dev also trusts pull_request, for what-if)
//   - on that resource group: Contributor, plus Role Based Access Control
//     Administrator conditioned to assign/remove only the roles in
//     shared/roles.bicep `assignableByDeployIdentity`, and only to service principals.

targetScope = 'subscription'

@description('GitHub repository as "owner/name". Federated credentials trust only this repo.')
param githubRepository string

@description('Region for the resource groups and identities.')
param location string = 'westeurope'

@description('Environments to create. Each gets its own resource group and deploy identity.')
param environments string[] = ['dev', 'prod']

resource resourceGroups 'Microsoft.Resources/resourceGroups@2024-03-01' = [for env in environments: {
  name: 'rg-lingolens-${env}'
  location: location
  tags: {
    app: 'lingolens'
    env: env
  }
}]

module deployIdentities 'bootstrap/deployIdentity.bicep' = [for (env, i) in environments: {
  name: 'lingolens-deploy-identity-${env}'
  scope: resourceGroups[i]
  params: {
    environmentName: env
    location: location
    githubRepository: githubRepository
  }
}]

output tenantId string = tenant().tenantId
output subscriptionId string = subscription().subscriptionId
@description('Per environment: set AZURE_CLIENT_ID on the matching GitHub Environment to clientId.')
output deployIdentities array = [for (env, i) in environments: {
  environment: env
  resourceGroup: resourceGroups[i].name
  clientId: deployIdentities[i].outputs.clientId
  principalId: deployIdentities[i].outputs.principalId
}]
