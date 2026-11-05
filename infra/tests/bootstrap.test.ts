// Behaviour of infra/bootstrap.bicep (subscription scope, run once by an admin).
// Per-environment resources are evaluated with sample parameter values so the
// assertions are on what Azure would receive.
import { describe, expect, it } from 'vitest';
import { evaluate, evaluateDeep } from './armEval';
import {
  bicepAvailable,
  compile,
  lint,
  moduleParams,
  resourcesOfType,
  type ArmResource,
  type ArmTemplate,
} from './bicep';
import { DEPLOY_ASSIGNABLE, ROLE } from './roles';

const REPO = 'contoso/lingo-lens';

type FederatedCredential = { issuer: string; subject: string; audiences: string[] };
type RoleAssignment = {
  roleDefinitionId: string;
  principalType: string;
  condition?: string;
  conditionVersion?: string;
};

describe.skipIf(!bicepAvailable)('bootstrap.bicep', () => {
  const template = bicepAvailable ? compile('bootstrap.bicep') : (undefined as never);
  const perEnvDeployment = bicepAvailable
    ? resourcesOfType(template, 'Microsoft.Resources/deployments').find((d) => d.copy !== undefined)!
    : (undefined as never);
  const identityTemplate = bicepAvailable
    ? (perEnvDeployment.properties as { template: ArmTemplate }).template
    : (undefined as never);

  /** The per-environment module's resources of `type`, evaluated for `env`. */
  function forEnv(env: string, type: string) {
    const scope = {
      variables: identityTemplate.variables as Record<string, unknown>,
      parameters: { environmentName: env, githubRepository: REPO, location: 'westeurope' },
    };
    return resourcesOfType(identityTemplate, type)
      .filter((r) => r.condition === undefined || evaluate(r.condition, scope) === true)
      .map((r: ArmResource) =>
        // Field by field: runtime-only values (e.g. reference() to a principal id)
        // stay as expression text, which no assertion here expects.
        Object.fromEntries(
          Object.entries(r.properties ?? {}).map(([key, value]) => {
            try {
              return [key, evaluateDeep(value, scope)];
            } catch {
              return [key, value];
            }
          }),
        ),
      );
  }

  it('lints clean', () => {
    expect(lint('bootstrap.bicep')).toBe('');
  });

  it('deploys at subscription scope', () => {
    expect(template.$schema).toContain('subscriptionDeploymentTemplate');
  });

  it('creates rg-lingolens-dev and rg-lingolens-prod in West Europe by default', () => {
    expect(template.parameters?.location?.defaultValue).toBe('westeurope');
    expect(template.parameters?.environments?.defaultValue).toEqual(['dev', 'prod']);
    const groups = resourcesOfType(template, 'Microsoft.Resources/resourceGroups');
    expect(groups).toHaveLength(1); // one resource, looped over the environments
    const names = ['dev', 'prod'].map((env) =>
      evaluate(groups[0]!.name.replace('copyIndex()', String(env === 'dev' ? 0 : 1)), {
        parameters: { environments: ['dev', 'prod'] },
      }),
    );
    expect(names).toEqual(['rg-lingolens-dev', 'rg-lingolens-prod']);
  });

  it('puts each deploy identity in its own environment resource group', () => {
    expect(perEnvDeployment.resourceGroup).toBe(
      "[format('rg-lingolens-{0}', parameters('environments')[copyIndex()])]",
    );
    expect(resourcesOfType(identityTemplate, 'Microsoft.ManagedIdentity/userAssignedIdentities')).toHaveLength(1);
    expect(moduleParams(template, perEnvDeployment.name).githubRepository).toBe(
      "[parameters('githubRepository')]",
    );
  });

  it("federates each identity with the repo's matching GitHub Environment", () => {
    for (const env of ['dev', 'prod']) {
      const creds = forEnv(
        env,
        'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials',
      ) as FederatedCredential[];
      expect(creds).toContainEqual({
        issuer: 'https://token.actions.githubusercontent.com',
        subject: `repo:${REPO}:environment:${env}`,
        audiences: ['api://AzureADTokenExchange'],
      });
    }
  });

  it('lets only the dev identity be used from pull requests (Bicep what-if)', () => {
    const subjects = (env: string) =>
      (
        forEnv(
          env,
          'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials',
        ) as FederatedCredential[]
      ).map((c) => c.subject);
    expect(subjects('dev')).toEqual([`repo:${REPO}:environment:dev`, `repo:${REPO}:pull_request`]);
    expect(subjects('prod')).toEqual([`repo:${REPO}:environment:prod`]);
  });

  describe('deploy identity roles on its resource group', () => {
    const assignments = () =>
      forEnv('prod', 'Microsoft.Authorization/roleAssignments') as RoleAssignment[];
    const withRole = (role: string) =>
      assignments().filter((a) => a.roleDefinitionId.endsWith(role));

    it('has exactly Contributor and RBAC Administrator', () => {
      expect(assignments()).toHaveLength(2);
    });

    it('has Contributor, unconditioned', () => {
      const [contributor] = withRole(ROLE.contributor);
      expect(contributor).toBeDefined();
      expect(contributor!.condition).toBeUndefined();
    });

    it('has RBAC Administrator, conditioned to assign and remove only the app roles, only for service principals', () => {
      const [rbac] = withRole(ROLE.rbacAdministrator);
      expect(rbac?.conditionVersion).toBe('2.0');
      const allowed = DEPLOY_ASSIGNABLE.join(', ');
      expect(rbac?.condition).toBe(
        "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR " +
          `(@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${allowed}} AND ` +
          "@Request[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'})) AND " +
          "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR " +
          `(@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {${allowed}} AND ` +
          "@Resource[Microsoft.Authorization/roleAssignments:PrincipalType] ForAnyOfAnyValues:StringEqualsIgnoreCase {'ServicePrincipal'}))",
      );
    });

    it('only service principals get the roles', () => {
      for (const a of assignments()) expect(a.principalType).toBe('ServicePrincipal');
    });
  });

  it('outputs what the GitHub Environments need', () => {
    expect(Object.keys(template.outputs ?? {})).toEqual(
      expect.arrayContaining(['tenantId', 'subscriptionId', 'deployIdentities']),
    );
  });
});
