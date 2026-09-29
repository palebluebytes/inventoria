/**
 * A face is spelled once, and its controls travel to the shell's header
 * (ADR-0114 §3, §5).
 *
 * Two claims, and they were one ticket because they were one deletion: the five
 * unfinished faces each drew a `.page-header` holding a title of their own, and
 * Media's gear was the only thing in any of those rows that had a job. The
 * titles go to the roster; the gear goes to the box above.
 *
 * **#538 added the sixth face and the third claim.** `FoodView` kept its title
 * row through all of that, so the face the record was written about was the one
 * still spelled twice — and its row held four controls and the one thing no
 * other face had, the word itself as a control (ADR-0091 §5). So the way back
 * crosses the same seam the gear does, and is asserted beside it.
 *
 * **The census is source-read and the handover is rendered**, which is the split
 * `face-switcher.test.ts` next door already draws. A title that is gone is an
 * absence in a file — no render can show you a heading nobody writes — while a
 * control crossing from a face's file into the header's markup is exactly the
 * thing a render can show and a source read cannot.
 */
import { describe, expect, it } from "vitest";
import { render } from "svelte/server";
import { createRawSnippet, type Snippet } from "svelte";
import { get } from "svelte/store";
import { readCode } from "./support/source";
import { headerTitle } from "./support/faces";
import {
  faceActions,
  faceBack,
  publishFaceActions,
  publishFaceBack,
} from "../../src/lib/layout/face-actions";
import FaceHeader from "../../src/lib/layout/FaceHeader.svelte";
import { FACES, facesOf, facetOf } from "../../src/lib/facets/registry";

/**
 * Every face §3 leaves without a title of its own, plus the bar under Agenda.
 *
 * It was five and is six. `FoodView` kept a `.page-header` of its own until
 * #538, under a second `<h1>` saying FOOD beneath the header's RATIONS — so the
 * one face §3 was written about was the one face still spelled twice, and the
 * list this census ran over was the list that let it be.
 */
const FACE_FILES = [
  "src/lib/views/MediaView.svelte",
  "src/lib/views/ItemsView.svelte",
  "src/lib/views/NotesView.svelte",
  "src/lib/views/SettingsView.svelte",
  "src/lib/views/AgendaView.svelte",
  "src/lib/views/FoodView.svelte",
];
const AGENDA_BAR = "src/lib/views/habits/AgendaHeader.svelte";
const MEDIA = "src/lib/views/MediaView.svelte";

describe("no face spells its own name", () => {
  it("leaves no face a title row to spell one in", () => {
    // The whole of what this ticket deletes, stated as the class rather than as
    // the three strings: a face that keeps a `.page-header` keeps somewhere to
    // write a second name, and the next one written would not be on §3's list.
    for (const file of FACE_FILES) {
      expect(readCode(file)).not.toContain("page-header");
    }
  });

  it("retires the three titles and the bar's fourth, everywhere in the app", () => {
    // §3 names three by hand. The agenda's date bar said `DAILY AGENDA` above
    // its date and was the fourth, which that record missed because it called
    // `AgendaView` headerless — true of the `.page-header` idiom and never of
    // that box. Read over the app rather than the six face files, so a retired
    // title cannot come back somewhere else in the app.
    //
    // `readCode` rather than `readSource`: the roster and the header both
    // *quote* the retired names in doc comments explaining what retired them,
    // and a claim about code that a comment could satisfy is not a claim.
    const app = [...FACE_FILES, AGENDA_BAR, "src/lib/layout/FaceHeader.svelte"]
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
      expect(headerTitle(body)).toBe(face.name);
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
    // Four faces carry no header control at all, and the header must not grow an
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
    // After the title, which is the half of §5's order this box decides. What
    // may sit between them is whitespace and Svelte's own block anchors and
    // nothing else — the maturity badge is between the two (#534) and Rations
    // ships, so on this face it contributes empty anchors. `face-maturity.test.ts`
    // owns the badge's own place in the row; this stays the handover's claim.
    expect(header()).toMatch(
      /<h1 class="face-title[^"]*">[\s\S]*?<\/h1>(?:\s|<!--[^>]*-->)*<div class="face-actions[^"]*"><button id="gear">/
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

describe("the title is a control only while a face is on a page", () => {
  const header = () =>
    render(FaceHeader, {
      props: {
        face: FACES[0],
        faces: facesOf(facetOf("root")),
        onPick: () => {},
      },
    } as never).body;

  it("is the word and nothing else while nothing is published", () => {
    // Six of the seven faces have no page to be on, and the seventh spends most
    // of its life on the day. A heading that was a button anyway would be a
    // control that goes nowhere, announced to a screen reader on every face.
    expect(header()).not.toContain("title-back");
    expect(headerTitle(header())).toBe("Rations");
  });

  it("wears the roster's name and the face's destination, in that order", () => {
    // ADR-0091 §5's pattern, and the reason it takes two owners to write:
    // "Food, back to the day" kept the visible word in front of a destination
    // nobody could otherwise guess, and the word is the roster's one spelling
    // now (§3) while the destination is a fact about the food screen alone.
    const stop = publishFaceBack({ to: "the day", go: () => {} });
    const body = header();
    expect(body).toContain('aria-label="Rations, back to the day"');
    // And it is still the word: a button *inside* the heading, so the name the
    // tile draws and the name the title draws stay one string.
    expect(headerTitle(body)).toBe("Rations");
    expect(body).toMatch(
      /<h1 class="face-title[^"]*">[\s\S]*?class="title-back[^"]*"/
    );
    stop();
    expect(header()).not.toContain("title-back");
  });

  it("clears only the way back it published, like the controls beside it", () => {
    // The same ordering hazard, and it bites harder here: this slot is
    // republished while one face stays mounted — every crossing onto a page and
    // off it — as well as when two faces swap.
    const leaving = publishFaceBack({ to: "the day", go: () => {} });
    const arriving = { to: "the library", go: () => {} };
    const stop = publishFaceBack(arriving);
    leaving();
    expect(get(faceBack)).toBe(arriving);
    stop();
    expect(get(faceBack)).toBeNull();
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

describe("Rations keeps the four controls and the return it publishes", () => {
  it("still draws its own row, and says where its title goes back to", () => {
    // The four read a page, a date and a disclosure that exist nowhere else, so
    // what moved is where they are drawn and nothing about what they do. The row
    // keeps a box of its own inside the header's, because the ⓘ is a
    // `ui/Disclosure` and a class handed to a component carries no scoping hash
    // — so the rules that dress all four need an anchor this file wrote.
    const code = readCode("src/lib/views/FoodView.svelte");
    expect(code).toContain("publishFaceActions(headerActions)");
    expect(code).toContain('<div class="header-actions">');
    expect(code).toContain('to: "the day"');
  });
});
