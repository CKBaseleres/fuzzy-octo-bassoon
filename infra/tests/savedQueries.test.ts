// Saved Log Analytics queries for operators (ticket 09), asserted on the compiled ARM template.
import { describe, expect, it } from 'vitest';
import { evaluate } from './armEval';
import { bicepAvailable, compile, moduleTemplate, resourcesOfType } from './bicep';

describe.skipIf(!bicepAvailable)('saved Log Analytics queries', () => {
  const template = bicepAvailable ? compile('main.bicep') : (undefined as never);

  it('saves "Unmapped Azure errors (7 days)" on the workspace, finding failures no classifier rule matched', () => {
    const searches = resourcesOfType(template, 'Microsoft.OperationalInsights/workspaces/savedSearches');
    const unmapped = searches.find(
      (s) => (s.properties as { displayName?: string }).displayName === 'Unmapped Azure errors (7 days)',
    );
    expect(unmapped).toBeDefined();
    const props = unmapped!.properties as { category: string; query: string };
    const { category } = props;
    const query = String(evaluate(props.query, { variables: moduleTemplate(template, 'monitoring').variables as Record<string, unknown> }));
    expect(category).toBe('Lingo Lens');
    expect(query).toContain('ago(7d)');
    expect(query).toContain('translation.failed');
    expect(query).toMatch(/mapped.*false/);
    for (const column of ['ruleId', 'service', 'errorCode', 'innerErrorCode', 'httpStatus']) {
      expect(query, column).toContain(column);
    }
  });
});
