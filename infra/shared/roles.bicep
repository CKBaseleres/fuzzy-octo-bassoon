// Built-in Azure role definition ids, shared by bootstrap.bicep and main.bicep.
// `assignableByDeployIdentity` is the exact list the deploy identities' conditioned
// Role Based Access Control Administrator assignment allows. Every role main.bicep
// assigns MUST be in it, or the infra deploy fails with AuthorizationFailed.
// Adding a role here takes effect only after an admin re-runs the bootstrap.

@export()
var roleIds = {
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c'
  roleBasedAccessControlAdministrator: 'f58310d9-a9f6-439a-9e8d-f62e7b41a168'
  cognitiveServicesUser: 'a97b65f3-24c7-4388-baec-2e87135dc908'
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
  storageTableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3'
  monitoringMetricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb'
}

@export()
@description('Roles the deploy identity may assign (and remove), and only to service principals.')
var assignableByDeployIdentity = [
  // Spec: the app's own data-plane roles.
  roleIds.cognitiveServicesUser
  roleIds.storageBlobDataContributor
  // Required by the Functions host itself with identity-based AzureWebJobsStorage:
  // Blob Data Owner (host storage, timer-trigger locks) and Table Data Contributor
  // (host diagnostic events; also the quota Table in ticket 08).
  roleIds.storageBlobDataOwner
  roleIds.storageTableDataContributor
  // Required for Microsoft Entra auth to Application Insights (local auth disabled).
  roleIds.monitoringMetricsPublisher
]
