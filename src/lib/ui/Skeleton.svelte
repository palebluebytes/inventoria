<script lang="ts">
  // A placeholder block standing in for content that has not loaded yet.
  //
  // It is deliberately not a spinner. The dashboard's shape is known before its
  // data is — four meal sections, a row of bars — so a skeleton can hold the
  // exact space the real thing will take and nothing moves when it arrives. A
  // spinner would hold no space and hand back a layout jump.
  //
  // Always decorative: `aria-hidden`, because a screen reader is told the region
  // is busy by the `aria-busy` on the container, and a pile of empty boxes is not
  // something to announce.
  let {
    height = "1rem",
    width = "100%",
    radius = true,
  }: {
    /** Any CSS length; match what the real content will occupy. */
    height?: string;
    width?: string;
    /** House radius, or a square block for a full-bleed panel. */
    radius?: boolean;
  } = $props();
</script>

<div
  class="skeleton"
  class:square={!radius}
  style="height: {height}; width: {width};"
  aria-hidden="true"
></div>

<style>
  /* The frame's own ink at low strength, so a placeholder reads as part of the
     brutalist palette rather than as a grey borrowed from somewhere else. */
  .skeleton {
    background: var(--border);
    border-radius: var(--radius);
    animation: skeleton-pulse 1.4s ease-in-out infinite;
  }
  .skeleton.square {
    border-radius: 0;
  }
  @keyframes skeleton-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.45;
    }
  }
  /* A pulse is the only motion here and it carries no information, so it is the
     first thing to drop when motion is unwelcome. */
  @media (prefers-reduced-motion: reduce) {
    .skeleton {
      animation: none;
    }
  }
</style>
