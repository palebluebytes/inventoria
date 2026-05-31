<script lang="ts">
  import Badge from "../ui/Badge.svelte";

  let {
    activeTab = $bindable(),
    dbReady,
    dbError,
  }: {
    activeTab: "food" | "habits" | "ledger" | "dev";
    dbReady: boolean;
    dbError: string;
  } = $props();

  const tabs = [
    { id: "food", icon: "🥦", label: "Food Twins" },
    { id: "habits", icon: "🔥", label: "Habits" },
    { id: "ledger", icon: "📒", label: "Ledger" },
    { id: "dev", icon: "🧪", label: "Dev" },
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
    width: clamp(12rem, 10rem + 5vw, 15rem);
    flex-shrink: 0;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-accent);
    display: flex;
    flex-direction: column;
    padding: var(--space-m) 0;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-s) var(--space-m);
    border-bottom: 1px solid var(--border);
    margin-bottom: var(--space-s);
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
    flex-direction: column;
    gap: 0;
    padding: 0;
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-s) var(--space-s);
    border: none;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-size: var(--step-n1);
    font-weight: 500;
    text-align: left;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }
  .nav-item .icon {
    font-size: 1.1em;
    filter: grayscale(100%);
    opacity: 0.7;
    transition: transform 0.2s;
  }
  .nav-item:first-child {
    border-top: 1px solid var(--border);
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
    font-weight: 600;
  }
  .nav-item.active .icon {
    opacity: 1;
  }
  .sidebar-footer {
    padding: var(--space-s) var(--space-s) 0;
    border-top: 1px solid var(--border);
  }
  :global(.w-full) {
    width: 100%;
  }
  :global(.justify-center) {
    justify-content: center;
  }
</style>
