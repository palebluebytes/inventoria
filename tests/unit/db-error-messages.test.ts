import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import ts from "typescript";
import {
  describeMarker,
  describeValue,
  MARKER_MAX_CHARS,
} from "../../src/lib/db/describe-value";
import { readCode, readSource } from "./support/source";

// #227. A thrown message in `src/lib/db/` is read on screen by the import, and
// the values passing through here are meals, notes, base64 photos and `gtin:`
// entity ids — the identifier ADR-0071 §4 forbids by name, and the one path
// that record's shape argument cannot cover. So a message says what a value
// *was* and never what it *said*.

describe("describeValue", () => {
  it("names an absent value rather than printing undefined", () => {
    expect(describeValue(undefined)).toBe("absent");
  });

  it("names null", () => {
    expect(describeValue(null)).toBe("null");
  });

  it("gives text its length and never its characters", () => {
    expect(describeValue("Meditate")).toBe("text of 8 characters");
    expect(describeValue("")).toBe("text of 0 characters");
    expect(describeValue("x")).toBe("text of 1 character");
  });

  // "must be a whole number of at least zero, and is a number" would say
  // nothing the requirement beside it did not.
  it("says what is wrong with a number rather than that it is one", () => {
    expect(describeValue(-1)).toBe("a negative number");
    expect(describeValue(0)).toBe("zero");
    expect(describeValue(1.5)).toBe("a number with a fraction");
    expect(describeValue(Number.NaN)).toBe("not a number");
    expect(describeValue(Number.POSITIVE_INFINITY)).toBe("an endless number");
    expect(describeValue(2 ** 53)).toBe("a whole number too large to be exact");
    expect(describeValue(1_756_000_000_000)).toBe("a number");
  });

  it("names a boolean without stating it", () => {
    expect(describeValue(true)).toBe("a boolean");
  });

  it("counts an array's items", () => {
    expect(describeValue([1, 2, 3])).toBe("an array of 3 items");
    expect(describeValue([1])).toBe("an array of 1 item");
    expect(describeValue([])).toBe("an array of 0 items");
  });

  it("counts an object's fields", () => {
    expect(describeValue({ entity: "gtin:5000159407236", value: "x" })).toBe(
      "an object with 2 fields"
    );
    expect(describeValue({})).toBe("an object with 0 fields");
  });

  it("reproduces neither a photo nor a barcode", () => {
    const photo = `data:image/jpeg;base64,${"A".repeat(200_000)}`;
    const said = describeValue({ entity: "gtin:5000159407236", value: photo });

    expect(said).not.toContain("gtin:");
    expect(said).not.toContain("5000159407236");
    expect(said).not.toContain("base64");
    expect(said.length).toBeLessThan(60);
  });
});

describe("describeMarker", () => {
  it("quotes a marker back, because the refusal is about which program wrote the file", () => {
    expect(describeMarker("inventoria-meal")).toBe('"inventoria-meal"');
    expect(describeMarker("N".repeat(MARKER_MAX_CHARS))).toContain("NNN");
  });

  it("falls back to the shape once the text is too long to be a marker", () => {
    expect(describeMarker("N".repeat(MARKER_MAX_CHARS + 1))).toBe(
      `text of ${MARKER_MAX_CHARS + 1} characters`
    );
  });

  it("describes a marker that is not text at all", () => {
    expect(describeMarker(undefined)).toBe("absent");
    expect(describeMarker({ artifact: "x" })).toBe("an object with 1 field");
  });
});

// ---------------------------------------------------------------------------
// The rule, held over the whole directory
// ---------------------------------------------------------------------------

/**
 * Every `${…}` a message in `src/lib/db/` is allowed to carry, per file, and
 * why it is safe.
 *
 * An allowlist rather than a hunt for the bad ones. #227 got in because
 * `JSON.stringify(datom)` looked like a helpful message, and the only question
 * that catches the next one is asked of every interpolation rather than of the
 * ones somebody thought to enumerate. Adding a message here means adding a line
 * below, which is where the thinking happens.
 *
 * Keyed by file rather than globally: `complaint` means one thing in
 * `db.core.ts` and nothing anywhere else, and a name that is safe in the module
 * that builds it is not safe in a module that does not.
 *
 * **What this does not claim.** It reads the syntax, not the data, so a message
 * assembled into a variable and thrown a few lines later is invisible to it —
 * as is anything reached through a helper, and as is a bare expression passed
 * as the whole message rather than built into one
 * (`deposit-store.ts`'s `StoreUnreachableError` is the live example). It is a
 * gate on the shape #227 was, not a proof about every string that can become an
 * error.
 *
 * It swept only `src/lib/db/` until [#382](https://github.com/palebluebytes/inventoria/issues/382),
 * on the grounds that "the same grammar in `src/lib/p2p/meal-reader.ts` is
 * pinned by that module's own tests". It was not: four refusals there
 * interpolated an entity id, which on the scan path is `gtin:<barcode>`, and
 * that module's tests asserted on the leaked id as their way of telling the
 * clauses apart — so they held the defect in place rather than catching it.
 * #227's own enumerating grep could not see them either, because they `throw` a
 * custom subclass. The sweep is what found the two sites the ticket's
 * hand-reading missed, which is the argument for running it over a directory
 * rather than over a list somebody wrote down.
 */
const ALLOWED_INTERPOLATIONS: Record<string, Record<string, string>> = {
  "src/lib/db/db.core.ts": {
    "index + 1": "a position in the batch the caller passed",
    "rows.length": "how many rows the caller passed",
    "datoms.length": "how many datoms the caller passed",
    complaint: "describeBrokenRule: a field name, a requirement, and a shape",
  },
  "src/lib/db/db.worker.ts": {
    pipeline: "a projection's name, from `projections`",
    type: "a worker message type, from `db.client.ts`",
  },
  "src/lib/db/version-vector.ts": {
    "describeMarker(device_id)":
      "the originating device while it is label-sized, its shape when it is not",
  },
  "src/lib/db/ledger-export.ts": {
    "describeBytes(bytes)": "a size, from the export's own accounting",
    "describeBytes(ceilingBytes)": "this app's own ceiling, a constant",
  },
  "src/lib/db/ledger-import.ts": {
    lineNumber: "which line of the file, a number",
    reason: "a refusal built in this module out of field names and numbers",
    "describeMarker(raw.artifact)":
      "the marker while it is marker-sized, its shape when it is not",
    "JSON.stringify(LEDGER_EXPORT_ARTIFACT)": "this app's own constant",
    schema_version: "a format version, already typechecked as a number",
    reads: "the versions this reader supports, from a constant",
    field: "a field name, from a literal in this module",
  },
  // #382. These are read on the **receiver's** screen, off a payload another
  // device built, so the question is not only "is this the user's data" but
  // "is this anybody's". Nothing below comes off the payload.
  "src/lib/p2p/meal-reader.ts": {
    lineNumber: "which line of the payload, a number",
    reason: "a refusal built in this module out of its own sentences",
    "row.attribute":
      "necessarily one of `OMITTED_ATTRIBUTES`' three constants, so this is this app's own vocabulary rather than the payload's",
    "describeBytes(bytes)": "a size, from this reader's own byte count",
    "describeBytes(ceilingBytes)": "this app's own ceiling, a constant",
    "describeMarker(raw.artifact)":
      "the marker while it is marker-sized, its shape when it is not",
    "JSON.stringify(MEAL_PAYLOAD_ARTIFACT)": "this app's own constant",
    schema_version: "a format version, already typechecked as a number",
    reads: "the versions this reader supports, from a constant",
  },
  "src/lib/p2p/deposit-store.ts": {
    "response.status": "an HTTP status, a number",
    verb: "an HTTP method, from a literal at each call site",
  },
  "src/lib/p2p/pairing-act.ts": {
    "secret.length": "how many bytes the caller passed, a number",
    PAIRING_SECRET_BYTES: "this app's own constant",
  },
  "src/lib/p2p/relay-room.ts": {
    "error instanceof Error ? error.message : error":
      "whatever this browser said about a socket that would not open — local, and never the payload",
    closeCode: "a WebSocket close code, a number",
  },
  "src/lib/p2p/room-code.ts": {
    "bytes.length": "how many bytes the caller passed, a number",
    ROOM_KEY_BYTES: "this app's own constant",
  },
};

/**
 * Every `${…}` a message in `code` carries, as the source writes it.
 *
 * A message site is a `throw`, the construction of anything named `…Error`, or
 * a `super(…)` call — the last because an `Error` subclass assembles its own
 * message there, which is a site a walk over `throw` statements alone would
 * miss. String concatenation counts as interpolation: `"row " + row.entity`
 * puts a value in a message exactly the way a template span does.
 */
function messageInterpolations(code: string, name: string): string[] {
  const source = ts.createSourceFile(name, code, ts.ScriptTarget.ESNext, true);
  const found = new Map<number, string>();

  const isStringish = (node: ts.Node): boolean =>
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (isStringish(node.left) || isStringish(node.right)));

  const collect = (node: ts.Node) => {
    if (ts.isTemplateExpression(node)) {
      for (const span of node.templateSpans) {
        found.set(span.expression.pos, span.expression.getText(source));
      }
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      (isStringish(node.left) || isStringish(node.right))
    ) {
      for (const side of [node.left, node.right]) {
        if (!isStringish(side)) found.set(side.pos, side.getText(source));
      }
    }
    ts.forEachChild(node, collect);
  };

  const isMessageSite = (node: ts.Node) =>
    ts.isThrowStatement(node) ||
    (ts.isNewExpression(node) &&
      node.expression.getText(source).endsWith("Error")) ||
    (ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.SuperKeyword);

  const walk = (node: ts.Node) => {
    if (isMessageSite(node)) collect(node);
    ts.forEachChild(node, walk);
  };
  walk(source);

  return [...found.values()];
}

/**
 * The directories a message is read on screen from. `src/lib/db/` reaches the
 * import screen; `src/lib/p2p/` reaches the receive door, which renders a
 * refusal's message verbatim behind its "show why" (`EndingLine.svelte`) and
 * has no `describeImportFailure` between the two.
 */
const SWEPT = ["src/lib/db", "src/lib/p2p"];

describe("what a message in a swept directory may say", () => {
  const files = SWEPT.flatMap((dir) =>
    readdirSync(new URL(`../../${dir}`, import.meta.url))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => `${dir}/${name}`)
  );

  it("finds the directories it is meant to be reading", () => {
    expect(files.length).toBeGreaterThan(5);
    expect(files).toContain("src/lib/db/db.core.ts");
    expect(files).toContain("src/lib/p2p/meal-reader.ts");
  });

  it.each(files)("%s interpolates nothing a datom said", (path) => {
    const allowed = ALLOWED_INTERPOLATIONS[path] ?? {};
    const unexplained = messageInterpolations(readSource(path), path).filter(
      (text) => !(text in allowed)
    );

    expect(unexplained).toEqual([]);
  });

  // A gate that quietly matches nothing reads from the outside like a gate that
  // found nothing wrong, so both halves are pinned: that it sees the messages
  // that are there, and that it would not let #227 back in.
  it("sees the interpolations that are there", () => {
    expect(
      messageInterpolations(readSource("src/lib/db/db.core.ts"), "db.core.ts")
    ).toContain("complaint");
    expect(
      messageInterpolations(
        readSource("src/lib/p2p/meal-reader.ts"),
        "meal-reader.ts"
      )
    ).toContain("describeMarker(raw.artifact)");
    expect(
      files.flatMap((path) => messageInterpolations(readSource(path), path))
        .length
    ).toBeGreaterThan(8);
  });

  it.each([
    "throw new Error(`Invalid datom structure: ${JSON.stringify(datom)}`);",
    'throw new Error("Invalid datom: " + JSON.stringify(datom));',
    "throw new LedgerImportRefusedError(`row ${row.entity} is bent`);",
    'class E extends Error { constructor(row) { super("row " + row.entity); } }',
  ])("would refuse: %s", (reintroduced) => {
    const carried = messageInterpolations(reintroduced, "reintroduced.ts");

    expect(carried.length).toBeGreaterThan(0);
    for (const text of carried) {
      expect(
        text in (ALLOWED_INTERPOLATIONS["src/lib/db/db.core.ts"] ?? {})
      ).toBe(false);
    }
  });
});

describe("the import screen", () => {
  const path = "src/lib/views/ledger/LedgerImport.svelte";

  it("shows a bounded failure rather than the message it was thrown", () => {
    const code = readCode(path);

    expect(code).toContain("describeImportFailure(err)");
    // One message is still rendered whole, and it is the refusal: this app's
    // own sentence, built in `ledger-import.ts` out of field names and line
    // numbers. Everything else that can reach the catch goes through the bound.
    expect(code.match(/err\.message/g)).toHaveLength(1);
    expect(code).toContain("message = `${err.message} Nothing was imported.`");
  });
});
