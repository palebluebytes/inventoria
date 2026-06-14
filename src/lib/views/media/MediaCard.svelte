<script lang="ts">
  import type { EnrichedMedia } from "../../media/state";
  import Badge from "../../ui/Badge.svelte";
  import Button from "../../ui/Button.svelte";

  let {
    item,
    onClick,
    onQuickAdvance,
  }: {
    item: EnrichedMedia;
    onClick: () => void;
    onQuickAdvance: (
      status: "saved" | "started" | "progress" | "completed"
    ) => void;
  } = $props();

  let imageError = $state(false);

  // Opening the detail view is suppressed when the click lands on the action
  // bar, so the quick-advance buttons keep working without a separate
  // stop-propagation handler on a non-interactive element.
  function handleCardClick(event: MouseEvent) {
    if ((event.target as HTMLElement).closest(".card-actions")) return;
    onClick();
  }
  function handleCardKey(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick();
    }
  }
</script>

<div
  class="media-card"
  class:completed={item.status === "completed"}
  role="button"
  tabindex="0"
  onclick={handleCardClick}
  onkeydown={handleCardKey}
>
  {#if item.poster_url && !imageError}
    <img
      src={item.poster_url}
      alt={item.title}
      class="card-poster"
      onerror={() => (imageError = true)}
      referrerpolicy="no-referrer"
      crossorigin="anonymous"
    />
  {:else}
    <div class="card-poster-placeholder">
      {item.type === "book" ? "📖" : item.type === "tv" ? "📺" : "🎬"}
    </div>
  {/if}
  <div class="card-details">
    <Badge variant="default" class="card-type-badge"
      >{item.type.toUpperCase()}</Badge
    >
    <h4 class="card-title">{item.title}</h4>
    <p class="card-creator">
      {#if item.type === "book"}
        Author: {item.author || "Unknown"}
      {:else}
        Director: {item.director || "Unknown"}
      {/if}
    </p>

    <!-- Specific to Saved -->
    {#if item.status === "saved" && item.release_date}
      <p class="card-date">{item.release_date.slice(0, 4)}</p>
    {/if}

    <!-- Specific to Progress -->
    {#if item.status === "progress"}
      {#if item.type === "book" && item.pages_read !== undefined}
        <div class="card-progress-stat">
          📖 {item.pages_read} pages read
        </div>
      {/if}
      {#if item.type === "tv" && (item.season !== undefined || item.episode !== undefined)}
        <div class="card-progress-stat">
          📺 S{item.season ?? 1} E{item.episode ?? 1}
        </div>
      {/if}
    {/if}

    <!-- Specific to Completed -->
    {#if item.status === "completed"}
      {#if item.rating}
        <div class="rating-display">
          {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
        </div>
      {/if}
      {#if item.review}
        <p class="card-review">"{item.review}"</p>
      {/if}
    {/if}
  </div>

  {#if item.status !== "completed"}
    <div class="card-actions">
      <Button
        variant="secondary"
        class="w-full text-xs"
        onclick={() => {
          if (item.status === "saved") onQuickAdvance("started");
          else if (item.status === "started") onQuickAdvance("progress");
          else if (item.status === "progress") onQuickAdvance("completed");
        }}
      >
        {#if item.status === "saved"}
          Start →
        {:else if item.status === "started"}
          Progress →
        {:else if item.status === "progress"}
          Complete ✓
        {/if}
      </Button>
    </div>
  {/if}
</div>

<style>
  .media-card {
    background: #fff;
    border: 2px solid #000;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition:
      transform 0.1s step-end,
      box-shadow 0.1s step-end;
    position: relative;
    box-shadow: 4px 4px 0 #000;
  }

  .media-card:hover {
    transform: translate(-4px, -4px);
    box-shadow: 8px 8px 0 #000;
  }

  .card-poster {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    border-bottom: 2px solid #000;
    background: #000;
    filter: grayscale(100%) contrast(120%);
    transition: filter 0.1s step-end;
  }

  .media-card:hover .card-poster {
    filter: grayscale(0%) contrast(100%);
  }

  .card-poster-placeholder {
    width: 100%;
    aspect-ratio: 2/3;
    background: repeating-linear-gradient(
      45deg,
      #fff,
      #fff 10px,
      #000 10px,
      #000 20px
    );
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 4rem;
    border-bottom: 2px solid #000;
  }

  .card-details {
    padding: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex: 1;
  }

  :global(.card-type-badge) {
    align-self: flex-start;
    font-family: monospace;
    font-size: 0.7rem !important;
    padding: 2px 6px !important;
    background: #000 !important;
    color: #fff !important;
    border-radius: 0 !important;
  }

  .card-title {
    font-size: var(--step-0);
    font-weight: 900;
    margin: 0;
    line-height: 1.1;
    color: #000;
    text-transform: uppercase;
  }

  .card-creator {
    font-family: monospace;
    font-size: var(--step-n2);
    color: #000;
    margin: 0;
    font-weight: 600;
  }

  .card-date {
    font-family: monospace;
    font-size: var(--step-n2);
    color: #000;
    margin: 0;
    border: 1px solid #000;
    padding: 0 4px;
    display: inline-block;
    align-self: flex-start;
  }

  .card-progress-stat {
    font-family: monospace;
    font-size: var(--step-n2);
    font-weight: 700;
    background: #000;
    color: #fff;
    padding: 4px 8px;
    border: 2px solid #000;
    margin-top: 8px;
    display: inline-block;
    align-self: flex-start;
    text-transform: uppercase;
  }

  .rating-display {
    color: #000;
    font-size: 0.8rem;
    margin-top: 4px;
  }

  .card-review {
    font-size: var(--step-n3);
    font-style: italic;
    color: var(--text-muted);
    margin: 4px 0 0 0;
    word-break: break-word;
  }

  .card-actions {
    padding: var(--space-3xs) var(--space-xs) var(--space-xs);
    border-top: 1px solid #f4f4f5;
  }

  :global(.w-full) {
    width: 100%;
  }
  :global(.text-xs) {
    font-size: var(--step-n2);
  }
</style>
