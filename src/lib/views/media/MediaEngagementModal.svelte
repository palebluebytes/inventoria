<script lang="ts">
  import { untrack } from "svelte";
  import type { EnrichedMedia } from "../../media/state";
  import { updateMediaStatus, enrichMediaTwin } from "../../stores/media.store";
  import Badge from "../../ui/Badge.svelte";
  import Button from "../../ui/Button.svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";

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

  // The dock's Log Event is outside the <form> — it is the sheet's, not the
  // body's — so it reaches the form by name rather than by containment.
  const FORM_ID = "engagement-form";

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
      enrichMediaTwin(media.id)
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

<!-- A sheet on a phone, a centred card above 768px (ADR-0089 §6, #329). It was
     a centred 90vh card around four fields, with a second scroll region capped
     at 200px inside it. `fillHeight`, because it holds those fields: on a phone
     the sheet takes the whole band and gives up the peek (§5), so a keyboard
     cannot push the header off the top. -->
<BottomSheet isOpen title="Log Engagement Event" {onClose} fillHeight centred>
  <div class="engagement">
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
      id={FORM_ID}
      onsubmit={(e) => {
        e.preventDefault();
        submitEngagement();
      }}
      class="engagement-form"
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
        <select id="event-rating" bind:value={formRating} class="retro-select">
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
    </form>
  </div>

  {#snippet footer({ close }: { close: () => void })}
    <div class="dock">
      <Button variant="secondary" onclick={close}>Cancel</Button>
      <Button type="submit" form={FORM_ID}>Log Event</Button>
    </div>
  {/snippet}
</BottomSheet>

<style>
  /* One column with one gap between its parts: the banner, the book's extra
     detail, and the form. The card this replaced had each of those pad itself
     and divide itself off with a thick rule, which is what a shell with no
     padding of its own forces; the sheet's body pads, so a section only has to
     say it is a framed block. */
  .engagement {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  .publish-year {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--text-secondary);
    margin: 0;
  }

  /* No `max-height` and no scroll of its own. It used to cap itself at 200px
     inside a card capped at 90vh — a second scroll region nested in the first,
     and the sheet's body is the one that scrolls (ADR-0089 §5). */
  .media-extra-details {
    padding: var(--space-s);
    border: var(--edge);
    background: var(--bg-base);
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }

  .blurb-section h4,
  .subjects-section h4 {
    margin: 0 0 var(--space-3xs) 0;
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    color: var(--ink);
  }

  .blurb-section p {
    margin: 0;
    font-size: var(--step-n1);
    line-height: 1.4;
    color: var(--text-primary);
  }

  .subjects-list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
  }

  .media-details-banner {
    display: flex;
    gap: var(--space-s);
    background: var(--paper);
    border: var(--edge);
    padding: var(--space-s);
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
    gap: var(--space-3xs);
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
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    color: var(--ink);
  }

  .banner-info :global(.badge) {
    align-self: flex-start;
  }

  .engagement-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-m);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
  }

  .form-group label {
    font-family: var(--font-mono);
    font-size: var(--step-n1);
    font-weight: 700;
    text-transform: uppercase;
    background: var(--ink);
    color: var(--paper);
    padding: var(--space-3xs) var(--space-2xs);
    align-self: flex-start;
  }

  .retro-input {
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

  .retro-select {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: var(--font-mono);
    font-weight: 700;
    border-radius: var(--radius);
    background: var(--paper);
    cursor: pointer;
    box-shadow: 4px 4px 0 var(--border);
    transition: all 0.1s step-end;
  }

  .retro-select:focus {
    outline: none;
    border-color: var(--ink);
    box-shadow: var(--shadow-2);
  }

  .retro-textarea {
    border: var(--edge);
    padding: var(--space-s);
    font-size: var(--step-0);
    font-family: var(--font-mono);
    font-weight: 700;
    border-radius: var(--radius);
    resize: vertical;
    box-shadow: inset 2px 2px 0 var(--border);
  }

  .retro-textarea:focus {
    outline: none;
    background: var(--ink);
    color: var(--paper);
    box-shadow: none;
  }

  .dock {
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
</style>
