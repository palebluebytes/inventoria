/**
 * What a WRITTEN verdict does to a finished corpus.
 *
 * Two passes and the one check they share. `applyVariantDrops` removes the rows
 * ADR-0061 §5 adjudicated by reading them; `applyShippedNames` gives the rows
 * that remain the names ADR-0056 and ADR-0061 §5 decided they ship under. They
 * live together because they are the same KIND of thing — a judgement a rule
 * cannot reach, recorded one row at a time — and because both are only safe
 * while the corpus still holds the words the judgement was reached by reading,
 * which is what {@link assertAdjudicatedRowsShip} is.
 *
 * They live apart from `usda-bundle.mjs` because that file decides which
 * archives are read and in what order the passes run, and moves when the
 * pipeline does. These two move when somebody READS a row.
 *
 * A library, not a command, like `usda-artifacts.mjs` beside it: the corpus
 * arrives as `survivors` and the app's own rosters arrive as `app` — nothing
 * here reaches for either, and nothing here restates a rule the app owns
 * (ADR-0047 §4).
 *
 * @import { AppModule, Survivor } from "./usda-bundle.mjs"
 */

/**
 * Refuses a corpus that no longer holds a hand-adjudicated row under the
 * description the verdict was reached by reading.
 *
 * The whole risk of a written list, and both of this module's passes carry it:
 * an entry names one row, and a filter change or a mirror refresh can rewrite or
 * remove that row without touching the entry. Either way the verdict is about
 * words nobody has read — a drop list that outlives its row deletes nothing, and
 * a rename that outlives its row renames a different food. A generation that
 * stops beats an artifact that quietly ships one.
 *
 * The mirror image of `assertSupersededSurvive`, which guards the same written
 * lists from the other side by asking whether the row a verdict KEEPS is still
 * shipping.
 *
 * @param {Map<number, string>} shipped - Every surviving row, by `fdcId`.
 * @param {readonly [number, string, ...unknown[]][]} entries - The adjudicated
 *   rows, each leading with its `fdcId` and the description it was read as.
 * @param {string} record - The record the verdict belongs to, for the message.
 * @param {string} module - Where to re-read it.
 * @returns {number} how many adjudicated rows were matched
 */
export function assertAdjudicatedRowsShip(shipped, entries, record, module) {
  for (const [fdcId, description] of entries) {
    const found = shipped.get(fdcId);
    if (found === description) continue;
    throw new Error(
      `${record} adjudicates ${fdcId} as "${description}", and the corpus ` +
        (found === undefined
          ? "no longer holds it. A verdict that outlives its row is a verdict about nothing"
          : `holds it as "${found}". The verdict was reached by reading the other name`) +
        `; re-read the row in ${module}.`
    );
  }
  return entries.length;
}

/** Every surviving row's description, by `fdcId`. */
const shippedNames = (survivors) =>
  new Map(
    survivors.map((survivor) => [
      survivor.food.fdcId,
      survivor.food.description,
    ])
  );

/**
 * Refuses a corpus that has moved past one of ADR-0061 §5's hand-adjudicated
 * drops.
 *
 * @param {Survivor[]} survivors
 * @param {AppModule} app
 */
export function assertAdjudicatedVariantsShip(survivors, app) {
  return assertAdjudicatedRowsShip(
    shippedNames(survivors),
    app.ADJUDICATED_VARIANTS,
    "ADR-0061 §5",
    "src/lib/food/usda-variant-drops.ts"
  );
}

/**
 * The corpus with ADR-0061's variants of a food it already keeps taken out.
 *
 * Its own pass, after `buildCorpus` rather than inside it, because the three
 * rules ask about a head phrase's SURVIVING rows — whether it still keeps a
 * plain form, a fluid one, an unfortified one. Asked of the archives they would
 * read verdicts about records the filters had already dropped.
 *
 * `variant_dropped` counts each rule's own casualties in the order
 * `resolveVariantDrops` asks them, so the four tallies partition the drops
 * rather than double-counting the rows two rules agree on. Stated as a literal
 * for the reason `buildCorpus`'s `dropped` is: it is the shape the run REPORTS,
 * and a tally nobody named is a tally nobody reads.
 *
 * @param {Survivor[]} survivors
 * @param {AppModule} app
 */
export function applyVariantDrops(survivors, app) {
  const drops = app.resolveVariantDrops(
    survivors.map((survivor) => ({
      fdcId: survivor.food.fdcId,
      description: survivor.food.description,
    }))
  );

  const variant_dropped = {
    flavoured_variant: 0,
    dehydrated_form: 0,
    fortification_duplicate: 0,
    adjudicated_variant: 0,
  };
  const kept = [];
  for (const survivor of survivors) {
    const reason = drops.get(survivor.food.fdcId);
    if (reason === undefined) kept.push(survivor);
    else variant_dropped[reason]++;
  }
  return { survivors: kept, variant_dropped };
}

/**
 * The corpus with USDA's commercial origin qualifiers taken out of its names,
 * the names ADR-0061 §5 adjudicated by hand put in, and the rows whose name that
 * left already taken (ADR-0056).
 *
 * **Where this runs is load-bearing in both directions.** It is after
 * `assertTwinNamesRetrieve`, because that check is a question about the MERGE
 * and has to be asked of the names USDA actually wrote — a renamed row cannot
 * answer to the archived description it came from, and asking it to would fail a
 * check about something else entirely. It is before the vocabulary derivation,
 * because ADR-0049 §3's filters ask what the FINISHED corpus retrieves, and
 * after this the finished corpus is sixteen rows short and 631 names different.
 *
 * The hand-adjudicated names go on FIRST, so the collision key, the origin
 * tiebreak and the designation pass all read the name the corpus will actually
 * ship (ADR-0061 §5).
 *
 * Aliases are renamed with the descriptions. None carries an origin qualifier
 * today, so this reaches nothing — but an alias IS a name the row answers to
 * (ADR-0050 §4), and a rule that took the words out of one kind of name while
 * leaving them in the other would quietly make `new zealand` searchable again
 * the first time a refresh produced such a twin.
 *
 * The fortification strip does NOT run over aliases, and that is not the same
 * asymmetry. Whether it may run at all is a question about the whole corpus
 * (ADR-0062 §3), which a one-name-at-a-time pass here cannot answer — so the
 * aliases go INTO `resolveShippedNames` as names that can block a rename, and
 * come out unchanged. The words stay searchable either way: six rows keep them.
 *
 * @param {Survivor[]} survivors
 * @param {AppModule} app
 */
export function applyShippedNames(survivors, app) {
  const adjudicated = assertAdjudicatedRowsShip(
    shippedNames(survivors),
    app.ADJUDICATED_NAMES,
    "ADR-0061 §5",
    "src/lib/food/usda-shipped-name.ts"
  );
  const byId = new Map(app.ADJUDICATED_NAMES.map((entry) => [entry[0], entry]));
  const named = survivors.map((survivor) => {
    const entry = byId.get(survivor.food.fdcId);
    if (!entry) return survivor;
    return { ...survivor, food: { ...survivor.food, description: entry[2] } };
  });

  const { renamed, dropped, fortification } = app.resolveShippedNames(
    named.map((s) => ({
      fdcId: s.food.fdcId,
      description: s.food.description,
      // Only read to settle a designation collision, where provenance may not
      // choose and completeness can (ADR-0056's Amendment).
      panelFields: s.food.foodNutrients.length,
      // Read only by ADR-0062 §3's freedom check, which has to ask about every
      // name a row answers to rather than only its description.
      also: s.also,
    }))
  );
  const kept = [];
  for (const survivor of named) {
    if (dropped.has(survivor.food.fdcId)) continue;
    const description =
      renamed.get(survivor.food.fdcId) ?? survivor.food.description;
    // Every surviving row, not only the renamed ones: a row's own description
    // can be clean while a name the twin merge discarded is not, and `also` is
    // ranked against exactly like a description (`bestNameKey`).
    const { also: discarded, ...rest } = survivor;
    const also = [
      ...new Set((discarded ?? []).map(app.stripNonNamingQualifiers)),
    ].filter((alias) => alias !== description);
    kept.push({
      ...rest,
      food: { ...survivor.food, description },
      ...(also.length ? { also } : {}),
    });
  }

  const origin_dropped = {
    collision: 0,
    preparation_sibling: 0,
    designation_collision: 0,
  };
  for (const reason of dropped.values()) origin_dropped[reason]++;
  return {
    survivors: kept,
    renamed: renamed.size,
    adjudicated,
    origin_dropped,
    fortification,
  };
}
