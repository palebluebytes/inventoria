<script lang="ts">
  import {
    fetchCategorySuggestions,
    isEnglishCategory,
  } from "../../food/open-food-facts";

  // A multi-select category type-ahead over OFF's canonical taxonomy (#84). Each
  // chosen category is a discrete pickable row (like a household portion), so the
  // form stops jamming OFF's comma list into one free-text box. Typing queries
  // OFF's `taxonomy_suggestions` (English only, `lc=en`); picking a suggestion
  // adds a chip. English-only: the taxonomy returns nothing for non-English input,
  // and any non-English SEED (a foreign product's own food/category) is verified
  // and hidden. Degrades to free text — Enter with no highlighted suggestion keeps
  // whatever was typed — so it still works offline (OFF re-canonicalizes on write).
  //
  // Owns only the chips + the add field; the caller wraps it in the section chrome
  // (heading, "optional"). `value` is the list of category strings, deduped
  // case-insensitively (OFF categories are case-insensitive).
  let { value = $bindable([]) }: { value: string[] } = $props();

  let query = $state("");
  let suggestions = $state<string[]>([]);
  // True while a taxonomy request is in flight, so the panel shows a loading row
  // rather than a bare/stale list while fetching.
  let loading = $state(false);
  let focused = $state(false);
  // Escape hides the panel without losing the typed query; any new keystroke re-
  // shows it.
  let dismissed = $state(false);
  // Index of the keyboard-highlighted suggestion; -1 = none (free-text on Enter).
  let active = $state(-1);
  let debounceTimer: ReturnType<typeof setTimeout>;
  // Monotonic request id so a slow response never overwrites a newer query's.
  let seq = 0;

  const listId = `catpick-${crypto.randomUUID()}`;
  const showPanel = $derived(focused && !dismissed && query.trim().length > 0);

  const isPicked = (c: string) =>
    value.some((v) => v.toLowerCase() === c.toLowerCase());

  // ── English-only seeds ─────────────────────────────────────────────────────
  // Seeds arrive from OFF's stored food/category, which is in the product's own
  // language — so verify each against the English taxonomy and drop the ones that
  // aren't English (isEnglishCategory === false). A category the taxonomy couldn't
  // be asked about (null, offline) is kept, never erased.
  //
  // A chip is shown only once it has SETTLED — verified English, undetermined-keep,
  // or a known English pick. One still being checked stays hidden behind a
  // "Checking categories…" line until its verdict lands, so a non-English seed
  // never flashes in and then vanishes. `verified` is the plain skip-set (only KEPT
  // categories, so a dropped non-English one is re-checked if re-seeded); `checking`
  // is the reactive set of keys with a check in flight, driving both the hide and
  // the loading line. Picked suggestions are already English, so add() marks them.
  const verified = new Set<string>();
  let checking = $state<Set<string>>(new Set());
  const shownChips = $derived(
    value.filter((v) => !checking.has(v.toLowerCase()))
  );

  async function verifySeeds(cats: string[]) {
    const started = new Set(checking);
    cats.forEach((c) => started.add(c.toLowerCase()));
    checking = started;
    const verdicts = await Promise.all(
      cats.map(async (c) => ({ c, english: await isEnglishCategory(c) }))
    );
    const drop = new Set<string>();
    const done = new Set(checking);
    for (const { c, english } of verdicts) {
      const key = c.toLowerCase();
      done.delete(key);
      if (english === false) drop.add(key);
      else verified.add(key); // English or undetermined → keep, don't re-check
    }
    checking = done;
    if (drop.size) value = value.filter((v) => !drop.has(v.toLowerCase()));
  }
  $effect(() => {
    const toCheck = value.filter((v) => {
      const key = v.toLowerCase();
      return !verified.has(key) && !checking.has(key);
    });
    if (toCheck.length) verifySeeds(toCheck);
  });

  function add(raw: string, known: boolean) {
    // Commas are OFF's separator, so a single category must not carry one; also
    // collapse whitespace so a free-typed entry is tidy.
    const clean = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (clean && !isPicked(clean)) {
      // A picked suggestion is already English; free text is left for verifySeeds.
      if (known) verified.add(clean.toLowerCase());
      value = [...value, clean];
    }
    query = "";
    suggestions = [];
    loading = false;
    active = -1;
  }

  function remove(cat: string) {
    // Remove by value — categories are deduped, and the shown list is a filtered
    // subset of `value`, so an index wouldn't line up.
    value = value.filter((v) => v !== cat);
  }

  function onInput() {
    clearTimeout(debounceTimer);
    active = -1;
    dismissed = false;
    if (!query.trim()) {
      suggestions = [];
      loading = false;
      return;
    }
    // Show the loading row immediately, then query on the same 300–400ms type-
    // ahead debounce the search field already uses.
    loading = true;
    suggestions = [];
    debounceTimer = setTimeout(runSearch, 300);
  }

  async function runSearch() {
    const q = query.trim();
    if (!q) {
      loading = false;
      return;
    }
    const mine = ++seq;
    const results = await fetchCategorySuggestions(q);
    if (mine !== seq) return; // superseded by a newer keystroke
    suggestions = results.filter((r) => !isPicked(r));
    loading = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (suggestions.length) active = (active + 1) % suggestions.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (suggestions.length)
        active = active <= 0 ? suggestions.length - 1 : active - 1;
    } else if (e.key === "Enter") {
      // Never let Enter submit the surrounding form — it commits a category.
      e.preventDefault();
      if (active >= 0 && active < suggestions.length)
        add(suggestions[active], true);
      else if (query.trim()) add(query, false);
    } else if (e.key === "Escape") {
      if (showPanel) dismissed = true;
    }
  }

  $effect(() => () => clearTimeout(debounceTimer));
</script>

<div class="catpick">
  {#if shownChips.length}
    <ul class="catpick-chips">
      {#each shownChips as cat (cat)}
        <li class="catpick-chip">
          <span>{cat}</span>
          <button
            type="button"
            onclick={() => remove(cat)}
            aria-label={`Remove ${cat}`}>✕</button
          >
        </li>
      {/each}
    </ul>
  {/if}
  {#if checking.size}
    <p class="catpick-checking" role="status">Checking categories…</p>
  {/if}

  <div class="catpick-field">
    <input
      class="catpick-input"
      role="combobox"
      aria-expanded={showPanel}
      aria-controls={listId}
      aria-autocomplete="list"
      aria-activedescendant={showPanel && active >= 0
        ? `${listId}-opt-${active}`
        : undefined}
      placeholder="＋ add a category"
      aria-label="Add a category"
      bind:value={query}
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={() => (focused = true)}
      onblur={() => setTimeout(() => (focused = false), 120)}
    />
    {#if showPanel}
      {#if loading}
        <p class="catpick-status" role="status">Searching…</p>
      {:else if suggestions.length}
        <ul class="catpick-list" id={listId} role="listbox">
          {#each suggestions as s, i (s)}
            <li
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              class:active={i === active}
              onmousedown={(e) => {
                // Commit before the input's blur closes the panel.
                e.preventDefault();
                add(s, true);
              }}
            >
              {s}
            </li>
          {/each}
        </ul>
      {:else}
        <p class="catpick-status" role="status">No matching categories</p>
      {/if}
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
  .catpick-checking {
    margin: 0;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }
  .catpick-field {
    position: relative;
  }
  .catpick-input {
    width: 100%;
    min-height: var(--tap-min);
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
  .catpick-list,
  .catpick-status {
    position: absolute;
    z-index: 5;
    top: calc(100% + 2px);
    left: 0;
    right: 0;
    margin: 0;
    border: var(--edge);
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: var(--shadow-2);
  }
  .catpick-list {
    list-style: none;
    padding: 0;
    max-height: 12rem;
    overflow-y: auto;
  }
  .catpick-status {
    padding: 0.6rem;
    font-size: 0.85rem;
    color: var(--text-secondary);
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
