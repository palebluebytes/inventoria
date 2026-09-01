<script lang="ts">
  import { onMount } from "svelte";
  import { saveAcquisitionTwin } from "../../stores/acquisition.store";
  import { fetchHtml } from "../../ingestion/fetcher";
  import { extractJsonLd } from "../../ingestion/json-ld";
  import Card from "../../ui/Card.svelte";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Alert from "../../ui/Alert.svelte";

  let { showManualForm = $bindable() }: { showManualForm: boolean } = $props();

  let shareUrl = $state("");
  let isScraping = $state(false);
  let scrapeError = $state("");
  let scrapeSuccess = $state("");

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

      // Add to database. The entity is always `twin:` (ADR-0086 §3); whatever
      // identifier the page carried is an attribute of the item, because a GTIN
      // is the identity of the packaged food it was printed for and not of the
      // thing you are thinking of buying.
      const entityId = scraped.entityId;
      const attributes: Record<string, unknown> = {
        "item/name": scraped.name,
        "item/image": scraped.image,
        "item/description": scraped.description,
        "item/brand": scraped.brand,
        "item/source_url": shareUrl,
      };
      if (scraped.identifier) {
        attributes[`item/${scraped.identifier.kind}`] =
          scraped.identifier.value;
      }
      await saveAcquisitionTwin({ entity: entityId, attributes }, "wanted"); // Defaults to wanted for shared/scraped items

      scrapeSuccess = `Successfully imported "${scraped.name}"!`;
      shareUrl = "";
    } catch (err: any) {
      scrapeError = err.message || "Failed to scrape product.";
    } finally {
      isScraping = false;
    }
  }
</script>

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

<style>
  h2 {
    font-size: var(--step-0);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    margin-bottom: var(--space-s);
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

  .mt-4 {
    margin-top: var(--space-s);
  }

  .ml-2 {
    margin-left: var(--space-xs);
  }
</style>
