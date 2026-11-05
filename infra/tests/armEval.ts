// A tiny evaluator for the subset of ARM template expressions Bicep emits for
// compile-time constants: string/number literals, variables(), parameters(),
// property access, indexing, and format/join/concat/equals/string/toLower.
// Lets tests assert on the value Azure would see (e.g. a role condition built
// from shared/roles.bicep) instead of on Bicep's compiled expression text.
// Throws on anything it does not understand, so a test never passes by accident.

type Scope = {
  variables?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
};

/** Evaluates `value` if it is an ARM expression string ("[...]"), else returns it as is. */
export function evaluate(value: unknown, scope: Scope): unknown {
  if (typeof value !== 'string') return value;
  if (value.startsWith('[[')) return value.slice(1);
  if (!(value.startsWith('[') && value.endsWith(']'))) return value;
  const parser = new Parser(value.slice(1, -1), scope);
  const result = parser.expression();
  parser.end();
  return result;
}

class Parser {
  private pos = 0;
  constructor(
    private readonly src: string,
    private readonly scope: Scope,
  ) {}

  end(): void {
    this.skipWs();
    if (this.pos !== this.src.length) this.fail('trailing input');
  }

  expression(): unknown {
    this.skipWs();
    let value = this.primary();
    for (;;) {
      this.skipWs();
      const ch = this.src[this.pos];
      if (ch === '.') {
        this.pos++;
        const name = this.identifier();
        value = this.member(value, name);
      } else if (ch === '[') {
        this.pos++;
        const index = this.expression();
        this.expect(']');
        value = this.member(value, index);
      } else {
        return value;
      }
    }
  }

  private primary(): unknown {
    const ch = this.src[this.pos];
    if (ch === "'") return this.stringLiteral();
    if (ch !== undefined && /[0-9-]/.test(ch)) return this.number();
    const name = this.identifier();
    this.expect('(');
    const args: unknown[] = [];
    this.skipWs();
    if (this.src[this.pos] !== ')') {
      for (;;) {
        args.push(this.expression());
        this.skipWs();
        if (this.src[this.pos] === ',') {
          this.pos++;
          continue;
        }
        break;
      }
    }
    this.expect(')');
    return this.call(name, args);
  }

  private call(name: string, args: unknown[]): unknown {
    switch (name) {
      case 'variables':
        return this.lookup(this.scope.variables, 'variable', args[0]);
      case 'parameters':
        return this.lookup(this.scope.parameters, 'parameter', args[0]);
      case 'format': {
        const [fmt, ...rest] = args;
        return String(fmt)
          .replace(/\{\{|\}\}|\{(\d+)\}/g, (m, i: string | undefined) =>
            m === '{{' ? '{' : m === '}}' ? '}' : String(rest[Number(i)]),
          );
      }
      case 'join':
        return (args[0] as unknown[]).map(String).join(String(args[1]));
      case 'concat':
        return args.every(Array.isArray) ? args.flat() : args.map(String).join('');
      case 'equals':
        return args[0] === args[1];
      case 'string':
        return typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
      case 'toLower':
        return String(args[0]).toLowerCase();
      case 'subscriptionResourceId':
        // Without a subscription argument: /subscriptions/{current}/providers/{type}/{name}
        return `/subscriptions/{subscriptionId}/providers/${String(args[0])}/${args.slice(1).map(String).join('/')}`;
      default:
        return this.fail(`unsupported function ${name}()`);
    }
  }

  private lookup(table: Record<string, unknown> | undefined, kind: string, key: unknown): unknown {
    if (!table || !(String(key) in table)) return this.fail(`unknown ${kind} ${String(key)}`);
    return evaluateDeep(table[String(key)], this.scope);
  }

  private member(value: unknown, key: unknown): unknown {
    if (value === null || typeof value !== 'object') return this.fail(`cannot index ${String(value)}`);
    const record = value as Record<string, unknown>;
    if (!(String(key) in record)) return this.fail(`missing property ${String(key)}`);
    return record[String(key)];
  }

  private stringLiteral(): string {
    this.expect("'");
    let out = '';
    for (;;) {
      const ch = this.src[this.pos++];
      if (ch === undefined) return this.fail('unterminated string');
      if (ch === "'") {
        if (this.src[this.pos] === "'") {
          out += "'";
          this.pos++;
          continue;
        }
        return out;
      }
      out += ch;
    }
  }

  private number(): number {
    const match = /^-?\d+/.exec(this.src.slice(this.pos));
    if (!match) return this.fail('bad number');
    this.pos += match[0].length;
    return Number(match[0]);
  }

  private identifier(): string {
    const match = /^[A-Za-z_$][\w$]*/.exec(this.src.slice(this.pos));
    if (!match) return this.fail('expected identifier');
    this.pos += match[0].length;
    return match[0];
  }

  private expect(ch: string): void {
    this.skipWs();
    if (this.src[this.pos] !== ch) this.fail(`expected '${ch}'`);
    this.pos++;
  }

  private skipWs(): void {
    while (this.src[this.pos] === ' ') this.pos++;
  }

  private fail(message: string): never {
    throw new Error(`armEval: ${message} at ${this.pos} in [${this.src}]`);
  }
}

/** Evaluates every ARM expression inside a JSON value (objects and arrays included). */
export function evaluateDeep(value: unknown, scope: Scope): unknown {
  if (Array.isArray(value)) return value.map((v) => evaluateDeep(v, scope));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, evaluateDeep(v, scope)]),
    );
  }
  return evaluate(value, scope);
}
