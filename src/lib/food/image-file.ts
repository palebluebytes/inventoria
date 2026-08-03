/**
 * Reads an image File into a base64 data URL — the one shared helper behind every
 * food-capture surface that stashes a photo on a twin (the label form's multi-shot
 * reader, the desktop barcode upload, and the manual-entry mini-forms). Rejects if
 * the read fails, so callers can surface a "couldn't read that image" message.
 */
export function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => resolve(ev.target?.result as string);
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}
