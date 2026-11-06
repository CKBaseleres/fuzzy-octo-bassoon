// Compiles Bicep to ARM JSON so tests assert on what Azure would actually receive.
// Finds the standalone Bicep CLI in this order:
//   1. $BICEP_BIN (path to a `bicep` binary)
//   2. `bicep` on PATH
//   3. ~/.azure/bin/bicep (where `az bicep install` puts it)
// With none available, `bicepAvailable` is false and the infra suites skip.
// Set REQUIRE_BICEP=1 (CI does) to fail instead of skipping.
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const infraDir = fileURLToPath(new URL('..', import.meta.url));

type Runner = (args: string[]) => string;

function tryRunner(cmd: string): Runner | undefined {
  const run: Runner = (args) =>
    execFileSync(cmd, args, {
      cwd: infraDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
  try {
    run(['--version']);
    return run;
  } catch {
    return undefined;
  }
}

function findRunner(): Runner | undefined {
  const fromEnv = process.env.BICEP_BIN;
  if (fromEnv) return tryRunner(fromEnv);
  return tryRunner('bicep') ?? tryRunner(join(homedir(), '.azure', 'bin', 'bicep'));
}

const runner = findRunner();

if (!runner && process.env.REQUIRE_BICEP === '1') {
  throw new Error('REQUIRE_BICEP=1 but no Bicep CLI was found (set BICEP_BIN or install az bicep)');
}

export const bicepAvailable = runner !== undefined;

function run(args: string[]): string {
  if (!runner) throw new Error('No Bicep CLI found');
  return runner(args);
}

export type ArmResource = {
  type: string;
  apiVersion?: string;
  name: string;
  location?: string;
  kind?: string;
  sku?: Record<string, unknown>;
  identity?: { type: string };
  properties?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ArmTemplate = {
  targetScope?: string;
  $schema: string;
  parameters?: Record<string, { type: string; defaultValue?: unknown; allowedValues?: unknown[] }>;
  resources: ArmResource[] | Record<string, ArmResource>;
  outputs?: Record<string, unknown>;
  [key: string]: unknown;
};

/** Compiles `file` (relative to infra/) and returns the ARM template. */
export function compile(file: string): ArmTemplate {
  return JSON.parse(run(['build', file, '--stdout'])) as ArmTemplate;
}

/** Compiles a .bicepparam file and returns its parameter values. */
export function compileParams(file: string): Record<string, unknown> {
  const out = JSON.parse(run(['build-params', file, '--stdout'])) as { parametersJson: string };
  const params = JSON.parse(out.parametersJson) as {
    parameters: Record<string, { value: unknown }>;
  };
  return Object.fromEntries(Object.entries(params.parameters).map(([k, v]) => [k, v.value]));
}

/** Lints a Bicep file; returns warnings and errors (empty string when clean). */
export function lint(file: string): string {
  try {
    return run(['lint', file]).trim();
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
  }
}

function topLevel(template: ArmTemplate): ArmResource[] {
  return Array.isArray(template.resources)
    ? template.resources
    : Object.values(template.resources);
}

/** Every resource a template deploys (not `existing` references), including those inside module deployments. */
export function allResources(template: ArmTemplate): ArmResource[] {
  return topLevel(template).filter((r) => r.existing !== true).flatMap((r) => {
    if (r.type === 'Microsoft.Resources/deployments') {
      const inner = (r.properties as { template?: ArmTemplate } | undefined)?.template;
      return inner ? [r, ...allResources(inner)] : [r];
    }
    return [r];
  });
}

export function resourcesOfType(template: ArmTemplate, type: string): ArmResource[] {
  return allResources(template).filter((r) => r.type.toLowerCase() === type.toLowerCase());
}

/** The compiled template of the module deployed under `name`. */
export function moduleTemplate(template: ArmTemplate, name: string): ArmTemplate {
  const deployment = resourcesOfType(template, 'Microsoft.Resources/deployments').find(
    (d) => d.name === name,
  );
  const inner = (deployment?.properties as { template?: ArmTemplate } | undefined)?.template;
  if (!inner) throw new Error(`No module deployment named ${name}`);
  return inner;
}

/** The parameter values main passes to the module deployed under `name`. */
export function moduleParams(template: ArmTemplate, name: string): Record<string, unknown> {
  const deployment = resourcesOfType(template, 'Microsoft.Resources/deployments').find(
    (d) => d.name === name,
  );
  const params = (deployment?.properties as { parameters?: Record<string, { value: unknown }> })
    ?.parameters;
  if (!params) throw new Error(`No module deployment named ${name}`);
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v.value]));
}
