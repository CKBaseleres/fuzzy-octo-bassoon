// Ticket 08: the quota Table and the Budget, asserted on the compiled ARM template.
import { describe, expect, it } from 'vitest';
import {
  bicepAvailable,
  compile,
  compileParams,
  moduleParams,
  moduleTemplate,
  resourcesOfType,
  type ArmResource,
} from './bicep';

const props = <T = Record<string, unknown>>(r: ArmResource) => r.properties as T;

interface Notification {
  enabled: boolean;
  operator: string;
  threshold: number;
  thresholdType: string;
  contactEmails: unknown;
}

describe.skipIf(!bicepAvailable)('quota counters', () => {
  const template = bicepAvailable ? compile('main.bicep') : (undefined as never);

  it('creates the quota Table in the existing storage account', () => {
    const tables = resourcesOfType(template, 'Microsoft.Storage/storageAccounts/tableServices/tables');
    expect(tables).toHaveLength(1);
    expect(String(tables[0]!.name)).toContain('quotacounters');
    expect(resourcesOfType(template, 'Microsoft.Storage/storageAccounts')).toHaveLength(1);
  });

  it('tells the Function App where the Table is', () => {
    const appSettings = moduleParams(template, 'functionApp').appSettings as Record<string, string>;
    expect(appSettings.STORAGE_TABLE_ENDPOINT).toContain("'storage'");
    expect(appSettings.STORAGE_TABLE_ENDPOINT).toContain('outputs.tableEndpoint');
    expect(appSettings.QUOTA_TABLE_NAME).toContain('outputs.quotaTableName');
    const storageOutputs = moduleTemplate(template, 'storage').outputs as Record<string, { value: string }>;
    expect(storageOutputs.tableEndpoint!.value).toContain('primaryEndpoints.table');
  });
});

describe.skipIf(!bicepAvailable)('budget', () => {
  const template = bicepAvailable ? compile('main.bicep') : (undefined as never);
  const budget = () => {
    const budgets = resourcesOfType(template, 'Microsoft.Consumption/budgets');
    expect(budgets).toHaveLength(1);
    return budgets[0]!;
  };

  it('is a monthly cost Budget on the resource group for the amount parameter', () => {
    expect(props(budget())).toMatchObject({
      category: 'Cost',
      timeGrain: 'Monthly',
      amount: "[parameters('amount')]",
    });
    expect(moduleParams(template, 'budget').amount).toBe("[parameters('budgetAmount')]");
  });

  it('alerts the recipients at 50%, 80% and 100% of actual spend and 100% of forecast', () => {
    const notifications = Object.values(props<{ notifications: Record<string, Notification> }>(budget()).notifications);
    expect(
      notifications.map((n) => `${n.thresholdType} ${n.threshold}`).sort(),
    ).toEqual(['Actual 100', 'Actual 50', 'Actual 80', 'Forecasted 100']);
    for (const n of notifications) {
      expect(n).toMatchObject({ enabled: true, operator: 'GreaterThanOrEqualTo', contactEmails: "[parameters('contactEmails')]" });
    }
    expect(moduleParams(template, 'budget').contactEmails).toBe("[parameters('budgetAlertEmails')]");
  });

  it('is only deployed once there is someone to alert', () => {
    const deployment = resourcesOfType(template, 'Microsoft.Resources/deployments').find((d) => d.name === 'budget');
    expect(deployment?.condition).toBe("[not(empty(parameters('budgetAlertEmails')))]");
  });
});

describe.skipIf(!bicepAvailable)('budget parameters', () => {
  it('dev: $25 a month', () => {
    const params = compileParams('dev.bicepparam');
    expect(params.budgetAmount).toBe(25);
    expect(Array.isArray(params.budgetAlertEmails)).toBe(true);
  });

  it('prod: $100 a month', () => {
    const params = compileParams('prod.bicepparam');
    expect(params.budgetAmount).toBe(100);
    expect(Array.isArray(params.budgetAlertEmails)).toBe(true);
  });
});
