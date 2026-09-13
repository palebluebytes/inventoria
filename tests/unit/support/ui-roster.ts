/**
 * The `ui/` vocabulary, as a declared list.
 *
 * ADR-0100 §8: *"The roster is a declared list the gate reads, never a folder
 * listing."* ADR-0083 set the precedent for the Facet gates, and `src/lib/ui/`
 * is the record's own worked reason for needing one here —
 * `BottomSheetDemo.svelte` sits in that folder with **zero** callers, being a
 * harness for the `?demo=bottomsheet` route rather than a member of anything.
 * A gate that globbed the folder would credit it with owning class names, and
 * five of the six collisions #413's sweep first reported were its.
 *
 * Declaring the list is not the same as hard-coding a folder listing back in,
 * and `NOT_MEMBERS` is what makes the difference: every `.svelte` file in
 * `src/lib/ui/` must appear in exactly one of the two, so a new file fails
 * until somebody says which it is. That is the failure ADR-0083 wanted — a
 * roster falling out of date is caught by the gate that reads it — rather than
 * the silent one a glob gives, where a harness quietly joins the vocabulary.
 *
 * `CONTEXT.md`'s "Interface primitives" section is the prose form of this list
 * and carries what each member is *for*; this is the machine-readable half, and
 * the two are edited together.
 */
import { execFileSync } from "node:child_process";

/** Every member of the vocabulary, as a path under `src/`. */
export const MEMBERS = [
  "src/lib/ui/Alert.svelte",
  "src/lib/ui/Badge.svelte",
  "src/lib/ui/BottomSheet.svelte",
  "src/lib/ui/Button.svelte",
  "src/lib/ui/Card.svelte",
  "src/lib/ui/Checkbox.svelte",
  "src/lib/ui/Input.svelte",
  "src/lib/ui/Meter.svelte",
  "src/lib/ui/Modal.svelte",
  "src/lib/ui/ReloadPrompt.svelte",
  "src/lib/ui/Row.svelte",
  "src/lib/ui/Segmented.svelte",
  "src/lib/ui/Select.svelte",
  "src/lib/ui/Skeleton.svelte",
  "src/lib/ui/Textarea.svelte",
  "src/lib/ui/ToggleGroup.svelte",
] as const;

/**
 * Files in `src/lib/ui/` that are **not** members, each with the argument for
 * why — the `SHORT_BY_ARGUMENT` shape ADR-0100 §7 names, where an exemption
 * costs a diff rather than a silent omission.
 */
export const NOT_MEMBERS: Record<string, string> = {
  "src/lib/ui/BottomSheetDemo.svelte":
    "A harness for the ?demo=bottomsheet route, with zero callers. ADR-0100 §8 names it.",
};

/** Every `.svelte` file the folder actually holds, for the gate that holds the
 *  two lists to it. */
export function uiFolderFiles(): string[] {
  return execFileSync("git", ["ls-files", "src/lib/ui/*.svelte"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
}
