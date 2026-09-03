<script lang="ts">
  import { searchOpenLibrary } from "../../media/open-library";
  import { searchTmdbMovies, searchTmdbTv } from "../../media/tmdb";
  import { ingestionRegistry } from "../../ingestion/registry";
  import { saveMediaTwin } from "../../stores/media.store";
  import { secretsStore } from "../../stores/secrets";
  import Button from "../../ui/Button.svelte";
  import Alert from "../../ui/Alert.svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";

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
        // Re-resolve via registry to get full payload + immutable provenance
        finalPayload = await ingestionRegistry.resolve(item.id);
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

<!-- A sheet on a phone, a centred card above 768px (ADR-0089 §6, #329). It was
     the worst geometry outside the sheets: a 90vh card holding a search field,
     with the result list capped at a further 40vh inside it — three viewport
     units nested, every one of them inert under a raised keyboard.

     `fillHeight`, because it holds a field: on a phone the sheet takes the
     whole band and gives up the peek (§5). The field stays at the top of the
     body rather than moving into the dock. The dock is for a sheet's primary
     action and for a field the body scrolls under — this list has neither, and
     a search box above its own results is where the eye starts. -->
<BottomSheet isOpen title="Ingest Digital Twins" {onClose} fillHeight>
  <div class="ingest">
    {#if initialType !== "book" && !$secretsStore.tmdb_api_key}
      <Alert variant="warning">
        TMDB API key is not configured. Set your key with the gear on the Media
        screen to search and ingest Movie/TV twins.
      </Alert>
    {/if}

    <form
      class="search-form"
      onsubmit={(e) => {
        e.preventDefault();
        if (initialType === "book" || $secretsStore.tmdb_api_key) {
          handleSearch();
        }
      }}
    >
      <input
        id="media-search-input"
        type="text"
        placeholder="Search title, author or keywords..."
        bind:value={searchQuery}
        class="retro-input"
        disabled={initialType !== "book" && !$secretsStore.tmdb_api_key}
      />
      <Button
        type="submit"
        loading={isSearching}
        disabled={initialType !== "book" && !$secretsStore.tmdb_api_key}
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
      <Alert variant="error">{searchError}</Alert>
    {/if}

    <div class="search-results">
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
</BottomSheet>

<style>
  /* One column with one gap between its parts. The card this replaced padded
     each section itself and spaced them with a utility class, which is what a
     shell with no padding of its own forces; the sheet's body pads, so the
     stack only has to say how far apart its own rows sit. */
  .ingest {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  /* The results simply stack: the sheet's body is the scroll region, and the
     `max-height: 40vh` this list used to carry was a second viewport cap nested
     inside the card's own (ADR-0089 §5). Its padding goes for the same reason —
     the body pads itself, and the card's zero-padding shell is gone. */
  .search-results {
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  .search-form {
    display: flex;
    gap: var(--space-s);
  }

  .v2-actions {
    display: flex;
    justify-content: flex-end;
  }

  .retro-input {
    flex: 1;
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: var(--font-mono);
    font-weight: 700;
    border-radius: var(--radius);
    background: var(--paper);
    box-shadow: inset 2px 2px 0 var(--border);
    transition: all 0.1s step-end;
  }

  .retro-input:focus {
    outline: none;
    background: var(--ink);
    color: var(--paper);
    box-shadow: none;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    gap: var(--space-s);
    padding: 0;
    border: var(--edge);
    background: var(--paper);
    box-shadow: var(--shadow-2);
  }

  .search-result-item :global(button) {
    margin: var(--space-s);
  }

  .result-thumbnail {
    width: 60px;
    height: 90px;
    object-fit: cover;
    border-right: var(--edge);
  }

  .result-thumbnail-placeholder {
    width: 60px;
    height: 90px;
    background: var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    border-right: var(--edge);
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
    font-family: var(--font-mono);
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }

  .no-results {
    text-align: center;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-style: italic;
    padding: var(--space-s);
  }

  .searching-spinner {
    text-align: center;
    font-family: var(--font-mono);
    padding: var(--space-m);
    font-style: italic;
  }
</style>
