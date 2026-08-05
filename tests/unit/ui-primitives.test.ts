import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Button from "../../src/lib/ui/Button.svelte";
import Card from "../../src/lib/ui/Card.svelte";
import ToggleGroup from "../../src/lib/ui/ToggleGroup.svelte";

// These render the primitives through Svelte's SSR path (no DOM needed) and
// assert on the emitted HTML. They pin the three things #77 makes contractual:
// the size/variant class axes, the polymorphic Card element choice, and the
// `...rest` a11y passthrough on both primitives.

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
