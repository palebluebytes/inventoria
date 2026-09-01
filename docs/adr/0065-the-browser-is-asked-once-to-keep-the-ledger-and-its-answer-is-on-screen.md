# ADR 0065: The browser is asked once to keep the ledger, and its answer is on screen

**Status:** Accepted  
**Date:** 2026-08-28  
**Implemented:** #180 `4b147a6` (the request and the readings), `5a089e1` (the Settings section), `39442ce` (one reader of the estimate), `4c37e27` (review fixes, including §2's split between the memoised request and the fresh reading); #290 `src/lib/views/storage/StorageStatus.svelte` (correction: §2's split was real **per mount**, and the Settings screen is never unmounted, so the reading described the moment the _app_ opened rather than the moment the screen did — it now re-reads on the root's active-tab signal). The decision is unamended; it was the implementation that missed it.

## Context

The ledger lives in OPFS, and OPFS is best-effort storage until something says
otherwise. The browser may evict it when the device runs short of disk, without a
prompt and without an action by the user. Nothing in the app had ever called
`navigator.storage.persist()`, which is the one call that moves an origin out of
that bucket.

The Developer Options survival test does not cover this. It writes a datom,
reloads the page and checks the datom is still there, which proves the database
outlives a refresh rather than exemption from eviction. Nothing on any screen
reported how much storage the site was holding either.

[ADR-0064](0064-the-ledger-leaves-as-raw-datoms-one-json-object-per-line.md)
gives the ledger a way out by hand. That is the answer to a lost device and to a
mis-tapped Wipe Database, and it is a poor answer to eviction, because eviction
happens to people who never thought to run an export. Durability in place and
durability by copy are different problems, and this record is the first.

## Decision

### 1. The request fires once, early, with no user gesture

`ensurePersistentStorage()` is called from the app's startup errands in
`App.svelte`, beside the corpus warm and the retired-secret sweep. It is not
awaited: the answer changes nothing about the load, and a storage decision is not
allowed to delay a screen.

It is not attached to a button, a first meal, or any other gesture. Chromium
decides from site engagement and installation without asking anyone, so a gesture
would buy nothing there. On a browser that does prompt, the prompt at first load
is the same prompt later, and hiding the request behind a control the user has to
find means the storage is best-effort until they find it.

### 2. `persisted()` is consulted before `persist()` is called

A grant already in place is never re-requested. The check is cheap, and asking
again for something already granted is the shape that turns into a prompt on
every load in a browser that prompts.

The promise is memoised at module scope. That is what enforces "at most once per
session": a second caller awaits the same promise rather than making a second
request, and a page load is the session boundary.

The **request** is memoised; the **reading** is not. `persisted()` asks for
nothing, so Settings waits for the startup request to settle and then reads the
current state rather than reporting the answer that request happened to get.
Chromium grants persistence on its own as a site is used more, which is the
behaviour §3 leans on, and a badge still showing a refusal from ten minutes ago
would be reporting the wrong thing.

### 3. A denial is reported and then left alone

A refusal is worth knowing about, so Settings states it. It is not worth acting
on, so nothing else happens: no prompt, no retry button, no banner, no feature
withheld. The browser is stating a policy rather than waiting to be asked more
politely, and Chromium in particular may grant later on its own as the site is
used more.

A denial is deliberately **not** remembered across sessions. Persisting a "we
already asked" flag would suppress exactly the request that would have succeeded
once engagement grew, and one call per page load is not a cost worth optimising.

### 4. The size readout is origin-wide, and says so

`navigator.storage.estimate()` answers for the whole origin: the ledger, the
bundled USDA corpus, the service worker precache and everything else cached for
the site, with no way to attribute a byte of it to any one of them. The Storage
section reports usage against quota and names what the number includes, rather
than letting a reader take it for the size of their ledger.

This record amends ADR-0064 §6 on one point. That record put the origin figure on
the export screen, where a heading about the ledger invites precisely the reading
the sentence underneath it then has to deny. The figure moves up to the Storage
section, in the same card and above the export, and the export keeps the one
number that is genuinely about the ledger: how many datoms are in it.

The estimate still refuses nothing. ADR-0064 §6 ruled that the fallback ceiling
is measured on bytes actually written, because an estimate that includes the food
bundle would refuse ledgers that fit. Nothing here revives that check.

### 5. The persistence state is not a datom

It is a property of one browser profile, not a fact about the person using the
app. Written to the ledger it would sync to a device where it is false, and the
ledger cannot take a fact back. So it is read from the browser at the moment it
is shown and stored nowhere.

### 6. An absent StorageManager is a third state, not a failure

`navigator.storage` is missing under the Node unit runner, and a browser can
offer half of it: Safari shipped `estimate()` years before `persist()`. The DOM
types declare all three methods as present, so presence is checked rather than
trusted, and a call that throws is treated the same as one that was never
available.

That case is `unknown`, alongside the Storage standard's own `persisted` and
`best-effort`. It is not `best-effort` in disguise, because the app was told
nothing and has nothing to report. The Settings section renders no persistence
line, renders no size line without figures, and disappears entirely when the
browser answers neither.

### 7. The screen says this is not a backup

Persistent storage survives disk pressure. It does not survive clearing site
data, the Wipe Database button one card away, or a lost device. The section says
so in a line of its own and points at the export, because a green badge reading
"Persistent" is an invitation to believe otherwise.

## Consequences

The ledger is exempt from eviction on any browser that grants it, which on
Chromium means most installed or well-used profiles. Where it is refused the
situation is unchanged from before this record, and now visible.

One module owns `navigator.storage`, so the feature detection exists once. The
export screen's own copy of the estimate call is gone with it.

The Settings visual baseline changes again, one release after the export section
changed it, and needs a refresh in CI.

Nothing here reacts to an eviction that has already happened. The app cannot
detect one directly, and a ledger that comes back empty is
[#182](https://github.com/palebluebytes/inventoria/issues/182)'s problem: reading
an export back is the only recovery there will be.
