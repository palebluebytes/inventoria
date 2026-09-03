<script lang="ts">
  import { updateAcquisitionStatus } from "../../stores/acquisition.store";
  import { getProxyImageUrl } from "../../ingestion/fetcher";
  import Badge from "../../ui/Badge.svelte";
  import Button from "../../ui/Button.svelte";

  let {
    selectedItem,
    onClose,
    onEdit,
  }: {
    selectedItem: any;
    onClose: () => void;
    onEdit: (item: any) => void;
  } = $props();

  async function handleToggleStatus() {
    if (!selectedItem) return;
    const nextStatus = selectedItem.status === "wanted" ? "owned" : "wanted";
    await updateAcquisitionStatus(selectedItem.id, nextStatus);
    onClose();
  }
</script>

<aside class="inspector-panel {selectedItem ? 'active' : ''}">
  {#if selectedItem}
    <div class="inspector-header">
      <button class="close-inspector-btn" onclick={onClose}>&times;</button>
      <div class="inspector-image">
        {#if selectedItem.image}
          <img
            src={getProxyImageUrl(selectedItem.image)}
            alt={selectedItem.name}
            crossorigin="anonymous"
          />
        {:else}
          <span class="placeholder-icon large">📦</span>
        {/if}
      </div>
    </div>
    <div class="inspector-content">
      <h3 class="item-name">{selectedItem.name}</h3>
      {#if selectedItem.brand}
        <span class="item-brand">{selectedItem.brand}</span>
      {/if}

      {#if selectedItem.source_url}
        <a
          href={selectedItem.source_url}
          target="_blank"
          rel="noopener noreferrer"
          class="source-link-btn"
        >
          🔗 Source
        </a>
      {/if}

      {#if selectedItem.tags && selectedItem.tags.length > 0}
        <div class="item-tags">
          {#each selectedItem.tags as tag}
            <Badge variant="default">{tag}</Badge>
          {/each}
        </div>
      {/if}

      {#if selectedItem.description}
        <div class="inspector-section">
          <p class="item-desc">{selectedItem.description}</p>
        </div>
      {/if}

      {#if selectedItem.note}
        <div class="inspector-section">
          <div class="item-note-box">
            <span class="note-label">Note:</span>
            <p class="note-text">{selectedItem.note}</p>
          </div>
        </div>
      {/if}

      <div class="item-meta">
        <span class="item-id" title={selectedItem.id}>{selectedItem.id}</span>
      </div>

      <div class="inspector-actions">
        <div class="action-wrap">
          <Button variant="secondary" onclick={() => onEdit(selectedItem)}>
            ✏️ Edit
          </Button>
        </div>
        <div class="action-wrap">
          <Button variant="primary" onclick={handleToggleStatus}>
            {selectedItem.status === "wanted"
              ? "Mark Acquired"
              : "Move to Wanted"}
          </Button>
        </div>
      </div>
    </div>
  {:else}
    <div class="empty-inspector">
      <span class="empty-inspector-icon">🔍</span>
      <p>Select an item to inspect</p>
    </div>
  {/if}
</aside>

<style>
  .inspector-panel {
    width: 100%;
    border: var(--edge);
    background: var(--bg-surface);
    box-shadow: var(--shadow-2);
    display: none;
    flex-direction: column;
    position: sticky;
    top: var(--space-m);
  }
  @media (min-width: 800px) {
    .inspector-panel {
      width: 320px;
      flex-shrink: 0;
      display: flex;
    }
  }
  .inspector-panel.active {
    display: flex;
  }

  .empty-inspector {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--space-2xl) var(--space-m);
    text-align: center;
    color: var(--text-muted);
    height: 100%;
  }
  .empty-inspector-icon {
    font-size: 3rem;
    margin-bottom: var(--space-s);
  }

  .inspector-header {
    position: relative;
    border-bottom: var(--edge);
    background: var(--bg-input);
  }
  .close-inspector-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 24px;
    height: 24px;
    background: var(--paper);
    border: var(--edge);
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 2;
  }
  @media (min-width: 800px) {
    .close-inspector-btn {
      display: none; /* Hide on desktop where it's a fixed sidebar */
    }
  }
  .inspector-image {
    aspect-ratio: 4/3;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(
      --paper
    ); /* Blend with white backgrounds of product images */
  }
  .inspector-image img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .placeholder-icon {
    font-size: 2rem;
    opacity: 0.6;
  }
  .placeholder-icon.large {
    font-size: 4rem;
  }

  .inspector-content {
    padding: var(--space-s);
    display: flex;
    flex-direction: column;
    gap: var(--space-s);
  }
  .item-name {
    font-size: var(--step-1);
    font-weight: 700;
    margin: 0;
    line-height: 1.1;
  }
  .item-brand {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
  }
  .source-link-btn {
    display: inline-block;
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--edge-thin);
    background: var(--bg-input);
    font-size: var(--step-n2);
    text-decoration: none;
    color: var(--ink);
    font-weight: 600;
    text-transform: uppercase;
    width: fit-content;
  }
  .source-link-btn:hover {
    background: var(--ink);
    color: var(--paper);
  }

  .inspector-section {
    padding-top: var(--space-xs);
    border-top: 1px dashed var(--border);
  }
  .item-desc {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    white-space: pre-wrap;
  }

  .item-meta {
    padding-top: var(--space-s);
    border-top: var(--edge-thin);
  }
  .item-id {
    font-family: var(--font-mono);
    font-size: 0.7rem;
    color: var(--text-muted);
    word-break: break-all;
  }

  .inspector-actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
    margin-top: var(--space-s);
  }
  .action-wrap {
    display: flex;
    flex-direction: column;
  }
  .action-wrap :global(button) {
    width: 100%;
    justify-content: center;
  }

  /* Tags rendering on card/inspector */
  .item-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
    margin-top: var(--space-xs);
  }

  /* Note box rendering on card/inspector */
  .item-note-box {
    margin-top: var(--space-s);
    background: var(--highlight-bg); /* Soft retro yellow post-it */
    border: var(--edge);
    padding: var(--space-2xs) var(--space-xs);
    box-shadow: var(--shadow-1);
    color: var(--ink);
  }
  .note-label {
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    display: block;
    margin-bottom: var(--space-3xs);
  }
  .note-text {
    font-size: var(--step-n1);
    margin: 0;
    line-height: 1.4;
    white-space: pre-wrap;
  }
</style>
