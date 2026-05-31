<script lang="ts">
  import { createQueryStore } from "../stores/datoms.store";
  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";

  const ledgerStore = createQueryStore<{
    entity: string;
    attribute: string;
    value: string;
    time: number;
  }>(
    "SELECT entity, attribute, value, time FROM datoms ORDER BY time DESC LIMIT 100"
  );

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleString();
  }
</script>

<header class="page-header">
  <h1>Ledger</h1>
  <p>Complete append-only EAVT log — most recent first. Read-only.</p>
</header>

<Card>
  <h2>
    Datoms <Badge variant="default" class="ml-2">{$ledgerStore.length}</Badge>
  </h2>
  {#if $ledgerStore.length === 0}
    <p class="empty">The ledger is empty.</p>
  {:else}
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Entity</th>
            <th>Attribute</th>
            <th>Value</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {#each $ledgerStore as row}
            <tr>
              <td class="mono small">{row.entity}</td>
              <td class="attr">{row.attribute}</td>
              <td class="small">{row.value}</td>
              <td class="muted small">{formatTime(row.time)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</Card>

<style>
  .page-header {
    margin-bottom: var(--space-m);
    animation: fadeIn 0.4s ease-out;
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.02em;
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: var(--space-xs);
    display: flex;
    align-items: center;
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }
  .table-wrap {
    overflow-x: auto;
    margin-top: var(--space-s);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-n2);
    text-align: left;
  }
  th {
    padding: var(--space-xs);
    border-bottom: 2px solid var(--border);
    color: var(--text-primary);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }
  td {
    padding: var(--space-xs);
    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    color: var(--text-secondary);
  }
  tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }
  .mono {
    font-family: monospace;
    color: var(--text-muted);
  }
  .attr {
    color: var(--accent-light);
    font-weight: 500;
  }
  .small {
    font-size: 0.85em;
  }
  .muted {
    color: var(--text-muted);
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
  }
  :global(.ml-2) {
    margin-left: var(--space-2xs);
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
