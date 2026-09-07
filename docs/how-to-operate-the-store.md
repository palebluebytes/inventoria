# How to operate the store

The store is the bucket a Deposit waits in so that two of your own devices converge
without both being awake.
[ADR-0096](adr/0096-devices-converge-without-both-being-awake-through-a-store-of-sealed-deltas.md)
§1 states what it may hold, and says plainly that unlike the relay's bar this one is
**not met by construction**:

> The store holds sealed objects at keys nobody can enumerate, none larger than 16 MiB,
> none older than 30 days. For each lane it holds at most one: its depositor's
> outstanding delta, until its collector takes it.

Five clauses, five different mechanisms, and only one of them the platform's. Three of
them live in this repo and are gated by the build. **Three live on the Cloudflare
account, where no build can see them**, and this page is what stands in for a gate
there. It also carries the operational half of §17: a stated threshold, a billing
alert, and the withdrawal procedure.

## Who holds up which clause

| Clause                       | Held up by                                              | Where                                            |
| ---------------------------- | ------------------------------------------------------- | ------------------------------------------------ |
| nobody can enumerate         | the address is a ratchet output the server never saw    | the client, unbuilt (§4)                         |
| none larger than 16 MiB      | our own route                                           | `worker/src/store.ts`, unit + e2e tested         |
| none older than 30 days      | the bucket's lifecycle rule                             | `worker/r2-lifecycle.json`, **applied below**    |
| at most one per lane         | supersede-in-place, and object versioning being **off** | the depositor, unbuilt (§5), and **the account** |
| until its collector takes it | the collector's `DELETE` after the final chunk verifies | the client, unbuilt (§5)                         |

The fourth row is the one to read twice. **The route carries none of it**: it cannot
tell a rewrite from a first write, and an unconditional `PUT` at a collected address
recreates the object. What holds the clause up is the depositor sending `If-Match`
(§5, unbuilt) and the bucket keeping no versions, and the route's part is only to pass
the precondition through and report the refusal.

Beside those, §16 names two things the provider must not have: **object versioning**
and **retention locks or compliance holds**. And #266 names one pipeline that would
write down a deposit address if it were switched on: **Workers Traces**, whose R2
binding spans carry `cloudflare.r2.request.key`.

`pnpm check` runs `scripts/worker-config-check.mjs`, which fails the build if traces are
on, if the script keeps an invocation log, if it binds anything but the store's one
bucket, if that bucket leaves the EU, or if the lifecycle file stops expiring every
object at 30 days. Everything below is what that gate cannot reach.

## Provisioning it, once

Every command needs `-J eu`. **A jurisdictional bucket is a distinct namespace**: the
same command without the flag addresses a different, empty bucket of the same name and
reports success.

```sh
# The bucket itself. `jurisdiction = "eu"` in wrangler.toml binds to this one.
wrangler r2 bucket create inventoria-store -J eu

# The backstop expiry (§1's third clause), from the file this repo commits.
wrangler r2 bucket lifecycle set inventoria-store --file worker/r2-lifecycle.json -J eu
```

The file carries two rules in one, and the second is worth a sentence. An expiry acts
on **objects**, and an incomplete multipart upload is not one: it is retained,
billable bytes that the 30-day rule would never reach. The route offers no multipart
path, so nothing should ever create one — but "none older than 30 days" bounds
everything in the bucket, including a blob a stranger wrote, and a clause with a class
it does not cover is the seam §1 rewrote its bar sentence to close.

**Object versioning has to be switched off in the dashboard**, and there is no wrangler
command for it: R2 → `inventoria-store` → Settings → Object versioning → Disabled.
Under versioning, every superseded deposit is retained and **§1's bar sentence becomes
false with nothing in our code changing** — supersede-in-place is exactly how a lane
holds one object. This is the sharpest of the account-side settings and the only one
whose failure is silent.

**This has to happen before the next `pnpm deploy`.** `wrangler.toml` binds the bucket,
so a deploy against an account that does not hold it fails outright — noisily, which is
the right direction, but it means provisioning is a step in shipping the store rather
than a step in operating it afterwards. Local development needs none of it: `wrangler
dev` simulates R2 on disk, which is what `pnpm dev:relay` and the e2e suite use.

## Verifying it

Nothing here changes anything; run it after provisioning and after any dashboard visit.

```sh
wrangler r2 bucket lifecycle list inventoria-store -J eu     # one enabled rule, "Expire objects after 30 days", all prefixes
wrangler r2 bucket notification list inventoria-store -J eu  # empty: a notification carries object.key, including on lifecycle deletion
wrangler r2 bucket dev-url get inventoria-store -J eu        # disabled: a public r2.dev URL makes every address a URL
wrangler r2 bucket domain list inventoria-store -J eu        # empty: a custom domain is the same disclosure by another door
wrangler r2 bucket lock list inventoria-store -J eu          # empty: a lock is a provider rule that refuses our delete (§16.7)
```

Object versioning is read in the dashboard, in the same place it is set.

## The threshold, and the alert

`docs/research/372-convergence-operating-cost.md` priced this in full and #393 records
the operational half of §17 here rather than in the record, because it is a number that
moves.

**The free tier binds first on R2 Class A operations, at about 33,000 users** at two
devices each, one wake a day. Past it the money is small: about $4.50/month at 50,000
users and $14.00/month at 100,000. **What the threshold is protecting against is not
expense; it is an unbounded and unwatched commitment.**

That distinction is the whole reason this section exists. ADR-0072 §14 could promise the
send would be _reopened rather than silently upgraded to a paid plan_ because Durable
Objects and Workers **state a hard stop** — exceed the free tier and operations fail with
an error, and reset the next day. **The R2 pricing page contains no equivalent sentence.**
R2 is a separate subscription whose free tier is an allowance deducted from a bill, so
there is a silent upgrade path here and diligence is the only thing closing it.

> **The threshold: any month in which the store's own R2 spend is not $0.00, or stored
> bytes exceed 5 GB, is a month to read this page again.**

Stored bytes are the sleeper, and they are what the alert is really for: operations
empty overnight and stored bytes accumulate. A healthy lane is trivial; an **abandoned**
lane reaches 4.88 MB, and once about 4.2% of users have a permanently abandoned device,
stored bytes overtake Class A as the binding limit. The backstop expiry does not move
that — §1 reads the clock unfavourably on both axes, so an actively refreshed lane may
never age out, and **the backstop is a privacy and disposal control, not a cost
control**.

**The alert**, set once, in the Cloudflare dashboard under Manage Account →
Notifications → Add:

| Setting     | Value                                                     |
| ----------- | --------------------------------------------------------- |
| Product     | Billing                                                   |
| Event type  | Billing Usage Alert                                       |
| Service     | R2                                                        |
| Threshold   | 75% of the free-tier allowance, on Class A and on storage |
| Destination | the account owner's email                                 |

A structural cap is **refused** rather than missing: capping would need exactly the
account-wide aggregate counter ADR-0072 §12 refused by name.

## Withdrawing it, or pivoting

These are **one procedure with two endings**, and the ending is chosen at the last step:

1. **Set the expire date.**
   `wrangler r2 bucket lifecycle add inventoria-store drain --expire-date <YYYY-MM-DD> -J eu`
2. **Let it run.** Disposal is enforced by the bucket rather than by a tool we write, so
   **shutting down never requires the `list()`** that is the loudest surface in the whole
   design. Cloudflare publishes a typical of 24 hours for a newly applied rule and no
   maximum, so allow days rather than hours.
3. **Then repoint the route, or remove it.** Repointing is the pivot; removing is the
   withdrawal.

**A pivot is an abandonment, not a migration, and that is a property rather than a plan.**
Addresses are client-derived, chain state lives on the devices, and a lost object costs a
rewrite rather than data — so each depositor re-fills its lane on its next wake, at a cost
of at most one wake per lane. That is the same cost the backstop expiry already imposes.
**We do not build an enumerator in order to leave**, which is why there is no export step
above.

The withdrawal clause itself is materially stronger than the relay's:

> If operating the store stops being tenable, the deposit is removed and convergence
> between two devices that are awake together remains.

ADR-0072 §14 falls back to a file export because removing the send removes the only path.
Removing the store removes only the **asleep** path: the feature degrades to the ADR-0075
design ADR-0096 amends, not to a manual export. **The threshold being crossed is the
tenability test.**

## What the operator can still learn, which no procedure here fixes

Written down so that nobody reads the settings above as a no-record posture. ADR-0096 §15
is the full account; the two loudest facts are that **`r2OperationsAdaptiveGroups` carries
the field `objectName`, retained 31 days, with no setting, flag or plan tier documented to
disable it** — there is no off, it is not a default of on — and that **one `list()` returns
address, exact byte length and write time for every object at any later moment**, with no
logging pipeline and no expiry window. What rotation buys is therefore unlinkability of
exchanges more than 31 days apart, not unlinkability.
