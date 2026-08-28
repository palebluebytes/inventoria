# Research: what a magic-wormhole code guarantees, and what a browser would need to reproduce it (#195)

**Ticket:** [#195](https://github.com/palebluebytes/inventoria/issues/195) — parent map [#185](https://github.com/palebluebytes/inventoria/issues/185) (send a meal to another person, and let your own devices converge).
**Question:** the map's decision 10 says the confidentiality bar is stated here, not inherited by picking a library. So: what does a three-word code actually buy, what enforces it, and how much of that survives a browser?
**Sources:** primary only — the `magic-wormhole-protocols` specification repo, the Python reference client, the mailbox and transit-relay server sources, `python-spake2`, RFC 9382, the Abdalla–Pointcheval paper, and the source of every browser implementation named. No blog posts, no secondary write-ups.
**Date:** 2026-08-28. **Status:** research only — nothing built, no dependency added.

---

## TL;DR

- The code is **16 bits** by default — two words from the PGP word list, one byte each. That is 65,536 possibilities, and it is safe **only because an attacker gets one guess per session and the failure is loud**, not because 16 bits is a lot.
- **Offline grinding is ruled out by SPAKE2 itself.** The code never appears on the wire except blinded by a fresh random group element; recovering it from a recorded transcript is a Diffie-Hellman problem, and the security bound is proportional to the number of _active_ sessions, not to offline work.
- **"One guess and it burns" is enforced in three places, and no one of them is sufficient.** The algorithm gives one guess per protocol execution; the _client_ protocol makes a failed guess terminal and visible (bad decrypt → mood `scary` → close, release, `WrongPasswordError`); the _mailbox server_ caps a nameplate/mailbox at **two sides** and raises `CrowdedError` on a third. Strip any one and the property is gone. Strip the third-side cap and "one guess" becomes "one guess, undetected" — and detection is the entire argument.
- **The server sees a lot and must be trusted for availability and for not spending its own one guess.** It sees appid, sides, nameplate, mailbox id, phase names, message sizes, timestamps, IP, client version. It cannot read content. It _can_ MitM with the same 1-in-65536 odds — plus one advantage a network attacker lacks: it can reuse the nameplate immediately ([issue #31](https://github.com/magic-wormhole/magic-wormhole/issues/31) is still open).
- **Do not ship against the public rendezvous server.** Its own source comment says "if it gets too expensive to run, I'll shut it down"; upstream's own DoS analysis says it "may just have to be a best-effort service, and if someone decides to kill it, it fails" and expects app authors to run their own. Winden, the one production web client, runs its own mailbox _and_ its own relay.
- **The browser can reproduce the key exchange today.** The rendezvous half is already a WebSocket carrying JSON. `magic-wormhole.rs` builds for `wasm32-unknown-unknown` in CI and is shipped in two web clients (Winden, wormhole.page). There is no maintained pure-JS client.
- **The browser cannot reproduce the transit half.** In the Rust WASM build every direct-connection path — STUN, the TCP listener, `direct-tcp-v1` hint generation, the "listen just in case" branch — is compiled out under `#[cfg(not(target_family = "wasm"))]`. What remains is _relay only_, over `websocket-v1` hints, to a relay you host. The public transit relay is advertised as TCP only.
- **QR does not remove the need for a PAKE.** The reference implementation's QR encodes `wormhole-transfer:{code}` — literally the same code it prints for typing, same 16 bits. A scanned code _can_ carry 128 bits, and at that entropy the offline-grinding argument does evaporate; but any typed fallback puts the small dictionary straight back, and the design is only as strong as its weakest addressing mode.

---

## 1. The code's shape, exactly

A wormhole code is `<nameplate>-<word>-<word>`, e.g. `4-purple-sausages`.

**The nameplate** is "a non-negative integer (`0` is allowed, and used for a 'YOLO' mode) with up to 40 digits"; the server "will reject nameplates that contain non-digits or are too long", and notes that "wormhole codes are expected to be transcribed between humans, so overly long nameplates suggest you're holding it wrong" ([server-protocol.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/server-protocol.md)). The nameplate is **not secret**: the server's `list` command returns every allocated nameplate for the bound AppID, expressly so a receiver's tab-completion knows which prefixes to offer (same source).

**The words** come from the [PGP Word List](https://en.wikipedia.org/wiki/PGP_word_list) — two lists of 256 words each (even and odd), alternated so a dropped word is detectable. Each word is chosen as `byte_to_odd_word[os.urandom(1)]` / `byte_to_even_word[os.urandom(1)]`: **exactly one byte, eight bits, per word** ([`_wordlist.py`](https://github.com/magic-wormhole/magic-wormhole/blob/master/src/wormhole/_wordlist.py)).

**The default length is two words.** `w.allocate_code(code_length=2)` ([`wormhole.py`](https://github.com/magic-wormhole/magic-wormhole/blob/master/src/wormhole/wormhole.py)); the API docs say the words are "a randomly-generated selection from the PGP wordlist, providing a default of 16 bits of entropy" ([api.rst](https://github.com/magic-wormhole/magic-wormhole/blob/master/docs/api.rst)). The Rust client uses the same list (`src/core/pgpwords.json`) with a configurable `num_words` ([wordlist.rs](https://github.com/magic-wormhole/magic-wormhole.rs/blob/main/src/core/wordlist.rs)).

**The whole code — nameplate included — is the PAKE password.** The client does `SPAKE2_Symmetric(to_bytes(code), idSymmetric=to_bytes(self._appid))` ([`_key.py`](https://github.com/magic-wormhole/magic-wormhole/blob/master/src/wormhole/_key.py)). The nameplate adds no secrecy (it is public), but including it binds the key to a specific rendezvous, and the AppID as `idSymmetric` binds it to a specific application.

### The typeable-versus-guessable trade-off, stated by upstream

The specification does not pretend 16 bits is large. It argues from the _attacker's economics_ instead:

> "An attacker gains _on average_ only one file for every 2^16 = 65536 attempts. Since there is no possibility of targetting any individual connection (because who would re-try sending their file hundreds of times if it keeps failing?), any gained data would be fairly useless in most of the cases. Because failed guessing attempts result in failed key exchanges, brute force attacks are inherently very disruptive of the service, and thus easy to detect." — [security.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/security.md)

And from the Python docs: "You should expect to see about 32000 failures before they have a 50% chance of being successful. If you see many failures, and think someone is trying to guess your codes, you can use e.g. `wormhole send --code-length=4` to make a longer code" ([attacks.rst](https://github.com/magic-wormhole/magic-wormhole/blob/master/docs/attacks.rst)).

Two load-bearing premises hide in that paragraph, and **both are properties of the application, not of the cryptography**:

1. **The code is per-send and never reused.** "There is no possibility of targetting any individual connection" only holds if a failed attempt does not leave the same code sitting there to be attacked again.
2. **Failures are visible.** "Easy to detect" only holds if the app surfaces them. An app that silently retries has converted a one-guess budget into an unbounded one.

## 2. The PAKE: why a 16-bit secret cannot be ground offline

### The construction

SPAKE2 is due to Abdalla and Pointcheval, ["Simple Password-Based Encrypted Key Exchange Protocols", CT-RSA 2005](https://www.di.ens.fr/~pointche/Documents/Papers/2005_rsa.pdf). Each side picks a random scalar and sends its public element **blinded by the password**:

```
x ← Zp ; X ← g^x ; X* = X · M^pw
y ← Zp ; Y ← g^y ; Y* = Y · N^pw
```

`python-spake2` implements this on Ed25519 (128-bit security level, 33-byte messages) and finalises with

```
key = H( H(pw) || H(idA) || H(idB) || X* || Y* || K )
```

with the symmetric variant sorting the two messages, since neither side knows which is which:

```python
def finalize_SPAKE2_symmetric(idSymmetric, msg1, msg2, K_bytes, pw):
    first_msg, second_msg = sorted([msg1, msg2])
    transcript = b"".join([sha256(pw).digest(), sha256(idSymmetric).digest(),
                           first_msg, second_msg, K_bytes])
    return sha256(transcript).digest()
```

([`spake2.py`](https://github.com/warner/python-spake2/blob/master/src/spake2/spake2.py))

On the wire this is the `pake` phase, `{"pake_v1": <hex>}`, "the binary SPAKE2 message (the one computed as `X+M*pw` or `Y+N*pw`)" ([client-protocol.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/client-protocol.md)).

### Why an eavesdropper learns nothing testable

`X*` is a uniformly random group element regardless of `pw` — for _every_ candidate password there is a consistent `X = X*/M^pw`. Nothing in the transcript lets an attacker tell which candidate is right, because the only value that would distinguish them, `K`, requires solving Diffie-Hellman. That is the whole point of the blinding, and it is why the security proof reduces to (a variant of) CDH. Abdalla and Pointcheval state the design goal directly:

> "The goal of these protocols is to restrict the adversary's success to on-line guessing attacks only. In these attacks, the adversary must be present and interact with the system in order to be able to verify whether its guess is correct. **The security in these systems usually relies on a policy of invalidating or blocking the use of a password if a certain number of failed attempts has occurred.**" (§1, Introduction; emphasis added)

Their bound for SPAKE1/SPAKE2 (Theorem 8) is proportional to `(q_send^A + q_send^B)` — the number of **active** Send queries — not to the number of hash queries an attacker can make at leisure.

`python-spake2`'s README says the same in operational terms:

> "A passive attacker who eavesdrops on the connection learns no information about the password or the generated secret. An active attacker (man-in-the-middle) gets exactly one guess at the password, and unless they get it right, they learn no information about the password or the generated secret. **Each execution of the protocol enables one guess.** The use of a weak password is made safer by the rate-limiting of guesses: no off-line dictionary attack is available to the network-level attacker" — [README](https://github.com/warner/python-spake2/blob/master/README.md)

**Note the sentence the ticket cares about**: the paper itself says the security "relies on a policy of invalidating or blocking". The algorithm supplies one-guess-per-execution. It does _not_ supply the policy that stops you having a million executions. That is somebody else's job — see §3.

### Preconditions the algorithm imposes

- **Instances and messages are single-use.** `python-spake2` raises `OnlyCallStartOnce`, `OnlyCallFinishOnce`, and `ReflectionThwarted` (someone replaying your own message back at you). The README: "you must never re-use a SPAKE2 instance for multiple key agreements: that would reveal the key and/or password."
- **M and N must have unknown discrete logs.** RFC 9382 §7: "the choice of M and N is critical for the security proof. The generation methods specified in this document are designed to eliminate concerns related to knowing discrete logs of M and N." ([RFC 9382](https://www.rfc-editor.org/rfc/rfc9382.txt))
- **Received elements must be validated.** RFC 9382 §7: "Elements received from a peer MUST be checked for group membership… An endpoint MUST abort the protocol if any received public value is not a member of G."
- **Randomness must be uniform and never reused.** RFC 9382 §7: "Randomly generated values, e.g., x and y, MUST NOT be reused; such reuse violates the security assumptions of the protocol and results in significant insecurity."
- **Timing.** `python-spake2` is candid: "This library is very much _not_ constant-time, and does not protect against timing attacks."

> **Version caveat worth carrying into any ADR.** The magic-wormhole docs link [RFC 9382](https://datatracker.ietf.org/doc/rfc9382/) as the variant used ([welcome.rst](https://github.com/magic-wormhole/magic-wormhole/blob/master/docs/welcome.rst)), but the wire format is `python-spake2`'s `pake_v1`, which is the older Abdalla–Pointcheval construction with a symmetric `M = N` parameter set and its own transcript hash. RFC 9382 defines an asymmetric A/B protocol with a different transcript encoding (`TT = len(A) || A || len(B) || B || len(pA) || pA || len(pB) || pB || len(K) || K || len(w) || w`, §3.3). **They are not interoperable.** Anything that claims "RFC 9382 compliance" is not automatically wire-compatible with magic-wormhole.

## 3. One guess and it burns: what actually enforces it

Three independent mechanisms. The ticket asks whether it is the protocol or the server; the answer is **both, plus the algorithm, and all three are load-bearing.**

### Layer 1 — the algorithm: one execution, one guess

As above. An active attacker who inserts himself must commit to a password guess when he sends his own `pake` message. He learns whether he was right only by trying to use the resulting key. He cannot try a second candidate against the same execution.

### Layer 2 — the client protocol: the failure is terminal and loud

The `version` phase is the key confirmation. It is the first message encrypted under the derived key, and it is authenticated:

> "As this is the first encrypted message, it also serves as a test to check if the encryption worked or failed… we use authenticated encryption (`nacl.SecretBox`), so if this decryption succeeds, then we're confident that _somebody_ used the same wormhole code as us… **If any message cannot be successfully decrypted, the mood is set to 'scary', and the wormhole is closed, the nameplate/mailbox will be released, and the WebSocket connection will be dropped.**" — [client-protocol.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/client-protocol.md)

In the reference client that path is a state-machine transition to `S3_closing` via `close_scared`, which sets the result to `WrongPasswordError()` and closes with mood `"scary"` ([`_boss.py`](https://github.com/magic-wormhole/magic-wormhole/blob/master/src/wormhole/_boss.py)). The API docs describe `WrongPasswordError` as "we received at least one incorrectly-encrypted message… perhaps because of a typo, or maybe an attacker tried to guess your code and failed" ([api.rst](https://github.com/magic-wormhole/magic-wormhole/blob/master/docs/api.rst)).

There is also an optional belt-and-braces: a **verifier**, a subkey derived with purpose `wormhole:verifier`, that both humans can compare out of band. It is the only defence against an attacker who _did_ guess correctly (client-protocol.md; api.rst).

### Layer 3 — the mailbox server: exactly two sides, no more

The server refuses a third participant, in both places it could appear:

```python
rows = db.execute("SELECT * FROM `mailbox_sides` WHERE `mailbox_id`=?", (mailbox_id,)).fetchall()
if len(rows) > 2:
    raise CrowdedError("too many sides have opened this mailbox")
```

and, for nameplates, `raise CrowdedError("too many sides have claimed this nameplate")` ([`server.py`](https://github.com/magic-wormhole/magic-wormhole-mailbox-server/blob/master/src/wormhole_mailbox_server/server.py)). There is also a `ReclaimedError` — "you cannot re-claim a nameplate that your side previously released" — but it is keyed on `side`, so it stops a buggy client, not an attacker with a fresh `side`.

This is what makes a successful guess _noticed_. Upstream states the combined property:

> "Each code is **one-time use only**, so attackers (e.g. a malicious Mailbox server) get only a single guess when attempting to subvert a connection. If such a guess is successful, one of the two intended peers will notice: their connection will fail, typically with a 'crowded' or 'scary' error." — [welcome.rst](https://github.com/magic-wormhole/magic-wormhole/blob/master/docs/welcome.rst)

### What is _not_ enforced anywhere

This matters as much as what is.

- **No rate limiting of any kind.** There is no per-IP throttle, no failed-attempt counter, no backoff in the mailbox server source. The only mechanism specified is the optional "permission" extension — a hashcash proof-of-work advertised in the `welcome` message, "to enable a proof-of-work challenge (using HashCash) when under attack to slow it down" (security.md; server-protocol.md). The ecosystem doc says it has "a 'proof-of-concept' Python client and server implementation and a specification but is not in any releases" ([ecosystem.rst](https://github.com/magic-wormhole/magic-wormhole/blob/master/docs/ecosystem.rst)).
- **Nameplates are reused immediately.** [magic-wormhole#31](https://github.com/magic-wormhole/magic-wormhole/issues/31), "don't re-allocate nameplates right away", is **still open**. attacks.rst spells out the cost: "If the server refused to reuse the same channel id (aka 'nameplate') right away (issue #31), a network attacker would be unable to set up the second connection, cutting this attack in half. An attacker who controls the server would not be affected."
- **The nameplate space is small and enumerable on purpose.** security.md: "An attacker may simply connect to every nameplate with a random code, causing the key exchange to fail. There is a 'list' command in the protocol which makes it easy to enumerate all nameplates to disrupt them, but even without it the name space is sufficiently small (by design, as we want short codes) to brute force."

**So the honest statement of the guarantee is:** _one guess per session, and a failed guess destroys the session and is visible to both honest parties._ It is **not** "one guess ever", and it is **not** rate-limited. It holds because a code is minted fresh per send, lives for minutes, and dies on first misuse.

## 4. The rendezvous mailbox: what it sees, what it must be trusted for, and its lifecycle

### What the server sees

From the wire ([server-protocol.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/server-protocol.md)) and its own operations doc ([operations.md](https://github.com/magic-wormhole/magic-wormhole-mailbox-server/blob/master/docs/operations.md)):

| Sees                                                                  | Notes                                                                                                                               |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| AppID                                                                 | from `bind`; scopes every nameplate and mailbox                                                                                     |
| Both `side` strings                                                   | random hex per client; reused across reconnects                                                                                     |
| Nameplate and mailbox id                                              | the mailbox id is a large random string, the nameplate a short integer                                                              |
| **Phase names** (`pake`, `version`, `0`, `1`, …)                      | plaintext; reveals protocol stage and message ordering                                                                              |
| Message bodies                                                        | hex; "either a random-looking cryptographic value (for the PAKE message), or a random-looking encrypted blob" — it cannot read them |
| Timestamps and sizes of every message                                 | security.md: "Any involved server will know the timestamp and size of each message it relays"                                       |
| IP address                                                            | recorded in an `address_ids` table, indirected to an "addrid" tuple                                                                 |
| Client implementation + version                                       | self-reported at `bind`, logged per connection in `client_versions`                                                                 |
| Moods (`happy` / `lonely` / `scary` / `errory`) + `crowded`, `pruney` | stored per nameplate and per mailbox in the usage DB                                                                                |

The privacy indirections — addrid generations, `--addrid-db=:memory:`, `--blur-usage=` — are **the operator's choices, not protocol guarantees**. A client cannot tell whether they are on.

### What it must be trusted for

- **Availability.** It is a single point of failure by design: "Wormhole codes can be so short because they implicitly contain a common rendezvous server URL… As a result, successful operation depends upon both clients being able to contact that server, making it a single point of failure" (security.md).
- **Not spending its own guess.** A malicious server has exactly the same 1-in-65536 chance as a network attacker — plus the ability to reuse the nameplate immediately to reach the second peer (attacks.rst, issue #31). The verifier is the only defence.
- **Not correlating.** It cannot read content, but it sees who talked to whom, when, and how much.

It is **not** trusted for confidentiality of payload, and it is **not** trusted for integrity — everything after `pake` is `nacl.SecretBox` under a key derived per-phase as `HKDF-SHA256(shared_key, "wormhole:phase:" + sha256(side) + sha256(phase))` (client-protocol.md).

### Nameplate / mailbox lifecycle

```
S→C  welcome            (may carry motd, error, permission-required{hashcash|none})
C→S  submit-permissions (optional)
C→S  bind {appid, side}
C→S  allocate           → S→C allocated {nameplate}      # allocation auto-claims, to avoid a race
C→S  claim {nameplate}  → S→C claimed {mailbox}          # sent even when self-allocated
C→S  open {mailbox}                                       # also subscribes this websocket
C→S  add {phase, body}  → S→C message {side, phase, body} to all connected sides
C→S  release {nameplate} → S→C released
C→S  close {mailbox, mood} → S→C closed
```

Rules that matter for a design:

- **A nameplate points at a mailbox**, and is deliberately short-lived: "Nameplates (on the server) must live until the second client has learned about the associated mailbox, after which point they can be reused by other clients. So if two clients connect quickly, but then maintain a long-lived wormhole connection, they do not need to consume the limited space of short nameplates for that whole time." The nameplate is deleted "once the last client has released it, or after some period of inactivity."
- **A mailbox is kept alive by an open client or by a nameplate pointing at it**; when the nameplate is pruned for inactivity, the mailbox goes with it.
- **Messages are an unordered set.** "The Mailbox server does not de-duplicate messages, nor does it retain ordering: clients must be prepared to handle duplicates and buffer/reorder messages as necessary." Numeric phases are reserved for application data and _are_ delivered to the app in strict numeric order by the client (client-protocol.md).
- **Pruning:** `CHANNEL_EXPIRATION_TIME = 11 * MINUTE`, `EXPIRATION_CHECK_PERIOD = 5 * MINUTE` ([`server_tap.py`](https://github.com/magic-wormhole/magic-wormhole-mailbox-server/blob/master/src/wormhole_mailbox_server/server_tap.py)). The server comment: "The client is allowed to disconnect for up to 9 minutes without losing the channel (nameplate, mailbox, and messages)." operations.md phrases the same timeout as 10 minutes. **A code is a ten-minute object, not a persistent address.**
- **Messages are persisted** and the server "will not send a direct response until any side-effects… have been safely committed to the database" — so it survives a restart, and so a message _is_ stored, encrypted, for up to the expiry window.

### Should a shipped app depend on the public rendezvous server?

**No.** Not on evidence from upstream's own files.

- The URL is `wss://relay.magic-wormhole.io/v1`, and the source comment above it reads in full: _"This is a relay I run on a personal server. If it gets too expensive to run, I'll shut it down."_ ([`src/wormhole/cli/public_relay.py`](https://github.com/magic-wormhole/magic-wormhole/blob/master/src/wormhole/cli/public_relay.py)).
- attacks.rst, on the DoS problem: "I do not have any good mitigations for this attack, and functionality may depend upon the continued goodwill of potential vandals… **If the API is sufficiently compelling for other applications to incorporate Wormhole 'technology' into their apps, I'm expecting that they'll run their own mailbox server**… For the built-in/upstream send-text/file/directory tools, using the public relay that I run, it may just have to be a best-effort service, and if someone decides to kill it, it fails."
- Nameplate scarcity is **per-AppID** — "Distinct app-ids reduce the size of the connection-id numbers" (api.rst) — so at minimum an app must mint its own AppID. But sharing a host with an unknown population means sharing its outage and abuse surface.
- **The one production web client agrees.** Winden's checked-in configuration points at servers Least Authority operates, not the public ones:
  ```
  MAILBOX_URL="wss://mailbox.stage.mw.leastauthority.com/v1"
  RELAY_URL="wss://relay.stage.mw.leastauthority.com"
  ```
  ([`client/.env.example`](https://github.com/LeastAuthority/winden/blob/main/client/.env.example))

Both servers are small, permissively-licensed Twisted services (`magic-wormhole-mailbox-server`, `magic-wormhole-transit-relay`) with SQLite state and a `--blur-usage` switch, so self-hosting is genuinely cheap — but it is a **hosting commitment**, and map #185's "Not yet specified → Relay operations" is where that lands.

## 5. Browser reality

### The rendezvous half: already browser-legal, and already shipped twice

Nothing in the mailbox protocol needs a raw socket. It is "a WebSocket connection to the Mailbox server", messages "serialized as JSON, encoded to UTF-8, and the resulting bytes sent as a single 'binary-mode' WebSocket payload" (server-protocol.md), and the public endpoint is already `wss://`.

**Implementations:**

| Implementation                                                             | Language       | Browser story                                           | State                               |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------- | ----------------------------------- |
| [`magic-wormhole.rs`](https://github.com/magic-wormhole/magic-wormhole.rs) | Rust           | **`wasm32-unknown-unknown` is a first-class CI target** | maintained (pushed 2026-07; v0.8.1) |
| [`bakkot/magic-wormhole-js`](https://github.com/bakkot/magic-wormhole-js)  | JS             | pure-JS client, SPAKE2 via WASM                         | **abandoned** (last push 2024-09)   |
| [Winden](https://github.com/LeastAuthority/winden)                         | TS + Rust/WASM | production web app, [winden.app](https://winden.app)    | maintained (pushed 2026-07)         |
| [wormhole.page](https://wormhole.page)                                     | Rust/WASM      | production web app                                      | named in upstream's ecosystem doc   |

- The Rust CI matrix includes `- os: WASM / target: wasm32-unknown-unknown / features: transit,transfer`, built as `cargo build -p magic-wormhole --target wasm32-unknown-unknown --no-default-features --features transit,transfer` ([`.github/workflows/push.yml`](https://github.com/magic-wormhole/magic-wormhole.rs/blob/main/.github/workflows/push.yml)). Its WASM-target dependencies are `ws_stream_wasm`, `getrandom` with the `js` feature, and `wasmtimer` ([`Cargo.toml`](https://github.com/magic-wormhole/magic-wormhole.rs/blob/main/Cargo.toml)). The CHANGELOG records "\[all\] Added compilation support for WASM targets", together with a note that matters for us: "**Most WASM targets however refuse to connect to non-TLS websockets.**"
- Winden wraps it: `client/vendor/magic-wormhole.rs` is a git submodule of the upstream Rust repo ([`.gitmodules`](https://github.com/LeastAuthority/winden/blob/main/.gitmodules)), and `client/wasm` is a `cdylib` crate depending on `magic-wormhole = { path = "../vendor/magic-wormhole.rs" }` with `wasm-bindgen` ([`client/wasm/Cargo.toml`](https://github.com/LeastAuthority/winden/blob/main/client/wasm/Cargo.toml)). _(Upstream's ecosystem.rst still describes Winden as "using the Go implementation via WASM" — that is stale against Winden's current `main`, which vendors the Rust one.)_
- The abandoned JS port's README carries a useful warning about the ecosystem: "**Spake2 is not widely implemented.** This project uses a [rust implementation](https://github.com/RustCrypto/PAKEs/tree/master/spake2) compiled to WebAssembly." Even the JS port used WASM for the PAKE.

**Verdict: the key exchange is borrowable in a browser today**, as a WASM module, with two shipped precedents. There is no maintained pure-JS option and no reason to want one.

### The transit half: not reproducible, structurally

magic-wormhole's own transit protocol tries direct TCP first and falls back to a relay ([transit.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/transit.md)). In the Rust WASM build, **the entire direct path is compiled out**. In `src/transit.rs`:

- the IP-address detection, STUN query and socket bind sit under `#[cfg(not(target_family = "wasm"))] if abilities.can_direct()`;
- the `direct-tcp-v1` connector chain is `#[cfg(not(target_family = "wasm"))]`;
- the TCP relay connector is `#[cfg(not(target_family = "wasm"))]`, with a **separate** `#[cfg(target_family = "wasm")]` branch that iterates `hint.ws` and calls `transport::connect_ws_relay(url, name)`;
- the "Also listen on some port just in case" inbound branch is `#[cfg(not(target_family = "wasm"))]`.

([`src/transit.rs`](https://github.com/magic-wormhole/magic-wormhole.rs/blob/main/src/transit.rs))

So in a browser there is **no peer-to-peer case at all**: every byte goes through a relay, over a WebSocket.

The good news is that this is _specified_, not a hack. transit.md's "Transports" section defines a WebSockets transport alongside TCP, with the framing kept identical so "the same protocol parsing to be used for TCP and for WebSockets", and the relay "will also connect two clients using different protocols together". Relay hints carry `{"type": "websocket-v1", "url": "<url>"}`. The Python relay implements it: `--websocket` / `--websocket-url` options and a `WebSocketTransitConnection` protocol ([`server_tap.py`](https://github.com/magic-wormhole/magic-wormhole-transit-relay/blob/master/src/wormhole_transit_relay/server_tap.py), [`transit_server.py`](https://github.com/magic-wormhole/magic-wormhole-transit-relay/blob/master/src/wormhole_transit_relay/transit_server.py)).

The bad news: **the public transit relay is advertised TCP-only** — `TRANSIT_RELAY = "tcp:transit.magic-wormhole.io:4001"` (`public_relay.py`) — and the transit-relay changelog through 0.5.0 (2-Mar-2026) never announces a public WebSocket endpoint. Winden's `RELAY_URL="wss://relay.stage.mw.leastauthority.com"` is Least Authority's own. A browser build therefore needs **a WebSocket transit relay you host**, and that relay carries 100% of the bytes for 100% of transfers.

### The one browser-native alternative for the bytes: WebRTC, via a different protocol

[`saljam/webwormhole`](https://github.com/saljam/webwormhole) (2,082 stars, pushed 2025-12) is the design that keeps the PAKE and swaps the transport for something browsers actually have:

> "This package removes the signalling server from the trust model by using a PAKE to estabish the authenticity of the WebRTC metadata. In other words, it's a clone of Magic Wormhole made to use WebRTC as the transport." — [`wormhole/dial.go`](https://github.com/saljam/webwormhole/blob/master/wormhole/dial.go)

The handshake is: open a slot on a WebSocket signalling server, run the PAKE over it, then exchange `secretbox(offer)` / `secretbox(answer)` / `secretbox(candidates…)` — "The session descriptions include the fingerprints of the DTLS certificates that WebRTC uses to secure its communications" ([README](https://github.com/saljam/webwormhole/blob/master/README)). Bytes then flow over the WebRTC DataChannel, direct where NAT traversal succeeds, TURN otherwise.

Three caveats, all from its own README:

1. **It is not magic-wormhole.** "Is it compatible with magic-wormhole? It is not."
2. **Different PAKE.** CPace, not SPAKE2, "because CPace and PAKE2 were the finalists for CFRG PAKE selection process".
3. **The README's first three lines are a shouted warning**: "THIS PROJECT IS STILL IN EARLY DEVELOPMENT IT USES EXPERIMENTAL CRYPTOGRAPHIC LIBRARIES AND IT HAS NOT HAD ANY KIND OF SECURITY OR CRYPTOGRAPHY REVIEW THIS SOFTWARE MIGHT BE BROKEN AND UNSAFE."

Its default code is also 2 bytes — `set.Int("length", 2, "length of generated secret")` ([`cmd/ww/file.go`](https://github.com/saljam/webwormhole/blob/master/cmd/ww/file.go)) — so 16 bits is the going rate across both ecosystems.

It also makes explicitly the point map #185's decision 4 will have to answer for a web app: "the convenience of using the web client directly on webwormhole.com comes at the cost of having to trust the code it serves. If the server is ever compromised it can be used inject malicious code that undermines the security of the client." A browser PWA cannot escape trusting its own origin, whatever the PAKE proves about the _signalling_ server. (Inventoria is installable and service-worker cached, which narrows but does not close that.)

### The browser checklist

To reproduce a magic-wormhole code's guarantee in a browser you need **all five**:

1. **A mailbox server you operate, on `wss://`.** Browsers refuse plaintext WebSockets from an HTTPS origin, and the Rust changelog says WASM targets refuse them too.
2. **SPAKE2 reachable from JS.** In practice: `magic-wormhole.rs` compiled to `wasm32-unknown-unknown` with `wasm-bindgen`, as Winden does. Budget for the WASM payload in an offline-first PWA — it must be precached, like the SQLite WASM already is (#125).
3. **A byte path.** Either a WebSocket transit relay you also operate, or WebRTC with the SDP and DTLS fingerprints authenticated under the PAKE key (webwormhole's shape, not magic-wormhole's). There is no direct-connection case in a browser.
4. **The two-sides cap, on your server.** This is not free with a hand-rolled rendezvous — it is the `CrowdedError` check, and without it the "somebody will notice" argument fails.
5. **A UI that treats a failed decrypt as terminal.** One bad `version` message means burn the code, release the mailbox, tell the user, and do **not** offer "try again" on the same code.

## 6. What a QR path changes — and what it does not

### As shipped, a QR carries no more entropy than the typed code

The reference CLI's QR is literally the printed code:

```python
if not args.zeromode and args.qr:
    qr = QRCode(border=1)
    qr.add_data(f"wormhole-transfer:{code}")
```

([`cmd_send.py`](https://github.com/magic-wormhole/magic-wormhole/blob/master/src/wormhole/cli/cmd_send.py); the toggle landed in 0.22.0 as "Display / suppress QR code with `WORMHOLE_QR=0`".) The URI scheme is `wormhole-transfer:{code}` with optional `version`, `rendezvous` and `role` query fields ([uri-scheme.md](https://github.com/magic-wormhole/magic-wormhole-protocols/blob/main/uri-scheme.md)). **So today, QR removes typing, not guessing.** Same 16 bits.

One detail from uri-scheme.md worth stealing regardless: the `role` field exists precisely because scanning is one-directional — "This functionality can be used if it is easier (from the user's point of view) to read the URI in the opposite direction (for example because QR codes are used and only one device is equipped with a camera)." Whoever holds the camera decides who leads.

### Does high entropy remove the need for a PAKE?

**For a scanned-only path, in the narrow sense: yes.** A PAKE exists to make a _small_ secret safe. If the code carries, say, 128 uniformly random bits, there is no dictionary to grind: you could feed the code straight into HKDF and use the result as a symmetric key, or use it to authenticate an ephemeral X25519 exchange, and an offline attacker has nothing to attack. That is a real simplification and it removes the WASM dependency.

**But it does not survive contact with the rest of the design**, for three reasons:

1. **A typed fallback re-imports the whole problem.** #185's decision 9 says "ephemeral per-send code for people (nothing stored), QR ideal". "Ideal" is not "only". The moment a user reads a code aloud over the phone — the actual scenario the map opens with — the secret is back to what a human will transcribe, which is roughly 16–32 bits. A design is only as strong as its weakest addressing mode, and **the reason magic-wormhole uses one code format for both is so there is no weak mode.** If Inventoria wants both a QR and a spoken code, either both go through a PAKE, or the spoken path must be explicitly documented as the weaker one with its own guess-burning discipline.
2. **The rendezvous identifier must not be derived from the secret** — and this is exactly the trap a "just hash the code to get a channel id" design falls into. attacks.rst is unusually blunt:

   > "Using the secret words as part of the 'channel id' isn't safe, since it would allow a network attacker, or the mailbox server, to deduce what the secret words are: since they only have 16 bits of entropy, the attacker just makes a table of hash(words) → channel-id, then reverses it. To make that safer we'd need to increase the codes to maybe 80 bits (ten words), plus do some significant key-stretching (like 5-10 seconds of scrypt or argon2), which would increase latency and CPU demands, and still be less secure overall."

   A QR-only design at 128 bits _could_ afford a derived channel id. A design with a typed fallback cannot, at any key-stretching budget a phone will tolerate.

3. **Entropy alone does not authenticate.** A high-entropy code stops guessing; it does not by itself bind the key to the two intended endpoints. Whatever replaces the PAKE must still mix the code, both endpoints' ephemeral public values, and an application identifier into the final key — which is the same discipline SPAKE2 encodes, minus the blinding.

### The residual argument for a PAKE even at high entropy

Two smaller points, both worth a line in the ADR:

- A high-entropy scanned code has to _exist somewhere_ — a QR on a screen, possibly a URL in a browser history or a deep-link handler. A PAKE means that even a code that leaked _after_ the transfer is worthless, because the derived key was never a function the attacker can evaluate from the transcript.
- The one-guess-and-it-burns property is what makes a _short-lived, single-use_ code coherent. At 128 bits you can drop the PAKE, but you still want the two-side cap, the terminal failure, and the ten-minute expiry — because those are what stop an attacker who _did_ obtain the code from quietly using it, and none of them come from entropy.

## 7. What would be lost by borrowing the shape without the enforcement

Stated plainly, because this is the failure mode #195 exists to prevent, and it feeds #199:

| Borrowed          | Dropped              | What actually happens                                                                                                                                                                                                                                            |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three-word code   | The PAKE             | The code (or anything derived from it — a channel id, a hash, a URL path) is grindable offline against a 65,536-entry dictionary in microseconds. attacks.rst names this exact mistake.                                                                          |
| Code + PAKE       | The two-sides cap    | An attacker who guesses joins as a third party. Nobody gets a `crowded` error. "One guess, detected in all other cases" degrades to "one guess, silent" — and the detection _is_ the security argument.                                                          |
| Code + PAKE + cap | The terminal failure | A retry loop, a "wrong code, try again" prompt, or a client that re-derives on the same mailbox turns a one-guess budget into an unbounded online attack. The paper's own text: security "relies on a policy of invalidating or blocking the use of a password". |
| Code + everything | A per-send code      | Reusing or remembering a code makes an individual transfer targetable, which is the premise security.md's "no possibility of targetting any individual connection" rests on.                                                                                     |
| Code + everything | A server you control | Availability is somebody else's goodwill, and the server retains its own one-guess MitM plus immediate nameplate reuse (#31 open).                                                                                                                               |

## 8. Open items this note does not settle

- **Which byte path.** WebSocket transit relay (magic-wormhole-shaped, one hop, you host, you pay for every byte) versus WebRTC DataChannel (webwormhole-shaped, direct where NAT allows, but a different protocol with an unreviewed reference implementation, and still needs TURN). This is #194's question; §5 supplies the constraint that in a browser there is **no third option**.
- **Whether to speak magic-wormhole's actual wire protocol** (and inherit the spec, the servers, and future interop) or only borrow the SPAKE2 construction. Interop with `wormhole send` is worth nothing to Inventoria — the payload is an NDJSON reference closure, not a file — but the specification and the two server implementations are worth a great deal.
- **WASM payload budget.** Inventoria already precaches SQLite WASM for offline boot (#125). A second WASM module for the PAKE is not free; measuring it belongs with the transport decision.
- **Nothing here was run.** No client was built, no server contacted, no code added.

---

## Source index

Everything above is cited inline. The primary repositories, for a reader following up:

- Protocol specifications: <https://github.com/magic-wormhole/magic-wormhole-protocols> — `client-protocol.md`, `server-protocol.md`, `transit.md`, `security.md`, `uri-scheme.md`
- Python reference client: <https://github.com/magic-wormhole/magic-wormhole> — `docs/attacks.rst`, `docs/api.rst`, `docs/welcome.rst`, `docs/ecosystem.rst`, `src/wormhole/_key.py`, `_boss.py`, `_wordlist.py`, `cli/public_relay.py`, `cli/cmd_send.py`
- Mailbox server: <https://github.com/magic-wormhole/magic-wormhole-mailbox-server> — `src/wormhole_mailbox_server/server.py`, `server_tap.py`, `docs/operations.md`
- Transit relay: <https://github.com/magic-wormhole/magic-wormhole-transit-relay> — `src/wormhole_transit_relay/server_tap.py`, `transit_server.py`
- Rust client: <https://github.com/magic-wormhole/magic-wormhole.rs> — `Cargo.toml`, `src/transit.rs`, `src/core/wordlist.rs`, `CHANGELOG.md`, `.github/workflows/push.yml`
- SPAKE2: <https://github.com/warner/python-spake2>; [RFC 9382](https://www.rfc-editor.org/rfc/rfc9382.txt); [Abdalla & Pointcheval, CT-RSA 2005](https://www.di.ens.fr/~pointche/Documents/Papers/2005_rsa.pdf)
- Browser clients: <https://github.com/LeastAuthority/winden>; <https://github.com/saljam/webwormhole>; <https://github.com/bakkot/magic-wormhole-js>
