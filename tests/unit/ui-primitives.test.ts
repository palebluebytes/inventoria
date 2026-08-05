import { describe, it, expect } from "vitest";
import { render } from "svelte/server";
import Button from "../../src/lib/ui/Button.svelte";
import Card from "../../src/lib/ui/Card.svelte";
import Badge from "../../src/lib/ui/Badge.svelte";

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
