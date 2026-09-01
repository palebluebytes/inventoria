<script lang="ts">
  import { mediaLibraryStore, updateMediaStatus } from "../stores/media.store";
  import type { EnrichedMedia } from "../media/state";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import MediaCard from "./media/MediaCard.svelte";
  import MediaIngestModal from "./media/MediaIngestModal.svelte";
  import MediaEngagementModal from "./media/MediaEngagementModal.svelte";
  import MediaSettingsSheet from "./media/MediaSettingsSheet.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Active media type filter
  let activeMediaType = $state<"movie" | "tv" | "book">("movie");

  // Media settings (top-right gear) — this screen's own settings surface,
  // carrying the TMDB key. A setting lives beside the thing it configures
  // (ADR-0080 §4), and until #303 this screen had no settings affordance at
  // all: the key sat on the app's Settings tab, two screens from the search box
  // that needs it.
  let settingsOpen = $state(false);

  // Modal State
  let ingestTargetStatus = $state<
    "saved" | "started" | "progress" | "completed" | null
  >(null);
  let selectedMediaId = $state<string | null>(null);
  let selectedMedia = $derived(
    selectedMediaId
      ? $mediaLibraryStore.find((m) => m.id === selectedMediaId) || null
      : null
  );

  function openEngagementModal(media: EnrichedMedia) {
    selectedMediaId = media.id;
  }

  async function handleQuickAdvance(
    media: EnrichedMedia,
    nextStatus: "saved" | "started" | "progress" | "completed"
  ) {
    try {
      await updateMediaStatus(media.id, media.type, nextStatus, {
        rating: media.rating,
        review: media.review,
        season: media.season,
        episode: media.episode,
        pages_read: media.pages_read,
      });
    } catch (err: any) {
      alert(`Failed to update status: ${err.message ?? err}`);
    }
  }

  // Reactive filters of columns
  const filteredLibrary = $derived(
    $mediaLibraryStore.filter((m) => m.type === activeMediaType)
  );

  const savedList = $derived(
    filteredLibrary.filter((m) => m.status === "saved")
  );
  const startedList = $derived(
    filteredLibrary.filter((m) => m.status === "started")
  );
  const progressList = $derived(
    filteredLibrary.filter((m) => m.status === "progress")
  );
  const completedList = $derived(
    filteredLibrary.filter((m) => m.status === "completed")
  );
</script>

{#snippet settingsMark()}
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3"></circle>
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
    ></path>
  </svg>
{/snippet}

<header class="page-header">
  <!-- Title and gear share a row of their own, so they keep a centre line
       whatever the blurb below does — the same header shape `FoodView` uses,
       which is the one ADR-0080 §4 pointed at when it commissioned this. -->
  <div class="header-bar">
    <h1>Media Tracker</h1>
    <button
      type="button"
      class="header-icon-btn"
      id="media-settings-btn"
      aria-label="Media settings"
      onclick={() => (settingsOpen = true)}
    >
      {@render settingsMark()}
    </button>
  </div>
  <p>
    Track your movies, TV shows, and books. Search databases and manage your
    backlog locally.
  </p>
</header>

<!-- Media Type Tab Selector (Desktop & Mobile) -->
<div
  class="mobile-tabs-container"
  style="display: block; margin-bottom: var(--space-m);"
>
  <div class="mobile-tabs">
    <button
      class="tab-btn"
      class:active={activeMediaType === "movie"}
      onclick={() => (activeMediaType = "movie")}
    >
      Movies
    </button>
    <button
      class="tab-btn"
      class:active={activeMediaType === "tv"}
      onclick={() => (activeMediaType = "tv")}
    >
      TV Shows
    </button>
    <button
      class="tab-btn"
      class:active={activeMediaType === "book"}
      onclick={() => (activeMediaType = "book")}
    >
      Books
    </button>
  </div>
</div>

<!-- Dashboard Kanban Board -->
<div class="kanban-board">
  <!-- Saved Column -->
  <div class="kanban-column">
    <div class="column-header">
      <div class="column-header-title">
        <h3>Saved</h3>
        <Badge id="count-saved" variant="default">{savedList.length}</Badge>
      </div>
      <button
        class="add-btn"
        onclick={() => (ingestTargetStatus = "saved")}
        title="Add Saved">+</button
      >
    </div>
    <div class="column-cards" id="list-saved">
      {#each savedList as item (item.id)}
        <MediaCard
          {item}
          onClick={() => openEngagementModal(item)}
          onQuickAdvance={(status) => handleQuickAdvance(item, status)}
        />
      {:else}
        <p class="empty-column">No saved media.</p>
      {/each}
    </div>
  </div>

  <!-- Started Column -->
  <div class="kanban-column">
    <div class="column-header">
      <div class="column-header-title">
        <h3>Started</h3>
        <Badge id="count-started" variant="default">{startedList.length}</Badge>
      </div>
      <button
        class="add-btn"
        onclick={() => (ingestTargetStatus = "started")}
        title="Add Started">+</button
      >
    </div>
    <div class="column-cards" id="list-started">
      {#each startedList as item (item.id)}
        <MediaCard
          {item}
          onClick={() => openEngagementModal(item)}
          onQuickAdvance={(status) => handleQuickAdvance(item, status)}
        />
      {:else}
        <p class="empty-column">No started media.</p>
      {/each}
    </div>
  </div>

  <!-- In Progress Column -->
  <div class="kanban-column">
    <div class="column-header">
      <div class="column-header-title">
        <h3>Progress</h3>
        <Badge id="count-progress" variant="default"
          >{progressList.length}</Badge
        >
      </div>
      <button
        class="add-btn"
        onclick={() => (ingestTargetStatus = "progress")}
        title="Add Progress">+</button
      >
    </div>
    <div class="column-cards" id="list-progress">
      {#each progressList as item (item.id)}
        <MediaCard
          {item}
          onClick={() => openEngagementModal(item)}
          onQuickAdvance={(status) => handleQuickAdvance(item, status)}
        />
      {:else}
        <p class="empty-column">No active progress.</p>
      {/each}
    </div>
  </div>

  <!-- Completed Column -->
  <div class="kanban-column">
    <div class="column-header">
      <div class="column-header-title">
        <h3>Completed</h3>
        <Badge id="count-completed" variant="default"
          >{completedList.length}</Badge
        >
      </div>
      <button
        class="add-btn"
        onclick={() => (ingestTargetStatus = "completed")}
        title="Add Completed">+</button
      >
    </div>
    <div class="column-cards" id="list-completed">
      {#each completedList as item (item.id)}
        <MediaCard
          {item}
          onClick={() => openEngagementModal(item)}
          onQuickAdvance={(status) => handleQuickAdvance(item, status)}
        />
      {:else}
        <p class="empty-column">No completed media.</p>
      {/each}
    </div>
  </div>
</div>

<!-- MEDIA SETTINGS — the header gear. One field: the TMDB key the ingest
     search needs (ADR-0080 §4). -->
{#if settingsOpen}
  <MediaSettingsSheet onClose={() => (settingsOpen = false)} />
{/if}

<!-- INGEST MEDIA SEARCH MODAL -->
{#if ingestTargetStatus}
  <MediaIngestModal
    initialStatus={ingestTargetStatus}
    initialType={activeMediaType}
    onClose={() => (ingestTargetStatus = null)}
  />
{/if}

<!-- LOG ENGAGEMENT MODAL -->
{#if selectedMedia}
  <MediaEngagementModal
    media={selectedMedia}
    onClose={() => (selectedMediaId = null)}
  />
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
    border-bottom: var(--edge);
    padding-bottom: var(--space-s);
  }
  /* `center` is what puts the title's centre line through the gear: the word
     and the 2.75rem icon square are different heights, and top-aligning them
     leaves the icon sitting low against it. */
  .header-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-s);
  }
  /* The gear, bare (no box) and opposite the title, sized like FoodView's. */
  .header-icon-btn {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ink);
    cursor: pointer;
    transition: transform 0.1s ease-out;
  }
  .header-icon-btn svg {
    width: 1.5rem;
    height: 1.5rem;
  }
  .header-icon-btn:hover {
    color: var(--text-secondary);
  }
  .header-icon-btn:active {
    transform: scale(0.92);
  }
  .header-icon-btn:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.05em;
    text-transform: uppercase;
    /* Centring the boxes is not centring the letters: an all-caps word has no
       descenders, so trimming the box to the cap-height/baseline block makes
       the box the letters and the row centres what the eye sees. Chromium and
       Safari honour this; anywhere else it is ignored (same as FoodView). */
    text-box-trim: trim-both;
    text-box-edge: cap alphabetic;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }

  /* Kanban board layout */
  .kanban-board {
    display: flex;
    flex-direction: column;
    gap: var(--space-l);
    margin-top: var(--space-m);
  }

  .kanban-column {
    background: var(--paper);
    border: var(--edge);
    padding: 0;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    box-shadow: var(--shadow-3);
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: var(--edge);
    padding: var(--space-xs) var(--space-s);
    background: var(--ink);
    color: var(--paper);
    margin-bottom: 0;
  }

  .column-header h3 {
    font-size: var(--step-0);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
    color: var(--paper);
  }

  .column-header-title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  .add-btn {
    background: transparent;
    color: var(--paper);
    border: none;
    font-size: 2rem;
    font-weight: 900;
    cursor: pointer;
    line-height: 1;
    padding: 0 var(--space-2xs);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s step-end;
  }
  .add-btn:hover {
    transform: scale(1.1);
  }

  .column-header :global(.badge) {
    background: var(--paper) !important;
    color: var(--ink) !important;
    border-color: var(--paper) !important;
  }

  .column-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-m);
    padding: var(--space-s);
    background: var(--bg-base);
  }

  .empty-column {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    color: var(--ink);
    text-align: center;
    padding: var(--space-xl) var(--space-s);
    border: 2px dashed var(--ink);
    margin: var(--space-s) 0;
    background: var(--paper);
    text-transform: uppercase;
    grid-column: 1 / -1;
  }

  /* Mobile Tabs */
  .mobile-tabs-container {
    display: block;
    margin-bottom: var(--space-s);
  }

  .mobile-tabs {
    display: flex;
    border: var(--edge);
    background: var(--bg-surface);
  }

  .mobile-tabs .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    border-right: var(--edge-thin);
    margin: 0;
    padding: var(--space-xs) 0;
    font-family: var(--font-mono);
    font-weight: 700;
    font-size: var(--step-n2);
    text-transform: uppercase;
    cursor: pointer;
  }

  .mobile-tabs .tab-btn:last-child {
    border-right: none;
  }

  .mobile-tabs .tab-btn.active {
    background: var(--ink);
    color: var(--paper);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
