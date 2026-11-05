// Built-in role GUIDs, written out independently of infra/shared/roles.bicep so
// the tests check the template against the spec rather than against itself.
export const ROLE = {
  contributor: 'b24988ac-6180-42a0-ab88-20f7382dd24c',
  rbacAdministrator: 'f58310d9-a9f6-439a-9e8d-f62e7b41a168',
  cognitiveServicesUser: 'a97b65f3-24c7-4388-baec-2e87135dc908',
  storageBlobDataContributor: 'ba92f5b4-2d11-453d-a403-e96b0029c9fe',
  storageBlobDataOwner: 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b',
  storageTableDataContributor: '0a9a7e1f-b9d0-4cc4-a60d-0319b160aaa3',
  monitoringMetricsPublisher: '3913510d-42f4-4e42-8a64-420c390055eb',
} as const;

/**
 * Roles the deploy identity's conditioned RBAC Administrator assignment may grant.
 * The spec names Cognitive Services User and Storage Blob Data Contributor; the other
 * three are what the Functions host needs for keyless storage and Application Insights.
 */
export const DEPLOY_ASSIGNABLE: readonly string[] = [
  ROLE.cognitiveServicesUser,
  ROLE.storageBlobDataContributor,
  ROLE.storageBlobDataOwner,
  ROLE.storageTableDataContributor,
  ROLE.monitoringMetricsPublisher,
];
