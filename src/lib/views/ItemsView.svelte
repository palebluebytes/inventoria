<script lang="ts">
  import { onMount } from "svelte";
  import {
    acquisitionLibraryStore,
    saveAcquisitionTwin,
    updateAcquisitionStatus,
  } from "../stores/acquisition.store";
  import { fetchHtml } from "../ingestion/fetcher";
  import { extractJsonLd } from "../ingestion/json-ld";
  import Card from "../ui/Card.svelte";
  import Badge from "../ui/Badge.svelte";
  import Button from "../ui/Button.svelte";
  import Input from "../ui/Input.svelte";
  import Alert from "../ui/Alert.svelte";

  let { dbReady }: { dbReady: boolean } = $props();

  // Tab state within the view
  let activeViewTab = $state<"owned" | "wanted">("owned");

  // Ingestion states
  let shareUrl = $state("");
  let isScraping = $state(false);
  let scrapeError = $state("");
  let scrapeSuccess = $state("");

  // Manual entry states
  let showManualForm = $state(false);
  let manualName = $state("");
  let manualBrand = $state("");
  let manualDescription = $state("");
  let manualImage = $state("");
  let manualStatus = $state<"owned" | "wanted">("wanted");

  // Computed lists based on derived store
  let items = $derived($acquisitionLibraryStore || []);
  let ownedItems = $derived(items.filter((i) => i.status === "owned"));
  let wantedItems = $derived(items.filter((i) => i.status === "wanted"));
  let activeList = $derived(
    activeViewTab === "owned" ? ownedItems : wantedItems
  );

  // Check URL query parameters for Web Share target on mount
  onMount(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get("url") || params.get("text") || "";

    // Extract a valid URL if mixed in text
    const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/);
    if (urlMatch) {
      shareUrl = urlMatch[0];
      handleScrape();
      // Clean up URL parameters
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  });

  async function handleScrape() {
    if (!shareUrl) return;
    isScraping = true;
    scrapeError = "";
    scrapeSuccess = "";

    try {
      const html = await fetchHtml(shareUrl);
      const scraped = extractJsonLd(html, shareUrl);

      if (!scraped) {
        throw new Error(
          "No product details (Schema.org JSON-LD) found on this page."
        );
      }

      // Add to database
      const entityId = scraped.entityId;
      await saveAcquisitionTwin(
        {
          entity: entityId,
          attributes: {
            "twin/name": scraped.name,
            "twin/image": scraped.image,
            "twin/description": scraped.description,
            "twin/brand": scraped.brand,
            "twin/source_url": shareUrl,
          },
        },
        "wanted"
      ); // Defaults to wanted for shared/scraped items

      scrapeSuccess = `Successfully imported "${scraped.name}"!`;
      shareUrl = "";
    } catch (err: any) {
      scrapeError = err.message || "Failed to scrape product.";
    } finally {
      isScraping = false;
    }
  }

  async function handleManualSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!manualName.trim()) return;

    try {
      const entityId = `twin:manual_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      await saveAcquisitionTwin(
        {
          entity: entityId,
          attributes: {
            "twin/name": manualName.trim(),
            "twin/image": manualImage.trim(),
            "twin/description": manualDescription.trim(),
            "twin/brand": manualBrand.trim(),
          },
        },
        manualStatus
      );

      // Reset form
      manualName = "";
      manualBrand = "";
      manualDescription = "";
      manualImage = "";
      showManualForm = false;
      scrapeSuccess = "Physical Digital Twin saved successfully!";
      scrapeError = "";
    } catch (err: any) {
      scrapeError = err.message || "Failed to save manually.";
    }
  }

  async function toggleStatus(
    itemId: string,
    currentStatus: "wanted" | "owned"
  ) {
    const nextStatus = currentStatus === "wanted" ? "owned" : "wanted";
    await updateAcquisitionStatus(itemId, nextStatus);
  }
</script>

<header class="page-header">
  <h1>Physical Digital Twins</h1>
  <p>
    Track your physical belongings and wanted list offline via append-only
    ledger.
  </p>
</header>

<!-- Share Target / Scraper Panel -->
<Card class="control-panel">
  <h2>Import via E-commerce URL</h2>
  <div class="input-row">
    <Input
      id="scrape-url-input"
      type="text"
      placeholder="Paste Shopify or product URL..."
      bind:value={shareUrl}
      disabled={isScraping}
    />
    <Button
      id="scrape-submit-btn"
      variant="primary"
      onclick={handleScrape}
      disabled={isScraping || !shareUrl}
    >
      {isScraping ? "Scraping..." : "Scrape & Track"}
    </Button>
  </div>

  {#if scrapeError}
    <Alert variant="error" class="mt-4">
      {scrapeError}
      <button class="text-btn ml-2" onclick={() => (showManualForm = true)}>
        Create manually instead
      </button>
    </Alert>
  {/if}

  {#if scrapeSuccess}
    <Alert variant="success" class="mt-4">{scrapeSuccess}</Alert>
  {/if}

  <div class="manual-trigger-wrapper mt-4">
    <Button
      variant="secondary"
      onclick={() => (showManualForm = !showManualForm)}
    >
      {showManualForm ? "Hide Manual Form" : "Create Manual Entry"}
    </Button>
  </div>
</Card>

<!-- Manual Creation Form -->
{#if showManualForm}
  <Card class="manual-form mt-4">
    <h2>Add Digital Twin Manually</h2>
    <form onsubmit={handleManualSubmit} class="form-grid">
      <div class="form-group">
        <label for="manual-name">Item Name *</label>
        <Input
          id="manual-name"
          bind:value={manualName}
          placeholder="e.g. Mechanical Keyboard"
        />
      </div>

      <div class="form-group">
        <label for="manual-brand">Brand</label>
        <Input
          id="manual-brand"
          bind:value={manualBrand}
          placeholder="e.g. Keychron"
        />
      </div>

      <div class="form-group">
        <label for="manual-image">Image URL</label>
        <Input
          id="manual-image"
          type="text"
          bind:value={manualImage}
          placeholder="https://..."
        />
      </div>

      <div class="form-group">
        <label for="manual-status">Initial Status</label>
        <select
          id="manual-status"
          bind:value={manualStatus}
          class="custom-select"
        >
          <option value="wanted">Wanted</option>
          <option value="owned">Owned</option>
        </select>
      </div>

      <div class="form-group full-width">
        <label for="manual-desc">Description</label>
        <textarea
          id="manual-desc"
          bind:value={manualDescription}
          placeholder="Details about this twin..."
        ></textarea>
      </div>

      <div class="form-actions full-width">
        <Button variant="primary" type="submit">Save Digital Twin</Button>
        <Button
          variant="secondary"
          type="button"
          onclick={() => (showManualForm = false)}>Cancel</Button
        >
      </div>
    </form>
  </Card>
{/if}

<!-- View Tabs (Owned vs Wanted) -->
<div class="view-tabs mt-6">
  <button
    id="tab-owned-btn"
    class="view-tab-btn {activeViewTab === 'owned' ? 'active' : ''}"
    onclick={() => (activeViewTab = "owned")}
  >
    Owned
    <Badge variant="default" class="ml-2">{ownedItems.length}</Badge>
  </button>
  <button
    id="tab-wanted-btn"
    class="view-tab-btn {activeViewTab === 'wanted' ? 'active' : ''}"
    onclick={() => (activeViewTab = "wanted")}
  >
    Wanted
    <Badge variant="default" class="ml-2">{wantedItems.length}</Badge>
  </button>
</div>

<!-- Twins Library List -->
<div id="twins-library" class="twins-grid mt-4">
  {#if activeList.length === 0}
    <p class="empty-message">
      No items tracked in this tab yet. Scrape or add one above!
    </p>
  {:else}
    {#each activeList as item}
      <Card class="item-card">
        <div class="item-image-wrapper">
          {#if item.image}
            <img src={item.image} alt={item.name} crossorigin="anonymous" />
          {:else}
            <div class="image-placeholder">📦</div>
          {/if}
        </div>
        <div class="item-details">
          <div class="item-header">
            <h3>{item.name}</h3>
            {#if item.source_url}
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                class="source-link"
                title="View Source Product"
              >
                🔗
              </a>
            {/if}
          </div>
          {#if item.brand}
            <span class="item-brand">{item.brand}</span>
          {/if}
          {#if item.description}
            <p class="item-desc">{item.description}</p>
          {/if}
          <div class="item-meta">
            <span class="item-id" title={item.id}>{item.id}</span>
            <Button
              variant="secondary"
              onclick={() => toggleStatus(item.id, item.status)}
            >
              {item.status === "wanted" ? "Acquired" : "Move to Wanted"}
            </Button>
          </div>
        </div>
      </Card>
    {/each}
  {/if}
</div>

<style>
  .page-header {
    margin-bottom: var(--space-m);
    border-bottom: 2px solid #000;
    padding-bottom: var(--space-s);
  }
  h1 {
    font-size: var(--step-2);
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: var(--space-3xs);
    letter-spacing: -0.05em;
    text-transform: uppercase;
  }
  h2 {
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    margin-bottom: var(--space-s);
  }
  p {
    color: var(--text-secondary);
    font-size: var(--step-n1);
  }

  .control-panel {
    background: var(--bg-surface);
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
  }

  .input-row {
    display: flex;
    gap: var(--space-s);
  }

  .text-btn {
    background: none;
    border: none;
    text-decoration: underline;
    font-weight: 600;
    cursor: pointer;
    color: var(--text-primary);
    padding: 0;
  }

  /* Manual Form */
  .manual-form {
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-s);
  }
  .form-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .form-group label {
    font-size: var(--step-n2);
    font-weight: 600;
    text-transform: uppercase;
  }
  .full-width {
    grid-column: span 2;
  }
  .custom-select {
    width: 100%;
    padding: 10px;
    border: 2px solid #000;
    border-radius: 0;
    font-size: var(--step-n1);
    background: #fff;
    font-family: inherit;
    font-weight: 500;
  }
  .custom-select:focus {
    outline: none;
    border-color: var(--primary);
  }
  textarea {
    width: 100%;
    min-height: 80px;
    padding: 10px;
    border: 2px solid #000;
    border-radius: 0;
    font-size: var(--step-n1);
    font-family: inherit;
    resize: vertical;
  }
  textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  .form-actions {
    display: flex;
    gap: var(--space-s);
    margin-top: var(--space-s);
  }

  /* Tabs */
  .view-tabs {
    display: flex;
    border-bottom: 2px solid #000;
    gap: 2px;
  }
  .view-tab-btn {
    padding: var(--space-s) var(--space-m);
    border: 2px solid #000;
    border-bottom: none;
    background: #f4f4f5;
    font-weight: 700;
    text-transform: uppercase;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    transition: all 0.2s ease;
  }
  .view-tab-btn:hover {
    background: #e4e4e7;
  }
  .view-tab-btn.active {
    background: #000;
    color: #fff;
  }

  /* Twins Grid */
  .twins-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: var(--space-m);
  }
  @media (min-width: 600px) {
    .twins-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .item-card {
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #000;
    padding: 0 !important;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
  }

  .item-image-wrapper {
    height: 180px;
    border-bottom: 2px solid #000;
    background: #f4f4f5;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .item-image-wrapper img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .image-placeholder {
    font-size: 3rem;
  }

  .item-details {
    padding: var(--space-s);
    display: flex;
    flex-direction: column;
    flex: 1;
  }
  .item-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-xs);
  }
  .item-header h3 {
    font-size: var(--step-0);
    font-weight: 700;
    margin: 0;
  }
  .source-link {
    font-size: 1.1rem;
    text-decoration: none;
    transition: transform 0.2s;
  }
  .source-link:hover {
    transform: scale(1.1);
  }
  .item-brand {
    font-size: var(--step-n2);
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    margin-top: 2px;
  }
  .item-desc {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin-top: var(--space-xs);
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .item-meta {
    margin-top: var(--space-m);
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #000;
    padding-top: var(--space-s);
  }
  .item-id {
    font-family: monospace;
    font-size: 0.7rem;
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 120px;
  }

  .empty-message {
    text-align: center;
    color: var(--text-muted);
    padding: var(--space-xl) 0;
    grid-column: 1 / -1;
  }

  :global(.mt-4) {
    margin-top: var(--space-s);
  }
  :global(.mt-6) {
    margin-top: var(--space-m);
  }
  :global(.ml-2) {
    margin-left: var(--space-xs);
  }
</style>
