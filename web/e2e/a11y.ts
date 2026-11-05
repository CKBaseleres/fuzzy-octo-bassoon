import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** The widths every screen is checked at (spec: phone 320, tablet 768, desktop). */
export const WIDTHS = [320, 768, 1280] as const;

/** axe rules for WCAG 2.0, 2.1 and 2.2, levels A and AA (spec: WCAG 2.2 AA). */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

type Violations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];

const describe = (violations: Violations) =>
  violations
    .map((v) => `${v.id} (${v.impact ?? 'n/a'}): ${v.help}\n${v.nodes.map((n) => `  - ${n.target.join(' ')}`).join('\n')}`)
    .join('\n');

const ID_REF_ATTRIBUTES = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant'];

/** `<element> <attribute>=<id>` for every ARIA id reference that points nowhere. */
const danglingIdRefs = (page: Page) =>
  page.evaluate((attributes) => {
    const dangling: string[] = [];
    for (const attribute of attributes) {
      for (const element of document.querySelectorAll(`[${attribute}]`)) {
        for (const id of (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean)) {
          if (!document.getElementById(id)) {
            const role = element.getAttribute('role') ?? element.tagName.toLowerCase();
            dangling.push(`${role}.${element.className.toString().split(' ')[0] ?? ''} ${attribute}=${id}`);
          }
        }
      }
    }
    return dangling;
  }, ID_REF_ATTRIBUTES);

/**
 * Checks the screen as it is now at each width: axe finds no WCAG A/AA
 * violation, the page never scrolls sideways, and zoom is not blocked.
 * Restores the starting viewport afterwards.
 */
export async function expectAccessibleAtEveryWidth(page: Page) {
  const start = page.viewportSize();
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });
    // Let layout and any media queries settle.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(0);

    const viewport = (await page.locator('meta[name="viewport"]').getAttribute('content')) ?? '';
    expect(viewport, 'zoom must not be blocked').not.toMatch(/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0*)?\b/);

    const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    expect(violations, `axe at ${width}px:\n${describe(violations)}`).toEqual([]);
  }
  // axe only reports a dangling aria-labelledby as "needs review"; a group or
  // region named by a missing id has no accessible name when focus lands on it.
  expect(await danglingIdRefs(page), 'ARIA id references with no matching element').toEqual([]);
  if (start) await page.setViewportSize(start);
}
