# ADR 0074: Sending is the meal's own numbers, receiving has no door of its own, and iOS is out of scope

**Status:** Accepted  
**Date:** 2026-08-29  
**Amended by:** [ADR-0080](0080-a-safari-tab-on-ios-hands-the-code-to-the-app-it-is-not.md) (§10's boundary shrinks from the whole platform to one case, §11 gains a second test, §12.4 dissolves, §12.5 is revived, §12.6 is refused on its own merits, and §12.8 keeps its conclusion with a new reason)

## Context

[ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) settles the wire
and [ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md) settles the
payload. This record settles **where a person taps**, **what a receive link does when it
lands**, and **which platforms the feature exists on at all**. The three belong together
because each one decided the next: the surfaces removed the inbox, removing the inbox made
the link the only remote carrier, and the link turned out not to reach an installed iOS
ledger.

Four shapes were prototyped on the real food screen over real logged meals
(`src/lib/send-proto/`, `?variant=A|B|C|D`) and driven live. They disagreed about
structure rather than decoration:

- **A — a way out in the header.** A sixth square joins the meal header, set apart from the
  five ways in by a rule; receiving is a standing control beside Recipes with a count.
  **Rejected**: §5 kills the count badge, and without one the control is a header slot
  spent on an errand nobody starts from the header.
- **B — one handover, two doors.** One control opens a sheet whose whole subject is the
  exchange, with the meal picked inside it in
  [ADR-0058](0058-a-past-meal-is-copied-whole-at-the-amounts-logged.md)'s picker shape.
  Coherent and teachable, and **rejected** on one thing: it invents a surface to hold a
  meal picker the app already has, and it puts sending somewhere you have to learn rather
  than somewhere you already look.
- **C — the exchange takes the screen.** Full-screen, no app chrome, plain text affordances
  in the flow of the page. Its send half survives into D in spirit; its inbox screen died
  with §5 and its nine-message refusal wording lost to §6. **Rejected.**
- **D — the meal's own numbers are the surface.** **Chosen.**

### Scope

This record covers the send surface, the receive surface, the receive link's landing
behaviour, and the platform boundary. It does not cover the wire (ADR-0072), the payload
(ADR-0073), or the own-device half, which has its own surface question and answers it in
[ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) §11.

Research note: `docs/research/217-receive-link-landing.md`.

## Decision

### 1. Sending lives inside the meal's own nutrition panel

Reached **two ways, both already on the screen doing nothing**: the meal's **name**
(`BREAKFAST` was inert text) and its **subtotal line** (an inert div under the meal's
rows). Neither is a new control, which is why **the meal header keeps its five ways in and
gains no sixth** — ADR-0059's header is untouched.

**The name is the door that always works.** An empty meal has no subtotal line at all, so
the figures cannot be the only way in. The name is primary and the figures are the
convenience.

**The panel is literally the Full-day panel one scale down**, not a lookalike:
`views/food/NutritionPanel.svelte` and `NutritionPanelCell.svelte` are rendered by both
surfaces. That extraction has already landed (`312011d`) and is not throwaway.

### 2. The meal panel drops five whole-day readings, on one argument

Every omission is the same argument — **these are readings of a day, not of a meal**:

- **Targets and fill bars.** A bar filling toward a _daily_ figure would read as a meal
  falling short of a day, which is not a shortfall. `showTarget` is the single axis
  separating the two callers of the shared cell.
- **Biggest gaps** ranks what the day is short of, and one meal is short of nearly
  everything by construction, so the strip would say nothing every time.
- **Limits** and **Not tracked**, both whole-day readings against a cap.
- **Nutrients the meal does not carry.** The day panel prints absent ones as `—` because a
  day is a thing you are trying to fill and a gap is the news. Forty cards reading `0 µg`
  say only that most foods are not most nutrients.

### 3. The panel turns into the code, and a minted code has no way back

The way out is a control **beside the meal's name in the panel header**, and **there is no
footer**. A dock under the sections would make handing the meal over the panel's purpose,
and the panel's purpose is the meal.

The panel does not open a second surface to send: **it turns into the code and back**.
**Once a code is minted there is no back button** — the code is live and the other person
is being handed it, so an affordance that looks like undo would be one. Closing is the only
way out, and closing cancels, which is one of ADR-0072 §6's burn conditions.

The sender's screen has exactly **two states worth designing**: showing a code and waiting,
and done. Measured, the shape is gather (155 ms), post, show the code, then wait for a
human (10.4 s in the run), after which everything completes in 79 ms. There is no
meaningful intermediate to animate, and no progress bar that depends on meal size, because
the code does not grow with the meal.

### 4. Receiving has no door: a link you opened, or the scanner you already have

**No inbox surface, no receive control, no count.** A meal reaches you two ways and only
two:

1. **You open a link.** §8 is what that does.
2. **You point the barcode scanner at their code** and it turns out not to be a barcode.
   **The Scan way in reads a meal code as well as a barcode**, which routes the same-room
   case through an existing way in rather than a new one.

Both land you **on the meal itself, deciding, with nothing in front of it**. That is the
receive-side equivalent of what §1 does for sending: the surface is the thing, not a lobby
in front of it.

### 5. Nobody is ever notified, and a badge cannot pretend otherwise

**This is the finding that produced the whole shape.** ADR-0072 §5 forbids a device
listening for a send it was not asked for, so the only notification that can exist comes
from the messenger the link arrived in, never from Inventoria.

**A count badge on a receive control can therefore only ever be non-zero after a receive
the user started themselves.** It looks like a notification and structurally cannot be one
— an affordance that lies about what it means. Once the badge goes, the standing receive
control has almost nothing left to justify a header slot; once that goes, there is no inbox
screen to reach. §4 is what is left.

### 6. Refusals get one line, with the cause behind a disclosure

Three wordings were built and compared — one line, four groups, and all nine in their own
words. **One line wins, plus the technical cause behind a "show why".** With no inbox there
is no list to explain a missing row in, and the refusal is read by someone standing in
front of the person who sent it, who needs to know it did not work rather than which of
ADR-0073 §8's seven clauses fired.

**The seal refusal is the exception and keeps its own sentence** — _"This did not come from
the code you scanned"_ — because "someone else answered" is different news from "this is
malformed".

### 7. The way out writes a date, never a weekday

`dayLabel` writes "Today" and "Tuesday", which is right where the app is talking to you
about your own week: the past-meal picker exists to help you find last Tuesday's dinner. It
is wrong the moment a second person is looking at the screen, because "Tuesday" names
nothing across two devices and "Today" is a claim about whose day. A send screen has both
problems at once.

**The ways in keep `dayLabel`; the way out gets a written date**, one format constant in
one place.

### 8. The receive link is a fragment read at boot on `/`, and never a route

The code's second carrier is a link, because two people in different cities cannot show
each other a screen. Its shape is **`https://<origin>/#r=<room>&k=<key>`** — the secret in
the **fragment**, never a query parameter, so it reaches no server by construction. The
same link is what the QR encodes, so there is one code shape with two carriers.

**The fragment survives everything HTTP specifies.** RFC 9110 §7.1 excludes it from the
target URI; Fetch §4.5 makes a fragmentless `Location` inherit the request's, which matters
because `GET /index.html` on the live site is a live **307 to `/`**; Workbox's
`NavigationRoute` matches on pathname and search only and returns a cached response rather
than a redirect; and Referrer Policy §8.4 nulls the fragment onward. It can only die
**outside** HTTP: a messenger's client-side link wrapper, linkification stopping at `#`, or
a `replaceState` that drops it — which `ItemImportPanel.svelte:30` already does today.

**It is read at boot on `/`, not on a `/receive` route.** This app has no router:
`App.svelte` switches a `Tab` in component state, and the only shipped URL reads are the
Share Target's `?url=`/`?text=` and `?mem=1`. `/` is a precached asset served 200 with
COOP and COEP, works before any service worker exists, needs no Cloudflare change, and
survives [ADR-0069](0069-a-shell-that-cannot-start-replaces-itself-once.md)'s recovery
reload.

Two behaviours are **forced rather than chosen**:

- **Read once, then `replaceState` the URL clean.** ADR-0072 §6 burns the code, so a reload
  must not read as a retry.
- **Parse after mount, inside a `try`.** ADR-0069's guard treats a module-scope throw as
  "cannot start" and wipes the service worker and every cache.

### 9. The receive page is served by the asset router, never by the Worker script

**The service worker needs no change.** `vite-plugin-pwa`'s default
`navigateFallback: "index.html"` with `allowlist=[/./]` already resolves every navigation
on the origin to the precached shell, online or offline, and has since the plugin was
added. The #125 offline gate passes unchanged. Two ways to break it, both avoidable:
throwing at module scope, and giving receive its own HTML entry, which the gate hardcodes
past and would never see.

**The deploy is where this could have broken.** `GET /receive` on the live site returns
**404 `text/plain` from the Worker with no `cross-origin-*` headers**, because
`not_found_handling` defaults to `"none"` and the request falls through to the script. And
`_headers` is **not applied to Worker-generated responses**, so a Worker-served receive page
would run without cross-origin isolation → no `SharedArrayBuffer` →
`sqlite3_vfs_find("opfs")` fails → **an in-memory database**.

> **The rule: the receive page is served by the asset router, never by the script.**

§8's fragment-on-`/` shape satisfies it with no config change at all, which is most of why
it was chosen. The rule is written down anyway, because `vite`'s `appType: 'spa'` falls
back to `index.html` in both `pnpm dev` and `pnpm preview`, so **the entire Playwright suite
would pass over this hole.**

**Cold start is not a constraint**, per ADR-0073 §10: 0 pre-mount requests, everything
precached, and SQLite off the mount path.

**The service worker must not log request URLs.** The specs allow a fragment to surface on
`FetchEvent.request.url`, and rather than test which engines do, the rule forbids the
logging — the same shape as ADR-0072 §9's `console.*` gate.

### 10. Person-to-person sending is out of scope on iOS, in both directions

Not a limitation to record and work around: a **scope boundary**. iPhone and iPad get no
send control and no working receive, and the app **refuses rather than degrades**.

**Why the link cannot be made to land.** A Home Screen web app's storage is a different jar
from Safari's _by Apple's stated design_ (WebKit Bugzilla **181849**, NEW since 2018: _"Home
Screen apps are created as isolated entities without shared state with the browser"_), and
link capturing does not exist in WebKit at all (WebKit Bugzilla **318623**, NEW, filed
2026-07-05), with no manifest member — `launch_handler`, `handle_links`, `capture_links`,
`url_handlers` — shipped on any _mobile_ browser. So an iOS receive link boots a **second
install with an empty ledger**, a fresh `device_id` and an HLC from zero, and the app
renders, accepts, re-mints, writes the arrival mark, and puts the meal somewhere the Home
Screen icon can never reach. iOS 26's undocumented `webapp://` scheme worked in the June
2025 beta and failed in April 2026, and iOS 26 also made every Home Screen add open as a
web app by default, so **the affected population grows rather than shrinks**.

**Why the boundary takes all four cases, not one.** Sending works on iOS; a non-installed
link receive works; an installed same-room receive is plausible and was never verified;
only the installed remote receive is broken. Two working cases and one unverified one are
given up to avoid one broken one, because **partial support on a platform nobody here can
test is worse than no support** — a platform supported in three-quarters of its cases is a
platform whose users are told the feature works, and the quarter that fails is the one that
loses data quietly.

**Why detection cannot rescue the narrower boundary.** A refusal keyed on the wrong-jar
case is not constructible: a genuine first-time iOS user in Safari also has an empty
Ledger, and the common install path — browse in Safari, _then_ Add to Home Screen — leaves
Safari's jar holding a **stale, non-empty** Ledger, so the heuristic fails in the dangerous
direction. No API reports that an install exists. The failure is loud when the Ledger was
built inside the Home Screen app and **silent** for the stale jar, and it is the silent
sub-case that carries the harm.

**What the two sides do:**

- **Send: the control is absent.** `CONTEXT.md`'s **Way in** entry carries the precedent —
  _a way in whose sheet could only disappoint is absent rather than disabled_ — and this is
  its mirror. An iPhone user never sees the way out of the meal's panel and never learns
  the feature exists. A control that exists only to refuse is a control a person tries
  again every month.
- **Receive: the surface speaks**, in §6's voice. The asymmetry is deliberate: a person
  reaches the receive surface by tapping a link somebody sent them, so silence there reads
  as a broken app rather than an absent feature.
- **The refusal precedes joining the room.** Forced rather than chosen: a refusing page that
  had already opened a socket would burn one of ADR-0072 §11.1's two and fail the send for
  a reason the sender cannot see. **Nothing on the receive path may touch the relay before
  the platform test has run.**

**The Ledger export is not offered on the iOS receive surface.** Offering it would teach a
person a five-step workaround for a feature just declared unsupported, on the surface where
they were told no. A refusal that proposes a way round is not a refusal. **ADR-0072 §14's
inline export on the _sender's_ failure surface is untouched** — that is a different screen,
on a different device, for a failure the sender cannot diagnose, and an Android sender whose
iOS recipient refuses will time out at five minutes and be offered the export, correctly.
This paragraph is the boundary between the two rules and they must not be merged.

**The sender learns nothing new.** Platform is a property of the _recipient's_ device, and
a sender-side hint would require learning it — precisely what ADR-0072 §7 was built not to
do. The recipient's device closes the hole at the only end that holds the facts, so
"delivered" stays honest: a refusing receiver never joins the room, so **no send into an
iOS device ever reports delivery.**

### 11. Detection is a sniff, on purpose, and it fails closed

`navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1`, plus the ordinary
`iPhone`/`iPod` match. The trap is the iPad: since iPadOS 13 it requests the desktop site by
default and reports `Macintosh`, indistinguishable from a Mac by user agent alone. Every
browser on iOS is WebKit, so Chrome and Firefox on an iPhone are the same case and need no
separate handling.

**When the test is unsure it refuses.** A test that allows when unsure hands the quiet
wrong-jar write back on exactly the device it cannot see. The cost is a Mac with a touch
screen losing a feature that would have worked — rare, and loud rather than quiet.

**This is a sniff and it is a sniff deliberately**, said here so nobody later replaces it
with a feature test that does not exist.

### 12. The refusals, recorded so nobody later "fixes" them

1. **No inbox screen, no standing receive control, no count badge.** §5.
2. **No back button on a minted code.** §3.
3. **No `/receive` route**, and no service-worker change. §8, §9.
4. **No human-asked fork on iOS.** A receive page asking _"is Inventoria on your Home
   Screen?"_ would have got the one fact no API gives, at one tap. Refused because it makes
   the app carry a question about a platform it does not support, and because a fork that
   continues on "no" keeps two of the four cases alive and re-creates the partial support
   §10 rejected.
5. **No paste door.** Paste was made a full addressing mode, then replaced by the link, then
   dropped without ever being refused. The clipboard is **not** partitioned, so pasting a
   code into the installed iOS app would have crossed the boundary trivially. It is refused
   **with the platform**, not on its merits — recorded because a later reader will find the
   earlier decision and think it was forgotten.
6. **No QR image through a messenger.** The iOS Scan tab is already a photo picker, so an
   image saved from a messenger and picked in the installed app would also have crossed the
   partition, reusing an existing door. Same reason as (5).
7. **No detection-based partial support on iOS.** Refuted rather than rejected: §10 shows
   the signal does not exist.
8. **No Ledger export on the iOS receive surface**, and **no sender-side platform hint.**
   §10.
9. **No service-worker request-URL logging.** §9.

## Consequences

**iOS is out of scope for this feature, and the map's floor-platform premise does not
survive.** "iOS is the floor platform" is still true of the app; it is **no longer true of
person-to-person sending**, and a later reader must not assume the premise carried through
to the last record. Three things would reopen the boundary — WebKit 181849 moving off NEW
with Home Screen apps sharing Safari's storage, WebKit 318623 shipping link capturing that
reaches Home Screen apps, or an iPhone becoming available to test with _and_ a deliberate
redrawing to the intersection case. None is a reason to leave a hook in the code now.

**The scanner is now the only same-room door**, which raises the stakes on what it can
read. On iOS this would have mattered a great deal and does not, because iOS is out: there
the Scan way in has never been a live camera at all — `BarcodeDetector` is a WebKit feature
flag off by default, so the tab takes the desktop upload path. That is filed separately as
an ordinary defect in barcode scanning.

**Accepting a meal can displace the recipient's own Recent suggestions**, per ADR-0073 §11.
The accept surface does not say so; it was weighed and left alone rather than overlooked.

**Three shipped-panel defects the extraction exposed are already fixed**, all latent in the
day panel and surfaced by putting a full-bleed band directly under the header: the header
division is ink rather than the pale border, the card clips to its padding box, and the
panel's scrollbar is hidden so its bands reach the frame.

**A receive link that half-opens must never read as a retry.** §8's read-once-then-clean
rule is the whole of that guarantee, and it is the one place where a routing detail is
load-bearing on a security property rather than on convenience.

## Amendment (2026-08-30): §10's detection premise is refuted, and the boundary is under review

**The app will always be installed on iOS.** That is a deployment assumption rather than
an API, and it was not available when §10 was written. It refutes the argument that made
the boundary total, so §10 must not be implemented as written until
[Does an always-installed iOS change the boundary?](https://github.com/palebluebytes/inventoria/issues/255)
closes.

**What is refuted.** §10 rests on detection being impossible: a first-time Safari user is
also empty, the browse-then-install path leaves a stale and non-empty Safari jar, and no
API reports that an install exists. But the page **can** always know one thing — that _it_
is not the installed copy, from `navigator.standalone` and `display-mode`. Hold the
assumption above and those two facts compose: **a receive page in an iOS Safari tab knows
with certainty both that it is in the wrong jar and that a reachable installed copy
exists.** That is the fact §10 said nothing could supply.

**What that revives.** §12.5 and §12.6 refused **paste** and **a QR image through a
messenger** _with the platform rather than on their merits_, and both were recorded that
way precisely so this moment would not read as an oversight. Both cross the storage
partition: the clipboard is not partitioned, and the iOS Scan way in is already a photo
picker. So the shape now available is not partial support but a **complete remote path
that hands the code to a door that already exists** — the Safari page refusing to accept
the meal itself and passing the code to the installed app instead.

**What is not refuted, and must not be quietly dropped:**

- The link still cannot reach an installed app's Ledger. WebKit **181849** and **318623**
  are unchanged, and the direct-landing shape stays dead.
- §12.4's _no detection-based partial support_ was refused on the signal not existing.
  The signal exists now, so that refusal needs **re-arguing rather than reversing** — the
  original objection was that a fork continuing on "no" keeps a broken case alive, and an
  assumption that iOS is always installed is not the same thing as an API that says so.
- §10's own reasoning that **partial support on a platform nobody here can test is worse
  than no support** is untouched, and [#209](https://github.com/palebluebytes/inventoria/issues/209)
  still records that nobody here can test it. Anything this reopens inherits that.
- The **one working receive case named in §10 disappears** under the same assumption:
  _not installed, via link, one jar_ never happens if the app is always installed. The
  assumption cuts both ways, and the ticket must price both.

**Status of the boundary until then:** stated, not withdrawn. [#237](https://github.com/palebluebytes/inventoria/issues/237)
is blocked so that nothing is built against a premise this record now knows to be false.

## Amendment (2026-09-01): #255 closed, and the boundary is one case rather than a platform

The 2026-08-30 Amendment above put §10 under review and blocked
[#237](https://github.com/palebluebytes/inventoria/issues/237) so that nothing would be
built against a premise this record knew to be false. That review is
[#255](https://github.com/palebluebytes/inventoria/issues/255), it has closed, and its
answer is
[ADR-0080](0080-a-safari-tab-on-ios-hands-the-code-to-the-app-it-is-not.md).

**§10 is not withdrawn. It shrinks.** What survives is one case: a remote link arriving
in an iOS Safari tab. Sending returns unconditionally, the same-room case returns, and
the remote case returns by way of a page that hands the code to the installed app
instead of accepting the meal itself. iPhone and iPad are in scope.

**What this record got right and keeps.** The link still cannot reach an installed app's
Ledger, and WebKit **181849** and **318623** are unchanged. _Nothing on the receive path
may touch the relay before the platform test has run_ survives its boundary and now has
a companion about OPFS. §11's sniff is unchanged and still fails closed, and ADR-0080 §6
adds a second test that fails closed in the same direction.

**What is corrected rather than shrunk.** The sentence that **no send into an iOS device
ever reports delivery** is false under ADR-0080 §3, and is struck. §12.4's refusal of a
human-asked fork is neither reversed nor re-argued: ADR-0080 §5 removes the fork, so
there is nothing left to refuse. §12.5's paste door is revived, on the merits it was
never refused on. §12.6's QR image through a messenger stays refused, now because it
moves a same-room mode into the remote row rather than because the platform is out.
§12.8's rule against a Ledger export on the iOS receive surface keeps its conclusion and
loses its reason, since that surface no longer refuses anything; the sentence forbidding
it to be merged with ADR-0072 §14's sender-side export still holds.

**What nobody should read into it.** This record's boundary was always person-to-person
only. [ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md)
carries no iOS clause and never did, and none of this reaches it.

**Still true, and now the binding constraint:** nobody here has an iOS device. §10's
reasoning that partial support on a platform nobody can test is worse than no support is
untouched, and ADR-0080 answers it by being safe while unverified rather than by
claiming verification. What is unverified is named in ADR-0080 §7, §10 and its
Consequences rather than assumed away.
