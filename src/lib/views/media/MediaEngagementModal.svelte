<script lang="ts">
  import { untrack } from "svelte";
  import type { EnrichedMedia } from "../../media/state";
  import { updateMediaStatus, enrichMediaTwin } from "../../stores/media.store";
  import Badge from "../../ui/Badge.svelte";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Select from "../../ui/Select.svelte";
  import Textarea from "../../ui/Textarea.svelte";
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import { appError } from "../../logs/app-log";

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
          appError("Failed to enrich book details", err);
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
<BottomSheet isOpen title="Log Engagement Event" {onClose} fillHeight>
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

    <!-- Every field here is a `ui/*` primitive, and #380 is where that became
         true: it took the two `.retro-select`s, the last of the `retro-*`
         family and the last hand-rolled select skin in the app.
         `tests/unit/ui-primitives.test.ts` keeps the family at zero.

         #380 budgeted for a cost that was never paid — a brutalist select
         standing over `.retro-input` and `.retro-textarea` siblings, which it
         argued for shipping rather than deferring #362's census guard. #374
         and #375 landed first and converged those siblings, so the mismatch
         never existed. Said here because a reader arriving from the ticket
         should learn that rather than go looking for it. -->
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
        <Select
          id="event-status-select"
          bind:value={formStatus}
          options={[
            { value: "saved", label: "Saved (To watch/read)" },
            { value: "started", label: "Started" },
            { value: "progress", label: "In Progress" },
            { value: "completed", label: "Completed" },
          ]}
        />
      </div>

      <!-- Book progress fields -->
      {#if media.type === "book" && (formStatus === "started" || formStatus === "progress")}
        <div class="form-group">
          <label for="event-pages-read">Pages Read (Optional)</label>
          <Input
            id="event-pages-read"
            type="number"
            min="0"
            bind:value={formPagesRead}
          />
        </div>
      {/if}

      <!-- TV progress fields -->
      {#if media.type === "tv" && (formStatus === "started" || formStatus === "progress")}
        <div class="flex gap-2">
          <div class="form-group flex-1">
            <label for="event-season">Season</label>
            <Input
              id="event-season"
              type="number"
              min="1"
              bind:value={formSeason}
            />
          </div>
          <div class="form-group flex-1">
            <label for="event-episode">Episode</label>
            <Input
              id="event-episode"
              type="number"
              min="1"
              bind:value={formEpisode}
            />
          </div>
        </div>
      {/if}

      <!-- Rating & Review -->
      <div class="form-group">
        <label for="event-rating">Rating (1-5)</label>
        <!-- The field `ui/Select` was made generic for. `formRating` is
             `number | undefined` and stays that way end to end: `No Rating` is
             an option whose value *is* `undefined`, not a sentinel string that
             a `Number()` at this call site would have to undo. If this field
             ever needs one, the generic has been given up. -->
        <Select
          id="event-rating"
          bind:value={formRating}
          options={[
            { value: undefined, label: "No Rating" },
            { value: 1, label: "1 - Poor" },
            { value: 2, label: "2 - Fair" },
            { value: 3, label: "3 - Good" },
            { value: 4, label: "4 - Very Good" },
            { value: 5, label: "5 - Outstanding" },
          ]}
        />
      </div>

      <div class="form-group">
        <label for="event-review">Review / Comments</label>
        <Textarea
          id="event-review"
          bind:value={formReview}
          placeholder="Add your thoughts..."
        />
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
