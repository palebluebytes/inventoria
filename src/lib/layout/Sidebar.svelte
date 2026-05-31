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
    background: rgba(14, 16, 24, 0.4);
    backdrop-filter: blur(20px);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: var(--space-m) 0;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: 0 var(--space-s) var(--space-m);
  }
  .logo-icon {
    font-size: var(--step-1);
    background: linear-gradient(135deg, var(--accent-light), var(--accent));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  .logo-text {
    font-weight: 700;
    font-size: var(--step-0);
    color: var(--text-primary);
    letter-spacing: -0.02em;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    padding: 0 var(--space-2xs);
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: var(--space-xs);
    padding: var(--space-2xs) var(--space-xs);
    border-radius: 10px;
    border: none;
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
    transition: transform 0.2s;
  }
  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: var(--text-primary);
  }
  .nav-item:hover .icon {
    transform: scale(1.1) rotate(-5deg);
  }
  .nav-item.active {
    background: linear-gradient(90deg, rgba(139, 92, 246, 0.15), transparent);
    color: var(--text-primary);
    font-weight: 600;
    box-shadow: inset 3px 0 0 var(--accent);
  }
  .sidebar-footer {
    padding: var(--space-s) var(--space-s) 0;
  }
  :global(.w-full) {
    width: 100%;
  }
  :global(.justify-center) {
    justify-content: center;
  }
</style>
