/**
 * Tiny deterministic expression evaluator for the built-in calculator.
 * Supports: + - * / % ( ) decimals, unary minus. No eval(), no network.
 *
 * `%` is postfix percent: `15%` = 0.15, so `1000*15%` = 150.
 */
export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'pct' }
  | { kind: 'lp' }
  | { kind: 'rp' };

function tokenize(src: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === ' ' || ch === '\t') { i++; continue; }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let j = i;
      let dots = 0;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) {
        if (src[j] === '.') dots++;
        j++;
      }
      if (dots > 1) return 'Invalid number.';
      const raw = src.slice(i, j);
      if (raw === '.' || raw === '') return 'Invalid number.';
      tokens.push({ kind: 'num', value: parseFloat(raw) });
      i = j;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', op: ch });
      i++;
      continue;
    }
    if (ch === '%') { tokens.push({ kind: 'pct' }); i++; continue; }
    if (ch === '(') { tokens.push({ kind: 'lp' }); i++; continue; }
    if (ch === ')') { tokens.push({ kind: 'rp' }); i++; continue; }
    return `Unexpected character "${ch}".`;
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  parse(): number | string {
    const v = this.expr();
    if (typeof v === 'string') return v;
    if (this.pos < this.tokens.length) return 'Unexpected input.';
    return v;
  }

  // expr := term (('+'|'-') term)*
  private expr(): number | string {
    let v = this.term();
    if (typeof v === 'string') return v;
    for (;;) {
      const t = this.tokens[this.pos];
      if (t?.kind === 'op' && (t.op === '+' || t.op === '-')) {
        this.pos++;
        const r = this.term();
        if (typeof r === 'string') return r;
        v = t.op === '+' ? v + r : v - r;
      } else return v;
    }
  }

  // term := factor (('*'|'/') factor)*
  private term(): number | string {
    let v = this.factor();
    if (typeof v === 'string') return v;
    for (;;) {
      const t = this.tokens[this.pos];
      if (t?.kind === 'op' && (t.op === '*' || t.op === '/')) {
        this.pos++;
        const r = this.factor();
        if (typeof r === 'string') return r;
        if (t.op === '/') {
          if (r === 0) return "Can't divide by zero.";
          v = v / r;
        } else v = v * r;
      } else return v;
    }
  }

  // factor := ('-' factor) | primary ('%')*
  private factor(): number | string {
    const t = this.tokens[this.pos];
    if (t?.kind === 'op' && t.op === '-') {
      this.pos++;
      const v = this.factor();
      return typeof v === 'string' ? v : -v;
    }
    // unary plus is not allowed (keeps "++" an error)
    let v = this.primary();
    if (typeof v === 'string') return v;
    while (this.tokens[this.pos]?.kind === 'pct') {
      this.pos++;
      v = v / 100;
    }
    return v;
  }

  // primary := number | '(' expr ')'
  private primary(): number | string {
    const t = this.tokens[this.pos];
    if (!t) return 'Incomplete expression.';
    if (t.kind === 'num') { this.pos++; return t.value; }
    if (t.kind === 'lp') {
      this.pos++;
      const v = this.expr();
      if (typeof v === 'string') return v;
      const c = this.tokens[this.pos];
      if (c?.kind !== 'rp') return 'Missing closing parenthesis.';
      this.pos++;
      return v;
    }
    return 'Unexpected input.';
  }
}

/** Evaluate an arithmetic expression. Pure. */
export function evaluate(src: string): CalcResult {
  if (!src.trim()) return { ok: false, error: 'Empty expression.' };
  const tokens = tokenize(src);
  if (typeof tokens === 'string') return { ok: false, error: tokens };
  const v = new Parser(tokens).parse();
  if (typeof v === 'string') return { ok: false, error: v };
  if (!Number.isFinite(v)) return { ok: false, error: 'Result is not finite.' };
  // Tidy floating-point noise (0.1+0.2).
  const tidy = Math.abs(v) < 1e-12 ? 0 : parseFloat(v.toPrecision(12));
  return { ok: true, value: tidy };
}

/** Normalize UI symbols (× ÷ −) to engine operators. */
export function normalizeInput(display: string): string {
  return display.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
}
