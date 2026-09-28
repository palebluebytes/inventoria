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
  import {
    curatedPairingName,
    curatedPick,
    declaredStateLabel,
    declaredStateOf,
    preselect,
    type PairingPick,
  } from "../../food/curated-pairing-offer";
  import type { CuratedPairing } from "../../food/curated-pairings";

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
  // Density Class question takes for the same reason, and it is the shape the
  // **Curated pairing** below lands in (§14): it pre-selects, and the confirm
  // under it is the whole of what keeps it from having accepted anything.
  //
  // **A Curated pairing is a prior and not a proposer** (§§9, 14). It contradicts
  // nothing above: it names no candidate this screen worked out, it is one
  // hand-authored row somebody committed with a `ground` a reviewer read, and it
  // shows the two things §14 will not let it imply — the **USDA row's own
  // description**, which is §9's condition on every pairing surface, and the
  // **Declared state** the row asserts, which is the segmented control above the
  // box moving to the answer rather than the row keeping it to itself. One
  // explicit act takes both, and either is a tap from being changed.
  //
  // **It is never a fallback.** The row shows wherever there is one, beside a
  // working search rather than behind its failure: showing a curated claim only
  // when nothing else was found hides it exactly where it is load-bearing.
  //
  // What decides whether a row is offered at all is not here — it is the host's,
  // through `curatedPairingOffer`, because it is a question about the twin: a
  // pack carrying a live pairing keeps it, and one whose pairing was cleared is
  // never re-offered.
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
    curated,
    onAccept,
    onClose,
  }: {
    /** The pack this pairing is about, named in the lede. */
    packName: string;
    /**
     * The Curated pairing this pack is offered, absent where the table has
     * nothing to say about it (§14).
     *
     * The host decides, through `curatedPairingOffer`, because whether a row is
     * offered is a question about the twin rather than about the screen: a live
     * `food/pairing` wins over the table and a cleared one is never re-offered.
     * What this sheet owes a row it is handed is the two things §14 says it
     * shows rather than implies.
     */
    curated?: CuratedPairing;
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
  let chosen = $state<PairingPick | undefined>(undefined);
  let searching = $state(false);
  let error = $state("");
  /** The query the rows on screen answered, so a stale list never reads as this one's. */
  let answered = $state("");
  /**
   * The pack in this person's hand, as they have said it is (§11) — or as a
   * curated row says it is, until they say otherwise.
   *
   * A row asserting a Pairing target IS the assertion that the pack is cooked
   * (§14), so a sheet that showed the row under the default would be showing a
   * cooked claim beside a list of Reference foods. It opens at the row's state
   * and the control says so; the default is still where a pack with no row
   * starts, which is what keeps the question a widening act.
   */
  // svelte-ignore state_referenced_locally
  // The initial value is what is wanted: the sheet is mounted per opening, and
  // after that the declaration is the person's. A derived would put the row's
  // state back the moment they moved off it.
  let declared = $state<DeclaredState>(
    curated ? declaredStateOf(curated) : DECLARED_STATE_DEFAULT
  );
  /**
   * What the box is searching, said in the box rather than left to be inferred
   * from the control above it. A cooked record is not a **Reference food**
   * (§16), so the word moves with the declaration.
   */
  let searchLabel = $derived(
    declared === "cooked" ? "Search cooked foods" : "Search reference foods"
  );

  /**
   * The curated row's USDA description, once the set its `set` names has been
   * asked for it (§9).
   *
   * Resolved rather than carried on the row, and the row is not shown until it
   * answers. §14 says a Curated pairing SHOWS the description rather than
   * implying it, and the table holds the pack's own name and a `ground` written
   * for a reviewer — neither of which is the USDA record's words. A row whose id
   * has left the set it names is the standing hazard the quarterly job exists
   * for, and the honest surface for one is no offer at all rather than an id.
   */
  let curatedName = $state<string | undefined>(undefined);
  $effect(() => {
    const row = curated;
    if (!row) return;
    let live = true;
    void curatedPairingName(row).then((name) => {
      if (live) curatedName = name;
    });
    return () => {
      live = false;
    };
  });

  /**
   * The curated row as something pickable, or absent where there is nothing to
   * offer right now. Every clause behind it is `curatedPick`'s, in the module
   * that holds the rest of §14 — this is the reading of it under what is on
   * screen at this moment.
   */
  let offered = $derived(curatedPick(curated, curatedName, declared));

  /** The words the row's Declared state is read under, from §11's own list. */
  let curatedStateLabel = $derived(
    curated ? declaredStateLabel(declaredStateOf(curated)) : ""
  );

  /**
   * Arms the button with the offer, the moment there is one (§2).
   *
   * **Arming, never accepting**: this sets what the button would write and
   * writes nothing, and the button under it is the whole act. **And never
   * overruling**: `preselect` hands back what is already picked where anything
   * is, which matters because the description is resolved out of an artifact —
   * the offer can appear a fetch after this sheet opened, by which time somebody
   * may have typed a query and tapped a row of their own.
   */
  $effect(() => {
    chosen = preselect(chosen, offered);
  });

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
    chosen = undefined;
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

  {#if offered}
    <!-- The Curated pairing (§14). It sits above the box, not behind it: a
         fallback-only treatment hides the curated claim exactly where it is
         load-bearing. The row carries the two things §14 will not let it imply —
         the USDA record's own description as its title, and the Declared state
         it asserts as its second line, which is also the state the control below
         is set to. Nothing here writes; the footer button is the act. -->
    <section class="pp-curated" data-testid="curated-pairing">
      <h3 class="pp-curated-head">Already matched by hand</h3>
      <Row
        title={offered.name}
        subtitle="The pack, {curatedStateLabel.toLowerCase()}"
        selected={chosen?.entity === offered.entity}
        data-testid="curated-pairing-row"
        data-reference={offered.entity}
        onclick={() => (chosen = offered)}
      />
      <p class="pp-curated-note">
        Somebody paired this barcode with that USDA food. Read its description
        against what is in your hand — it is a suggestion, and nothing is
        written until you tap below.
      </p>
    </section>
  {/if}

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
            onclick={() => (chosen = { entity: food.entity, name: food.name })}
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
      disabled={chosen === undefined}
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

  .pp-curated {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin-bottom: var(--space-s);
  }

  .pp-curated-head {
    font-size: var(--step-n1);
    font-weight: 600;
    color: var(--text-secondary);
  }

  .pp-curated-note {
    font-size: var(--step-n2);
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
