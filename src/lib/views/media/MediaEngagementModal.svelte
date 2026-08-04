<script lang="ts">
  import { untrack } from "svelte";
  import type { EnrichedMedia } from "../../media/state";
  import { updateMediaStatus, enrichMediaTwin } from "../../stores/media.store";
  import Badge from "../../ui/Badge.svelte";
  import Button from "../../ui/Button.svelte";
  import Modal from "../../ui/Modal.svelte";

  let {
    media,
    onClose,
  }: {
    media: EnrichedMedia;
    onClose: () => void;
  } = $props();

  const init = untrack(() => media);
  let formStatus = $state<"saved" | "started" | "progress" | "completed">(
    init.status
  );
  let formRating = $state<number | undefined>(init.rating);
  let formReview = $state(init.review || "");
  let formSeason = $state<number | undefined>(init.season);
  let formEpisode = $state<number | undefined>(init.episode);
  let formPagesRead = $state<number | undefined>(init.pages_read);
  let imageError = $state(false);
  let isEnriching = $state(false);

  let subjects = $derived.by(() => {
    if (!media.subject) return [];
    if (Array.isArray(media.subject)) return media.subject;
    try {
      return JSON.parse(media.subject as any);
    } catch {
      return [];
    }
  });

  $effect(() => {
    if (
      media.type === "book" &&
      (!media.blurb || !subjects || subjects.length === 0) &&
      !isEnriching
    ) {
      isEnriching = true;
      enrichMediaTwin(media.id, "book")
        .catch((err) => {
          console.error("Failed to enrich book details:", err);
        })
        .finally(() => {
          isEnriching = false;
        });
    }
  });

  async function submitEngagement() {
    try {
      await updateMediaStatus(media.id, media.type, formStatus, {
        rating: formRating,
        review: formReview,
        season: formSeason,
        episode: formEpisode,
        pages_read: formPagesRead,
      });
      onClose();
    } catch (err: any) {
      alert(`Failed to log engagement: ${err.message ?? err}`);
    }
  }
</script>

<Modal
  {onClose}
  title="Log Engagement Event"
  overlayBg="rgba(255, 255, 255, 0.95)"
  overlayBlur="none"
>
  {#snippet children({ props, close })}
    <div {...props} class="modal-card">
      <div class="modal-header">
        <h2>Log Engagement Event</h2>
        <button class="close-btn" onclick={close}>&times;</button>
      </div>

      <div class="media-details-banner">
        {#if media.poster_url && !imageError}
          <img
            src={media.poster_url}
            alt={media.title}
            class="banner-poster"
            onerror={() => (imageError = true)}
            referrerpolicy="no-referrer"
            crossorigin="anonymous"
          />
        {/if}
        <div class="banner-info">
          <h3>{media.title}</h3>
          <p>
            {#if media.type === "book"}
              Author: {media.author || "Unknown"}
            {:else}
              Director: {media.director || "Unknown"}
            {/if}
          </p>
          {#if media.type === "book" && media.first_publish_year}
            <p class="publish-year">
              First Published: {media.first_publish_year}
            </p>
          {/if}
          <Badge variant="default">{media.type.toUpperCase()}</Badge>
        </div>
      </div>

      {#if media.blurb || subjects.length > 0}
        <div class="media-extra-details">
          {#if media.blurb}
            <div class="blurb-section">
              <h4>Synopsis</h4>
              <p>{media.blurb}</p>
            </div>
          {/if}
          {#if subjects.length > 0}
            <div class="subjects-section">
              <h4>Subjects</h4>
              <div class="subjects-list">
                {#each subjects.slice(0, 8) as subj}
                  <Badge variant="default">{subj}</Badge>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/if}

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
        {#if media.type === "book" && (formStatus === "started" || formStatus === "progress")}
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
        {#if media.type === "tv" && (formStatus === "started" || formStatus === "progress")}
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
          <Button variant="secondary" onclick={close}>Cancel</Button>
          <Button type="submit">Log Event</Button>
        </div>
      </form>
    </div>
  {/snippet}
</Modal>

<style>
  .modal-card {
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    z-index: 1001;
    background: #fff;
    border: var(--edge-thick);
    width: calc(100% - 2 * var(--space-s));
    max-width: 600px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    padding: 0;
    box-shadow: 12px 12px 0 #000;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: var(--edge-thick);
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
    border: var(--edge);
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
    box-shadow: var(--shadow-2);
  }

  .publish-year {
    font-family: monospace;
    font-size: var(--step-n1);
    font-weight: 700;
    color: #64748b;
    margin: 0;
  }

  .media-extra-details {
    padding: var(--space-s) var(--space-m);
    border-bottom: var(--edge-thick);
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
    max-height: 200px;
    overflow-y: auto;
  }

  .blurb-section h4,
  .subjects-section h4 {
    margin: 0 0 var(--space-3xs) 0;
    font-family: monospace;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    color: #000;
  }

  .blurb-section p {
    margin: 0;
    font-size: var(--step-n1);
    line-height: 1.4;
    color: #3f3f46;
  }

  .subjects-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
  }

  .media-details-banner {
    display: flex;
    gap: var(--space-s);
    background: #fff;
    border-bottom: var(--edge-thick);
    padding: var(--space-m);
  }

  .banner-poster {
    width: 80px;
    height: 120px;
    object-fit: cover;
    border: var(--edge);
    box-shadow: var(--shadow-2);
  }

  .banner-info {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
  }

  .banner-info h3 {
    margin: 0;
    font-size: var(--step-1);
    font-weight: 900;
    line-height: 1.1;
    text-transform: uppercase;
  }

  .banner-info p {
    margin: 0;
    font-family: monospace;
    font-size: var(--step-n1);
    font-weight: 700;
    color: #000;
  }

  .banner-info :global(.badge) {
    align-self: flex-start;
  }

  .engagement-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
    overflow-y: auto;
    padding: var(--space-m);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-group label {
    font-family: monospace;
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    background: #000;
    color: #fff;
    padding: 2px 6px;
    align-self: flex-start;
  }

  .retro-input {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: monospace;
    font-weight: 700;
    border-radius: var(--radius);
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

  .retro-select {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: monospace;
    font-weight: 700;
    border-radius: var(--radius);
    background: #fff;
    cursor: pointer;
    box-shadow: 4px 4px 0 #e4e4e7;
    transition: all 0.1s step-end;
  }

  .retro-select:focus {
    outline: none;
    border-color: #000;
    box-shadow: var(--shadow-2);
  }

  .retro-textarea {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: monospace;
    font-weight: 700;
    border-radius: var(--radius);
    resize: vertical;
    box-shadow: inset 2px 2px 0 #e4e4e7;
  }

  .retro-textarea:focus {
    outline: none;
    background: #000;
    color: #fff;
    box-shadow: none;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-xs);
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
  .mt-4 {
    margin-top: var(--space-s);
  }
  .mt-6 {
    margin-top: var(--space-m);
  }
</style>
