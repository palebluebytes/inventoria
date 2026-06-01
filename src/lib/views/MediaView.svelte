<script lang="ts">
  import { onMount } from "svelte";
  import {
    mediaLibraryStore,
    saveMediaTwin,
    updateMediaStatus,
  } from "../stores/media.store";
  import { searchOpenLibrary } from "../media/open-library";
  import {
    searchTmdbMovies,
    searchTmdbTv,
    lookupTmdbMovie,
    lookupTmdbTv,
  } from "../media/tmdb";
  import type { EnrichedMedia } from "../media/state";
  import Card from "../ui/Card.svelte";
  import Button from "../ui/Button.svelte";
  import Badge from "../ui/Badge.svelte";
  import Input from "../ui/Input.svelte";
  import Alert from "../ui/Alert.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Active status column selected on mobile viewport
  let activeMobileTab = $state<"saved" | "started" | "progress" | "completed">(
    "saved"
  );

  // Ingestion Modal State
  let showIngestModal = $state(false);
  let searchType = $state<"book" | "movie" | "tv">("movie");
  let searchQuery = $state("");
  let searchResults = $state<any[]>([]);
  let isSearching = $state(false);
  let savingId = $state<string | null>(null);
  let searchError = $state("");

  // TMDB API Key settings
  let tmdbApiKey = $state("");

  onMount(() => {
    tmdbApiKey = localStorage.getItem("inventoria_tmdb_api_key") || "";
  });

  function saveTmdbKey() {
    localStorage.setItem("inventoria_tmdb_api_key", tmdbApiKey);
  }

  // Active Media Item for Engagement Dialog
  let selectedMedia = $state<EnrichedMedia | null>(null);
  let formStatus = $state<"saved" | "started" | "progress" | "completed">(
    "saved"
  );
  let formRating = $state<number | undefined>(undefined);
  let formReview = $state("");
  let formSeason = $state<number | undefined>(undefined);
  let formEpisode = $state<number | undefined>(undefined);
  let formPagesRead = $state<number | undefined>(undefined);

  function openEngagementModal(media: EnrichedMedia) {
    selectedMedia = media;
    formStatus = media.status;
    formRating = media.rating;
    formReview = media.review || "";
    formSeason = media.season;
    formEpisode = media.episode;
    formPagesRead = media.pages_read;
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    isSearching = true;
    searchError = "";
    searchResults = [];

    try {
      if (searchType === "book") {
        const results = await searchOpenLibrary(searchQuery);
        // Map raw OL search results for search card displays
        searchResults = results.map((payload) => ({
          id: payload.entity,
          payload,
          title: payload.attributes["media/title"],
          creator: payload.attributes["media/author"],
          release_date: payload.attributes["media/release_date"],
          poster_url: payload.attributes["media/poster_url"],
          type: "book",
        }));
      } else {
        const apiKey = tmdbApiKey.trim();
        if (!apiKey) {
          searchError = "TMDB API Key is required to search movies/TV.";
          isSearching = false;
          return;
        }

        if (searchType === "movie") {
          const results = await searchTmdbMovies(searchQuery, apiKey);
          searchResults = results.map((payload) => ({
            id: payload.entity,
            payload,
            title: payload.attributes["media/title"],
            creator: payload.attributes["media/director"],
            release_date: payload.attributes["media/release_date"],
            poster_url: payload.attributes["media/poster_url"],
            type: "movie",
          }));
        } else {
          const results = await searchTmdbTv(searchQuery, apiKey);
          searchResults = results.map((payload) => ({
            id: payload.entity,
            payload,
            title: payload.attributes["media/title"],
            creator: payload.attributes["media/director"], // TV Creator mapping
            release_date: payload.attributes["media/release_date"],
            poster_url: payload.attributes["media/poster_url"],
            type: "tv",
          }));
        }
      }
    } catch (err: any) {
      searchError =
        err.message ?? "Search failed. Please verify API configuration.";
    } finally {
      isSearching = false;
    }
  }

  async function handleSaveMedia(item: any) {
    savingId = item.id;
    try {
      let finalPayload = { ...item.payload };

      // For Movie/TV, we perform details lookup to enrich credits/creator information if API key is present
      if (item.type !== "book" && tmdbApiKey.trim()) {
        const rawId = parseInt(item.id.split(":").pop() ?? "0");
        if (rawId > 0) {
          if (item.type === "movie") {
            const enriched = await lookupTmdbMovie(rawId, tmdbApiKey.trim());
            finalPayload = enriched;
          } else {
            const enriched = await lookupTmdbTv(rawId, tmdbApiKey.trim());
            finalPayload = enriched;
          }
        }
      }

      await saveMediaTwin(finalPayload, "saved");
      // Remove from search results to show it was saved
      searchResults = searchResults.filter((r) => r.id !== item.id);
    } catch (err: any) {
      searchError = `Save failed: ${err.message ?? err}`;
    } finally {
      savingId = null;
    }
  }

  async function submitEngagement() {
    if (!selectedMedia) return;
    try {
      await updateMediaStatus(
        selectedMedia.id,
        selectedMedia.type,
        formStatus,
        {
          rating: formRating,
          review: formReview,
          season: formSeason,
          episode: formEpisode,
          pages_read: formPagesRead,
        }
      );
      selectedMedia = null;
    } catch (err: any) {
      alert(`Failed to log engagement: ${err.message ?? err}`);
    }
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
  const savedList = $derived(
    $mediaLibraryStore.filter((m) => m.status === "saved")
  );
  const startedList = $derived(
    $mediaLibraryStore.filter((m) => m.status === "started")
  );
  const progressList = $derived(
    $mediaLibraryStore.filter((m) => m.status === "progress")
  );
  const completedList = $derived(
    $mediaLibraryStore.filter((m) => m.status === "completed")
  );
</script>

<header class="page-header">
  <div class="header-main">
    <div>
      <h1>Media Library</h1>
      <p>
        Manage your books, movies, and TV shows in a local-first EAVT ledger.
      </p>
    </div>
    <Button id="ingest-media-btn" onclick={() => (showIngestModal = true)}>
      ＋ Ingest Media
    </Button>
  </div>
</header>

<!-- Mobile View Tab Selector -->
<div class="mobile-tabs-container">
  <div class="mobile-tabs">
    <button
      class="tab-btn"
      class:active={activeMobileTab === "saved"}
      onclick={() => (activeMobileTab = "saved")}
    >
      Saved ({savedList.length})
    </button>
    <button
      class="tab-btn"
      class:active={activeMobileTab === "started"}
      onclick={() => (activeMobileTab = "started")}
    >
      Started ({startedList.length})
    </button>
    <button
      class="tab-btn"
      class:active={activeMobileTab === "progress"}
      onclick={() => (activeMobileTab = "progress")}
    >
      Progress ({progressList.length})
    </button>
    <button
      class="tab-btn"
      class:active={activeMobileTab === "completed"}
      onclick={() => (activeMobileTab = "completed")}
    >
      Completed ({completedList.length})
    </button>
  </div>
</div>

<!-- Dashboard Kanban Board -->
<div class="kanban-board">
  <!-- Saved Column -->
  <div class="kanban-column" class:mobile-hidden={activeMobileTab !== "saved"}>
    <div class="column-header">
      <h3>Saved</h3>
      <Badge id="count-saved" variant="default">{savedList.length}</Badge>
    </div>
    <div class="column-cards" id="list-saved">
      {#each savedList as item (item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="media-card" onclick={() => openEngagementModal(item)}>
          {#if item.poster_url}
            <img src={item.poster_url} alt={item.title} class="card-poster" />
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
            {#if item.release_date}
              <p class="card-date">{item.release_date.slice(0, 4)}</p>
            {/if}
          </div>
          <div class="card-actions" onclick={(e) => e.stopPropagation()}>
            <Button
              variant="secondary"
              class="w-full text-xs"
              onclick={() => handleQuickAdvance(item, "started")}
            >
              Start →
            </Button>
          </div>
        </div>
      {:else}
        <p class="empty-column">No saved media.</p>
      {/each}
    </div>
  </div>

  <!-- Started Column -->
  <div
    class="kanban-column"
    class:mobile-hidden={activeMobileTab !== "started"}
  >
    <div class="column-header">
      <h3>Started</h3>
      <Badge id="count-started" variant="default">{startedList.length}</Badge>
    </div>
    <div class="column-cards" id="list-started">
      {#each startedList as item (item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="media-card" onclick={() => openEngagementModal(item)}>
          {#if item.poster_url}
            <img src={item.poster_url} alt={item.title} class="card-poster" />
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
          </div>
          <div class="card-actions" onclick={(e) => e.stopPropagation()}>
            <Button
              variant="secondary"
              class="w-full text-xs"
              onclick={() => handleQuickAdvance(item, "progress")}
            >
              Progress →
            </Button>
          </div>
        </div>
      {:else}
        <p class="empty-column">No started media.</p>
      {/each}
    </div>
  </div>

  <!-- In Progress Column -->
  <div
    class="kanban-column"
    class:mobile-hidden={activeMobileTab !== "progress"}
  >
    <div class="column-header">
      <h3>Progress</h3>
      <Badge id="count-progress" variant="default">{progressList.length}</Badge>
    </div>
    <div class="column-cards" id="list-progress">
      {#each progressList as item (item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div class="media-card" onclick={() => openEngagementModal(item)}>
          {#if item.poster_url}
            <img src={item.poster_url} alt={item.title} class="card-poster" />
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
          </div>
          <div class="card-actions" onclick={(e) => e.stopPropagation()}>
            <Button
              variant="secondary"
              class="w-full text-xs"
              onclick={() => handleQuickAdvance(item, "completed")}
            >
              Complete ✓
            </Button>
          </div>
        </div>
      {:else}
        <p class="empty-column">No active progress.</p>
      {/each}
    </div>
  </div>

  <!-- Completed Column -->
  <div
    class="kanban-column"
    class:mobile-hidden={activeMobileTab !== "completed"}
  >
    <div class="column-header">
      <h3>Completed</h3>
      <Badge id="count-completed" variant="default"
        >{completedList.length}</Badge
      >
    </div>
    <div class="column-cards" id="list-completed">
      {#each completedList as item (item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="media-card completed"
          onclick={() => openEngagementModal(item)}
        >
          {#if item.poster_url}
            <img src={item.poster_url} alt={item.title} class="card-poster" />
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
            {#if item.rating}
              <div class="rating-display">
                {"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}
              </div>
            {/if}
            {#if item.review}
              <p class="card-review">"{item.review}"</p>
            {/if}
          </div>
        </div>
      {:else}
        <p class="empty-column">No completed media.</p>
      {/each}
    </div>
  </div>
</div>

<!-- INGEST MEDIA SEARCH MODAL -->
{#if showIngestModal}
  <div
    class="modal-overlay"
    onclick={() => (showIngestModal = false)}
    role="dialog"
    aria-modal="true"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Ingest Digital Twins</h2>
        <button class="close-btn" onclick={() => (showIngestModal = false)}
          >&times;</button
        >
      </div>

      <div class="modal-tabs">
        <button
          class="tab-btn"
          class:active={searchType === "movie"}
          onclick={() => (searchType = "movie")}
        >
          🎬 Movies
        </button>
        <button
          class="tab-btn"
          class:active={searchType === "tv"}
          onclick={() => (searchType = "tv")}
        >
          📺 TV Shows
        </button>
        <button
          class="tab-btn"
          class:active={searchType === "book"}
          onclick={() => (searchType = "book")}
        >
          📖 Books
        </button>
      </div>

      <!-- Config API Key for TMDB -->
      {#if searchType !== "book"}
        <div class="api-key-config">
          <label for="tmdb-key-input">TMDB API Key (saved in browser):</label>
          <div class="flex gap-2 mt-1">
            <input
              id="tmdb-key-input"
              type="password"
              placeholder="Enter TMDB API Key"
              bind:value={tmdbApiKey}
              class="retro-input flex-1"
            />
            <Button variant="secondary" onclick={saveTmdbKey}>Save Key</Button>
          </div>
        </div>
      {/if}

      <!-- Search Bar -->
      <form
        class="search-form mt-4"
        onsubmit={(e) => {
          e.preventDefault();
          handleSearch();
        }}
      >
        <input
          id="media-search-input"
          type="text"
          placeholder="Search title, author or keywords..."
          bind:value={searchQuery}
          class="retro-input flex-1"
        />
        <Button type="submit" loading={isSearching}>Search</Button>
      </form>

      {#if searchError}
        <Alert variant="error" class="mt-4">{searchError}</Alert>
      {/if}

      <!-- Results Area -->
      <div class="search-results mt-4">
        {#if isSearching}
          <div class="searching-spinner">Searching remote databases...</div>
        {:else}
          {#each searchResults as item}
            <div class="search-result-item">
              {#if item.poster_url}
                <img
                  src={item.poster_url}
                  alt={item.title}
                  class="result-thumbnail"
                />
              {:else}
                <div class="result-thumbnail-placeholder">
                  {item.type === "book" ? "📖" : "🎬"}
                </div>
              {/if}
              <div class="result-info">
                <span class="result-title">{item.title}</span>
                <span class="result-creator">
                  {#if item.type === "book"}
                    By {item.creator || "Unknown"}
                  {:else}
                    Release: {item.release_date || "Unknown"}
                  {/if}
                </span>
              </div>
              <Button
                variant="secondary"
                disabled={savingId !== null}
                loading={savingId === item.id}
                onclick={() => handleSaveMedia(item)}
              >
                Save
              </Button>
            </div>
          {:else}
            {#if searchQuery && !isSearching}
              <p class="no-results">No matches found locally or online.</p>
            {/if}
          {/each}
        {/if}
      </div>
    </div>
  </div>
{/if}

<!-- LOG ENGAGEMENT MODAL -->
{#if selectedMedia}
  <div
    class="modal-overlay"
    onclick={() => (selectedMedia = null)}
    role="dialog"
    aria-modal="true"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>Log Engagement Event</h2>
        <button class="close-btn" onclick={() => (selectedMedia = null)}
          >&times;</button
        >
      </div>

      <div class="media-details-banner">
        {#if selectedMedia.poster_url}
          <img
            src={selectedMedia.poster_url}
            alt={selectedMedia.title}
            class="banner-poster"
          />
        {/if}
        <div class="banner-info">
          <h3>{selectedMedia.title}</h3>
          <p>
            {#if selectedMedia.type === "book"}
              Author: {selectedMedia.author || "Unknown"}
            {:else}
              Director: {selectedMedia.director || "Unknown"}
            {/if}
          </p>
          <Badge variant="default">{selectedMedia.type.toUpperCase()}</Badge>
        </div>
      </div>

      <form
        onsubmit={(e) => {
          e.preventDefault();
          submitEngagement();
        }}
        class="engagement-form mt-4"
      >
        <!-- Status -->
        <div class="form-group">
          <label for="event-status-select">Status</label>
          <select
            id="event-status-select"
            bind:value={formStatus}
            class="retro-select"
          >
            <option value="saved">Saved (To watch/read)</option>
            <option value="started">Started</option>
            <option value="progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
        </div>

        <!-- Book progress fields -->
        {#if selectedMedia.type === "book" && (formStatus === "started" || formStatus === "progress")}
          <div class="form-group">
            <label for="event-pages-read">Pages Read (Optional)</label>
            <input
              id="event-pages-read"
              type="number"
              min="0"
              bind:value={formPagesRead}
              class="retro-input"
            />
          </div>
        {/if}

        <!-- TV progress fields -->
        {#if selectedMedia.type === "tv" && (formStatus === "started" || formStatus === "progress")}
          <div class="flex gap-2">
            <div class="form-group flex-1">
              <label for="event-season">Season</label>
              <input
                id="event-season"
                type="number"
                min="1"
                bind:value={formSeason}
                class="retro-input"
              />
            </div>
            <div class="form-group flex-1">
              <label for="event-episode">Episode</label>
              <input
                id="event-episode"
                type="number"
                min="1"
                bind:value={formEpisode}
                class="retro-input"
              />
            </div>
          </div>
        {/if}

        <!-- Rating & Review -->
        <div class="form-group">
          <label for="event-rating">Rating (1-5)</label>
          <select
            id="event-rating"
            bind:value={formRating}
            class="retro-select"
          >
            <option value={undefined}>No Rating</option>
            <option value={1}>1 - Poor</option>
            <option value={2}>2 - Fair</option>
            <option value={3}>3 - Good</option>
            <option value={4}>4 - Very Good</option>
            <option value={5}>5 - Outstanding</option>
          </select>
        </div>

        <div class="form-group">
          <label for="event-review">Review / Comments</label>
          <textarea
            id="event-review"
            rows="3"
            bind:value={formReview}
            class="retro-textarea"
            placeholder="Add your thoughts..."
          ></textarea>
        </div>

        <div class="modal-footer mt-6">
          <Button variant="secondary" onclick={() => (selectedMedia = null)}
            >Cancel</Button
          >
          <Button type="submit">Log Event</Button>
        </div>
      </form>
    </div>
  </div>
{/if}

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-s);
  }
  .header-main {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-s);
    flex-wrap: wrap;
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
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-m);
    margin-top: var(--space-m);
  }

  @media (min-width: 768px) {
    .kanban-board {
      grid-template-columns: repeat(4, 1fr);
    }
  }

  .kanban-column {
    background: var(--bg-surface);
    border: 2px solid #000;
    padding: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    min-height: 300px;
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 1);
  }

  .column-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-3xs);
    margin-bottom: var(--space-2xs);
  }

  .column-header h3 {
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .column-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    flex: 1;
    overflow-y: auto;
  }

  .empty-column {
    font-size: var(--step-n2);
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-m) 0;
    font-style: italic;
  }

  /* Media Card Styles */
  .media-card {
    background: #fff;
    border: 1px solid #000;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    position: relative;
  }

  .media-card:hover {
    transform: translateY(-2px);
    box-shadow: 4px 4px 0 rgba(0, 0, 0, 1);
  }

  .card-poster {
    width: 100%;
    aspect-ratio: 2/3;
    object-fit: cover;
    border-bottom: 1px solid #000;
    background: #f4f4f5;
  }

  .card-poster-placeholder {
    width: 100%;
    aspect-ratio: 2/3;
    background: #e4e4e7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 3rem;
    border-bottom: 1px solid #000;
  }

  .card-details {
    padding: var(--space-xs);
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  :global(.card-type-badge) {
    align-self: flex-start;
    font-size: 0.6rem !important;
    padding: 1px 4px !important;
  }

  .card-title {
    font-size: var(--step-n1);
    font-weight: 700;
    margin: 0;
    line-height: 1.2;
    color: #000;
  }

  .card-creator {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    margin: 0;
  }

  .card-date {
    font-size: var(--step-n3);
    color: var(--text-muted);
    margin: 0;
  }

  .card-progress-stat {
    font-size: var(--step-n2);
    font-weight: 600;
    background: #f4f4f5;
    padding: 2px 6px;
    border: 1px solid #000;
    margin-top: 4px;
    display: inline-block;
    align-self: flex-start;
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

  /* Modals */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(255, 255, 255, 0.95);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: var(--space-s);
  }

  .modal-card {
    background: #fff;
    border: 2px solid #000;
    width: 100%;
    max-width: 550px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    padding: var(--space-m);
    box-shadow: 8px 8px 0 rgba(0, 0, 0, 1);
    animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-xs);
    margin-bottom: var(--space-s);
  }

  .modal-header h2 {
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 2rem;
    cursor: pointer;
    line-height: 1;
    color: #000;
  }

  .modal-tabs {
    display: flex;
    gap: var(--space-xs);
    border-bottom: 1px solid #000;
    margin-bottom: var(--space-s);
  }

  .tab-btn {
    flex: 1;
    background: transparent;
    border: 1px solid #000;
    border-bottom: none;
    padding: var(--space-xs) 0;
    font-size: var(--step-n1);
    font-weight: 600;
    cursor: pointer;
    text-transform: uppercase;
  }

  .tab-btn.active {
    background: #000;
    color: #fff;
  }

  .search-form {
    display: flex;
    gap: var(--space-xs);
  }

  .retro-input {
    border: 2px solid #000;
    padding: var(--space-2xs) var(--space-xs);
    font-size: var(--step-n1);
    font-family: inherit;
    border-radius: 0;
  }

  .retro-input:focus {
    outline: none;
    background: #fafafa;
  }

  .api-key-config {
    background: #f4f4f5;
    border: 1px solid #000;
    padding: var(--space-xs);
    font-size: var(--step-n2);
  }

  .api-key-config label {
    font-weight: 600;
  }

  .search-results {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    max-height: 40vh;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: var(--space-xs);
    border: 1px solid #000;
    background: #fff;
  }

  .result-thumbnail {
    width: 50px;
    height: 75px;
    object-fit: cover;
    border: 1px solid #000;
  }

  .result-thumbnail-placeholder {
    width: 50px;
    height: 75px;
    background: #e4e4e7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    border: 1px solid #000;
  }

  .result-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .result-title {
    font-weight: 700;
    font-size: var(--step-n1);
  }

  .result-creator {
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  .no-results {
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
    padding: var(--space-s);
  }

  .searching-spinner {
    text-align: center;
    padding: var(--space-m);
    font-style: italic;
  }

  /* Log Engagement Modal Banner */
  .media-details-banner {
    display: flex;
    gap: var(--space-s);
    background: #f4f4f5;
    border: 1px solid #000;
    padding: var(--space-xs);
  }

  .banner-poster {
    width: 60px;
    height: 90px;
    object-fit: cover;
    border: 1px solid #000;
  }

  .banner-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
  }

  .banner-info h3 {
    margin: 0;
    font-size: var(--step-0);
    line-height: 1.2;
  }

  .banner-info p {
    margin: 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  .engagement-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    overflow-y: auto;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .form-group label {
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
  }

  .retro-select {
    border: 2px solid #000;
    padding: var(--space-2xs) var(--space-xs);
    font-size: var(--step-n1);
    font-family: inherit;
    border-radius: 0;
    background: #fff;
    cursor: pointer;
  }

  .retro-textarea {
    border: 2px solid #000;
    padding: var(--space-2xs) var(--space-xs);
    font-size: var(--step-n1);
    font-family: inherit;
    border-radius: 0;
    resize: vertical;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xs);
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
    border: none;
    border-right: 1px solid #000;
    margin: 0;
    padding: var(--space-xs) 0;
    font-size: var(--step-n2);
  }

  .mobile-tabs .tab-btn:last-child {
    border-right: none;
  }

  .mobile-tabs .tab-btn.active {
    background: #000;
    color: #fff;
  }

  .mobile-hidden {
    display: none !important;
  }

  @media (min-width: 768px) {
    .mobile-tabs-container {
      display: none;
    }
    .mobile-hidden {
      display: flex !important;
    }
  }

  .flex {
    display: flex;
  }
  .flex-1 {
    flex: 1;
  }
  .gap-2 {
    gap: var(--space-xs);
  }
  .mt-1 {
    margin-top: 4px;
  }
  .mt-4 {
    margin-top: var(--space-s);
  }
  .mt-6 {
    margin-top: var(--space-m);
  }
  :global(.w-full) {
    width: 100%;
  }
  :global(.text-xs) {
    font-size: var(--step-n2);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
