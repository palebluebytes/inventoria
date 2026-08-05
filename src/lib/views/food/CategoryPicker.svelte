<script lang="ts">
  import { fetchCategorySuggestions } from "../../food/open-food-facts";

  // A multi-select category type-ahead over OFF's canonical taxonomy (#84). Each
  // chosen category is a discrete pickable row (like a household portion), so the
  // form stops jamming OFF's comma list into one free-text box. Typing queries
  // OFF's `taxonomy_suggestions` (English for now); picking a suggestion adds a
  // chip. It degrades to free text — Enter with no highlighted suggestion keeps
  // whatever was typed — so it still works offline (OFF re-canonicalizes on write).
  //
  // Owns only the chips + the add field; the caller wraps it in the section chrome
  // (heading, "optional"). `value` is the list of category strings, deduped
  // case-insensitively (OFF categories are case-insensitive).
  let { value = $bindable([]) }: { value: string[] } = $props();

  let query = $state("");
  let suggestions = $state<string[]>([]);
  let open = $state(false);
  // Index of the keyboard-highlighted suggestion; -1 = none (free-text on Enter).
  let active = $state(-1);
  let debounceTimer: ReturnType<typeof setTimeout>;
  // Monotonic request id so a slow response never overwrites a newer query's.
  let seq = 0;

  const listId = `catpick-${crypto.randomUUID()}`;

  const isPicked = (c: string) =>
    value.some((v) => v.toLowerCase() === c.toLowerCase());

  function add(raw: string) {
    // Commas are OFF's separator, so a single category must not carry one; also
    // collapse whitespace so a free-typed entry is tidy.
    const clean = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (clean && !isPicked(clean)) value = [...value, clean];
    query = "";
    suggestions = [];
    open = false;
    active = -1;
  }

  function remove(i: number) {
    value = value.filter((_, idx) => idx !== i);
  }

  function onInput() {
    clearTimeout(debounceTimer);
    active = -1;
    if (!query.trim()) {
      suggestions = [];
      open = false;
      return;
    }
    // Match the 300–400ms type-ahead debounce the search field already uses.
    debounceTimer = setTimeout(runSearch, 300);
  }

  async function runSearch() {
    const q = query.trim();
    if (!q) return;
    const mine = ++seq;
    const results = await fetchCategorySuggestions(q);
    if (mine !== seq) return; // superseded by a newer keystroke
    suggestions = results.filter((r) => !isPicked(r));
    open = suggestions.length > 0;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length) {
        open = true;
        active = (active + 1) % suggestions.length;
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length)
        active = active <= 0 ? suggestions.length - 1 : active - 1;
    } else if (e.key === "Enter") {
      // Never let Enter submit the surrounding form — it commits a category.
      e.preventDefault();
      if (open && active >= 0 && active < suggestions.length)
        add(suggestions[active]);
      else if (query.trim()) add(query);
    } else if (e.key === "Escape") {
      if (open) {
        open = false;
        active = -1;
      }
    }
  }

  $effect(() => () => clearTimeout(debounceTimer));
</script>

<div class="catpick">
  {#if value.length}
    <ul class="catpick-chips">
      {#each value as cat, i (cat)}
        <li class="catpick-chip">
          <span>{cat}</span>
          <button
            type="button"
            onclick={() => remove(i)}
            aria-label={`Remove ${cat}`}>✕</button
          >
        </li>
      {/each}
    </ul>
  {/if}

  <div class="catpick-field">
    <input
      class="catpick-input"
      role="combobox"
      aria-expanded={open}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={open && active >= 0
        ? `${listId}-opt-${active}`
        : undefined}
      placeholder="＋ add a category"
      aria-label="Add a category"
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => {
        if (suggestions.length) open = true;
      }}
      onblur={() => setTimeout(() => (open = false), 120)}
    />
    {#if open}
      <ul class="catpick-list" id={listId} role="listbox">
        {#each suggestions as s, i (s)}
          <li
            id={`${listId}-opt-${i}`}
            role="option"
            aria-selected={i === active}
            class:active={i === active}
            onmousedown={(e) => {
              // Commit before the input's blur closes the list.
              e.preventDefault();
              add(s);
            }}
          >
            {s}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>

<style>
  .catpick {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }
  .catpick-chips {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2xs);
  }
  .catpick-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 40px;
    padding: 0.2rem 0.2rem 0.2rem 0.6rem;
    border: var(--edge);
    border-radius: var(--radius);
    background: var(--paper);
    font-size: 0.9rem;
  }
  .catpick-chip button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--paper);
    color: var(--text-secondary);
    cursor: pointer;
    font: inherit;
  }
  .catpick-field {
    position: relative;
  }
  .catpick-input {
    width: 100%;
    min-height: 44px;
    padding: 0.6rem;
    border: 1px dashed var(--ink);
    border-radius: var(--radius);
    background: var(--paper);
    font: inherit;
    font-weight: 600;
  }
  .catpick-input::placeholder {
    color: var(--text-secondary);
    font-weight: 600;
  }
  .catpick-list {
    position: absolute;
    z-index: 5;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 12rem;
    overflow-y: auto;
    border: var(--edge);
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: var(--shadow-2);
  }
  .catpick-list li {
    padding: 0.55rem 0.6rem;
    min-height: 44px;
    display: flex;
    align-items: center;
    cursor: pointer;
    border-bottom: 1px solid var(--border);
  }
  .catpick-list li:last-child {
    border-bottom: 0;
  }
  .catpick-list li.active {
    background: var(--ink);
    color: var(--paper);
  }
</style>
