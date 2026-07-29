/**
 * A tiny, safe arithmetic evaluator for amount fields (ADR-0023, issue: "type a
 * sum for the amount"). It lets a quantity like `65 / 2` be entered where the
 * user knows the total but not the split — the field logs the computed `32.5`,
 * not the literal text.
 *
 * Deliberately NOT `eval`/`new Function`: those execute arbitrary JavaScript, so
 * a stray input could touch globals or throw in surprising ways. This is a
 * hand-rolled tokenizer + recursive-descent parser over a closed grammar —
 * decimals, the four operators, unary +/-, and parentheses — and nothing else.
 * Anything outside that grammar (a letter, a dangling operator, an empty field,
 * an unbalanced paren, a divide-by-zero) yields `null`, the single "not a usable
 * number yet" signal the caller leans on to keep the last good value.
 *
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := ('+' | '-') factor | number | '(' expr ')'
 */

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "lparen" }
  | { kind: "rparen" };

/** The characters a raw amount field is allowed to hold — digits, a decimal
 *  point, the four operators, parentheses, and spaces. Exported so the input
 *  control filters keystrokes against the exact same set the parser accepts. */
export const AMOUNT_EXPRESSION_CHARS = /[0-9+\-*/.() ]/;

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " ") {
      i++;
      continue;
    }
    if (c === "+" || c === "-" || c === "*" || c === "/") {
      tokens.push({ kind: "op", value: c });
      i++;
      continue;
    }
    if (c === "(") {
      tokens.push({ kind: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ kind: "rparen" });
      i++;
      continue;
    }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      let dots = 0;
      while (j < input.length) {
        const d = input[j];
        if (d >= "0" && d <= "9") {
          j++;
        } else if (d === ".") {
          dots++;
          j++;
        } else {
          break;
        }
      }
      const slice = input.slice(i, j);
      // A lone "." or a number with two points (e.g. "1.2.3") is not a number.
      if (dots > 1 || slice === ".") return null;
      tokens.push({ kind: "num", value: Number(slice) });
      i = j;
      continue;
    }
    // Any other character means this isn't a well-formed expression.
    return null;
  }
  return tokens;
}

/**
 * Evaluates an arithmetic expression to a finite number, or returns `null` if
 * the string isn't (yet) a complete, valid expression. `null` covers the empty
 * field, mid-typing states (`65 /`), malformed input, and division by zero —
 * the caller treats all of them the same: keep the last usable amount.
 */
export function evaluateAmount(input: string): number | null {
  const maybeTokens = tokenize(input);
  if (!maybeTokens || maybeTokens.length === 0) return null;
  const tokens: Token[] = maybeTokens;

  let pos = 0;
  const peek = () => tokens[pos];

  // Grammar-following mutually-recursive descent. Each returns null to abort the
  // whole parse; a stray null bubbles up unchanged.
  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) return null;
    while (peek()?.kind === "op" && (peek() as any).value.match(/[+-]/)) {
      const op = (tokens[pos] as { value: "+" | "-" }).value;
      pos++;
      const right = parseTerm();
      if (right === null) return null;
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  function parseTerm(): number | null {
    let left = parseFactor();
    if (left === null) return null;
    while (peek()?.kind === "op" && (peek() as any).value.match(/[*/]/)) {
      const op = (tokens[pos] as { value: "*" | "/" }).value;
      pos++;
      const right = parseFactor();
      if (right === null) return null;
      if (op === "/" && right === 0) return null; // divide-by-zero → invalid
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  function parseFactor(): number | null {
    const t = peek();
    if (!t) return null;
    if (t.kind === "op" && (t.value === "+" || t.value === "-")) {
      pos++;
      const operand = parseFactor();
      if (operand === null) return null;
      return t.value === "-" ? -operand : operand;
    }
    if (t.kind === "num") {
      pos++;
      return t.value;
    }
    if (t.kind === "lparen") {
      pos++;
      const inner = parseExpr();
      if (inner === null) return null;
      if (peek()?.kind !== "rparen") return null; // unbalanced
      pos++;
      return inner;
    }
    return null;
  }

  const result = parseExpr();
  // A valid parse must consume every token and land on a finite number.
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }
  return result;
}
