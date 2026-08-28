/**
 * Where a ledger export goes on this particular browser (ADR-0064).
 *
 * The intended path is the File System Access API: `showSaveFilePicker` gives
 * the user the location, `createWritable()` gives us a stream, and the file is
 * written as it is read. It is Chromium-only, which matches this project's
 * target; the e2e matrix defines chromium and a Pixel 5 profile and nothing
 * else.
 *
 * Where it is missing there is no streaming write at all, so the fallback
 * assembles the file in memory and refuses above a stated ceiling. Everything
 * that decides *what* gets written lives in `ledger-export.ts` and is pure;
 * this module is the browser half, and holds nothing worth testing without one.
 */

import { bufferedSink, type ExportSink } from "./ledger-export";

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
 * Roughly how many bytes this origin is using, or `null` where the browser will
 * not say. It covers everything the origin stores, the cached USDA bundle
 * included, so it over-states the ledger rather than under-stating it; the
 * screen that shows it says so.
 */
export async function estimateStoredBytes(): Promise<number | null> {
  if (
    typeof navigator === "undefined" ||
    !("storage" in navigator) ||
    typeof navigator.storage.estimate !== "function"
  ) {
    return null;
  }
  try {
    const estimate = await navigator.storage.estimate();
    return typeof estimate.usage === "number" ? estimate.usage : null;
  } catch {
    // A privacy-locked or insecure context refuses outright. No estimate is a
    // missing figure, not a failed export.
    return null;
  }
}

/** Where an export is going, and whether getting there costs memory. */
export interface ExportTarget {
  sink: ExportSink;
  /** True when the whole file has to be assembled before any of it is saved. */
  buffered: boolean;
}

/**
 * Opens the browser's save dialog and returns somewhere to write, or `null`
 * when the user dismissed it. Must be called from the click that asked for the
 * export: the picker requires a user gesture.
 */
export async function chooseExportTarget(
  filename: string,
  ceiling_bytes: number
): Promise<ExportTarget | null> {
  if (!canStreamToFile()) {
    return {
      sink: bufferedSink(ceiling_bytes, (parts) =>
        downloadParts(parts, filename)
      ),
      buffered: true,
    };
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
    sink: {
      write: (chunk) => writable.write(chunk),
      close: () => writable.close(),
      // `abort` discards the swap file the browser has been filling, so a
      // failed export leaves no half-written file at the chosen location.
      abort: () => writable.abort(),
    },
    buffered: false,
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
  URL.revokeObjectURL(url);
}
