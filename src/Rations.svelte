<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { dbClient } from "./lib/db/db.client";
  import { runStartupErrands } from "./lib/facets/startup";
  import {
    faceOf,
    facesOf,
    shownFaces,
    type Facet,
    type FaceId,
  } from "./lib/facets/registry";
  import { hiddenFaces } from "./lib/stores/device-settings";
  import { faceBack } from "./lib/layout/face-actions";
  import { enterBackStop, leaveBackStop } from "./lib/ui/back-stack";
  import {
    takeCodeHandover,
    takeReceiveLink,
    type ReceiveOpening,
  } from "./lib/p2p/receive-link";
  import { isIosSafariTab } from "./lib/p2p/safari-tab";
  import { openAppWake } from "./lib/p2p/wake-errand";
  import type { OpenWake } from "./lib/p2p/wake-cadence";
  import { watchCarriedDeletions } from "./lib/stores/carried-deletion-notice";
  import Badge from "./lib/ui/Badge.svelte";
  import FaceHeader from "./lib/layout/FaceHeader.svelte";
  import FoodView from "./lib/views/FoodView.svelte";
  import RecipeLibrarySheet from "./lib/views/food/RecipeLibrarySheet.svelte";
  import JarSettings from "./lib/views/settings/JarSettings.svelte";
  import CodeHandover from "./lib/views/food/CodeHandover.svelte";
  import ReloadPrompt from "./lib/ui/ReloadPrompt.svelte";

  /**
   * Which Facet this is, handed in by the entry point that mounted this shell
   * (ADR-0076 §6). It arrives as a prop rather than being read here so that
   * `src/food-main.ts` stays the single place Rations' identity is named, and so
   * that nothing in this tree is ever tempted to work it out from a URL.
   */
  let { facet }: { facet: Facet } = $props();

  // ── The whole of Rations' chrome ──────────────────────────────────────────
  //
  // **Rations has a switcher now** (ADR-0114 §8, overturning ADR-0078 §2). What
  // survives of that record is §1, and it survives *as the mechanism*: this
  // shell declares three faces — Rations, Recipes and Settings — and
  // `check:facets` holds that declaration to what this build actually reaches,
  // so a cross-Facet link is still **unexpressible** rather than suppressed.
  // There is no `display-mode` test anywhere, and there is nothing to hide at
  // runtime: the other four faces' screens are not in this bundle.
  //
  // The app's own mark in the panel is a **drawing** here and a control on the
  // root, which is the same rule seen from the other side. §6 sends the
  // triquetra home to the root's landing grid, and that grid is at `/` — outside
  // this Facet's scope, so a link there would eject an install into a browser
  // tab. `FaceSwitcher`'s `onHome` is optional for exactly this, and Rations
  // hands none.
  //
  // **One Tracked Domain no longer means one screen** (ADR-0091 §5). Above the
  // shell breakpoint Rations has pages — Settings and Reports, Recipes having
  // become a face of its own at #536 — and the header's icons are navigation
  // rather than sheet openers. That amends ADR-0078 §1 and nothing else: every
  // page is Rations' own, so the no-way-*out* rule this file is built on is
  // untouched, and a link to a screen outside this build is still unexpressible.
  // Below the breakpoint there are no pages and the icons open sheets, which is
  // the shape this comment used to describe wholesale.

  // ── A meal, arriving by link ──────────────────────────────────────────────
  //
  // **The receive link is Rations', and the root reads none** (ADR-0084 §5).
  // A meal is `event:consume_*` and food twins, so the hand-off belongs to the
  // Facet that owns them (§1) — and prefix matching is one-directional, so a
  // link at `/food/` opened by somebody who installed only the root is still
  // inside their scope and lands, while the reverse would eject a Rations user
  // into a browser tab. There is one arrival and one door.
  //
  // Receiving has no door of its own (ADR-0074 §4), so this is not a route and
  // there is nothing to navigate to. The link is `/food/#r=…&k=…` — the secret
  // in the fragment, so it reaches no server — and it is read here because the
  // URL belongs to the shell rather than to any one screen. What it opens
  // belongs to the food screen, which is where a meal is.
  //
  // §9's rule is what this shape is bought with: **the page that reads it is
  // served by the asset router, never by the Worker script.** A route falling
  // through to the script answers without the `cross-origin-*` headers
  // `_headers` puts on an asset — no cross-origin isolation, no
  // `SharedArrayBuffer`, and an in-memory database. `/food/index.html` is
  // Rations' own precached entry, served 200 as an asset (#312), so the hole is
  // avoided by never leaving it. Do not give receive an HTML entry of its own.
  let receiveLink = $state<ReceiveOpening | null>(null);

  // ── The three faces this shell holds ──────────────────────────────────────
  //
  // **Minus what this device has hidden** (ADR-0114 §10), off the same one key
  // the root reads: a face this person has tidied out of the grid is tidied out
  // of both switchers, because the preference is about the device rather than
  // about the install. Two of Rations' three are hideable — Settings is where
  // hiding is undone — and hiding the face you are standing on is allowed and
  // moves you nowhere, which is a consequence of this list being read where the
  // grid is drawn rather than where a face is chosen.
  const faces = $derived(shownFaces(facesOf(facet), $hiddenFaces));

  /**
   * Which of this shell's three faces is up.
   *
   * **A plain `FaceId` since #555, which is what the cut bought.** It used to
   * hold the food screen's page as well, because the Settings tile and the gear
   * opened one surface and the two controls had to land on one state. They open
   * two surfaces now — the gear opens Rations' own settings, the tile opens the
   * jar's Settings face — so the page is the food screen's own business again
   * and this says nothing about it.
   *
   * That is a narrowing and a loss at once: a page and a face can now disagree,
   * because they are two variables in two files. The one place that has to know
   * about both is the Back stop below, which reads the way back rather than
   * guessing from here.
   */
  let face = $state<FaceId>("rations");

  /**
   * A tile's landing, which is the face itself and nothing more.
   *
   * **Leaving Rations declines an arriving meal** (ADR-0073 §10). The code is
   * this shell's state and the surface it opens is the food screen's, so
   * unmounting that screen kills the socket and would otherwise leave the code
   * here to re-open a surface whose payload is gone — which `leaveReceiving`'s
   * own comment names as the thing that must not happen. Two of the three tiles
   * unmount the food screen now, and this is the one place all three are
   * chosen, so the clearing is written here: leaving is declining, by every
   * route there is.
   *
   * Picking Rations while standing on it is not a leaving and clears nothing.
   */
  function showFace(id: FaceId) {
    if (id !== "rations") receiveLink = null;
    face = id;
  }

  // ── Back means the start destination ─────────────────────────────────────
  //
  // **One stop, and it walks one rung per press** (ADR-0114 §14). This shell's
  // start destination is the Rations face on the day, which is where `/food/`'s
  // own `start_url` opens, so this is the manifest member read as a screen
  // rather than a second concept.
  //
  // **This is the shell with rungs, and so the only one that reads a way back.**
  // The root's version of this effect is the same stop with the `faceBack` half
  // deleted, because a face is the only rung it has: `hasPages` is Rations' alone
  // (ADR-0091 §5), so the food screen publishes a way back on this shell and
  // nowhere else. The rule is one sentence in both places; the ladder is one rung
  // long over there.
  //
  // **`home` is a different thing and stays different.** Under Rations *home* is
  // `/`, outside the Facet, which is why `FaceSwitcher`'s `onHome` is optional
  // and why this shell draws no such control. That asymmetry is about where `/`
  // is; it says nothing about whether a face is somewhere you went, so it is not
  // inherited here.
  //
  // **The predicate is the face *or* a way back, and since #555 it has to be
  // both.** §14 always stated it that way; this shell got away with reading one
  // variable while the page and the face were written on one state, and they are
  // not any more — the gear's page is the food screen's own business now, so on
  // the Rations face `face` says "start destination" while `FoodView` publishes
  // a rung above it. Reading the face alone would strand a reader on the Reports
  // page with a Back press that leaves the app; reading the way back alone would
  // lose the stop that gets Recipes and Settings home. So both are read, and the
  // two are never counted: there is one stop while either says there is
  // somewhere up from here.
  //
  // What that does *not* do is push two for a face that is also a page. There is
  // no such face left — that was Settings, and cutting it in two is what put this
  // shell back on §14's own sentence.
  //
  // The way back is read **above** the guard so that it stays a dependency of an
  // effect that returns early: the stop has to be replaced when a page opens, and
  // a read after the guard would be untracked on the day.
  //
  // **A hidden start destination is still the destination.** The Rations face is
  // hideable and hiding the face you stand on moves you nowhere (§10), so Back
  // can land on a face that is not in this switcher — which is that rule working,
  // since hiding takes a face out of the grid and never out of reach.
  $effect(() => {
    const up = $faceBack;
    if (face === "rations" && up === null) return;
    const id = enterBackStop("place", () =>
      up ? up.go() : showFace("rations")
    );
    return () => leaveBackStop(id);
  });

  // ── The one case that never opens the ledger ──────────────────────────────
  //
  // **A Safari tab on iOS never accepts a meal. It shows the code and says
  // where to put it** (ADR-0082 §2). The link cannot reach the installed app's
  // Ledger, so the page does not try: it hands the code to a door that already
  // exists, and mounts `CodeHandover` instead of the app.
  //
  // **This is read here, above the `init` below, and that ordering is §8.**
  //
  // > The page must not ask the browser to durably keep a jar it is in the
  // > middle of telling you is not yours.
  //
  // Both of §6's tests are synchronous property reads, so the gate is
  // affordable, and skipping is safe because this page mounts no view that
  // subscribes to a ledger store — which is the invariant the synchronous
  // kick-off below exists to protect. **Nothing else moves.**
  //
  // The read is total: `isIosSafariTab` swallows a signal that throws, and
  // `takeCodeHandover` swallows a `replaceState` the browser refused (ADR-0082
  // §9), so nothing here can reach ADR-0069's boot guard.
  const handover: ReceiveOpening | null =
    typeof window !== "undefined" && isIosSafariTab(window.navigator)
      ? takeCodeHandover({
          href: window.location.href,
          clean: (url) => window.history.replaceState(null, "", url),
        })
      : null;
  // Only the handover page reads this, and `handover` is non-null only when
  // there was a `window` to read it from — so the empty string is unreachable
  // rather than a fallback anything renders.
  const origin = handover === null ? "" : window.location.origin;

  // ── DB init ───────────────────────────────────────────────────────────────
  //
  // The same Jar as the root's, at the same path. A Facet is a face onto one
  // jar, not a jar of its own (ADR-0076 §1), so this opens the ledger the root
  // opens and every meal logged here is in the root's Food tab.
  let dbReady = $state(false);
  let dbError = $state("");

  // The same hook `App.svelte` hangs off `window`, and it is here for the same
  // reason it is there: `tests/receive-link.spec.ts` reads it to hold ADR-0082
  // §8's claim that the handover path opened no database at all, and it can
  // only read an absence it can tell apart from an absent hook. It is set
  // before the branch below, so the assertion is about `init` rather than about
  // this line.
  if (typeof window !== "undefined") {
    window.dbClient = dbClient;
  }

  // Kick off worker creation synchronously, before any child view subscribes to
  // a ledger store. init() assigns dbClient.worker and posts its `init` message
  // before its first await, so store queries that fire during the initial render
  // are queued behind that init message (the worker processes messages in order)
  // instead of racing an unset worker and rejecting with "not initialized".
  const initPromise = handover ? null : dbClient.init("/inventoria.db");

  /**
   * This open's wake, kept so its triggers can be dropped with the app.
   *
   * **Rations wakes** (ADR-0105 §9, amending ADR-0096 §7). A wake is an open of
   * a Facet rather than an open of the root, and this Facet's scope is food —
   * so this open serves every lane it meets, collects whatever a peer left, and
   * deposits food and its deletions and nothing else. That last clause is what
   * closes
   * [#415](https://github.com/palebluebytes/inventoria/issues/415): a
   * Facet-scoped wipe performed in this install now deposits its Carried
   * deletion on this open instead of waiting for the root to be opened.
   *
   * **It is not a way out of this Facet** (ADR-0078). It reaches no root
   * screen, mounts no root view module and draws nothing; the pairing surface
   * is #423's, and until it lands the act still lives only on the root's
   * Settings.
   */
  let wake: OpenWake | null = null;
  /**
   * The listener for a peer's Carried deletion, attached **before** the wake
   * that applies one (ADR-0096 §12): the worker announces it once, so a
   * broadcast with nobody listening is a deletion the person is never told
   * about.
   *
   * Rations draws no notice — `CarriedDeletionNotice` is the root's screen —
   * and this is still Rations', because the record it writes is `localStorage`
   * and waits to be read. Without it a deletion applied under a Rations-only
   * open would be lost rather than deferred.
   */
  let watching: (() => void) | null = null;
  let unmounted = false;
  onDestroy(() => {
    unmounted = true;
    wake?.close();
    watching?.();
  });

  onMount(async () => {
    // A page that is handing the code over opens nothing and asks for nothing
    // (ADR-0082 §8): no database, no persistence request, no corpus fetch and
    // no second reading of a URL it has already taken the code off. Every
    // errand below is an errand on behalf of a jar this page is telling you is
    // not yours.
    if (handover) return;
    // Every entry point's errands, including the request to keep the ledger.
    // The list is shared precisely so this entry cannot quietly skip one.
    runStartupErrands();
    // Before the ledger, not after it. ADR-0073 §10 measured the cold-boot
    // window out of existence on the strength of SQLite being entirely OFF the
    // mount path: waiting in the room needs a WebSocket and `crypto.subtle`,
    // not OPFS, so a meal can arrive and be shown while the database is still
    // opening — and a database that never opens must not swallow the link.
    readReceiveLink();
    try {
      await initPromise;
      dbReady = true;
      watching = watchCarriedDeletions();
      wake = openAppWake("food");
      // The shell can be torn down inside the awaits above, in which case
      // `onDestroy` has already run and found nothing to close.
      if (unmounted) {
        wake.close();
        watching();
      }
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  });

  /**
   * Takes the code off the URL, once (ADR-0074 §8).
   *
   * **After mount and inside a `try`**, both forced rather than chosen.
   * ADR-0069's boot guard reads a throw during module evaluation as "this shell
   * cannot start" and wipes the service worker and every cache, so a malformed
   * fragment must not be able to reach it. The `try` is real work rather than
   * ceremony: `takeReceiveLink` deliberately lets a refused `replaceState` out,
   * because a code still sitting in the address bar is a code a reload could
   * spend a second time, and an ordinary boot is the safe reading of that.
   *
   * The read is what cleans the URL, so a reload is never a retry.
   */
  function readReceiveLink() {
    if (typeof window === "undefined") return;
    try {
      const link = takeReceiveLink({
        href: window.location.href,
        clean: (url) => window.history.replaceState(null, "", url),
      });
      if (link.kind === "none") return;
      receiveLink = link;
      // No tab to switch to, and nothing to navigate: the food screen is
      // already the one that is mounted, and a page is only ever reached by
      // pressing for it (ADR-0091 §5), so an arriving link cannot land behind
      // one.
    } catch {
      // An ordinary boot, which is the safe reading of a URL that could not be
      // cleaned. The sender is still standing there and mints another code.
    }
  }
</script>

<svelte:head>
  <title>{facet.name}</title>
  <!-- The Facet's own sentence, which its manifest also carries (#305). Read
       rather than repeated, so the two cannot come apart. -->
  <meta name="description" content={facet.description} />
</svelte:head>

{#if handover}
  <!-- ADR-0082 §2. Not a route and not a service-worker change (§11.3): the
       same fragment on the same `/food/`, answered by a different page. The
       app's own shell is deliberately absent — no food screen — because §8's
       skipped `init` is only safe while nothing here subscribes to a ledger
       store. -->
  <CodeHandover opening={handover} {origin} />
{:else}
  <!-- The same hook the root's `.app` carries, for the same reason: readiness is
       a fact the suite needs and not a thing to draw (ADR-0114 §9). Rations
       never had a badge to read, so `tests/support/rations.ts` read the day's
       skeletons instead — one signal for both shells is what this replaces. -->
  <div
    class="rations"
    data-db={dbError ? "error" : dbReady ? "ready" : "opening"}
  >
    <!-- The same pinned header every face wears (ADR-0114 §5). Rations drew none
         at all until now — its chrome was the food screen's own title row — and
         that row is still there below this one until
         [#533](https://github.com/palebluebytes/inventoria/issues/533) folds the
         faces' titles into this box. -->
    <FaceHeader face={faceOf(face)} {faces} onPick={showFace} />

    <main class="main">
      <!-- The capped, centred column, and the whole of why it is a box of its
           own: `.main` is the scroll container, and a cap on the scroll
           container draws the scrollbar down the middle of a wide screen
           instead of at the edge of the window (`src/app.css`, ADR-0091 §2 as
           amended). The wrapper takes the cap; the scroll stays outside it. -->
      <div class="shell-column">
        {#if dbError}
          <!-- **Error only**, and it is now what both shells do (ADR-0114 §9).
               The root used to report three states in the Sidebar's footer
               badge; that box is deleted, and `● DB Ready` went with it. The
               argument was always this one: a food screen that silently never
               becomes ready is the one failure a user cannot read off the page,
               and a permanent green badge is a developer's affordance charging
               the user for it. -->
          <Badge class="w-full justify-center" variant="error">
            ✕ DB Error — {dbError}
          </Badge>
        {/if}

        <!-- The link lands here (ADR-0084 §5), and the surface it opens is the
             food screen's. The payload and the socket die with the screen that
             holds them; the **code** does not, because it is this shell's state
             and not that screen's, so `showFace` clears it on the way out
             (ADR-0073 §10).

             It used to read "there is no Tab to wander off", which was true of a
             shell whose whole content was one screen. There is a switcher now,
             and since #555 **two** of its three tiles unmount this screen — so
             wandering off declines the meal, which is the same clause reaching
             the same answer by the route §10 already named ("leaving is
             declining, by any route"). The shape is what changed, rather than the
             claim: with one such tile the code outliving the screen was a defect
             nobody had met, and with two it is the ordinary way out of the
             face. -->
        {#if face === "recipes"}
          <!-- The recipe library, and **the shell mounts it** (ADR-0114 §4, #536).
               It was one of the food screen's pages until #536, reached from a pot
               in that screen's header as well as from the tile — two controls for
               one surface. The page is gone, so this is the same call the root
               makes from `App.svelte`: a face is a screen at every width, with no
               day threaded into it and nothing to close.

               The food screen is **unmounted** while this is up, which is the
               root's reading of a face and now this shell's too. That is what
               makes leaving Rations for Recipes decline an arriving meal
               (ADR-0073 §10 — "leaving is declining, by any route") and what makes
               coming back land on the day. -->
          <RecipeLibrarySheet />
        {:else if face === "settings"}
          <!-- The Settings face, and **the shell mounts it** (ADR-0114 §10,
               #555). It is the jar-wide block and nothing else here: the pairing
               card and the face-visibility toggles, with no install to offer
               because nothing is nested inside this Facet. Two cards is what the
               face is under Rations, and §10's "contents vary by Facet" is that
               being true rather than a shortfall — the root's own door wraps the
               same block in everything ADR-0080 §2 gives the root alone.

               It follows `SettingsView`: section headings and no title of its
               own, because the name of this face is the shell header's to say
               (ADR-0114 §3).

               **A screen at every width**, which is the whole of what #555
               bought. The gear used to open this face, so below the shell
               breakpoint it drew as a modal sheet over the day, under a header
               saying Settings, with the day's own controls in it and no way
               back — a face that was not a screen, which is exactly what #536
               spent a control to refuse. The gear opens Rations' own settings
               now and keeps its legitimate sheet-below/page-above shape, because
               a **page** may be a sheet and a **face** may not. -->
          <JarSettings facetId="food" />
        {:else}
          <!-- `hasPages` is this shell saying what it can hold (ADR-0091 §5). Above
               the shell breakpoint the food screen shows Rations' own settings or
               Reports instead of the day, and the header's icons are the
               navigation between them. Neither is the Settings face above: that
               is the jar's and this shell mounts it, while these are the Facet's
               and the screen holds them. The root mounts the same screen inside
               its Rations face and passes nothing, because a page a tile away
               from the root's own Settings would be a second door to a surface
               that already has one. -->
          <FoodView
            {dbReady}
            {receiveLink}
            hasPages
            onReceiveClose={() => (receiveLink = null)}
          />
        {/if}
      </div>
    </main>

    <!-- Rations registers its own service worker and prompts its own clients.
         One deploy therefore prompts twice on a device with both Facets
         installed, which is accepted rather than mitigated: they are two
         installs with two precaches, and a single prompt updating both would
         claim an authority the registration model does not grant
         (ADR-0077 §8). -->
    <ReloadPrompt {facet} />
  </div>
{/if}

<style>
  .rations {
    display: flex;
    flex-direction: column;
    height: 100svh;
    background: var(--bg-base);
    /* All four, and the root's `.app` now agrees on every edge (ADR-0089 §2, as
       amended by ADR-0114 §5). It used to hand the bottom inset to its nav,
       which stood at the foot of the screen and reserved the home indicator
       itself; that nav is deleted. Nothing stands between either box and the
       indicator, and the last row of whatever is open would otherwise sit under
       it. `tests/unit/shell.test.ts` reads the pair as one loop. */
    padding: env(safe-area-inset-top, 0px) env(safe-area-inset-right, 0px)
      env(safe-area-inset-bottom, 0px) env(safe-area-inset-left, 0px);
  }

  /* `.main` is not here. It is one rule in `src/app.css`, shared with the root's
     shell, because this block used to be duplicated character for character
     between the two files — including the missing `margin-inline` that left the
     column hugging the left edge of a wide screen (ADR-0091 §2). */
</style>
