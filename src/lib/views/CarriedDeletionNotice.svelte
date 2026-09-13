<script lang="ts">
  // **A one-shot notice of a completed act** (ADR-0096 §12): a wipe performed
  // on another of this person's devices has reached this one and taken rows
  // here. It is drawn the moment there is something to say and never otherwise.
  //
  // **It is not a prompt, and there is no undo.** Both would be lies: the rows
  // are physically gone on both devices by the time this renders, and an undo
  // would be the recoverability claim ADR-0096 §17 refuses. The only control is
  // the one that marks it read.
  //
  // **It belongs to no Tracked Domain, which is why it is not a screen.** The
  // Jar domain declares no views (ADR-0096 §13) — nothing *draws* a carried
  // deletion, and a notice is not a domain's screen. This module sits in the
  // jar-wide surface `checkViewContainment` counts and does not attribute,
  // beside `SettingsView` and the ledger blocks.
  //
  // **The root shows it and Rations does not.** A wake is an open of the root
  // Facet (ADR-0096 §7), so the root is the only Facet that ever applies one —
  // a notice in Rations could only ever report an act some *other* shell
  // performed, and a Rations-only user never converges and has nothing to be
  // told about.
  import Alert from "../ui/Alert.svelte";
  import Button from "../ui/Button.svelte";
  import {
    carriedDeletionLine,
    carriedDeletionNotice,
    dismissCarriedDeletion,
  } from "../stores/carried-deletion-notice";
</script>

{#if $carriedDeletionNotice}
  <Alert variant="warning">
    <p>{carriedDeletionLine($carriedDeletionNotice)}</p>
    <Button variant="secondary" onclick={dismissCarriedDeletion}>
      I have read this
    </Button>
  </Alert>
{/if}

<style>
  p {
    margin: 0 0 var(--space-s);
  }
</style>
