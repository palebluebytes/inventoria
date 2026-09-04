/**
 * Where a local-log export goes on this device — the whole of it.
 *
 * A `Blob`, an anchor and a click. Nothing here decides *what* is written:
 * that is `buildLogExport` in `src/lib/logs/log-facility.ts`, which is pure,
 * and the bytes arrive already serialised because the screen that calls this
 * renders the very same string it hands over.
 *
 * It lives beside the screen that calls it rather than under `logs/`, for the
 * reason its sibling `src/lib/views/ledger/export-target.ts` states about the
 * ledger (ADR-0064 §6): nothing in it is about the log. That placement is the
 * whole of the mechanism #213 chose. **The export vehicle may change — Web
 * Share, the clipboard, another format — and the app still gains no place to
 * send**, because a vehicle behind one named module is swapped by editing this
 * file. There is deliberately no `LogDestination` interface, adapter list or
 * registry: #213 §6 considered one and deferred it, on the ground that the
 * fence is what makes the property checkable, not the interface. Nothing in
 * `src/` names `navigator.share`, `canShare` or `navigator.clipboard` today.
 *
 * **What was deliberately not inherited from the ledger's.** That module's
 * `ExportSink` and `chooseExportTarget` exist to avoid assembling a large file
 * in memory — it streams into `showSaveFilePicker` and refuses above a 64 MiB
 * ceiling (`ledger-export.ts`). A log export is bounded at 256 KiB by the
 * facility's own shared budget, so it is *always* the buffered path. Reusing
 * that machinery would buy a Chromium-only picker, an `AbortError` dismissal
 * case and a ceiling that can never trip, for a payload that fits in one
 * string. The placement and this doc-comment's reasoning are mirrored; no code
 * is shared.
 *
 * **Including `downloadParts`, which is the four lines below almost verbatim**
 * — and that is the near-duplicate worth naming rather than leaving to be
 * found. It is private to the ledger's module, so sharing it means exporting it
 * and importing from `../ledger/export-target`, which would pull that module
 * into this one's import closure. It names `showSaveFilePicker` and an object
 * URL of its own, so the gate would then report the log export as having a
 * second way out — correctly. The fence and the shared helper cannot both hold,
 * and #213 §6 chose the fence: **share no code.** Four lines of `Blob` and
 * anchor is what that costs, and the whole of what it costs.
 *
 * The property this module is the single exception to is asserted by
 * `scripts/log-egress-check.mjs`, which is rooted here as well as at the
 * facility: **no transport the user did not perform, and the payload that
 * leaves is the payload that was reviewed.**
 */

/**
 * The name the download arrives under. Not exported: unlike the ledger's, whose
 * caller needs the name for the picker's `suggestedName`, nothing outside this
 * module has a use for it.
 *
 * The day, not the instant, and the day of the export rather than of any record
 * in it — this is the moment the file was reviewed and handed over, which is
 * the moment a reader of a directory listing is trying to place.
 *
 * It is not Facet-scoped the way the ledger's is. That filename distinguishes a
 * whole backup from a Facet-scoped slice of one because the two files have the
 * same grammar and the same extension; a log export is neither of those things
 * and has no sibling to be confused with.
 */
function logExportFilename(exported_at: number): string {
  return `inventoria-log-${new Date(exported_at).toISOString().slice(0, 10)}.json`;
}

/**
 * Hands the reviewed text to the browser as an ordinary download.
 *
 * **Takes the serialised text, not the payload object**, and that is the point
 * of the signature: the screen renders this exact string in the review and
 * passes the same value here, so "what the file will hold" and what the file
 * holds are one value rather than two stringifications that could drift. A
 * vehicle that re-serialised — or subset, or reformatted — would be the
 * exclusion-from-one-export shape ADR-0053 §6 refuses.
 *
 * Must be called from the click that asked for it: a programmatic download
 * outside a user gesture is what browsers block, and it is also the half of the
 * property that says the user performed the transport.
 */
export function downloadLogExport(json: string, exported_at: number): void {
  const url = URL.createObjectURL(
    new Blob([json], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = logExportFilename(exported_at);
  link.click();
  // Revoked on a later task rather than in the same tick, which is the one
  // thing worth taking from the sibling: the race is with the click that has
  // just started the download, not with the size of what it is downloading.
  // Holding a quarter-megabyte URL alive meanwhile costs nothing.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
