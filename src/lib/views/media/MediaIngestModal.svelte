<script lang="ts">
  import { searchOpenLibrary } from "../../media/open-library";
  import {
    searchTmdbMovies,
    searchTmdbTv,
    lookupTmdbMovie,
    lookupTmdbTv,
  } from "../../media/tmdb";
  import { saveMediaTwin } from "../../stores/media.store";
  import { settingsStore } from "../../stores/settings.store";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";

  let {
    onClose,
    initialStatus = "saved",
    initialType = "movie",
  }: {
    onClose: () => void;
    initialStatus?: "saved" | "started" | "progress" | "completed";
    initialType?: "movie" | "tv" | "book";
  } = $props();

  let searchQuery = $state("");
  let searchResults = $state<any[]>([]);
  let isSearching = $state(false);
  let savingId = $state<string | null>(null);
  let searchError = $state("");

  $effect(() => {
    if (searchQuery) {
      const handler = setTimeout(() => {
        handleSearch();
      }, 500);
      return () => clearTimeout(handler);
    } else {
      searchResults = [];
    }
  });

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    isSearching = true;
    searchError = "";
    searchResults = [];

    try {
      if (initialType === "book") {
        const results = await searchOpenLibrary(searchQuery);
        searchResults = results.map((payload) => ({
          id: payload.entity,
          payload,
          title: payload.attributes["media/title"],
          creator: payload.attributes["media/author"],
          release_date: payload.attributes["media/release_date"],
          poster_url: payload.attributes["media/poster_url"],
          type: "book",
          imageError: false,
        }));
      } else {
        if (initialType === "movie") {
          const results = await searchTmdbMovies(searchQuery);
          searchResults = results.map((payload) => ({
            id: payload.entity,
            payload,
            title: payload.attributes["media/title"],
            creator: payload.attributes["media/director"],
            release_date: payload.attributes["media/release_date"],
            poster_url: payload.attributes["media/poster_url"],
            type: "movie",
            imageError: false,
          }));
        } else {
          const results = await searchTmdbTv(searchQuery);
          searchResults = results.map((payload) => ({
            id: payload.entity,
            payload,
            title: payload.attributes["media/title"],
            creator: payload.attributes["media/director"],
            release_date: payload.attributes["media/release_date"],
            poster_url: payload.attributes["media/poster_url"],
            type: "tv",
            imageError: false,
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

      if (item.type !== "book") {
        const rawId = parseInt(item.id.split(":").pop() ?? "0");
        if (rawId > 0) {
          if (item.type === "movie") {
            const enriched = await lookupTmdbMovie(rawId);
            finalPayload = enriched;
          } else {
            const enriched = await lookupTmdbTv(rawId);
            finalPayload = enriched;
          }
        }
      }

      await saveMediaTwin(finalPayload, initialStatus);
      searchResults = searchResults.filter((r) => r.id !== item.id);
    } catch (err: any) {
      searchError = `Save failed: ${err.message ?? err}`;
    } finally {
      savingId = null;
    }
  }
</script>

<div class="modal-overlay" onclick={onClose} role="dialog" aria-modal="true">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="modal-card" onclick={(e) => e.stopPropagation()}>
    <div class="modal-header">
      <h2>Ingest Digital Twins</h2>
      <button class="close-btn" onclick={onClose}>&times;</button>
    </div>

    {#if initialType !== "book" && !$settingsStore.tmdb_api_key}
      <div class="mt-4">
        <Alert variant="warning">
          TMDB API key is not configured. Please set your key in Settings to
          search and ingest Movie/TV twins.
        </Alert>
      </div>
    {/if}

    <form
      class="search-form mt-4"
      onsubmit={(e) => {
        e.preventDefault();
        if (initialType === "book" || $settingsStore.tmdb_api_key) {
          handleSearch();
        }
      }}
    >
      <input
        id="media-search-input"
        type="text"
        placeholder="Search title, author or keywords..."
        bind:value={searchQuery}
        class="retro-input flex-1"
        disabled={initialType !== "book" && !$settingsStore.tmdb_api_key}
      />
      <Button
        type="submit"
        loading={isSearching}
        disabled={initialType !== "book" && !$settingsStore.tmdb_api_key}
        >Search</Button
      >
    </form>

    {#if initialType === "book"}
      <div class="v2-actions">
        <Button
          variant="secondary"
          onclick={() =>
            alert(
              "V2 Feature: Barcode and Image scanning for books will be available in the next release."
            )}
        >
          📷 Scan Barcode / Cover (V2)
        </Button>
      </div>
    {/if}

    {#if searchError}
      <Alert variant="error" class="mt-4 mx-4">{searchError}</Alert>
    {/if}

    <div class="search-results mt-4">
      {#if isSearching}
        <div class="searching-spinner">Searching remote databases...</div>
      {:else}
        {#each searchResults as item}
          <div class="search-result-item">
            {#if item.poster_url && !item.imageError}
              <img
                src={item.poster_url}
                alt={item.title}
                class="result-thumbnail"
                onerror={() => (item.imageError = true)}
                referrerpolicy="no-referrer"
                crossorigin="anonymous"
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

<style>
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
    border: 4px solid #000;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    box-shadow: 12px 12px 0 #000;
    animation: slideUp 0.1s step-end;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 4px solid #000;
    padding: var(--space-s) var(--space-m);
    background: #000;
    color: #fff;
    margin-bottom: 0;
  }

  .modal-header h2 {
    font-size: var(--step-1);
    font-weight: 900;
    text-transform: uppercase;
    margin: 0;
  }

  .close-btn {
    background: #fff;
    border: 2px solid #000;
    width: 40px;
    height: 40px;
    font-size: 2rem;
    cursor: pointer;
    line-height: 1;
    color: #000;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s step-end;
  }

  .close-btn:hover {
    background: #e4e4e7;
    transform: translate(-2px, -2px);
    box-shadow: 4px 4px 0 #000;
  }

  .search-form {
    display: flex;
    gap: var(--space-s);
    padding: var(--space-m) var(--space-m) 0;
  }

  .v2-actions {
    display: flex;
    justify-content: flex-end;
    padding: var(--space-s) var(--space-m) 0;
  }

  .retro-input {
    border: 2px solid #000;
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: monospace;
    font-weight: 700;
    border-radius: 0;
    background: #fff;
    box-shadow: inset 2px 2px 0 #e4e4e7;
    transition: all 0.1s step-end;
  }

  .retro-input:focus {
    outline: none;
    background: #000;
    color: #fff;
    box-shadow: none;
  }

  .search-results {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    max-height: 40vh;
    padding: var(--space-s) var(--space-m) var(--space-m);
  }

  .search-result-item {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: 0;
    border: 2px solid #000;
    background: #fff;
    box-shadow: 4px 4px 0 #000;
  }

  .search-result-item :global(button) {
    margin: var(--space-s);
  }

  .result-thumbnail {
    width: 60px;
    height: 90px;
    object-fit: cover;
    border-right: 2px solid #000;
  }

  .result-thumbnail-placeholder {
    width: 60px;
    height: 90px;
    background: #e4e4e7;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    border-right: 2px solid #000;
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
    font-family: monospace;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  .no-results {
    text-align: center;
    color: var(--text-muted);
    font-family: monospace;
    font-style: italic;
    padding: var(--space-s);
  }

  .searching-spinner {
    text-align: center;
    font-family: monospace;
    padding: var(--space-m);
    font-style: italic;
  }

  .mt-4 {
    margin-top: var(--space-s);
  }
  .mx-4 {
    margin-left: var(--space-m);
    margin-right: var(--space-m);
  }
  .flex-1 {
    flex: 1;
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
