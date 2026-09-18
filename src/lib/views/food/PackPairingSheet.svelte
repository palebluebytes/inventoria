<script lang="ts">
  import BottomSheet from "../../ui/BottomSheet.svelte";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import Row from "../../ui/Row.svelte";
  import Alert from "../../ui/Alert.svelte";
  import Segmented from "../../ui/Segmented.svelte";
  import {
    searchUsdaFoods,
    NoReferenceFoodError,
    NO_FOOD_FOUND,
    SEARCH_DEBOUNCE_MS,
    type FoodResult,
  } from "../../food/food-search";
  import { isReferenceFoodEntity } from "../../food/pairing";
  import {
    DECLARED_STATES,
    DECLARED_STATE_DEFAULT,
    pairingSearchCorpus,
    type DeclaredState,
  } from "../../food/pairing-targets";
  import {
    ArtifactUnreachableError,
    needsNetworkLine,
  } from "../../food/bundled-artifact";

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
  //
  // **The Declared state is the one question this sheet asks** (§11), and it
  // decides which set the search reaches: *cooked* reaches the Pairing index and
  // never the Search index, the default reaches the Search index and never the
  // Pairing index. It defaults to as-bought, so it is a **widening act and not a
  // gate in front of pairing** — a person never meets it unless they reach for
  // it, and the pack that behaves as it did yesterday still does.
  //
  // **Nothing about it is recorded**, here or anywhere: every row in the Pairing
  // index is a cooked record by construction, so the target's own `fdc:` id IS
  // the state, and the id is the whole of what {@link onAccept} hands back.
  // Storing the question beside the answer would keep the question.
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

  let query = $state("");
  let results = $state<FoodResult[]>([]);
  let chosen = $state<FoodResult | null>(null);
  let searching = $state(false);
  let error = $state("");
  /** The query the rows on screen answered, so a stale list never reads as this one's. */
  let answered = $state("");
  /** The pack in this person's hand, as they have said it is (§11). */
  let declared = $state<DeclaredState>(DECLARED_STATE_DEFAULT);
  /**
   * What the box is searching, said in the box rather than left to be inferred
   * from the control above it. A cooked record is not a **Reference food**
   * (§16), so the word moves with the declaration.
   */
  let searchLabel = $derived(
    declared === "cooked" ? "Search cooked foods" : "Search reference foods"
  );

  let debounceTimer: ReturnType<typeof setTimeout>;
  $effect(() => {
    const typed = query.trim();
    // Read so that moving the declaration re-runs the search over the other set
    // rather than leaving the last set's rows standing under the new question.
    const state = declared;
    clearTimeout(debounceTimer);
    if (!typed) {
      results = [];
      answered = "";
      error = "";
      return;
    }
    debounceTimer = setTimeout(
      () => void runSearch(typed, state),
      SEARCH_DEBOUNCE_MS
    );
    return () => clearTimeout(debounceTimer);
  });

  async function runSearch(typed: string, state: DeclaredState) {
    searching = true;
    error = "";
    try {
      const search = await searchUsdaFoods(
        typed,
        {},
        pairingSearchCorpus(state)
      );
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
          : // Neither Facet precaches the Pairing index (§11), so declaring a
            // pack cooked with no network is an ordinary case rather than an
            // exceptional one, and the recovery is the declaration itself: the
            // set this device DOES keep is one tap away.
            e instanceof ArtifactUnreachableError
            ? needsNetworkLine(
                e,
                "Say “As you bought it” to search the foods this device keeps."
              )
            : e instanceof Error
              ? e.message
              : String(e);
    } finally {
      searching = false;
    }
  }

  function accept() {
    if (!chosen) return;
    onAccept(chosen.entity);
    onClose();
  }

  /**
   * The declaration moved, so everything on screen is an answer to the other
   * question and goes.
   *
   * **The rows go with the pick, and that is the partition rather than tidiness**
   * (§11). A list left standing across the change is a list of Reference foods
   * under a person who has just said their jar is cooked, one tap from exactly
   * the pairing the partition exists to refuse — and it would be reachable in
   * the window the search takes to settle, which is the one window nobody is
   * watching for. The effect above re-runs and answers the new question.
   */
  function redeclare() {
    chosen = null;
    results = [];
    answered = "";
    error = "";
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

  <!-- The Declared state (§11): one question about the pack, two values, and
       the only route to a Pairing target. It sits above the box because it says
       what is being searched, and moving it takes the rows AND the pick with it
       — see `redeclare`. -->
  <Segmented
    label="The pack in your hand"
    options={DECLARED_STATES}
    bind:value={declared}
    onValueChange={redeclare}
    testid="declared-state"
  />

  <Input
    bind:value={query}
    placeholder={searchLabel}
    inputmode="search"
    data-testid="pairing-search"
    aria-label={searchLabel}
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
