# How to operate the model route

The model route is the one gated way the app asks a model a question. It runs on this
repo's own Worker against Cloudflare Workers AI, and it is the **first deliberate
readable egress** in an app whose standing posture is that nothing readable leaves the
device.

This is a separate page from `docs/how-to-operate-the-store.md` on purpose. That one is
scoped to one bucket and its withdrawal; a gateway is not a store setting, and the two
have no operator step in common.

Everything below lives on the **Cloudflare account**, where no build can see it.
`scripts/worker-config-check.mjs` deliberately does **not** grow a fifth claim for any of
it — a gate that cannot reach what it asserts is a gate crying wolf — so this page is
what stands in for one.

## Who holds up which clause

| Clause                                              | Held up by                                 | Where                              |
| --------------------------------------------------- | ------------------------------------------ | ---------------------------------- |
| the call reaches Workers AI at all                  | `[ai] binding = "AI"`                      | `wrangler.toml`, its only key      |
| the call is not logged by AI Gateway                | the gateway's `collect_logs: false`        | **the account**, set below         |
| the call names that gateway rather than a `default` | the route's exported call options          | `worker/src/`, unit-tested         |
| a stranger cannot spend the allocation              | the operator key                           | `wrangler secret put`, below       |
| a runaway is bounded                                | the gateway's rate limit, **and the plan** | **the account**, set below         |
| nothing readable is kept by us                      | the route is amnesiac                      | `scripts/worker-closure-check.mjs` |

The second row is the one to read twice. Cloudflare's docs never state whether a bare
`env.AI.run()` lands in an auto-created `default` gateway whose log collection is **On**,
and AI Gateway log retention is count-bounded rather than time-bounded. Naming an explicit
gateway with logging off is how that question stops mattering.

## The API token

These acts are **API-or-dashboard only**; there is no `wrangler` subcommand for any part
of AI Gateway. The token is account-owned and needs three permission groups:

| Permission   | Level           | What it is for                                               |
| ------------ | --------------- | ------------------------------------------------------------ |
| `AI Gateway` | **Edit**        | create the gateway and read it back                          |
| `Workers AI` | **Read**        | enumerate the model catalogue                                |
| `Workers AI` | **Edit**        | run a model — which is also how model terms are accepted     |
| `Billing`    | Read (optional) | read the account's plan, which §"The real backstop" rests on |

Two traps, both of which cost time once:

- **An account-owned token does not verify at the user endpoint.**
  `GET /user/tokens/verify` answers `1000 Invalid API Token` for a perfectly good token.
  Verify at the **account** endpoint instead:

  ```sh
  curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/tokens/verify" \
    -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN"
  # {"result":{"id":"…","status":"active"},"success":true,…}
  ```

- **A permission edit takes minutes to propagate.** Adding `AI Gateway` to an existing
  token left `/ai-gateway/gateways` answering `403` `10000 Authentication error` for
  **about 150 seconds** before it began answering `200`, with no change at either end.
  A `403` straight after an edit is not a wrong permission; poll before re-editing.

The token lives in `.env` as `CLOUDFLARE_AI_API_TOKEN`, beside the R2 one. It is
deliberately **not** the same token as `CLOUDFLARE_API_TOKEN`: that one is the USDA
backup's, and widening it would hand gateway-edit rights to a script that backs up a
public dataset.

## Provisioning it, once

### 1. Check what is already there

```sh
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways?per_page=50" \
  -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN"
```

**A `default` in this list means something has already called bare**, and whatever it
logged is already logged. At the time this page was written the account held **zero
gateways**, so nothing ever had.

### 2. Create the gateway, with the rate limit in the same call

`rate_limiting_*` are **create-time `POST` fields alongside `collect_logs`**, so this
costs nothing extra done here and a second call if it is not.

```sh
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways" \
  -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN" -H "Content-Type: application/json" \
  --data '{
    "id": "inventoria-model-route",
    "collect_logs": false,
    "cache_ttl": 0,
    "cache_invalidate_on_update": false,
    "rate_limiting_limit": 20,
    "rate_limiting_interval": 60,
    "rate_limiting_technique": "sliding"
  }'
```

**The name is the point.** `inventoria-model-route` rather than `default`, so the gateway
itself says it was chosen.

`cache_ttl: 0` is caching **off**, and it is a privacy setting here rather than a
performance one: an AI Gateway cache stores prompts and responses, which is exactly the
material this route is built not to keep.

**`zdr` is a false friend and is deliberately not set.** The create body accepts it, and
"Zero Data Retention" is the name you would reach for — but it _"only applies to Unified
Billing requests that use Cloudflare-managed credentials"_ and _"does not control AI
Gateway logging"_. Our call is Workers AI on `postpaid`, so `zdr` would be inert.
`collect_logs: false` is the only lever that acts on our path.

### 3. Verify it by reading it back

Never trust the create response; it is the same request restated.

```sh
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-gateway/gateways/inventoria-model-route" \
  -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN"
```

| Field                     | Must read    | Why                                                      |
| ------------------------- | ------------ | -------------------------------------------------------- |
| `collect_logs`            | `false`      | the clause this whole page exists for                    |
| `is_default`              | `false`      | proves it is the named gateway, not the auto-created one |
| `cache_ttl`               | `0`          | no prompt or response is cached                          |
| `logpush`                 | `false`      | logs are not shipped anywhere either                     |
| `rate_limiting_limit`     | `20`         | with `interval` `60`, `technique` `sliding`              |
| `workers_ai_billing_mode` | `"postpaid"` | not on prepaid credits, so the plan's hard stop applies  |

Two fields **default** favourably and are worth knowing about rather than setting:
`log_management` comes back `100000` with `log_management_strategy` `"DELETE_OLDEST"`. So
even if log collection were ever switched on, the store is count-bounded and self-pruning
rather than unbounded.

### 4. Accept the model terms

Some models are gated on an agreement, and the gate answers **`5016` / HTTP `403`**,
_"User has not agreed to Llama3.2 model terms"_. **Agreeing is itself an inference call**,
not a dashboard checkbox — which is why the token needs `Workers AI: Edit`:

```sh
curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai/run/@cf/meta/llama-3.2-11b-vision-instruct" \
  -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN" -H "Content-Type: application/json" \
  --data '{"prompt":"agree"}'
```

**A successful acceptance still answers HTTP `403` with code `5016`.** Read the message,
not the status:

> `AiError: Model Agreement: Thank you for agreeing to this model's terms. You may now use the model.`

Which models are gated is **not** predictable from the vendor. Of the four candidates,
only one was:

| Model                                          | Gated?             |
| ---------------------------------------------- | ------------------ |
| `@cf/meta/llama-3.2-11b-vision-instruct`       | **yes** — accepted |
| `@cf/meta/llama-4-scout-17b-16e-instruct`      | no                 |
| `@cf/mistralai/mistral-small-3.1-24b-instruct` | no                 |
| `@cf/moondream/moondream3.1-9B-A2B`            | no                 |

Verify by running the model normally and getting a `200`.

## Verifying it

Nothing here changes anything; run it after provisioning and after any dashboard visit.

```sh
# The gateway's settings, as the table above.
curl -s ".../ai-gateway/gateways/inventoria-model-route" -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN"

# Workers AI is enabled, and the catalogue as it is *today*.
curl -s ".../ai/models/search?per_page=500" -H "Authorization: Bearer $CLOUDFLARE_AI_API_TOKEN"
```

**Re-read the catalogue rather than trusting any list in this repo.** A model id quoted
from memory has already cost this effort a year of wrong instructions.

## The operator key, and rotating it

The route is gated by one shared secret so it is not a public endpoint spending the
account's allocation for strangers.

**Mint it as a CSPRNG draw, never as a typed passphrase:**

```sh
openssl rand -base64 32
```

**Set it on the Worker**, where it is write-only from that moment on:

```sh
wrangler secret put MODEL_ROUTE_KEY
wrangler secret list        # verification: the name appears; the value never does
```

The device half is entered by hand into Settings and stored as `model_route_key`. It has
**no `VITE_` fallback on purpose**: `import.meta.env` inlines at build time, so a
build-time fallback for this particular secret _is_ the leak.

### Rotation

**Rotation is the only recovery path from a leaked key**, and it is written here as its
own procedure rather than assembled from three other sections at eleven at night.

1. Draw a new one: `openssl rand -base64 32`
2. `wrangler secret put MODEL_ROUTE_KEY` — takes effect on the next deploy of the script.
3. Re-type it in Settings **on every device**. `localStorage` is per-device and unsynced,
   so there is no push; every device is silently 401 until it is re-typed.

Step 3 is the whole cost, and it is why the key is worth protecting rather than rotating
casually.

## What the rate limit does and does not bind

The rate limit is **not** an account-level ceiling, and reading it as one would be the
mistake this section exists to prevent.

**It binds only calls that name the gateway.** The same request with the gateway omitted
answers `200` while the gateway is fully rate-limited — verified, not assumed. So a bug
that dropped the gateway from the call options would silently escape the limit _and_ the
logging-off setting at the same time, and nothing on the account would notice. That is
precisely why the route's call options are an exported constant with a unit test on them
rather than an inline object literal.

**When it trips**, the client gets more than the docs promise. Cloudflare documents the
status code only; the actual response is:

```
HTTP/2 429
{"errors":[{"message":"Rate limited","code":2003}],"success":false,"result":{},"messages":[]}
```

There is **no `Retry-After` header**. The body's `2003` is what distinguishes a gateway
rate limit from **`3036`** — _"You have used up your daily free allocation of 10,000
neurons"_ — which is also HTTP `429`. **On status alone the two are indistinguishable**,
and they mean opposite things to a user: one clears in seconds, the other at 00:00 UTC.

**Rate limiting does not require log collection.** The docs never say either way; it was
tested, and a gateway with `collect_logs: false` rate-limits correctly. So there is no
trade to make here — logging stays off and the limit stays on.

## The real backstop, which no gate here can see

**The $0.00 ceiling is not a setting. It is which plan the account is on.**

On the Workers **Free** plan the daily allocation is a hard stop — `3036` / HTTP `429`,
reset at 00:00 UTC, with no overage to buy. A leaked key therefore costs **$0 by
construction**, and that named absence is what makes one shared secret proportionate.

An **unrelated upgrade to Workers Paid silently converts that hard stop into unbounded
overage.** Nothing in this repo can read a plan, no notification fires on the change, and
the person upgrading will be doing it for some other reason entirely.

> **The threshold: any month in which this account is not on Workers Free is a month to
> read this page again, and to decide the key and the limit afresh.**

An account-level spend cap is **refused because it does not exist**: budget alerts _"do
not pause or cap usage"_, and the old spending-limit endpoint _"always responds 403"_.
Gateway spend limits are refused too, on two unverified conditions — `spend_limits` is
`PUT`-only and absent from the create body, and its documentation names only Unified
Billing and BYOK, never Workers AI postpaid.

The gateway rate limit above is what is left: **the one control that survives a plan
change unattended**, within the bound stated in the previous section.

## What the operator can still learn, which no procedure here fixes

Written down so nobody reads the settings above as a no-record posture.

**Cloudflare documents no-training, and nothing quotable about retention.** No duration
anywhere, no locality — Workers AI is `✘ Not compatible` with Regional Services, so the
EU claim in `wrangler.toml` is narrowed to the store and does not extend here — and
prompt caching is on by default at the provider.

`collect_logs: false` stops **AI Gateway** writing a log. It says nothing about what
Workers AI itself retains, and there is **no content-bearing Workers AI signal outside AI
Gateway** for any gate in this repo to reach. What the setting buys is therefore the
absence of a log store _we_ created and _we_ could be compelled to produce — which is
worth having, and is not the same as the provider holding nothing.
