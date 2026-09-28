/**
 * A face is spelled once, and its controls travel to the shell's header
 * (ADR-0114 §3, §5).
 *
 * Two claims, and they are one ticket because they are one deletion: the five
 * unfinished faces each drew a `.page-header` holding a title of their own, and
 * Media's gear was the only thing in any of those rows that had a job. The
 * titles go to the roster; the gear goes to the box above.
 *
 * **The census is source-read and the handover is rendered**, which is the split
 * `face-switcher.test.ts` next door already draws. A title that is gone is an
 * absence in a file — no render can show you a heading nobody writes — while the
 * gear crossing from a face's file into the header's markup is exactly the thing
 * a render can show and a source read cannot.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { createRawSnippet, type Snippet } from "svelte";
import { get } from "svelte/store";
import { readCode } from "./support/source";
import {
  faceActions,
  publishFaceActions,
} from "../../src/lib/layout/face-actions";
import FaceHeader from "../../src/lib/layout/FaceHeader.svelte";
import { FACES, facesOf, facetOf } from "../../src/lib/facets/registry";

/** The five §3 leaves without a title of their own, plus the bar under Agenda. */
const FIVE = [
  "src/lib/views/MediaView.svelte",
  "src/lib/views/ItemsView.svelte",
  "src/lib/views/NotesView.svelte",
  "src/lib/views/SettingsView.svelte",
  "src/lib/views/AgendaView.svelte",
];
const AGENDA_BAR = "src/lib/views/habits/AgendaHeader.svelte";
const MEDIA = "src/lib/views/MediaView.svelte";

describe("no face spells its own name", () => {
  it("leaves the five with no title row to spell one in", () => {
    // The whole of what this ticket deletes, stated as the class rather than as
    // the three strings: a face that keeps a `.page-header` keeps somewhere to
    // write a second name, and the next one written would not be on §3's list.
    for (const file of FIVE) {
      expect(readCode(file)).not.toContain("page-header");
    }
  });

  it("retires the three titles and the bar's fourth, everywhere in the app", () => {
    // §3 names three by hand. The agenda's date bar said `DAILY AGENDA` above
    // its date and was the fourth, which that record missed because it called
    // `AgendaView` headerless — true of the `.page-header` idiom and never of
    // that box. Read over the source rather than the five files, so a retired
    // title cannot come back somewhere else in the app.
    //
    // `readCode` rather than `readSource`: the roster and the header both
    // *quote* the retired names in doc comments explaining what retired them,
    // and a claim about code that a comment could satisfy is not a claim.
    const app = [...FIVE, AGENDA_BAR, "src/lib/layout/FaceHeader.svelte"]
      .map(readCode)
      .join("\n");
    for (const retired of [
      "Media Tracker",
      "Physical Digital Twins",
      "Notes &amp; Checklist",
      "DAILY AGENDA",
    ]) {
      expect(app).not.toContain(retired);
    }
  });

  it("puts every face's one spelling in the header, off the roster", () => {
    // The positive half, and the reason the deletions above are safe: the name
    // the tile draws is the name the `<h1>` draws, because both read `face.name`
    // rather than a string of their own. Asserted over the whole roster so a
    // face added without a name in the registry fails here too.
    for (const face of FACES) {
      const body = render(FaceHeader, {
        props: { face, faces: facesOf(facetOf("root")), onPick: () => {} },
      } as never).body;
      // The scope class Svelte stamps on the element sits inside the
      // attribute, so the match is on the class and the text together rather
      // than on a spelled-out tag.
      expect(body).toMatch(
        new RegExp(`<h1 class="face-title[^"]*">${face.name}</h1>`)
      );
    }
  });
});

describe("a face's own controls cross into the header", () => {
  /** A snippet the render tier can actually draw, with no cast to build one. */
  const mark = (id: string) =>
    createRawSnippet(() => ({ render: () => `<button id="${id}"></button>` }));

  const header = () =>
    render(FaceHeader, {
      props: {
        face: FACES[0],
        faces: facesOf(facetOf("root")),
        onPick: () => {},
      },
    } as never).body;

  it("draws nothing at all on a face that publishes none", () => {
    // Four of the five carry no header control, and the header must not grow an
    // empty box for them: `.face-actions` is a flex item with a gap, so an empty
    // one is a visible notch to the right of every title in the app.
    expect(header()).not.toContain("face-actions");
  });

  it("draws what the face published, where the header puts it", () => {
    // The crossing itself. The gear is written in `MediaView.svelte` and drawn
    // in a box that is not its parent and not its child — the header is above
    // `.main` and the face mounts inside it — so this is the only tier that can
    // show the two ends meeting.
    const stop = publishFaceActions(mark("gear"));
    // After the title, which is the half of §5's order this box decides.
    expect(header()).toMatch(
      /<h1 class="face-title[^"]*">[^<]*<\/h1>\s*<!--\[0--><div class="face-actions[^"]*"><button id="gear">/
    );
    stop();
    expect(header()).not.toContain("face-actions");
  });

  it("lets an arriving face's controls survive the departing face's cleanup", () => {
    // The one ordering hazard the module exists to defuse. Switching faces
    // destroys one and mounts another, and a teardown that cleared the slot
    // unconditionally would be right in one order and would blank the header in
    // the other. The teardown compares identities, so neither order matters.
    const leaving = publishFaceActions(mark("leaving"));
    const arriving: Snippet = mark("arriving");
    const stop = publishFaceActions(arriving);
    leaving();
    expect(get(faceActions)).toBe(arriving);
    // The slot is module-level, so a test that walks out still holding it would
    // decide what the header draws in the next one.
    stop();
    expect(get(faceActions)).toBeNull();
  });
});

describe("Media keeps the gear it publishes", () => {
  it("still opens its own settings sheet from its own file", () => {
    // ADR-0080 §4 put the TMDB key beside the search box that needs it, and §10
    // of this record moves nothing face-specific into the Settings face. What
    // moved is where the button is drawn, so the button, its id and the sheet it
    // opens all have to still be here — `media-settings.test.ts` next door owns
    // the sheet's own contents.
    const code = readCode(MEDIA);
    expect(code).toContain('id="media-settings-btn"');
    expect(code).toContain("<MediaSettingsSheet");
    expect(code).toContain("publishFaceActions(headerActions)");
  });
});
