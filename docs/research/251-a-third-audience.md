# What a third audience would break

Research for [#251](https://github.com/palebluebytes/inventoria/issues/251), on the map
[let a device that was asleep converge later](https://github.com/palebluebytes/inventoria/issues/248).

The audience is a **nutritionist tracking a client's foods**: not you, and not a peer you hand a
meal to. Map decision 9 says the design must not foreclose it and this map does not build it. This
note prices it.

## The answer in three sentences

**A bounded, pairwise, dropped-on-collection deposit can carry an asymmetric one-way relationship.
The store is not what stands in the way** — [#249](https://github.com/palebluebytes/inventoria/issues/249)
foreclosed nothing here. What stands in the way is **ADR-0075 §3's symmetric secret**, which cannot
express direction under any address derivation [#250](https://github.com/palebluebytes/inventoria/issues/250)
can land on, and **ADR-0075 §7's refusal to narrow the payload**, which hands a coach the client's
medication record along with their food diary because both live in one table. Neither is fixed by a
replica, so the honest verdict is the one the ticket asked to hear plainly if it were true and it is
not: **this does not structurally require the sealed replica, and #249's closing first cost this
ticket nothing.**

## What this refutes and confirms, by name

**Refuted: #251's own first bullet.** Its body said _"a replica is the natural substrate a third
party would read from and a mailbox is not"_, and the ordering-failure comment inherited that as a
constraint. The asymmetry it named is not real for this audience. A coach's read pattern is
**asynchronous by nature** — a professional reviews a caseload on a Monday morning while the clients
are at work — and that is precisely what a deposit is. Everything a replica would buy a coach over
#249's bounded store, a deposit already buys:

| What a coach needs                      | Replica                        | #249's bounded deposit                                   |
| --------------------------------------- | ------------------------------ | -------------------------------------------------------- |
| Read when the client's device is asleep | yes                            | **yes** — a deposit is collected, not met                |
| A whole base to read from               | yes                            | **yes** — guard 1 puts it there at the first appointment |
| Corrections arriving over time          | yes                            | **yes** — deltas against that base                       |
| Exactly one collector per deposit       | no (guard 2 needs re-deriving) | **yes** — pairwise, per #260                             |
| Onboard with no live meeting            | yes                            | no — guard 1 forbids it                                  |

Only the last row differs, and #249 already priced it: bootstrapping needs the pairing secret, which
came from a party that was awake moments earlier. For a coach that party is a person in a consulting
room. **Guard 1 costs a coach exactly what it costs a second device: nothing, because the secret has
to change hands in person anyway** (ADR-0072 §4 — no spoken code, no typed field).

**Confirmed: map decision 9's premise, that a coach is different in kind from a third device.** It is
confirmed for a sharper reason than the map gives. A third device differs from you in _availability_;
a coach differs from you in _authority_, and ADR-0075 §4 already wrote the sentence that decides it,
aimed at hubs: _"A hub would be a convention, not a mechanism. The pairing secret is symmetric and the
relay is dumb, so nothing could enforce which side is the hub."_ Substitute _reader_ for _hub_ and the
paragraph transfers verbatim. §4 has already refused, on the record, the class of construction a
one-way relationship belongs to.

**Confirmed and extended: the map's collision table.** All four rows hold. What the table does not
say is that **three of the four break in one direction only** — coach → client, which a one-way
relationship never uses — so the fatal composition is not any single licence but §2 and §3 together
(§3 below). The one that breaks in the _used_ direction is §8, and it is the worst of them.

**Confirmed: #185's refusal, and it does not have to be reopened.** A per-client store outside the
coach's own `datoms` reaches attributable, updating, correctable facts about a client without an
author concept entering any ledger and without a genuinely shared multi-person ledger (§2 below).

## 1. What a symmetric secret cannot carry, and why the address cannot rescue it

ADR-0075 §3's Paired Device is `{ device_id, a name the user typed, a 256-bit pairing secret }`. Four
things a one-way, asymmetric, revocable relationship needs that it does not carry.

**Direction.** A shared secret authenticates a _channel_, not a _role_. §5 derives both the room id
and the session key as `KDF(secret, epoch)`, which both sides compute independently — so both sides
can deposit and both can collect. Nothing in the construction distinguishes reader from writer.

**And no address derivation fixes this, under either shape #250 is weighing.** This is the load-bearing
finding of the section, and it holds for the same reason in both cases: _the address is derived from a
secret both parties hold._

- **Epoch-derived** (`KDF(secret, epoch)`, ADR-0075 §5). Adding a domain separator —
  `KDF(secret, epoch, "client→coach")` — gives two addresses instead of one, and both parties can
  compute both. A domain separator partitions **lanes**; it does not withhold a **capability**.
- **Ratchet-derived** (address from the last successful sync, #250's first candidate). The ratchet
  state is shared and both sides advance it. It buys unlinkability across time, not asymmetry; and a
  collector who opens the app weekly stresses the divergence case #250 is already chasing.

So **#250 can neither foreclose nor enable a third audience**, whichever shape it lands on. The
foreclosure, if there is one, is in §3's choice of a symmetric seed, and it is decided there.

**What asymmetry actually requires is that one side hold something the other does not**, which means
a keypair rather than a shared seed. Two established prior arts, and they differ in an instructive
way:

- **Tahoe-LAFS** derives a read-cap _from_ a write-cap, one-way. Per its
  [directory-node specification](https://tahoe-lafs.readthedocs.io/en/latest/specifications/dirnodes.html):
  _"The holder of the 'write capability' will be able to retrieve the private key (as well as the AES
  encryption key used for the data itself). The holder of the 'read capability' will be able to obtain
  the public key and the AES data key, but not the RSA private key needed to modify the data."_
  Read-only-ness is enforced by **absence of a signing key**, not by anybody's cooperation. That is a
  mechanism, and it is what §4's sentence says a symmetric secret can never be.
- **Ink & Switch's Keyhive** is the local-first-native version, modelling read, write and admin as
  chains of signed delegations over an Automerge document
  ([project page](https://www.inkandswitch.com/project/keyhive/),
  [notebook](https://www.inkandswitch.com/keyhive/notebook/)). It separates a **pull** capability from
  a read capability — _"it's only the ability to retrieve bytes from the network but not decrypt or
  modify them"_ — which is exactly the distinction a store-plus-coach needs.

**The cost of importing either into this project is a ledger-schema change, and that is the number
this section exists to produce.** `datoms` carries `(entity, attribute, value, time, hlc_ms, hlc_ctr,
device_id)` and **nothing is signed**; `device_id` is a tiebreak field
([EAVT Vocabulary](../eavt-vocabulary.md)), unauthenticated by construction. Enforcing "this party may
read and may not write" means either per-datom signatures the collector verifies, or a delegation the
collector checks before accepting a deposit. The second is far cheaper and is where a design would
start — but it is still a new key type, a new artifact, and a verification step on the receive path
that ADR-0075 §13 currently has only two of.

**Revocability.** Deleting a symmetric pairing works pairwise and unilaterally (§4, §12), so
revocation is _available_. It is **forward-only**, and that is not a repo limitation but a property of
the class. Keyhive states it plainly: _"if someone has the data and the symmetric key, then they have
the ability to read that data."_ For your own devices §4 answers this — _"no model takes your ledger
off the device you lost"_. For a coach, what they already collected is theirs permanently, and no
cryptography changes that. It becomes a **data-protection** problem rather than a protocol one (§4
below).

**Category.** Under §3 a coach would appear on the Devices screen as a Paired Device, which is a
category error map decision 9 explicitly forbids, and §4's _"every device already holds total power
over its own pairings"_ would read as _the coach may deposit into you_.

**Verdict.** _A bounded pairwise deposit can carry the relationship; ADR-0075 §3 cannot. Asymmetry is
unreachable from a shared secret under any epoch or ratchet derivation, and reaching it costs a
keypair, a delegation artifact, and a verification step on the receive path — none of which the ledger
has today._ Checkable: point at any construction over `{ device_id, name, secret }` in which one side
provably cannot write.

## 2. Re-minting does not survive, and a read-only projection is the way past #185

**Re-minting is not merely unhelpful here, it is inverted.** ADR-0073 §5 re-mints because _"the event
is a claim about the recipient eating: their clock, their day, their Meal Type."_ Re-minting a client's
lunch into a coach's ledger asserts that **the coach ate it** — and ADR-0073 §11's stated consequences
follow at once: it enters the coach's day totals, and it enters Recent against ADR-0057's cap of
twelve. A coach needs the opposite of re-minting: facts attributable to the client, updating over time.

That is the thing #185's Out of scope refuses — _"an author/owner concept in the ledger, and with it a
genuinely shared multi-person ledger. Re-minting on acceptance is the deliberate alternative."_

**A read-only projection does sidestep it, and on a reading #185 supports rather than strains.** The
client's datoms live in a per-client store on the coach's device, outside the coach's own `datoms`
table, read by projections pointed at that store and never folded into the coach's state. Nothing in
the coach's ledger gains an author attribute, because the client's rows are never in the coach's
ledger; and there is no shared ledger, because nothing is shared — the coach holds a copy, one-way,
per client. **Attribution moves out of the row and into the store.**

**This is a move the project has made three times already**, which is what makes it available rather
than novel: ADR-0075 §3 puts the Paired Device outside the ledger because the ledger cannot represent
a revocation; ADR-0053 puts the empty-search log outside it; ADR-0072 §2 puts the seal key outside it.
The rule those share — _state whose semantics the ledger cannot carry lives beside it, not in it_ —
covers a client's record exactly.

**What it costs, honestly, in the three terms the ticket named:**

- **Freshness.** As fresh as the last collection: the client's device deposits when it is open, the
  coach's collects when theirs is. That is #249's store, unchanged, and no worse than own-device
  convergence.
- **Correction.** Free **if and only if the sidecar keeps the append-only shape** — datoms in HLC
  order, latest-wins fold. A client corrects a meal by appending a later datom and the coach's view
  moves. **If the sidecar is a materialised snapshot instead — today's totals, a summary — corrections
  are lost silently**, because nothing in a snapshot says it is stale. That is the one place this shape
  can be built wrong, and it is worth stating as the constraint it is: _a read-only projection must be
  an append-only sidecar with its own fold, not a rendered view._
- **Revocation.** The client stops depositing, and the coach's app can drop the store. Neither is
  enforceable against a coach who has already collected (§1). It buys deletion, not un-reading.

**The cost the ticket did not name, and it is the largest.** Every projection in the app reads
`datoms` — day totals, `foodSourceView`, the NOVA verdict, the RDA targets. A client view means every
one of them takes its source as a parameter rather than assuming one. That is not a data-model change;
it is a change to every read path in the application, on the scale of the god-screen decomposition
(ADR-0029/0030), and it is the true price of this audience.

**Verdict.** _Re-minting does not survive and is not repairable. Attributable, updating, correctable
client facts are reachable without the shared multi-person ledger #185 refused, via an append-only
per-client sidecar with its own fold — at the cost of parameterising every projection in the app._
Checkable: no datom in the coach's `datoms` table names a person.

## 3. ADR-0075's four "the peer is you" licences, inverted

Three of the four break only in the coach → client direction. The exception is §8.

### §2 — silent convergence, no approval. **Fatal in composition, not alone.**

§2 reads _"'silently' means no inbox and no approval, not unprompted"_, and that reading is what makes
automatic convergence legal. In the used direction — client → coach — silent arrival is right: the
coach consented to a caseload, the facts are not proposals, and under §2 above nothing merges into the
coach's own state, so there is nothing to approve. In the reverse direction it is exactly what #185's
locked decision 8 refuses: _"Nothing writes unseen — from a person."_

**The break is that §2 and §3 compose.** Silent convergence is safe only because the peer is you; a
symmetric secret cannot make the peer _not_ you (§1); so the two together mean a coach can write unseen
into a client's ledger. **Neither section is wrong; the pair is.** This is the specific hole map
decision 9 is guarding against and it is worth naming as a composition rather than as either clause.

**Fixable, and only by fixing §3.** Nothing at the §2 end helps: an approval prompt on the client's
device is ADR-0075 §2's already-refused button with an interruption in front of it, and it would fire
on every legitimate own-device sync too.

### §7 — the skip rule inverts, a later fact wins. **Right in the used direction; the payload rule is the fatal half.**

The inversion itself survives. Client → coach, later-wins is exactly what a coach wants — the client's
corrections must overtake their earlier entries. Coach → client it is ADR-0073 §6's named hazard
(_"the sender's numbers overwrite the recipient's own corrections"_), and it is the same composition as
§2: contained by direction, and direction is unenforceable under §3. Under the §2 sidecar it is
contained _structurally_, because latest-wins applies within a client's own store and cannot reach the
coach's rows at all.

**What is fatal is §7's other half: refusal 8, no payload narrowing.** Superseded datoms, photos and
the full 39.8% `twin/raw_provenance` share all cross, and the exclusion of everything else is
structural because **the payload is the `datoms` table**. Its licence is _"a device that lacks your
photos is not a second copy of your ledger, it is a lossy one"_ — an argument that exists only when
both copies are yours. A coach should receive **less**, and there is no mechanism in this half to send
less.

The narrowing machinery exists — ADR-0073 is a reference closure that omits exactly three attributes —
but on the half that re-mints and never updates. **A coach therefore needs ADR-0073's payload shape
over ADR-0075's transport and clock discipline, which is a third combination neither record defines.**
That is the structural cost of this audience stated in one sentence, and it is larger than the
addressing question.

### §8 — foreign stamps kept, the clock advanced. **Fatal as written, and the sidecar is the complete fix.**

§8 says keeping stamps and advancing to them _"is the convergence mechanism — you are the sender, so
the risk that argument names does not exist."_ ADR-0073 §7 names the risk: _"a sender whose phone is
set to 2030 permanently drags the recipient's clock forward — every subsequent local write stamps at
2030, from accepting one meal. With your own file that is self-inflicted; from another person it is
not, and bounding it is strictly worse than closing it."_

**This is the only one of the four that breaks in the direction a one-way relationship actually uses**,
and it is worse for a coach than for a meal recipient in three ways. It needs no hostile actor — a
wrong timezone or a manually advanced date will do. **A coach has N clients**, so the exposure is
N-fold and one poisoned client is enough. And the poison **propagates**: the coach's own devices
converge under §8, so a 2030 stamp reaches every device the coach owns, permanently.

Three options exist and only one works:

1. **Re-mint and restamp** (ADR-0073 §7's answer). Destroys the client's own ordering, so corrections
   become unorderable against the entries they correct. Not available.
2. **Keep and advance** (ADR-0075 §8). Poisons the coach's clock, N-fold, permanently.
3. **Keep the stamps in a separate clock domain** — the §2 sidecar. `Hlc.update` is never called
   against the coach's own clock; the client's stamps stay in the client's store, where latest-wins
   over that client's own rows is exactly right, and a client with a broken clock damages only their
   own view.

**Only (3) survives, and neither existing record offers it.** That is the central structural result of
this note: the sidecar is not one design option among several, it is the only shape that answers §8 at
all, and it happens to be the same shape §2 needed to get past #185.

### §13 — no ceiling, no arrival mark. **Both fixable, and the arrival mark confirms the sidecar.**

**No ceiling.** _"A ledger is as big as it is, and a rule that refuses your own data is a rule against
convergence."_ The clause is licensed by there being no other person; here there is, so ADR-0073 §9's
1 MiB bound revives on its own terms. Two adjustments it needs: the bound must be **per deposit**
rather than per relationship, since a coach's feed is unbounded over time and a whole first sync is
tens of megabytes; and ADR-0072 §13.2's _"a malicious intended recipient — you chose to send it"_ does
not cover the reverse case, so the client's device needs the bound too. Note the storage arithmetic:
#249 put R2's free tier at roughly 1,400 users at ~7 MB each, and #260's pairwise fan-out means a
coach's caseload multiplies stored bytes rather than sharing them.

**No arrival mark.** ADR-0073 §11 exists because _"a received `food:custom_`twin carries no provenance
and matches no prefix, so today it would render as manual entry — a false claim that the recipient
hand-authored it."_ Every food in a coach's client view is in exactly that position, so the defect
§11 fixes would be universal there. But §11's own rule is that`food/arrival` records _how this food
came to be here_, **never who sent it** — and a coach's view needs _whose_. **Under the sidecar,
"whose" is the store rather than an attribute, so §11's rule survives untouched.** The third
independent confirmation of the same shape.

**Verdict for §3 as a whole.** _§2 fatal only in composition with §3 and fixable only at §3; §7's
inversion acceptable and §7's refusal 8 fatal, fixable by borrowing ADR-0073's closure; §8 fatal and
fixable only by a separate clock domain; §13 fixable on both counts, from parts that already exist._

## 4. What changes when the data is somebody else's

ADR-0072 §13's threat model is written for one person's own devices, and it is honest about that. A
professional holding an identifiable person's dietary record is a different legal setting, and the
change is a discontinuity rather than a matter of degree. **This section is bounded: it names what
shifts and where a lawyer is needed. Nothing here is a verdict on anybody's compliance.**

### The exemption the app currently lives under stops applying

UK GDPR Article 2(2)(c) excludes _"the processing of personal data by an individual in the course of a
purely personal or household activity"_
([Art. 2](https://www.legislation.gov.uk/eur/2016/679/article/2)). A local-first app in which a person
logs their own food, with no account and a relay holding nothing that outlives a room (ADR-0072 §12),
sits inside that exemption. **A professional's caseload does not.** A nutritionist determines the
purposes and means of processing their clients' records and is therefore a **controller** in their own
right under Art. 4(7) ([Art. 4](https://www.legislation.gov.uk/eur/2016/679/article/4)) — not us, and
not by our choice. Shipping software an individual uses on themselves and shipping software a
professional uses on other people are different acts.

### Refusal 8 is what makes it special-category data

Article 9(1) prohibits processing _"data concerning health"_ absent an Art. 9(2) condition
([Art. 9](https://www.legislation.gov.uk/eur/2016/679/article/9)), and Art. 4(15) defines that as data
_"related to the physical or mental health of a natural person, including the provision of health care
services, which reveal information about his or her health status."_

**A food diary alone is arguable. Inventoria's ledger is not a food diary.** A Compliance Event is _"a
Calendar Event Blueprint with `cal_event/tracking: true`… used for medication"_ with a free-text
`cal_event/description`, folding to `event:occur_` rows ([CONTEXT.md](../../CONTEXT.md)); Habit
Blueprints, Notes and Checklists are in the same table. **ADR-0075 §7 refuses payload narrowing, so a
coach paired under the own-device shape receives all of it.**

That is the sharpest regulatory consequence of a repo decision in this note, and it should be stated
in exactly this direction: **the refusal of payload narrowing is what turns a food diary into a
special-category record.** §3 above prices the fix on architectural grounds; this is the second,
independent reason to want it.

### Whether a nutritionist can rely on the health-and-care ground is doubtful, and it is not our call

Art. 9(2)(h) covers _"the provision of health or social care or treatment"_, but Art. 9(3) disapplies
the prohibition under (h) **only** where the data is _"processed by or under the responsibility of a
professional subject to the obligation of professional secrecy under domestic law or rules established
by national competent bodies."_ In the UK, **"dietitian" and "dietician" are protected titles regulated
by the HCPC; "nutritionist" is not among the protected titles of any HCPC profession**
([HCPC, the professions we regulate](https://www.hcpc-uk.org/about-us/who-we-regulate/the-professions/)).
UK law adds its own condition alongside — DPA 2018 Schedule 1 Part 1 paragraph 2 supplies the health-or-
social-care condition and states that Art. 9(3) and s.11(1) apply with it
([Sch. 1](https://www.legislation.gov.uk/ukpga/2018/12/schedule/1)).

**The bounded consequence for the design**, which is all this note claims: **a design must not assume
9(2)(h) is available.** The generally-available ground is Art. 9(2)(a), **explicit consent** — which
must be specific, informed and withdrawable, and which makes the client's ability to end the
relationship a legal requirement rather than a courtesy. Whether a given practitioner can rely on (h)
depends on their registration and their contract, and is a question for their advisers.

### Does a zero-knowledge operator change the controller/processor analysis?

**Partly, for us. Not at all for the coach.**

The relevant recent authority is **Case C-413/23 P, EDPS v SRB, judgment of 4 September 2025**. The
Court _"confirmed that the General Court was correct in so far as it held that pseudonymised data must
not be regarded as constituting, in all cases and for every person, personal data… pseudonymisation
may, depending on the circumstances of the case, effectively prevent persons other than the controller
from identifying the data subject in such a way that, for them, the data subject is not or is no
longer identifiable"_
([Court of Justice press release 107/25](https://curia.europa.eu/site/upload/docs/application/pdf/2025-09/cp250107en.pdf)).
That is the strongest available support for the position that a sealed deposit under a key we never
receive by any path (ADR-0072 §2) is not personal data **in our hands**.

**Three limits, all load-bearing:**

1. **The same judgment closes the door on using it as a general excuse.** _"The identifiable nature of
   the data subject must be assessed at the time of collection of the data and from the point of view
   of the controller."_ Blindness downstream does not relieve whoever was the controller at collection.
2. **It construes Regulation 2018/1725** (the EU institutions' regulation), not the GDPR. The
   definitions are parallel; the transposition is an inference.
3. **It is not binding in the UK.** European Union (Withdrawal) Act 2018 s.6(1): a UK court _"is not
   bound by any principles laid down, or any decisions made, on or after IP completion day by the
   European Court"_, though s.6(2) says it _"may have regard to"_ them
   ([s. 6](https://www.legislation.gov.uk/ukpga/2018/16/section/6)). Persuasive, not authority.

**And it does nothing for the coach**, who holds plaintext and is plainly a controller. Encryption is a
security measure under Art. 32 ([Art. 32](https://www.legislation.gov.uk/eur/2016/679/article/32)); it
does not remove data from scope for a party holding the key. **The corollary worth carrying into the
ADR: ADR-0072 §12's "nothing that outlives a room" and #249's completeness line are doing legal work as
well as privacy work, and any relaxation of either spends both at once.**

### Retention, subject access, deletion

- **Storage limitation** (Art. 5(1)(e), [Art. 5](https://www.legislation.gov.uk/eur/2016/679/article/5))
  requires the coach to hold a client's record no longer than necessary. The app has no concept of a
  retention period for anything, and #249's R2 lifecycle rule bounds the _deposit_, never the copy.
- **Subject access** (Art. 15, [Art. 15](https://www.legislation.gov.uk/eur/2016/679/article/15)) is
  the cheap one: ADR-0064's exporter pointed at the sidecar produces the client's record as NDJSON.
- **Erasure** (Art. 17, [Art. 17](https://www.legislation.gov.uk/eur/2016/679/article/17)) is the one
  the architecture is worst at, and it is the fourth independent argument for the sidecar. _"There are
  no `UPDATE` or `DELETE` statements anywhere in the write path, as a standing rule"_
  ([State Is a Reading of the Past](../append-only-ledger.md)). Against a merged ledger, erasing one
  person's rows is the operation the design most conspicuously refuses. Against a per-client sidecar it
  is dropping a store. **Append-only is a feature for your own data and a liability for someone else's,
  and the sidecar is the seam where the two are allowed to differ.**

### Two duty-of-care facts that are repo facts, not legal opinion

- **A professional acting on this data would be acting on a view with known silent losses.** ADR-0075
  §10 accepts that two edits made before any sync fall through to ADR-0020's `device_id` tiebreak,
  _"deterministic, identical on both devices, and arbitrary from the user's point of view"_; ADR-0075 §9
  records that `NotesStore.init` never subscribes to `onInvalidate`, so imported notes are invisible
  until reload. Both are correct trades for a personal log and neither has been weighed as clinical
  input.
- **You cannot offer a professional a channel you have already promised you may withdraw.** ADR-0072
  §14: _"If operating the relay stops being tenable, the send is removed and the file export remains.
  That is a documented outcome, not a failure."_ That clause is honest for a convenience feature. It is
  a different thing under a caseload, and the ADR should say so rather than let the clause be inherited.

**Verdict.** _A third audience moves the app from outside UK GDPR's material scope into a setting where
the professional is a controller of special-category data; the payload rule is what makes it
special-category; 9(2)(h) should not be assumed available to a nutritionist; a zero-knowledge operator
is plausibly outside the analysis for sealed bytes and irrelevant to the coach; and erasure is the
obligation the append-only ledger cannot meet except at a sidecar seam._ Not legal advice — the points
flagged for advisers are the 9(2)(h) availability question and the controller/joint-controller position
of an app publisher whose software a professional uses on third parties.

## The ADR paragraph, ready to paste

> **What this does not foreclose, and what it would cost.** A third audience — a nutritionist tracking
> a client's foods — is not built here and is not shut out here. The bounded store is not the obstacle:
> a deposit is asynchronous by nature, which is how a professional reads a caseload, and its two guards
> hold for a coach exactly as they hold for a second device. What a one-way relationship needs and this
> record does not carry is asymmetry, and asymmetry is unreachable from §3's symmetric pairing secret
> under **any** address derivation, because both parties compute the address from a secret both hold; a
> domain separator partitions lanes, not permissions. §4's sentence about hubs — _a convention, not a
> mechanism_ — is the same refusal seen from the other side. Reaching it costs a keypair, a delegation
> artifact and a verification step on the receive path, on the Tahoe-LAFS read-cap or Ink & Switch
> Keyhive model. Three further costs are named so they are not rediscovered. **§7's refusal of payload
> narrowing is licensed by "the peer is you" and would hand a coach the client's Compliance Events
> along with their food diary**, so that audience needs ADR-0073's narrowed closure over this record's
> transport — a combination neither record defines. **§8 is fatal in the direction such a relationship
> actually uses**: a client whose clock says 2030 would drag a coach's clock forward permanently, N-fold
> across a caseload and onward to every device the coach owns. And **re-minting inverts** — it would
> assert the coach ate the meal. The only shape that answers all three is a **per-client append-only
> sidecar with its own clock domain**, read by projections outside the holder's own `datoms`; it
> sidesteps the author concept [#185](https://github.com/palebluebytes/inventoria/issues/185) refused
> by moving attribution from the row to the store, and it is the one seam at which erasure of another
> person's record is possible in an append-only design. Its price is that every projection in the app
> must take its source as a parameter. Nothing in this record blocks that; nothing in it builds toward
> it either. Recorded so that a later effort finds the analysis rather than deriving it
> ([#251](https://github.com/palebluebytes/inventoria/issues/251),
> [research note](https://github.com/palebluebytes/inventoria/blob/main/docs/research/251-a-third-audience.md)).

## Load-bearing versus interesting

**Load-bearing.** §1's result that no address derivation can express asymmetry, because it decouples
this question from #250 entirely. §3's §8 finding and the three-option elimination, because it is the
only inversion that breaks in the used direction. §3's refusal-8 finding, because it is the largest
single cost and it is also §4's regulatory trigger. §2's sidecar-versus-snapshot constraint, because it
is where the shape can be built wrong silently.

**Interesting, and not relied on.** The Tahoe-LAFS and Keyhive citations establish that read-only
capability is a solved problem in adjacent systems; neither is proposed as a dependency and neither has
been assessed for browser or WASM cost. The C-413/23 P analysis is genuinely useful for the operator's
position and is doubly caveated (wrong regulation, not binding in the UK).

**Not established, and would need work if the audience were ever built.** Whether a delegation-checked
deposit can be verified by the collector without the store learning anything new about the pairing.
Whether a client's _deletion_ — which in an append-only ledger is a later fact, not a removal — can be
made to propagate into a coach's sidecar as anything stronger than a request. What a coach's caseload
does to #249's storage arithmetic and #260's fan-out beyond the direction of the effect. And the
controller/joint-controller position of an app publisher whose software a professional runs on third
parties, which is a lawyer's question and not a reader's.
