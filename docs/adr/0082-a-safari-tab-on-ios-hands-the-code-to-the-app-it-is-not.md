# ADR 0082: A Safari tab on iOS never accepts a meal, it hands the code to the app it is not

**Status:** Accepted  
**Date:** 2026-09-01  
**Amends:** [ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md) (§10's boundary shrinks from the whole platform to one case, §11 gains a second test, §12.4 dissolves, §12.5 is revived, §12.6 is refused on its own merits, and §12.8's export rule keeps its conclusion with a new reason)  
**Amends:** [ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) (§4's "no typed-code entry field, ever" is narrowed to the argument that produced it, and Paste returns to the addressing modes it was never refused from)
**Implemented:** #292 `87f5dcd`, `0b201ac`, `b27d88c`, `ce22b05`, `eab8576`, `d7835e4` — §2, §6, §8 and §9 as `src/lib/p2p/safari-tab.ts`, `takeCodeHandover` in `src/lib/p2p/receive-link.ts`, `src/lib/views/food/CodeHandover.svelte` and the boot-order gate above `dbClient.init`, which #313 moved to `src/Rations.svelte`; §4, §12 and §13 as `src/lib/p2p/pasted-link.ts` and `src/lib/views/food/MealLinkField.svelte`, mounted on the Scan way in by `src/lib/views/food/FoodStager.svelte`; §11.8's replaced reason in `src/lib/p2p/send-words.ts`. §3 needs no code: the way out never grew a platform branch. §7 stays empirically unrun, and the device half of §6 is [#287](https://github.com/palebluebytes/inventoria/issues/287). §14's rule fired at [#313](https://github.com/palebluebytes/inventoria/issues/313): the page now names **Rations**, read off the roster in `src/lib/views/food/CodeHandover.svelte`, and the scope §14 filed separately is settled by [ADR-0084](0084-a-hand-off-belongs-to-the-facet-that-owns-what-it-carries.md) §5

## Context

This record amends [ADR-0074](0074-sending-is-the-meals-own-numbers-and-receiving-has-no-door.md)
and amends [ADR-0072](0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md).
The trailer above names what moved in each; the sections below argue it. Either
placement creates the backlink obligation `docs:check` enforces, which is why both
records name this one in their own headers. A header-only declaration went
unchecked until [#261](https://github.com/palebluebytes/inventoria/issues/261),
fixed while this record was being written, and the duplication here predates the
fix rather than working around it.

ADR-0074 §10 put iPhone and iPad out of scope for person-to-person sending in both
directions, and its 2026-08-30 Amendment recorded that the argument which made the
boundary total no longer holds. [#255](https://github.com/palebluebytes/inventoria/issues/255)
is where that was settled. This record is its answer.

### The fact that reopened it, and the shape of what it can carry

§10 rested on detection being impossible: a first-time Safari user is also empty, the
browse-then-install path leaves a stale and non-empty Safari jar, and no API reports
that an install exists. The last of those is still true and will stay true. The first
two stop mattering, because the page can always know one thing with certainty: **that
it is not the installed copy.**

That is a strictly weaker fact than "an installed copy exists", and the whole of this
record's design follows from refusing to close the gap between them. §5 is where that
refusal is spent.

### The deployment expectation that prompted this, and does not hold it up

**The app is expected to always be installed on iOS.** That is a deployment
expectation with no enforcement behind it, and it is recorded here in Context rather
than in the Decision on purpose: it is why anyone looked again, and **the shape below
never consults it.** The page acts on what it can observe, hands the code over whether
or not an install exists, and gives the person who has not installed an instruction
rather than a dead end. A later reader who finds the expectation falsified will find
nothing in the Decision that has to be unpicked, and that outcome was chosen rather
than stumbled into.

### Scope

This record covers the iOS boundary and what replaces it, the addressing mode that
comes back with it, and the two tests that decide which path a page takes. It does not
reopen the wire (ADR-0072 §§1 to 3, 5 to 15), the payload
([ADR-0073](0073-a-sent-meal-is-a-narrowed-closure-that-lands-re-minted.md),
[ADR-0081](0081-a-meals-closure-is-bounded-by-kind-not-by-reachability-alone.md)), or
the surfaces ADR-0074 §§1 to 9 settle.

**The own-device half is untouched, and this is said because it will otherwise be
assumed.** [ADR-0075](0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md)
carries no iOS clause of any kind. §10's boundary was always person-to-person only, so
nothing here reaches convergence between your own devices.

Research: the two fact-finds this record rests on are summarised at §4 and §6 with
their primary sources. Neither produced a note under `docs/research/`, because both
answered inside a day and their conclusions are short enough to carry here.

## Decision

### 1. The boundary is one case, not a platform

iOS is back in scope. What is left of §10 is a single case: **a remote link arriving in
an iOS Safari tab.** The four cases and what each does:

| Case                                      | What happens                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **Sending, any recipient**                | Works. §3.                                                                                              |
| **Receiving, same room, installed**       | The Scan way in reads the code inside the app. No partition is approached. §7 names what is unverified. |
| **Receiving, remote link, installed**     | Safari cannot write to the app's jar, so it does not try. It hands the code over. §2.                   |
| **Receiving, remote link, not installed** | The same page, word for word. §5.                                                                       |

**Android and desktop are untouched and never take this path.** A WebAPK is a stub that
launches the host browser named in its `runtimeHost` meta-data, and the content renders
in Chrome's own `WebappActivity`, whose profile provider returns
`ProfileManager.getLastUsedRegularProfile()`. Same `Profile`, same `StoragePartition`,
same jar as a tab. There is no wrong-jar case on Android to defend against, and
inventing a handover there would be an obstacle built for nothing.

### 2. A Safari tab on iOS never accepts a meal. It shows the code and says where to put it.

The receive surface, under the tests in §6, does not render the meal and does not
decide anything about it. It shows the code, a control that copies it, and two
sentences: open the app and paste this into Scan, and, if you have not installed it
yet, add it to the Home Screen first and come back.

**It is one page with one wording and no branch.** That is not an economy, it is the
whole mechanism, and §5 is why.

**Three things it does not do**, each forced by a rule that already exists:

- **It joins no room.** ADR-0074 §10 fixed this and the reason survives its boundary:
  a page that had opened a socket would burn one of ADR-0072 §11.1's two and fail the
  send for a reason the sender cannot see. _Nothing on the receive path may touch the
  relay before the platform test has run._
- **It opens no ledger and asks for no persistence.** §8.
- **It cleans the URL.** §9.

It does read the code locally before saying anything, because `readSendCode` is pure
and touches nothing, and a truncated link should be refused where it is read rather
than after a person has carried it into another app. A refusal here is ADR-0074 §6's
one line with the cause behind a disclosure, unchanged.

### 3. Sending comes back, unconditionally, with no iOS behaviour of its own

§10 removed the way out of the meal's panel on iOS **only** to avoid supporting a
platform in some of its cases and not others. Nothing about sending touches the storage
partition: an iOS sender mints a code, opens a socket, seals and posts, and every one
of those is platform-neutral. Its recipient is frequently an Android phone, where the
send never had a problem at all.

**The control is present on iOS exactly as it is everywhere else.** `CONTEXT.md`'s _a
way in whose sheet could only disappoint is absent rather than disabled_ no longer
applies here, because the sheet no longer only disappoints.

The sender still learns delivery and never acceptance (ADR-0072 §7), still learns
nothing about the recipient's platform (ADR-0072 §7 again, and §10's own reasoning),
and still gets ADR-0072 §14's inline export when the relay is unreachable. **§10's
sentence that no send into an iOS device ever reports delivery is now false and is
struck**: a send into an iOS device reports delivery when the meal is delivered, which
is what the sender needed it to mean all along.

### 4. Paste is the carrier, and it is refused nothing it was ever refused on

ADR-0074 §12.5 recorded that Paste had been made a full addressing mode, then replaced
by the link, then dropped **without ever being refused** on its own terms. It is
restored, and the platform fact it was waiting on is settled from source.

**The pasteboard is not partitioned the way storage is.** WebKit's iOS platform
pasteboard is constructed from `[UIPasteboard generalPasteboard]`, with no branch on
app identity, bundle id, data store, or standalone mode; the only non-general path is
the drag-and-drop singleton. Apple documents `UIPasteboard.general` as the systemwide
pasteboard shared between apps, and the partitioned alternative (named pasteboards,
scoped by Team ID) exists and WebKit does not use it. There is no WebKit bug describing
a pasteboard partition for Home Screen web apps.

**Manual paste is the mechanism, and it is the one that is settled.**
`LocalFrame::requestDOMPasteAccess` grants access immediately on
`editor().isPastingFromMenuOrKeyBinding()`, before any client callback, prompt or
origin check, and the Clipboard API spec puts a user-agent Paste menu entry outside its
permission model. The **programmatic** read is gated three ways and carries two
residuals no public source can close: whether WebKit's own Paste callout counts as
UIKit "user intent", and whether the same-origin auto-grant survives the crossing.
**The design uses the ungated path and does not call `navigator.clipboard.readText()`
at all.** Verified 2026-09-01 against WebKit `main`, Apple's UIKit documentation, and
the W3C Clipboard API draft.

### 5. One page for two readers, because telling them apart is the thing that cannot be done

ADR-0074 §12.4 refused a human-asked fork, on the grounds that a fork continuing on
"no" keeps a broken case alive and re-creates the partial support §10 rejected. **That
refusal is not reversed and it is not re-argued. It dissolves, because there is no
longer a fork to refuse.**

The page never establishes whether an install exists. It shows the same thing to
someone who has the app and to someone who does not, and the second sentence of its
wording is addressed to a reader it has not identified, which is why it costs nothing
when it is unnecessary. There is no question, no branch, and no "no" to continue on.

**What this gives up, stated rather than absorbed.** §10 named one working iOS receive
case: _not installed, via link, one jar_. That person could previously accept a meal
into Safari and use it. They now cannot, on any device the tests in §6 catch. The
exchange is deliberate and it is not neutral:

- They lose a working path and gain an instruction. The cost is loud, immediate, and
  on screen.
- What they lose was a meal written into a jar they would abandon the moment they
  installed the app, which is the outcome the whole of §10 exists to prevent one step
  later.
- The alternative costs more. Accepting when unsure reinstates the silent wrong-jar
  write; asking reinstates the fork.

**This is the price of not needing the deployment expectation in Context**, and it is
the reason the design is correct whether that expectation holds or not.

### 6. Two tests, both failing closed toward handing over

Two separate facts are needed and they come from different signals.

1. **Is this WebKit on iOS?** ADR-0074 §11's sniff, unchanged:
   `navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1`, plus the
   ordinary `iPhone`/`iPod` match. It fails closed toward "yes".
2. **Am I the installed copy?** `navigator.standalone === true`, and nothing else.
   Anything falsy, absent, or thrown reads as **not installed**.

**Handing over requires both. Receiving normally requires either to be false.** An
unknown WebKit build hands over rather than accepting, which is the same direction §11
already fails in, so this is one rule stated about two facts rather than two rules.

`navigator.standalone` is settled to the line: `Navigator::standalone()` returns
`frame->settings().standalone()`, and the `Standalone` preference is embedder-set with
a default of `false` across WebKitLegacy, WebKit and WebCore. So a Safari tab reports
`false` rather than `undefined`, and the property exists on every Cocoa port rather
than iOS alone, which is why the platform sniff is still needed and cannot be replaced
by the presence of the property.

**`display-mode` was considered and is refused**, and this is written down because it
is the obvious thing for a later reader to add. WebKit has supported the media feature
since 2017, and every compat table that says otherwise is wrong. But WebKit evaluates
it against **the declared manifest applied to the frame**, not against the presentation
the spec asks about, and `m_applicationManifest` is set once from `PageConfiguration`
and never updated by parsing `<link rel="manifest">`. Safari 17 also ships installs for
sites carrying no manifest at all, and such an install reports `browser`. Requiring
both signals to agree would therefore let the **installed** app read itself as not
installed and hand the code to itself, forever. A second signal that can only turn a
correct accept into a loop is not corroboration.

**There is no third test, and there will not be one.** Nothing exposes whether an
install exists, and that is a position rather than a gap: WebKit's own answer on the
canonical spec issue is that Safari web apps are fully isolated, and that for a site in
a browser to know a web app is installed would break Safari's privacy model. A design
that waits for that signal waits permanently.

### 7. The same-room case has nothing structural in its way, and one unverified read

Both apps are installed, the code is shown on one screen and read from the other, and
nothing approaches the storage partition. This case needs no handover and gets none.

**It is not thereby verified.** On iOS the Scan way in is a photo picker rather than a
live camera, so the code is decoded by `zxing-wasm` from a still, and that read has been
confirmed on Chromium only.
[#209](https://github.com/palebluebytes/inventoria/issues/209) owns that check and is
reopened for it. The case is recorded here as **structurally clear and empirically
unrun**, which is the honest state of it.

**The dependency on [#228](https://github.com/palebluebytes/inventoria/issues/228) runs
the other way from how it first appeared.** If #228 is resolved by registering the
ponyfill as a global `BarcodeDetector`, iOS gains a live camera and this case gets
faster. Nothing in this record breaks. That is only true because §12.6 is refused
below; a design that had leant on the photo picker would have been holding a defect
open.

### 8. Nothing on the receive path may touch OPFS before the platform test has run

A companion to §2's relay rule, and the same shape of obligation about a different
resource.

Today `App.svelte` calls `dbClient.init("/inventoria.db")` **synchronously at component
initialisation**, before `onMount` and therefore before the receive link is read at all.
`onMount` then calls `ensurePersistentStorage()`. So a link opened in an iOS Safari tab
would open a database in Safari's jar and ask the browser to keep it durably, before
any test could run.

> **The page must not ask the browser to durably keep a jar it is in the middle of
> telling you is not yours.**

That sentence is the whole justification. The empty database is untidy; the persistence
request is the thing that is wrong, because a stale non-empty Safari jar is precisely
the dangerous case §10 named, and this would be the app creating one and pinning it.

The gate is affordable: both tests in §6 are synchronous property reads, so `init` can
be skipped ahead of it, and skipping is safe because a page in this state mounts no view
that subscribes to a ledger store, which is the invariant the synchronous kick-off
exists to protect.

**This was already true under §10 as written** and is not a fault this record
introduces: a page that refused on sight still opened the database first.

### 9. The URL is cleaned here too, on one rule rather than one rule with an exception

ADR-0074 §8's read-once-then-`replaceState` rule is stated with one reason, that a
reload must not read as a retry. On this page there is nothing to retry, because it
never joins a room and never spends a code, so the reason does not reach it.

**It cleans the URL anyway.** ADR-0074's own Consequences call §8 _the one place where a
routing detail is load-bearing on a security property_, and that is not a rule to grow a
branch in. The address bar is also where a secret gets screenshotted, enters history and
renders in the tab switcher, and §2's copy control makes it unnecessary.

**A reload is cheap, and this is recorded because the rule reads alarming here and is
not.** The link is still sitting in the messenger it arrived in, so a reload that loses
the code costs one tap to recover, against a room that is still live.

### 10. The five minutes do not move, and this is a judgement rather than a measurement

ADR-0072 §6's fourth burn condition and §11.4's room lifetime are deliberately one clock
and one number. The path in §2 inserts a copy, an app switch and a paste between the
link arriving and the room being joined.

**Five minutes stands.** The remote case has always had a human leg in it, and that leg
was always the dominant term: the sender messages the link, the recipient notices it,
reads it and taps it. Moving the number means moving a burn condition and a room
lifetime together, to buy headroom against a term that was never the binding one.

**No countdown is shown, and one is not constructible.** The code carries a room and a
key and no timestamp, so the page cannot know when the room opened. A live timer would
be inventing a figure.

**Stated plainly: this is not measured.** There is no device
([#209](https://github.com/palebluebytes/inventoria/issues/209),
[#287](https://github.com/palebluebytes/inventoria/issues/287)), so it cannot be. It
joins the roster of things to time when a handset exists, and until then it is a
judgement and is labelled as one.

### 11. The refusals, restated with the ones that moved

ADR-0074 §12's list, as it now stands. Numbering follows the original so the two can be
read side by side.

1. **No inbox screen, no standing receive control, no count badge.** Unchanged.
2. **No back button on a minted code.** Unchanged.
3. **No `/receive` route**, and no service-worker change. Unchanged, and §2's page is
   the same fragment on the same `/`.
4. **No human-asked fork on iOS.** **Dissolved rather than reversed.** §5: the page asks
   nothing and branches nowhere, so there is no fork left to refuse.
5. **No paste door.** **Revived.** §4. It was refused with the platform and never on its
   merits, and the platform fact it waited on is settled.
6. **No QR image through a messenger.** **Still refused, now on its own merits.** ADR-0072
   §4's table divides the modes by room: Scan is a QR on the other person's screen, Paste
   is a link through a messenger the two people already share. **A QR routed through a
   messenger is a same-room mode moved into the remote row**, and the remote row already
   has a carrier. It is the link case wearing a QR's clothes. Two supporting reasons: it
   is five steps against two, and it would have coupled the design to #228 staying
   unfixed (§7).
7. **No detection-based partial support on iOS.** **Refuted differently.** §10 held the
   signal did not exist; the mode signal does exist and the install-existence signal does
   not, and §5 and §6 are built on exactly that asymmetry.
8. **No Ledger export on the iOS receive surface**, and **no sender-side platform hint.**
   **The conclusion stands, the reason is replaced.** §10 refused it because a refusal
   that proposes a way round is not a refusal, and §2's page refuses nothing. The reason
   now is that **the surface has a working path, and a second route offered beside a
   working one reads as doubt about the first** — the person would be left choosing
   between pasting a code and asking the sender to start again with a file. **ADR-0072
   §14's inline export on the _sender's_ failure surface remains untouched**, on a
   different screen, on a different device, for a failure the sender cannot diagnose.
   §10 wrote that these two rules must not be merged. They are still not merged, and this
   clause is where that survives.
9. **No service-worker request-URL logging.** Unchanged.
10. **No `navigator.clipboard.readText()`.** New. §4: the programmatic path is gated and
    carries two residuals no source can close, and the manual path is settled. The design
    takes the settled one.
11. **No `display-mode` in the install test.** New. §6.
12. **No countdown on the receive surface.** New. §10, and it is not constructible anyway.

### 12. ADR-0072 §4's typed-field sentence is narrowed to the argument that produced it

§4 refuses speaking a code aloud, on entropy: the mode that decides the bar is the
weakest one, so there is no weakest one. It then says **"There is no read-it-out-over-the-phone
flow, and no typed-code entry field, ever."**

That sentence overreached its own paragraph. §4's table lists **Paste at 128+ bits** as
one of the two sanctioned addressing modes, so the record both endorses paste and
forbids the only surface paste can land on.

> **Narrowed: no code a human is expected to reproduce.** Not spoken, not read out over
> a phone, not transcribed from another screen.

A field that accepts a pasted link is not that, because nothing about it is sized to
what a person can hold in their head. The bar stays on the code's **content** rather
than on how the characters arrived, which is the only form of the rule a browser can
enforce: the field accepts a full link shape only, `readSendCode` refuses anything that
is not a URL carrying both halves with an exactly-32-byte key, and there is no
placeholder inviting anyone to type.

### 13. The paste lands on the Scan way in, on every platform

ADR-0074 §4 gives receiving two doors and §5 killed the standing receive control. A
pasted code is neither a boot URL nor something a camera saw, so it needs somewhere.

**It joins the Scan way in.** That door already accepts a code that turns out not to be
a barcode, and on iOS it is already a picker rather than a camera. This keeps ADR-0074
§4's claim literally true: receiving still has **no door of its own**, it borrows one.

**On every platform, not iOS alone.** [ADR-0078](0078-a-facet-contains-no-way-out.md)'s
reasoning about one behaviour installed or in a tab applies: a platform conditional is
two behaviours to build, test and explain, and what it would save is a text field. It
also restores ADR-0072 §4's table to what it always said. On Android the link already
lands in the installed app, so the field is redundant there; redundant is not a reason
to make it conditional.

### 14. This record names a Facet, and the name follows the map

The destination in §2's wording is **Inventoria**, because that is what exists today.

[#267](https://github.com/palebluebytes/inventoria/issues/267)'s map makes the food
screen a separately installable Facet, and if it lands the meal lives in **Rations**,
which is what the wording must then name. **The rule is that the name follows the Facet
that holds the meal**, so that becomes a one-line change rather than a hidden assumption
somebody has to find.

**Which scope mints the link is not settled here.** `sendCodeLink` builds
`https://<origin>/#r=…&k=…` at `/`, the root's scope, and whether a Facet world wants
that at `/food/` is a question about which scope owns the link. It belongs to the map,
not to this record, and it is filed separately.

## Consequences

**iOS is in scope for person-to-person sending, and the map's floor-platform premise is
restored in part.** ADR-0074's Consequences said the premise did not survive to the last
record. It survives to this one for sending, for the same-room case, and for the remote
case by way of §2. It does not survive for a link landing directly in an installed
app's ledger: WebKit **181849** and **318623** are unchanged, and that shape stays dead.

**Four things would change this record**, and none is a reason to leave a hook in the
code now:

1. WebKit 181849 moving off NEW with Home Screen apps sharing Safari's storage, which
   removes the case entirely.
2. WebKit 318623 shipping link capturing that reaches Home Screen apps, which removes
   the carrier problem.
3. A handset becoming available, which turns §7 and §10 from stated-unverified into
   measured.
4. The proposed CSS `application-context` media feature shipping. It is unmerged in
   both engines (w3c/manifest PR **1218**, WebKit bug **314609** with PR **65597** open),
   and it is worth naming only with its limit attached: it answers _am I the installed
   copy_, which §6 already answers, and **not** _does an install exist_, which is what
   §5 is built to avoid needing.

**The verification roster grows, and part of it cannot be automated.** A stubbed
`navigator` proves the branch and not the platform, which is the same hole ADR-0074 §9
flagged when it noted the Playwright suite would pass straight over the asset-router
rule. What a suite can hold: the handover path performs no `dbClient.init`, makes no
persistence request, opens no socket, and cleans the URL. What only a device can hold:
that `navigator.standalone` reports `true` inside a web clip, which every rule here now
rests on and which is an inference from a preference default rather than a measurement.

**The p2p arc's records are 0072 to 0075 and 0081 to 0082, and the number was wrong
twice before it was right.** The arc originally ran 0072 to 0076. The Facet arc had also
taken 0076, so this one moved to 0079 and 0080; its head branch then turned out to hold
0079 and 0080 as well, so it moved again to 0081 and 0082. The Facet arc keeps **0076 to
0080** and merges first, and 0076 to 0080 are absent from this branch until it does. The
README's no-gaps rule describes a merged history rather than a branch mid-flight.

**The lesson is not "check harder".** Sequential numbering assigns a shared name from a
value that only exists once everything has merged, so on a repo with several arcs open at
once every unmerged record is holding a number provisionally, whatever its author
believed. Checking which numbers were free was done, and was correct at the moment it was
run, and was stale within hours. Two things follow, and the second is the one that helps:
the record's number is settled by whoever merges **last**, and `docs:check` now refuses
two records that share a number, because `adrs` is keyed by that number and a collision
used to make one of the two vanish from every check in silence.

**Nothing here is built yet.** #255 produced a decision and these records.
[#237](https://github.com/palebluebytes/inventoria/issues/237) is rewritten rather than
unblocked: its send half is deleted by §3, its receive half is inverted by §2, and its
platform-sniff module survives verbatim with a different consequence hanging off it.

## Amendment (2026-09-02, #295): both arcs have merged, and the numbering note is spent

The Consequences paragraph on numbering describes a tree in which the Facet arc had not
landed. It has. `main` now carries 0072 to 0088 with no gap, so **"0076 to 0080 are
absent from this branch until it does" is false as written**, and "the Facet arc keeps
0076 to 0080 and merges first" is a fact about history rather than a plan. The paragraph
is left in place because what it was written for is unaffected: the arc did move twice,
the record's number is settled by whoever merges **last**, and `docs:check` refuses two
records that share a number.

**§13's ADR-0078 reference is a link now.** It was a bare name because the record it
points at sat on an unmerged branch, and a parenthetical said so. Both are gone:
[ADR-0078](0078-a-facet-contains-no-way-out.md) is now a relative link like every other
sibling reference, and the parenthetical was false the moment the file arrived. That is
also the first point at which any gate can see the reference, since the relative-link
walk only follows `](...)` and a bare name is invisible to it. The argument §13 takes
from that record is unchanged.

**"Nothing here is built yet" no longer holds either**, and the header already says so:
the `Implemented:` trailer names #292 and its six commits. It is recorded here so the
Consequences section is not read as current, and no section is edited for it.
