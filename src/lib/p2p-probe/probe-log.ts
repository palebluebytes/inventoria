/**
 * PROTOTYPE — throwaway, dev-only. See `src/lib/p2p-probe/README.md`.
 *
 * The timeline, and the report that comes out of it.
 *
 * #198 asks for four things to be recorded: what worked, on which pairing of
 * devices and networks, how long the exchange took end to end, and how it felt
 * to perform as a human handing someone a meal. Three of those are mechanical
 * and this module owns them; the fourth is the human's and the report leaves it
 * a blank to fill in.
 *
 * A probe whose result has to be reconstructed from memory afterwards is a
 * probe run twice, so every stage stamps itself as it happens and the whole
 * thing copies out as text ready to paste into the ticket.
 *
 * Pure but for two edges: the clock is injected, and the report reads
 * `navigator.userAgent` because a probe result that does not say which browser
 * produced it is not a result.
 */

export interface Mark {
  at: number;
  stage: string;
  detail?: string;
}

export interface Facts {
  [key: string]: string | number | boolean | undefined;
}

export class ProbeLog {
  private readonly marks: Mark[] = [];
  private readonly facts: Facts = {};
  private started = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(stage: string, detail?: string): void {
    this.started = this.now();
    this.marks.length = 0;
    this.mark(stage, detail);
  }

  mark(stage: string, detail?: string): void {
    this.marks.push({ at: this.now() - this.started, stage, detail });
  }

  fact(key: string, value: string | number | boolean | undefined): void {
    this.facts[key] = value;
  }

  timeline(): Mark[] {
    return [...this.marks];
  }

  /** Milliseconds from the first mark to the last, the "end to end" #198 asks for. */
  elapsed(): number {
    if (this.marks.length === 0) return 0;
    return this.marks[this.marks.length - 1].at;
  }

  /** Milliseconds between two named stages, or null if either never happened. */
  between(from: string, to: string): number | null {
    const a = this.marks.find((m) => m.stage === from);
    const b = [...this.marks].reverse().find((m) => m.stage === to);
    if (!a || !b) return null;
    return b.at - a.at;
  }

  reset(): void {
    this.marks.length = 0;
    for (const k of Object.keys(this.facts)) delete this.facts[k];
  }

  /**
   * The whole run as text, ready to paste under a comment on #198.
   *
   * Markdown rather than JSON because the destination is a GitHub issue that a
   * person reads, and because the one field that matters most — how it felt —
   * is prose that no schema was going to capture.
   */
  report(header: string): string {
    const ms = (n: number) => `${n.toFixed(0)} ms`;
    const lines: string[] = [];
    lines.push(`### ${header}`);
    lines.push("");
    lines.push("**Run**");
    lines.push("");
    lines.push("| fact | value |");
    lines.push("| --- | --- |");
    lines.push(`| user agent | \`${navigatorLabel()}\` |`);
    for (const [k, v] of Object.entries(this.facts))
      if (v !== undefined) lines.push(`| ${k} | ${String(v)} |`);
    lines.push(`| end to end | ${ms(this.elapsed())} |`);
    lines.push("");
    lines.push("**Timeline**");
    lines.push("");
    lines.push("| at | stage | detail |");
    lines.push("| --- | --- | --- |");
    for (const m of this.marks)
      lines.push(`| ${ms(m.at)} | ${m.stage} | ${m.detail ?? ""} |`);
    lines.push("");
    lines.push("**Devices and network** _(fill in)_");
    lines.push("");
    lines.push("- sending device:");
    lines.push("- receiving device:");
    lines.push(
      "- network: same Wi-Fi / one hotspotting / two networks / no internet at all"
    );
    lines.push("");
    lines.push("**How it felt to hand someone a meal** _(fill in)_");
    lines.push("");
    return lines.join("\n");
  }
}

const navigatorLabel = (): string =>
  typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
