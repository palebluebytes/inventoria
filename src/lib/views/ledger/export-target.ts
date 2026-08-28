/**
 * Where a ledger export goes on this particular browser (ADR-0064 §6).
 *
 * The intended path is the File System Access API: `showSaveFilePicker` gives
 * the user the location, `createWritable()` gives us a stream, and the file is
 * written as it is read. It is Chromium-only, which matches this project's
 * target; the e2e matrix defines chromium and a Pixel 5 profile and nothing
 * else.
 *
 * Where it is missing there is no streaming write at all, so the fallback
 * assembles the file in memory and refuses above the stated ceiling.
 *
 * This lives beside the screen that calls it rather than under `db/`, because
 * nothing in it is about the ledger: it is a save dialog, a `Blob` and an
 * anchor. Everything that decides *what* gets written is pure and lives in
 * `src/lib/db/ledger-export.ts`.
 */

import { bufferedSink, type ExportSink } from "../../db/ledger-export";

/**
 * `showSaveFilePicker` is not in TypeScript's DOM library, so the shape it
 * returns is declared here at the boundary where it is actually called.
 */
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}
interface FilePickerWindow {
  showSaveFilePicker(
    options?: SaveFilePickerOptions
  ): Promise<FileSystemFileHandle>;
}

/** Whether this browser can write a file as the export produces it. */
export function canStreamToFile(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/** The name the save dialog opens with, and the fallback download's filename. */
export function exportFilename(exported_at: number): string {
  const day = new Date(exported_at).toISOString().slice(0, 10);
  return `inventoria-ledger-${day}.ndjson`;
}

/**
 * Opens the browser's save dialog and returns somewhere to write, or `null`
 * when the user dismissed it. Must be called from the click that asked for the
 * export: the picker requires a user gesture.
 */
export async function chooseExportTarget(
  filename: string,
  ceilingBytes: number
): Promise<ExportSink | null> {
  if (!canStreamToFile()) {
    return bufferedSink(ceilingBytes, (parts) =>
      downloadParts(parts, filename)
    );
  }

  let handle: FileSystemFileHandle;
  try {
    handle = await (window as unknown as FilePickerWindow).showSaveFilePicker({
      suggestedName: filename,
      types: [
        {
          description: "Newline-delimited JSON",
          accept: { "application/x-ndjson": [".ndjson"] },
        },
      ],
    });
  } catch (err) {
    // Dismissing the dialog throws AbortError. Cancelling is not a failure, so
    // it comes back as "no target" rather than as an error to report.
    if (err instanceof DOMException && err.name === "AbortError") return null;
    throw err;
  }

  const writable = await handle.createWritable();
  return {
    write: (chunk) => writable.write(chunk),
    close: () => writable.close(),
    // Aborting discards the swap file the browser has been filling, so a failed
    // export leaves no half-written file at the chosen location. The reason
    // travels with it, which is what the stream surfaces to the platform.
    abort: (reason) => writable.abort(reason),
  };
}

/** Hands the assembled parts to the browser as an ordinary download. */
function downloadParts(parts: string[], filename: string): void {
  const url = URL.createObjectURL(
    new Blob(parts, { type: "application/x-ndjson" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoked on a later task rather than immediately. The blob here can run to
  // tens of megabytes, and revoking in the same tick races the download the
  // click just started.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
