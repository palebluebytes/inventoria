/**
 * PROTOTYPE — see README.md. Throwaway; not reached by the app.
 *
 * The chrome: which population, which shape, and where the threshold sits. All
 * three live in the URL so a reading can be pasted into the ticket.
 *
 *   ?food=beef-sirloin&shape=c&t=20
 */

import "../../../app.css";

import { h, clear, pct } from "./dom";
import { POPULATIONS, read, type Reading } from "./model";
import { draw, thresholdFor, type Shape, type State } from "./views";
import type { SearchIndex } from "../usda-corpus";

const SHAPES: { id: Shape; label: string; gist: string }[] = [
  {
    id: "a",
    label: "A · rows stay",
    gist: "variants stay separate rows; the rest are dropped",
  },
  {
    id: "b",
    label: "B · every axis a form",
    gist: "one row, a control for everything USDA varies",
  },
  {
    id: "c",
    label: "C · forms that earn it",
    gist: "one row, a control only where the number moves",
  },
  {
    id: "d",
    label: "D · one row, real forms",
    gist: "one row; its forms are the rows USDA published",
  },
  {
    id: "e",
    label: "E · the adjudicated rule",
    gist: "an axis is a form by kind, not by size; no dial",
  },
  {
    id: "f",
    label: "F · adjudicated, flat",
    gist: "variants stay separate rows; a variant is a food",
  },
];

async function boot() {
  const app = document.getElementById("app")!;
  const res = await fetch("/usda/search-index.json");
  if (!res.ok) {
    app.textContent =
      "could not load /usda/search-index.json — run this through `pnpm prototype:food-forms`, which serves the app's public/ directory.";
    return;
  }
  const index = (await res.json()) as SearchIndex;

  const url = new URL(location.href);
  const population =
    POPULATIONS.find((p) => p.id === url.searchParams.get("food")) ??
    POPULATIONS[0];

  const state: State = {
    reading: read(population, index.foods),
    shape: (SHAPES.find((s) => s.id === url.searchParams.get("shape"))?.id ??
      "a") as Shape,
    threshold: Number(url.searchParams.get("t") ?? 20) / 100,
    picked: new Map(),
    chosen: null,
    redraw: () => render(),
  };

  const head = h("header", {});
  const stage = h("main", {});
  const foot = h("footer", {});
  clear(app).append(head, stage, foot);

  function remember() {
    const next = new URL(location.href);
    next.searchParams.set("food", state.reading.population.id);
    next.searchParams.set("shape", state.shape);
    next.searchParams.set("t", String(Math.round(state.threshold * 100)));
    history.replaceState(null, "", next);
  }

  function pick(population: (typeof POPULATIONS)[number]) {
    state.reading = read(population, index.foods) as Reading;
    state.picked = new Map();
    state.chosen = null;
    render();
  }

  function render() {
    remember();
    const live = thresholdFor(state);

    clear(head).append(
      h(
        "div",
        { class: "title" },
        h("h1", { text: "Does a food have forms?" }),
        h("span", {
          class: "ticket",
          text: "PROTOTYPE · inventoria#189 · throwaway, not reached by the app",
        })
      ),
      h(
        "nav",
        { class: "foods" },
        POPULATIONS.map((p) =>
          h("button", {
            class: `food${p.id === state.reading.population.id ? " food-on" : ""}`,
            text: p.query,
            onclick: () => pick(p),
          })
        )
      ),
      h("p", { class: "why", text: state.reading.population.why }),
      h(
        "div",
        {
          class: `dial${
            state.shape === "b" || state.shape === "e" || state.shape === "f"
              ? " dial-off"
              : ""
          }`,
        },
        h("label", {
          for: "t",
          text: "An axis is a choice when it moves the calories by at least",
        }),
        h("input", {
          id: "t",
          type: "range",
          min: "0",
          max: "60",
          step: "1",
          value: String(Math.round(state.threshold * 100)),
          oninput: (event: Event) => {
            state.threshold =
              Number((event.target as HTMLInputElement).value) / 100;
            render();
          },
        }),
        h("output", { class: "dial-value", text: pct(live) }),
        state.shape === "b" &&
          h("span", {
            class: "dial-note",
            text: "shape B ignores the dial — every axis is a control",
          }),
        (state.shape === "e" || state.shape === "f") &&
          h("span", {
            class: "dial-note",
            text: "no dial — an axis is judged by kind, not by size",
          })
      )
    );

    draw(stage, state);

    clear(foot).append(
      h(
        "div",
        { class: "shapes" },
        SHAPES.map((shape) =>
          h(
            "button",
            {
              class: `shape${shape.id === state.shape ? " shape-on" : ""}`,
              onclick: () => {
                state.shape = shape.id;
                render();
              },
            },
            h("b", { text: shape.label }),
            h("span", { text: shape.gist })
          )
        )
      )
    );
  }

  render();
}

boot();
