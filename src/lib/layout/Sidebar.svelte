<script lang="ts">
  import Badge from "../ui/Badge.svelte";

  let {
    activeTab = $bindable(),
    dbReady,
    dbError,
    height = $bindable(0),
  }: {
    activeTab: "food" | "agenda" | "media" | "items" | "notes" | "settings";
    dbReady: boolean;
    dbError: string;
    /**
     * This box's own border-box height, reported out so the shell can publish
     * it as `--shell-floor` (`src/app.css`).
     *
     * Below 768 this is the app's floor: anything pinned to the band's bottom
     * edge lands behind it. Measured rather than restated, because the height is
     * `--tap-min` plus two paddings plus a safe-area inset the device picks, and
     * a sum of those written somewhere else is a copy that goes stale.
     *
     * Above 768 the aside is a left rail rather than a floor, and the shell
     * zeroes `--shell-floor` there — so what this reports up here (a full column
     * height) is never read.
     */
    height?: number;
  } = $props();

  const tabs = [
    { id: "food", icon: "🥦", label: "Food" },
    { id: "media", icon: "🎬", label: "Media" },
    { id: "items", icon: "📦", label: "Items" },
    { id: "agenda", icon: "🗓️", label: "Agenda" },
    { id: "notes", icon: "✅", label: "Notes" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ] as const;
</script>

<aside class="sidebar" bind:offsetHeight={height}>
  <div class="logo">
    <span class="logo-icon">⬡</span>
    <span class="logo-text">Inventoria</span>
  </div>
  <nav>
    {#each tabs as { id, icon, label }}
      <button
        class="nav-item {activeTab === id ? 'active' : ''}"
        onclick={() => (activeTab = id)}
      >
        <span class="nav-icon">{icon}</span>
        {label}
      </button>
    {/each}
  </nav>
  <div class="sidebar-footer">
    <Badge
      class="db-badge w-full justify-center"
      variant={dbReady ? "success" : dbError ? "error" : "warning"}
    >
      {dbReady ? "● DB Ready" : dbError ? "✕ DB Error" : "○ Connecting…"}
    </Badge>
  </div>
</aside>

<style>
  .sidebar {
    width: 100%;
    flex-shrink: 0;
    background: var(--bg-surface);
    border-top: var(--edge);
    display: flex;
    flex-direction: column;
    padding: 0;
    /* The nav is the sixth full-bleed surface and the only one that never asked
       for its inset (ADR-0089 §2); `viewport-fit=cover` is what makes the value
       non-zero at all. Below 768px only: above it the sidebar is a static left
       rail rather than the app's floor, and #325 rules a bottom inset there
       meaningless. A longhand rather than a fourth value in the shorthand
       above, because the shorthand is what the wide rule replaces.

       **Or a floor, whichever is larger**, for the reason the Way-in bar takes
       one: on Android with three-button navigation the inset is 0 and correctly
       so — the viewport ends above the nav bar and nothing is hidden — but this
       nav's own items then sit directly against the system's back, home and
       recents buttons, and a thumb that overshoots leaves the app rather than
       changing tab. Material's rule is the size: 48dp targets "separated by 8dp
       of space or more", and the system's buttons are touch targets. The
       argument in full is in `views/food/WayInBar.svelte`. */
    padding-bottom: max(env(safe-area-inset-bottom, 0px), var(--space-xs));
    position: sticky;
    bottom: 0;
    z-index: 100;
  }
  .logo {
    display: none;
  }
  .logo-icon {
    font-size: var(--step-1);
    color: var(--ink);
  }
  .logo-text {
    font-weight: 700;
    font-size: var(--step-0);
    color: var(--ink);
    letter-spacing: -0.05em;
    text-transform: uppercase;
  }
  nav {
    display: flex;
    flex-direction: row;
    justify-content: space-around;
    gap: 0;
    padding: 0;
    flex: none;
  }
  .nav-item {
    min-height: var(--tap-min);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-3xs);
    padding: var(--space-xs) 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    /* The literal here was a hand-copy of this token's own value. */
    font-size: var(--step-n3);
    font-weight: 600;
    text-align: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    flex: 1;
    text-transform: uppercase;
  }
  .nav-item .nav-icon {
    font-size: 1.4em;
    filter: grayscale(100%);
    opacity: 0.7;
    transition: transform 0.2s;
  }
  .nav-item:hover {
    background: var(--bg-input);
    color: var(--ink);
  }
  .nav-item:hover .nav-icon {
    transform: scale(1.1) rotate(-5deg);
    opacity: 1;
  }
  .nav-item.active {
    background: var(--ink);
    color: var(--paper);
  }
  .nav-item.active .nav-icon {
    opacity: 1;
  }
  .sidebar-footer {
    display: none;
  }
  :global(.w-full) {
    width: 100%;
  }
  :global(.justify-center) {
    justify-content: center;
  }

  @media (min-width: 768px) {
    .sidebar {
      width: clamp(12rem, 10rem + 5vw, 15rem);
      border-top: none;
      border-right: var(--edge);
      position: static;
      padding: var(--space-m) 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-s) var(--space-m);
      border-bottom: var(--edge);
      margin-bottom: var(--space-s);
    }
    nav {
      flex-direction: column;
      justify-content: flex-start;
      flex: 1;
    }
    .nav-item {
      flex-direction: row;
      justify-content: flex-start;
      padding: var(--space-s) var(--space-s);
      border-bottom: var(--edge-thin);
      font-size: var(--step-n1);
      font-weight: 500;
      text-transform: none;
    }
    .nav-item:first-child {
      border-top: var(--edge-thin);
    }
    .nav-item .nav-icon {
      font-size: 1.1em;
    }
    .sidebar-footer {
      display: block;
      padding: var(--space-s) var(--space-s) 0;
      border-top: var(--edge);
    }
  }
</style>
