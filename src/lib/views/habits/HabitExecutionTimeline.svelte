<script lang="ts">
  import type { HabitLineage } from "../../stores/habits.store";
  import Card from "../../ui/Card.svelte";

  let { executions }: { executions: HabitLineage["executions"] } = $props();

  function formatTime(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<Card class="mt-4 shadow-brutal">
  <h2>Execution & Quality Logs</h2>
  {#if executions.length === 0}
    <p class="empty">No executions logged yet.</p>
  {:else}
    <ul class="logs-timeline">
      {#each [...executions].reverse() as exec}
        <li class="timeline-item">
          <div class="timeline-marker"></div>
          <div class="timeline-content">
            <div class="timeline-header">
              <span class="timeline-time">{formatTime(exec.time)}</span>
              <span class="badge-status {exec.status || 'completed'}">
                {exec.status || "completed"}
              </span>
              {#if exec.target_id}
                <span class="badge-target">{exec.target_id}</span>
              {/if}
              {#if exec.metadata?.difficulty}
                <span class="badge-difficulty {exec.metadata.difficulty}">
                  {exec.metadata.difficulty}
                </span>
              {/if}
              {#if exec.metadata?.duration}
                <span class="badge-duration">{exec.metadata.duration}m</span>
              {/if}
            </div>
            {#if exec.metadata?.note}
              <blockquote class="timeline-note">
                “{exec.metadata.note}”
              </blockquote>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

<style>
  .logs-timeline {
    list-style: none;
    position: relative;
    padding-left: var(--space-s);
    margin-top: var(--space-s);
  }
  .logs-timeline::before {
    content: "";
    position: absolute;
    top: 8px;
    bottom: 8px;
    left: 4px;
    width: 2px;
    background-color: var(--border-accent);
  }
  .timeline-item {
    position: relative;
    margin-bottom: var(--space-m);
  }
  .timeline-item:last-child {
    margin-bottom: 0;
  }
  .timeline-marker {
    position: absolute;
    left: -20px;
    top: 6px;
    width: 10px;
    height: 10px;
    background-color: var(--bg-base);
    border: 2px solid var(--border-accent);
    border-radius: 50%;
  }
  .timeline-content {
    background: var(--bg-input);
    padding: var(--space-2xs) var(--space-xs);
    border: 1px solid var(--border);
  }
  .timeline-header {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
    flex-wrap: wrap;
  }
  .timeline-time {
    font-size: var(--step-n2);
    color: var(--text-secondary);
    font-weight: 500;
  }
  .badge-difficulty {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 4px;
    border: 1px solid var(--border-accent);
  }
  .badge-difficulty.easy {
    background: var(--green-bg);
    color: var(--green);
  }
  .badge-difficulty.medium {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .badge-difficulty.hard {
    background: var(--red-bg);
    color: var(--red);
  }
  .badge-duration {
    font-size: 10px;
    background: #000;
    color: #fff;
    padding: 1px 4px;
    font-weight: 500;
  }
  .badge-status {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    padding: 1px 4px;
    border: 1px solid var(--border-accent);
  }
  .badge-status.completed {
    background: var(--green-bg);
    color: var(--green);
  }
  .badge-status.exempt {
    background: var(--amber-bg);
    color: var(--amber);
  }
  .badge-target {
    font-size: 10px;
    font-weight: 600;
    background: var(--bg-input);
    border: 1px solid var(--border-accent);
    padding: 1px 4px;
  }
  .timeline-note {
    font-size: var(--step-n1);
    color: var(--text-primary);
    margin-top: var(--space-3xs);
    font-style: italic;
    border-left: 2px solid var(--text-muted);
    padding-left: var(--space-2xs);
  }
  .empty {
    color: var(--text-muted);
    text-align: center;
    padding: var(--space-xl) 0;
  }
  .shadow-brutal {
    border: 2px solid var(--border-accent) !important;
    box-shadow: 4px 4px 0px 0px var(--border-accent);
  }
</style>
