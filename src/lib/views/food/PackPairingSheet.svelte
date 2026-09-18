<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Row from "../../ui/Row.svelte";
  import Alert from "../../ui/Alert.svelte";
  import {
    searchUsdaFoods,
    NoReferenceFoodError,
    NO_FOOD_FOUND,
    type FoodResult,
  } from "../../food/food-search";
  import { isReferenceFoodEntity } from "../../food/pairing";

  // **The pairing act** (ADR-0113 §§1, 2 and 9): a person searches the corpus
  // this app already ships, reads a reference food's own description, and says
  // yes to one of them.
  //
  // **Nothing proposes** (§9). There is no model behind this box and no
  // mechanical offer in front of it, and the reason is a measurement rather than
  // a preference: handed the whole corpus, a model emitted six ids that are real
  // rows naming a different food while its own stated reason named the food
  // correctly — peanut butter under the words "olive oil", cornmeal under
  // "Emmental cheese" (#247). Validating the id against the corpus catches one
  // error in seven. So the clause the whole design rests on — *a wrong pairing
  // names a food you can read and reject* — holds only where the **reference
  // food's own description** is on screen, and a search the user drives
  // satisfies that by construction.
  //
  // **Pre-selecting is allowed; pre-accepting is not** (§2). A tap arms the
  // button and writes nothing; the button is the act. That is the same shape the
  // Density Class question takes for the same reason, and it is the shape a
  // Curated pairing will land in (§14) — that one pre-selects, and the confirm
  // under it is what keeps it from having accepted anything.
  //
  // **A Curated stand-in is not a candidate.** The shipped search folds one in
  // where the corpus has a coverage hole (ADR-0046 §1), and it is a specific OFF
  // product rather than a reference food, so it has no business being the second
  // end of this relationship. The filter is on the id and not on the tag,
  // because that is the property that has to hold.
  let {
    packName,
    onAccept,
    onClose,
  }: {
    /** The pack this pairing is about, named in the lede. */
    packName: string;
    /**
     * The person accepted a reference food for this pack. The write is the
     * host's: a pack already in the ledger takes a datom, a staged one carries
     * the assertion to its own commit — the split `onAssertDensity` already
     * makes.
     */
    onAccept: (reference: string) => void;
    onClose: () => void;
  } = $props();

  const SEARCH_DEBOUNCE_MS = 120;

  let query = $state("");
  let results = $state<FoodResult[]>([]);
  let chosen = $state<FoodResult | null>(null);
  let searching = $state(false);
  let error = $state("");
  /** The query the rows on screen answered, so a stale list never reads as this one's. */
  let answered = $state("");

  let debounceTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const typed = query.trim();
    clearTimeout(debounceTimer);
    if (!typed) {
      results = [];
      answered = "";
      error = "";
      return;
    }
    debounceTimer = setTimeout(() => void runSearch(typed), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(debounceTimer);
  });

  async function runSearch(typed: string) {
    searching = true;
    error = "";
    try {
      const search = await searchUsdaFoods(typed);
      // A search that answered while the user typed on is not this search's
      // answer, and the rows below say which query they are for.
      results = search.results.filter((food) =>
        isReferenceFoodEntity(food.entity)
      );
      answered = typed;
      // A query whose only answers were stand-ins is an empty pairing search,
      // and says so rather than showing a list with nothing in it.
      if (results.length === 0) error = NO_FOOD_FOUND;
    } catch (e) {
      results = [];
      answered = typed;
      error =
        e instanceof NoReferenceFoodError
          ? NO_FOOD_FOUND
          : ((e as Error).message ?? String(e));
    } finally {
      searching = false;
    }
  }

  function accept() {
    if (!chosen) return;
    onAccept(chosen.entity);
    onClose();
  }
</script>

<BottomSheet
  isOpen
  title="Pair with a reference food"
  testId="pack-pairing"
  {onClose}
>
  <p class="pp-lede">
    Which USDA food describes what is in <strong>{packName}</strong>? Its
    figures fill only what this label leaves out, and the pack stays the food.
  </p>

  <Input
    bind:value={query}
    placeholder="Search reference foods"
    inputmode="search"
    data-testid="pairing-search"
    aria-label="Search reference foods"
  />

  {#if searching}
    <p class="pp-hint" role="status">Searching…</p>
  {:else if error && answered === query.trim()}
    <Alert variant="warning">{error}</Alert>
  {/if}

  {#if results.length > 0}
    <ul class="pp-list" data-testid="pairing-results">
      {#each results as food (food.entity)}
        <li>
          <!-- The row's own description, which is the whole of what makes a
               wrong pairing rejectable (§9). Name-only, as the food search's
               list is for ADR-0090 §6's reason. -->
          <Row
            title={food.name}
            selected={chosen?.entity === food.entity}
            data-testid="pairing-result"
            data-reference={food.entity}
            onclick={() => (chosen = food)}
          />
        </li>
      {/each}
    </ul>
  {/if}

  {#snippet footer()}
    <!-- The act, and the only thing on this sheet that writes (§2). A tap on a
         row above arms it and asserts nothing. -->
    <Button
      variant="primary"
      disabled={chosen === null}
      data-testid="pairing-accept"
      onclick={accept}
    >
      {chosen ? `Pair with ${chosen.name}` : "Pick a reference food"}
    </Button>
  {/snippet}
</BottomSheet>

<style>
  .pp-lede {
    margin-bottom: var(--space-s);
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }

  .pp-hint {
    margin-top: var(--space-xs);
    font-size: var(--step-n1);
    color: var(--text-secondary);
  }

  .pp-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-top: var(--space-s);
    list-style: none;
  }
</style>
