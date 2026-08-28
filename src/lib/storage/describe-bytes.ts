/**
 * A byte count as a person reads it, in the decimal units a file manager shows.
 * One decimal place below ten, none above, because every figure it is given is
 * an estimate and more digits would claim a precision they do not have.
 *
 * It lives here rather than in the export module that first needed it: the
 * export's refusal message and the Storage section's usage line both read bytes
 * out to a person, and neither is about the other.
 */
export function describeBytes(bytes: number): string {
  const units = ["bytes", "KB", "MB", "GB"];
  let scaled = bytes;
  let unit = 0;
  while (scaled >= 1000 && unit < units.length - 1) {
    scaled /= 1000;
    unit += 1;
  }
  if (unit === 0) return `${Math.round(scaled)} bytes`;
  const figure = scaled < 10 ? scaled.toFixed(1) : String(Math.round(scaled));
  return `${figure} ${units[unit]}`;
}
