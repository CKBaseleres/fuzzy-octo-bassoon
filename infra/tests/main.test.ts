// Behaviour of infra/main.bicep, asserted on the compiled ARM template
// (what Azure receives), not on Bicep source text.
import { describe, expect, it } from 'vitest';
import {
  bicepAvailable,
  compile,
  compileParams,
  lint,
  moduleParams,
  moduleTemplate,
  resourcesOfType,
  type ArmResource,
  type ArmTemplate,
} from './bicep';
import { DEPLOY_ASSIGNABLE, ROLE } from './roles';

function single(template: ArmTemplate, type: string, kind?: string): ArmResource {
  const found = resourcesOfType(template, type).filter((r) => kind === undefined || r.kind === kind);
  expect(found, `${type}${kind ? ` (${kind})` : ''}`).toHaveLength(1);
  return found[0]!;
}

function props<T = Record<string, unknown>>(r: ArmResource): T {
  return r.properties as T;
}

describe.skipIf(!bicepAvailable)('main.bicep', () => {
  const template = bicepAvailable ? compile('main.bicep') : (undefined as never);

  it('lints clean', () => {
    expect(lint('main.bicep')).toBe('');
  });

  it('defaults the region to West Europe', () => {
    expect(template.parameters?.location?.defaultValue).toBe('westeurope');
  });

  it('creates a Standard Static Web App with preview environments off', () => {
    const swa = single(template, 'Microsoft.Web/staticSites');
    expect(swa.sku).toMatchObject({ name: 'Standard', tier: 'Standard' });
    expect(props(swa).stagingEnvironmentPolicy).toBe('Disabled');
  });

  it('links the Function App as the Static Web App backend, so /api goes through the SWA proxy', () => {
    single(template, 'Microsoft.Web/staticSites/linkedBackends');
    expect(moduleParams(template, 'staticWebApp').backendResourceId).toBe(
      "[reference(resourceId('Microsoft.Resources/deployments', 'functionApp'), '2025-04-01').outputs.id.value]",
    );
    expect(moduleTemplate(template, 'functionApp').outputs?.id).toMatchObject({
      value: "[resourceId('Microsoft.Web/sites', parameters('name'))]",
    });
  });

  it('runs the API on Flex Consumption (Node) with a system-assigned identity and at most 10 instances', () => {
    const plan = single(template, 'Microsoft.Web/serverfarms');
    expect(plan.sku).toMatchObject({ name: 'FC1', tier: 'FlexConsumption' });

    const site = single(template, 'Microsoft.Web/sites');
    expect(site.identity?.type).toBe('SystemAssigned');
    expect(template.parameters?.functionMaximumInstanceCount?.defaultValue).toBe(10);
    expect(moduleParams(template, 'functionApp').maximumInstanceCount).toBe(
      "[parameters('functionMaximumInstanceCount')]",
    );
    const config = props<{ functionAppConfig: { runtime: { name: string }; deployment: unknown } }>(
      site,
    ).functionAppConfig;
    expect(config.runtime.name).toBe('node');
    expect(JSON.stringify(config.deployment)).toContain('SystemAssignedIdentity');
  });

  it('turns off publishing credentials on the Function App', () => {
    const policies = resourcesOfType(template, 'Microsoft.Web/sites/basicPublishingCredentialsPolicies');
    expect(policies).toHaveLength(2);
    for (const p of policies) expect(props(p).allow).toBe(false);
  });

  it('disables storage account key access', () => {
    const storage = single(template, 'Microsoft.Storage/storageAccounts');
    expect(props(storage)).toMatchObject({ allowSharedKeyAccess: false, allowBlobPublicAccess: false });
  });

  it('creates Translator S1 with a custom domain, its own identity and no keys', () => {
    const translator = single(template, 'Microsoft.CognitiveServices/accounts', 'TextTranslation');
    expect(translator.sku).toEqual({ name: 'S1' });
    expect(translator.identity?.type).toBe('SystemAssigned');
    expect(props(translator).customSubDomainName).toBeTruthy();
    expect(props(translator).disableLocalAuth).toBe(true);
  });

  it('creates Document Intelligence with a custom domain and no keys', () => {
    const di = single(template, 'Microsoft.CognitiveServices/accounts', 'FormRecognizer');
    expect(props(di).customSubDomainName).toBeTruthy();
    expect(props(di).disableLocalAuth).toBe(true);
  });

  it('creates Application Insights with local auth off', () => {
    const appi = single(template, 'Microsoft.Insights/components');
    expect(props(appi).DisableLocalAuth).toBe(true);
  });

  describe('role assignments', () => {
    // Normalise each assignment to { scope parameter, role GUID, principal parameter }.
    const module = bicepAvailable ? moduleTemplate(template, 'roleAssignments') : (undefined as never);
    const roleIds =
      (module?.variables as { roleIds: Record<string, string> } | undefined)?.roleIds ?? {};
    const assignments = bicepAvailable
      ? resourcesOfType(module, 'Microsoft.Authorization/roleAssignments').map((a) => {
          const roleKey = /variables\('roleIds'\)\.(\w+)/.exec(String(props(a).roleDefinitionId))?.[1];
          return {
            scopeName: /parameters\('(\w+)'\)/.exec(String(a.scope))?.[1],
            role: roleKey ? roleIds[roleKey] : undefined,
            principal: /parameters\('(\w+)'\)/.exec(String(props(a).principalId))?.[1],
            principalType: props(a).principalType,
          };
        })
      : [];
    const count = (scopeName: string, role: string, principal: string) =>
      assignments.filter(
        (a) => a.scopeName === scopeName && a.role === role && a.principal === principal,
      ).length;

    it('grants the Function identity Cognitive Services User on Translator and Document Intelligence', () => {
      expect(count('translatorName', ROLE.cognitiveServicesUser, 'functionPrincipalId')).toBe(1);
      expect(count('documentIntelligenceName', ROLE.cognitiveServicesUser, 'functionPrincipalId')).toBe(1);
    });

    it('grants the Function identity Storage Blob Data Contributor on the storage account', () => {
      expect(count('storageAccountName', ROLE.storageBlobDataContributor, 'functionPrincipalId')).toBe(1);
    });

    it('grants the Translator identity Storage Blob Data Contributor on the storage account', () => {
      expect(count('storageAccountName', ROLE.storageBlobDataContributor, 'translatorPrincipalId')).toBe(1);
    });

    it('passes the real Function and Translator identities into the module', () => {
      const params = moduleParams(template, 'roleAssignments');
      expect(params.functionPrincipalId).toContain("'functionApp'");
      expect(params.functionPrincipalId).toContain('outputs.principalId');
      expect(params.translatorPrincipalId).toContain("'aiServices'");
      expect(params.translatorPrincipalId).toContain('outputs.translatorPrincipalId');
    });

    it('assigns only roles the deploy identity may assign, and only to service principals', () => {
      expect(assignments.length).toBeGreaterThan(0);
      for (const a of assignments) {
        expect(a.principalType).toBe('ServicePrincipal');
        expect(DEPLOY_ASSIGNABLE, `role ${a.role} on ${a.scopeName}`).toContain(a.role);
      }
    });
  });

  it('wires the quota, timeout and kill-switch app settings', () => {
    const appSettings = moduleParams(template, 'functionApp').appSettings as Record<string, unknown>;
    expect(Object.keys(appSettings)).toEqual(
      expect.arrayContaining([
        'TRANSLATIONS_ENABLED',
        'DAILY_TRANSLATION_QUOTA',
        'HOURLY_PER_IP_QUOTA',
        'DOCUMENT_TIMEOUT_MINUTES',
        'IMAGE_TIMEOUT_MINUTES',
        'TRANSLATOR_ENDPOINT',
        'DOCUMENT_INTELLIGENCE_ENDPOINT',
        'STORAGE_ACCOUNT_NAME',
        'STORAGE_BLOB_ENDPOINT',
      ]),
    );
    expect(appSettings.DAILY_TRANSLATION_QUOTA).toBe("[parameters('dailyTranslationQuota')]");
  });
});

describe.skipIf(!bicepAvailable)('parameter files', () => {
  it('dev: West Europe, 10 instances, lower quotas', () => {
    expect(compileParams('dev.bicepparam')).toMatchObject({
      environmentName: 'dev',
      location: 'westeurope',
      functionMaximumInstanceCount: 10,
      translationsEnabled: true,
      dailyTranslationQuota: 50,
      hourlyPerIpQuota: 10,
    });
  });

  it('prod: West Europe, 10 instances, prod quotas', () => {
    expect(compileParams('prod.bicepparam')).toMatchObject({
      environmentName: 'prod',
      location: 'westeurope',
      functionMaximumInstanceCount: 10,
      translationsEnabled: true,
      dailyTranslationQuota: 300,
      hourlyPerIpQuota: 20,
    });
  });
});
