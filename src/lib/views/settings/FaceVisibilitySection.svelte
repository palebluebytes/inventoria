<script lang="ts">
  // **Which faces this device shows** (ADR-0114 §10), on the Settings face of
  // whichever Facet is drawing it.
  //
  // **Hiding removes a face from the switcher and nothing else.** It is not a
  // deletion, not a disablement and not an uninstall: the face keeps its screen,
  // its URL and its share target, so a deep link or a shared meal still lands on
  // it. That is what the section says out loud, because a toggle beside a list of
  // names is otherwise read as "turn this part of the app off" — and the one
  // thing a person must not have to find out by experiment is whether their data
  // went with it.
  //
  // **The rows are the shell's own roster, not `FACES`.** The root offers six and
  // Rations two, because a shell cannot show a face whose screens are not in its
  // build (ADR-0114 §8) and a toggle for one would be a control with nothing
  // behind it. `hideableFaces` drops the one face this section is standing on
  // (§10: it is where hiding is undone), so the list is the roster minus one at
  // both sizes.
  //
  // The BETA badge is `ui/Badge`, the primitive ADR-0114 §11 names, drawn here
  // directly: §11 counts two drawings — the switcher tile's band and the header's
  // badge — and this row is a third the record did not foresee.
  // [#534](https://github.com/palebluebytes/inventoria/issues/534) builds the one
  // component for the other two and folds this in; until it does, a row that said
  // nothing about maturity would ask somebody to decide whether to hide Media
  // without telling them Media is unfinished.
  import Badge from "../../ui/Badge.svelte";
  import Card from "../../ui/Card.svelte";
  import Checkbox from "../../ui/Checkbox.svelte";
  import Row from "../../ui/Row.svelte";
  import { hiddenFaces, setFaceHidden } from "../../stores/device-settings";
  import { hideableFaces, type RosteredFace } from "../../facets/registry";

  let {
    faces,
  }: {
    /**
     * The faces the shell drawing this holds, in the roster's order —
     * `facesOf(facet)`, **unfiltered**.
     *
     * It must be the whole declaration rather than what the switcher is
     * currently drawing: a section handed the shown set could never offer the
     * row that puts a hidden face back.
     */
    faces: readonly RosteredFace[];
  } = $props();

  const rows = $derived(hideableFaces(faces));
</script>

<Card class="mt-4">
  <h2>Faces</h2>
  <p class="lead">
    Which faces this device shows when you press the logo. Unticking one takes
    it out of the grid and does nothing else — its screens still work, a link or
    a shared meal still opens it, and nothing you have logged is touched.
  </p>

  <ul class="faces">
    {#each rows as face (face.id)}
      <li>
        <Row title={face.name}>
          {#snippet lead()}
            <!-- `alt=""`: the name is the row's own title, so a described mark
                 would make every line announce itself twice — the same reading
                 `FaceGrid`'s tiles take. -->
            <img
              class="face-mark"
              src={face.mark}
              alt=""
              width="32"
              height="32"
            />
          {/snippet}
          {#snippet trailing()}
            <span class="controls">
              {#if face.maturity === "beta"}
                <Badge variant="warning">BETA</Badge>
              {/if}
              <!-- Ticked means shown, which is the direction the sentence above
                   is written in and the direction the grid is read in.

                   **Both a label and an `aria-label`, and neither is redundant.**
                   `ui/Checkbox` refuses an unnamed box on purpose, and the
                   visible word has to be short enough to sit at the end of a row
                   whose name is already on the left. So the row reads
                   "Media … Show ☑", and a reader tabbing between controls hears
                   "Show Media" instead of six boxes all called "Show". The
                   visible text is inside the accessible name, which is the
                   condition on doing this at all (WCAG 2.5.3). -->
              <Checkbox
                id="face-visible-{face.id}"
                label="Show"
                aria-label="Show {face.name}"
                checked={!$hiddenFaces.includes(face.id)}
                onCheckedChange={(next) => setFaceHidden(face.id, !next)}
              />
            </span>
          {/snippet}
        </Row>
      </li>
    {/each}
  </ul>
</Card>

<style>
  h2 {
    font-size: var(--step-1);
    font-weight: 800;
    color: var(--ink);
    text-transform: uppercase;
    margin: 0;
  }
  .lead {
    font-size: var(--step-n1);
    color: var(--text-secondary);
    margin: var(--space-2xs) 0 0;
  }
  /* A list, because it is one. `Row` draws its own edges, so the only thing left
     here is to undo the browser's marker and indent. */
  .faces {
    display: flex;
    flex-direction: column;
    gap: var(--space-2xs);
    margin: var(--space-s) 0 0;
    padding: 0;
    list-style: none;
  }
  /* The same drawing the switcher tile carries, at a list line's size: the mark
     is line art on transparency and is never composited onto a colour
     (`docs/icon-provenance.md`), which is what lets the set include a gear whose
     cut encloses no paper at all. */
  .face-mark {
    display: block;
    width: 32px;
    height: 32px;
  }
  /* The badge and the box travel together at the row's right edge, in flow. Not
     `Row`'s `corner`, which is positioned out of flow and would let the badge
     land on top of the checkbox on a narrow phone. */
  .controls {
    display: flex;
    align-items: center;
    gap: var(--space-2xs);
  }
</style>
