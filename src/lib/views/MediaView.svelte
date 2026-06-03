<script lang="ts">
  import { mediaLibraryStore, updateMediaStatus } from "../stores/media.store";
  import type { EnrichedMedia } from "../media/state";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import MediaCard from "./media/MediaCard.svelte";
  import MediaIngestModal from "./media/MediaIngestModal.svelte";
  import MediaEngagementModal from "./media/MediaEngagementModal.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Active media type filter
  let activeMediaType = $state<"movie" | "tv" | "book">("movie");

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

<header class="page-header">
  <h1>Media Tracker</h1>
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
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-s);
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.05em;
    text-transform: uppercase;
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
    background: #fff;
    border: 2px solid #000;
    padding: 0;
    display: flex;
    flex-direction: column;
    min-height: 200px;
    box-shadow: 6px 6px 0 #000;
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding: var(--space-xs) var(--space-s);
    background: #000;
    color: #fff;
    margin-bottom: 0;
  }

  .column-header h3 {
    font-size: var(--step-0);
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
    color: #fff;
  }

  .column-header-title {
    display: flex;
    align-items: center;
    gap: var(--space-s);
  }

  .add-btn {
    background: transparent;
    color: #fff;
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
    background: #fff !important;
    color: #000 !important;
    border-color: #fff !important;
  }

  .column-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-m);
    padding: var(--space-s);
    background: #fafafa;
  }

  .empty-column {
    font-family: monospace;
    font-size: var(--step-n1);
    color: #000;
    text-align: center;
    padding: var(--space-xl) var(--space-s);
    border: 2px dashed #000;
    margin: var(--space-s) 0;
    background: #fff;
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
    border: 2px solid #000;
    background: var(--bg-surface);
  }

  .mobile-tabs .tab-btn {
    flex: 1;
    background: transparent;
    border: none;
    border-right: 1px solid #000;
    margin: 0;
    padding: var(--space-xs) 0;
    font-family: monospace;
    font-weight: 700;
    font-size: var(--step-n2);
    text-transform: uppercase;
    cursor: pointer;
  }

  .mobile-tabs .tab-btn:last-child {
    border-right: none;
  }

  .mobile-tabs .tab-btn.active {
    background: #000;
    color: #fff;
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
