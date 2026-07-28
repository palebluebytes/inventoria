<script lang="ts">
  import Badge from "../ui/Badge.svelte";

  let {
    activeTab = $bindable(),
    dbReady,
    dbError,
  }: {
    activeTab: "food" | "agenda" | "media" | "items" | "notes" | "settings";
    dbReady: boolean;
    dbError: string;
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

<aside class="sidebar">
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
        <span class="icon">{icon}</span>
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
    border-top: 2px solid #000;
    display: flex;
    flex-direction: column;
    padding: 0;
    position: sticky;
    bottom: 0;
    z-index: 100;
  }
  .logo {
    display: none;
  }
  .logo-icon {
    font-size: var(--step-1);
    color: #000;
  }
  .logo-text {
    font-weight: 700;
    font-size: var(--step-0);
    color: #000;
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: var(--space-xs) 0;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 0.65rem;
    font-weight: 600;
    text-align: center;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    flex: 1;
    text-transform: uppercase;
  }
  .nav-item .icon {
    font-size: 1.4em;
    filter: grayscale(100%);
    opacity: 0.7;
    transition: transform 0.2s;
  }
  .nav-item:hover {
    background: #f4f4f5;
    color: #000;
  }
  .nav-item:hover .icon {
    transform: scale(1.1) rotate(-5deg);
    opacity: 1;
  }
  .nav-item.active {
    background: #000;
    color: #fff;
  }
  .nav-item.active .icon {
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
      border-right: 2px solid #000;
      position: static;
      padding: var(--space-m) 0;
    }
    .logo {
      display: flex;
      align-items: center;
      gap: var(--space-xs);
      padding: 0 var(--space-s) var(--space-m);
      border-bottom: 2px solid #000;
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
      border-bottom: 1px solid #000;
      font-size: var(--step-n1);
      font-weight: 500;
      text-transform: none;
    }
    .nav-item:first-child {
      border-top: 1px solid #000;
    }
    .nav-item .icon {
      font-size: 1.1em;
    }
    .sidebar-footer {
      display: block;
      padding: var(--space-s) var(--space-s) 0;
      border-top: 2px solid #000;
    }
  }
</style>
