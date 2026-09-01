import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import { createRawSnippet } from "svelte";
import Button from "../../src/lib/ui/Button.svelte";
import Card from "../../src/lib/ui/Card.svelte";
import Badge from "../../src/lib/ui/Badge.svelte";
import ToggleGroup from "../../src/lib/ui/ToggleGroup.svelte";
import Checkbox from "../../src/lib/ui/Checkbox.svelte";
import Row from "../../src/lib/ui/Row.svelte";

// These render the primitives through Svelte's SSR path (no DOM needed) and
// assert on the emitted HTML. They pin the three things #77 makes contractual:
// the size/variant class axes, the polymorphic Card element choice, and the
// `...rest` a11y passthrough on both primitives — and, since #319, Row's own
// element choice, which is read off the row's contents rather than a flag.

describe("Button", () => {
  it("emits variant and size classes (defaults: primary / md)", () => {
    const { body } = render(Button, { props: {} });
    expect(body).toContain("btn-primary");
    expect(body).toContain("btn-md");
  });

  it("honours explicit variant and size", () => {
    const { body } = render(Button, {
      props: { variant: "danger", size: "lg" },
    });
    expect(body).toContain("btn-danger");
    expect(body).toContain("btn-lg");
    expect(body).not.toContain("btn-primary");
    expect(body).not.toContain("btn-md");
  });

  it("keeps the caller's class alongside the base classes", () => {
    const { body } = render(Button, { props: { class: "w-full" } });
    expect(body).toContain("btn");
    expect(body).toContain("w-full");
  });

  it("spreads ...rest a11y attributes onto the <button>", () => {
    const { body } = render(Button, {
      props: {
        "aria-label": "Close",
        "aria-pressed": true,
        title: "Close panel",
        "data-testid": "close-btn",
      } as Record<string, unknown>,
    });
    expect(body).toContain('aria-label="Close"');
    expect(body).toContain("aria-pressed");
    expect(body).toContain('title="Close panel"');
    expect(body).toContain('data-testid="close-btn"');
  });

  it("does not let ...rest override the class styling channel", () => {
    const { body } = render(Button, {
      props: { class: "styled", "aria-label": "x" } as Record<string, unknown>,
    });
    // class carries both base + caller styling; rest never clobbers it.
    expect(body).toContain("btn-primary");
    expect(body).toContain("styled");
  });
});

describe("Card", () => {
  it("renders a static <div> when not pressable", () => {
    const { body } = render(Card, { props: {} });
    expect(body).toContain('<div class="card');
    expect(body).not.toContain("<button");
    expect(body).not.toContain("card-pressable");
  });

  it("renders a native <button> tile when given onclick", () => {
    const { body } = render(Card, { props: { onclick: () => {} } });
    expect(body).toContain("<button");
    expect(body).toContain("card-pressable");
    expect(body).toContain('type="button"');
  });

  it("spreads ...rest a11y attributes onto the static div", () => {
    const { body } = render(Card, {
      props: {
        "aria-label": "Summary",
        role: "region",
      } as Record<string, unknown>,
    });
    expect(body).toContain('aria-label="Summary"');
    expect(body).toContain('role="region"');
  });

  it("spreads ...rest a11y attributes onto the pressable button", () => {
    const { body } = render(Card, {
      props: {
        onclick: () => {},
        "aria-pressed": true,
        "aria-controls": "panel-1",
      } as Record<string, unknown>,
    });
    expect(body).toContain("<button");
    expect(body).toContain("aria-pressed");
    expect(body).toContain('aria-controls="panel-1"');
  });
});

describe("Badge", () => {
  it("emits the default variant class", () => {
    const { body } = render(Badge, { props: {} });
    expect(body).toContain("badge-default");
  });

  it("supports the neutral variant (the category grey fallback)", () => {
    const { body } = render(Badge, { props: { variant: "neutral" } });
    expect(body).toContain("badge-neutral");
    expect(body).not.toContain("badge-default");
  });
});

describe("ToggleGroup", () => {
  const options = [
    { value: "", label: "All" },
    { value: "books", label: "books" },
    { value: "tools", label: "tools" },
  ];

  it("renders a role=group of role=radio items, one per option", () => {
    const { body } = render(ToggleGroup, {
      props: { options, ariaLabel: "Filter" },
    });
    // Group root carries the group role; a type="single" group makes each item
    // a role=radio (the deselectable single-select semantics).
    expect(body).toContain('role="group"');
    expect(body).toContain('role="radio"');
    expect(body).toContain('data-value="books"');
    expect(body).toContain('data-value="tools"');
    // Each label surfaces in the emitted HTML.
    expect(body).toContain(">All<");
    expect(body).toContain(">books<");
  });

  it("marks the bound value as the pressed (data-state=on) item", () => {
    const { body } = render(ToggleGroup, {
      props: { options, value: "books" },
    });
    // The selected cell inverts via bits' data-state="on"; the others are off.
    expect(body).toMatch(/data-value="books"[^>]*data-state="on"/);
    expect(body).toMatch(/data-value="tools"[^>]*data-state="off"/);
  });

  it("treats an empty value as nothing-selected, lighting the empty (All) item", () => {
    const { body } = render(ToggleGroup, {
      props: { options, value: "" },
    });
    // value "" is the deselect-to-empty state: the "" ("All") item is the only
    // one pressed, and no tag item is on.
    expect(body).toMatch(/data-value=""[^>]*data-state="on"/);
    expect(body).toMatch(/data-value="books"[^>]*data-state="off"/);
    expect(body).toMatch(/data-value="tools"[^>]*data-state="off"/);
  });

  it("renders a visible label wired as the group's accessible name", () => {
    const { body } = render(ToggleGroup, {
      props: { options, label: "Filter by tag" },
    });
    expect(body).toContain("Filter by tag");
    expect(body).toMatch(/id="tg-[^"]+"/);
    expect(body).toMatch(/aria-labelledby="tg-[^"]+"/);
  });
});

describe("Checkbox", () => {
  it("wraps a native checkbox in the <label> that names it", () => {
    const { body } = render(Checkbox, { props: { label: "Recording" } });
    // The label wrapper is always rendered, so a checkbox with no accessible
    // name is not expressible (ADR-0068).
    expect(body).toContain("<label");
    expect(body).toContain('type="checkbox"');
    expect(body).toContain("Recording");
  });

  it("prefers children over the label prop when both are given", () => {
    const { body } = render(Checkbox, {
      props: {
        label: "the prop",
        children: createRawSnippet(() => ({
          render: () => "<span>the snippet</span>",
        })),
      } as Record<string, unknown>,
    });
    expect(body).toContain("the snippet");
    expect(body).not.toContain("the prop");
  });

  it("reaches the input with checked and disabled", () => {
    const { body } = render(Checkbox, {
      props: { label: "Recording", checked: true, disabled: true },
    });
    expect(body).toMatch(/<input[^>]*\schecked\b/);
    expect(body).toMatch(/<input[^>]*\sdisabled\b/);
  });

  it("leaves the input unchecked and enabled by default", () => {
    const { body } = render(Checkbox, { props: { label: "Recording" } });
    expect(body).not.toMatch(/<input[^>]*\schecked\b/);
    expect(body).not.toMatch(/<input[^>]*\sdisabled\b/);
  });

  it("spreads ...rest a11y attributes onto the input, not the label", () => {
    const { body } = render(Checkbox, {
      props: {
        label: "Recording",
        id: "dev-mode-toggle",
        "aria-describedby": "why",
        "data-testid": "recording",
      } as Record<string, unknown>,
    });
    // id and ...rest land on the input so `page.locator("#id").check()` and
    // every aria/data hook address the control itself.
    expect(body).toMatch(/<input[^>]*id="dev-mode-toggle"/);
    expect(body).toMatch(/<input[^>]*aria-describedby="why"/);
    expect(body).toMatch(/<input[^>]*data-testid="recording"/);
  });

  it("keeps the caller's class on the label row beside the base class", () => {
    const { body } = render(Checkbox, {
      props: { label: "Recording", class: "consent-toggle" },
    });
    expect(body).toMatch(/<label[^>]*class="checkbox[^"]*consent-toggle/);
  });

  it("keeps ...rest off the row entirely — class is the only channel to it", () => {
    const { body } = render(Checkbox, {
      props: {
        label: "Recording",
        class: "row",
        title: "Records this channel",
        "data-testid": "recording",
      } as Record<string, unknown>,
    });
    const labelStart = body.indexOf("<label");
    const openingLabel = body.slice(
      labelStart,
      body.indexOf(">", labelStart) + 1
    );
    // The scope class rides along; what matters is that both the base and the
    // caller's class are on the row and nothing from ...rest is.
    expect(openingLabel).toContain('class="checkbox row');
    expect(openingLabel).not.toContain("title=");
    expect(openingLabel).not.toContain("data-testid=");
  });
});

describe("Row", () => {
  const props = { title: "Quick estimate", subtitle: "Log a figure, fast" };
  const mark = (glyph: string) =>
    createRawSnippet(() => ({ render: () => `<span>${glyph}</span>` }));

  it("stacks the title over a muted subtitle", () => {
    const { body } = render(Row, { props });
    expect(body).toMatch(/class="[^"]*\brow-title\b[^"]*">Quick estimate</);
    expect(body).toMatch(
      /class="[^"]*\brow-subtitle\b[^"]*">Log a figure, fast</
    );
  });

  it("drops the subtitle line entirely when there is none", () => {
    const { body } = render(Row, { props: { title: "Quick estimate" } });
    expect(body).toContain("row-title");
    expect(body).not.toContain("row-subtitle");
  });

  it("renders a native <button> when it is clickable and holds no corner", () => {
    const { body } = render(Row, { props: { ...props, onclick: () => {} } });
    expect(body).toMatch(/<button[^>]*class="row[ "]/);
    expect(body).toContain('type="button"');
    expect(body).not.toContain('role="button"');
  });

  it("falls back to a div role=button when it also draws a remove ✕", () => {
    // HTML forbids a button inside a button, and the ✕ is a real one.
    const { body } = render(Row, {
      props: { ...props, onclick: () => {}, onRemove: () => {} },
    });
    expect(body).toMatch(/<div[^>]*role="button"[^>]*tabindex="0"/);
    expect(body).not.toMatch(/<button[^>]*class="row[ "]/);
  });

  it("falls back to a div role=button when it holds corner content", () => {
    const { body } = render(Row, {
      props: { ...props, onclick: () => {}, corner: mark("✓") },
    } as Parameters<typeof render>[1]);
    expect(body).toMatch(/<div[^>]*role="button"/);
    expect(body).not.toMatch(/<button[^>]*class="row[ "]/);
  });

  it("is a plain inert div with no tap handler at all", () => {
    const { body } = render(Row, { props });
    expect(body).toMatch(/<div[^>]*class="row[ "]/);
    expect(body).not.toContain('role="button"');
    expect(body).not.toContain("tabindex");
    expect(body).not.toContain("clickable");
  });

  it("names its own remove ✕ after the row it removes", () => {
    const { body } = render(Row, { props: { ...props, onRemove: () => {} } });
    expect(body).toMatch(
      /<button[^>]*class="[^"]*\brow-remove\b[^"]*"[^>]*aria-label="Remove Quick estimate"/
    );
  });

  it("gives the corner to `corner` when both it and a remove are passed", () => {
    const { body } = render(Row, {
      props: { ...props, onRemove: () => {}, corner: mark("✓") },
    } as Parameters<typeof render>[1]);
    expect(body).toContain("row-corner");
    expect(body).toContain("✓");
    expect(body).not.toContain("row-remove");
  });

  it("places the lead ahead of the text and the trailing mark after it", () => {
    const { body } = render(Row, {
      props: { ...props, lead: mark("⚡"), trailing: mark("›") },
    } as Parameters<typeof render>[1]);
    expect(body.indexOf("⚡")).toBeLessThan(body.indexOf("row-title"));
    expect(body.indexOf("›")).toBeGreaterThan(body.indexOf("row-subtitle"));
  });

  it("marks the selected row", () => {
    const { body } = render(Row, { props: { ...props, selected: true } });
    expect(body).toMatch(/class="[^"]*\bselected\b/);
  });

  it("keeps the caller's class on the root beside the base class", () => {
    const { body } = render(Row, { props: { ...props, class: "intent" } });
    expect(body).toMatch(/class="row intent/);
  });

  it("lets a caller name the parts its own DOM contract already names", () => {
    const { body } = render(Row, {
      props: {
        ...props,
        onRemove: () => {},
        titleClass: "fi-name",
        subtitleClass: "fi-qty",
        removeClass: "fi-remove",
      },
    });
    expect(body).toMatch(/class="row-title fi-name/);
    expect(body).toMatch(/class="row-subtitle fi-qty/);
    expect(body).toMatch(/class="row-remove fi-remove/);
  });

  it("spreads ...rest a11y attributes onto both element modes", () => {
    const asButton = render(Row, {
      props: {
        ...props,
        onclick: () => {},
        "data-testid": "intent-menu",
      } as Record<string, unknown>,
    });
    expect(asButton.body).toMatch(/<button[^>]*data-testid="intent-menu"/);

    const asDiv = render(Row, {
      props: { ...props, "data-testid": "logged-food" } as Record<
        string,
        unknown
      >,
    });
    expect(asDiv.body).toMatch(/<div[^>]*data-testid="logged-food"/);
  });
});
