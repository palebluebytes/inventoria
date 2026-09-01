<script lang="ts">
  import type { Facet } from "../facets/registry";

  /**
   * The root's link to another Facet: **the single sanctioned exit**
   * (ADR-0078 §4), and the record's own word for it.
   *
   * It is a link and not an install button because `beforeinstallprompt` fires
   * for the *current document's* manifest. There is no API by which a page at
   * `/` offers an install of `/food/` — to install Rations the user has to be
   * standing on a `/food/` document — so the root's only honest move is to put
   * them on one.
   *
   * And it is a new tab and not a navigation in place because ADR-0078 §1 has
   * guaranteed the Facet on the other side has no door back. From a standalone
   * install this deliberately steps outside the app; the label says so, because
   * a disguised exit is the trap §1 exists to stop and an install decision
   * belongs in a browser, which is the only place Back works.
   *
   * Only the root may render this, and that is not a rule this component
   * enforces — it is a consequence of prefix matching (ADR-0078 §3). Every
   * other Facet's scope is inside the root's, so only the root can link to one
   * without leaving its own.
   */
  let { facet }: { facet: Facet } = $props();
</script>

<!-- Every word of it is the Facet's own, so nothing here can advertise a name
     or a promise the roster has stopped making. The one sentence that is this
     component's rather than the Facet's is the label ADR-0078 §4 requires. -->
<p class="facet-exit">
  <a href={facet.startUrl} target="_blank" rel="noopener">
    Open {facet.name}
  </a>
  <span class="note">
    {facet.description} Opens in a browser tab, where you can install it.
  </span>
</p>

<style>
  .facet-exit {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
    margin-top: var(--space-l);
    padding-top: var(--space-s);
    border-top: var(--edge-thin);
    font-size: var(--step-n1);
  }

  .note {
    color: var(--text-secondary);
    font-size: var(--step-n2);
  }
</style>
