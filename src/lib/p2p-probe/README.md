# #198 probe — two phones on a table, no server: does a meal cross?

**Throwaway.** Dev-only, dead-code eliminated from the production build, kept as
a primary source for [#198](https://github.com/palebluebytes/inventoria/issues/198)
rather than as anything to build on. It writes nothing to the ledger and reads
nothing from it.

[#194](https://github.com/palebluebytes/inventoria/issues/194) established what
the platform _claims_ — no STUN server is required, host candidates need no
infrastructure, iOS Safari has carried data channels since 2017, and mDNS
obfuscation is universal and standardised nowhere. It could not establish
whether an exchange actually completes between two phones on a given network.
That is this.

## Running it

Two phones need HTTPS: camera access and `RTCPeerConnection` are both
secure-context only, so `http://<lan-ip>:5173` is not an option on either
platform.

```sh
pnpm proto:198
# in another shell
nix shell nixpkgs#cloudflared -c cloudflared tunnel --url http://localhost:5173
```

Open the printed `https://<something>.trycloudflare.com/?demo=p2p198` on both
devices. The page arrives over the internet; nothing the probe measures does.

**For the no-internet run:** load the page on both phones first, then put both
into Airplane mode and switch Wi-Fi back on (or join one phone to the other's
hotspot). Leave the tabs open — there is no service worker on this route, so a
reload with no internet loses the page.

## What it builds, measured before any phone was involved

The probe rebuilds #199's meals in the browser from the bundled USDA corpus,
through the app's own mappers, with #197's narrowing applied. Run against the
committed artifacts it lands within a few percent of #199, slightly dear because
it uses the widest corpus rows throughout where #199 mixed in packaged goods
(which #197's narrowing made the cheaper twin):

| meal                       | entities | datoms | raw       | deflated | #199 said | symbols @2900 B | symbols @1200 B |
| -------------------------- | -------- | ------ | --------- | -------- | --------- | --------------- | --------------- |
| a normal meal              | 8        | 40     | 14.5 KiB  | 2.2 KiB  | 13.0      | **1**           | 2               |
| a cooked dinner            | 22       | 104    | 42.0 KiB  | 5.2 KiB  | 34.9      | 2               | 5               |
| a Christmas dinner         | 66       | 309    | 118.8 KiB | 13.0 KiB | 114.6     | 5               | 12              |
| an implausibly large feast | 132      | 612    | 232.1 KiB | 24.5 KiB | 224.0     | 9               | **22**          |

Both symbol columns turned out to be beside the point. **The rule is one symbol
or nothing** — a chain is a cycling slideshow the sender has to hold steady while
the recipient films it, which is not handing someone a meal. So the QR-only
path's entire budget is a single symbol, and the question is what fits in one.

Measured against the widest corpus rows, deflated, with #197's narrowing:

| foods | dishes | entities | datoms | raw    | deflated  | fits v40-L (2,939 B) | fits v35-L (2,292 B) |
| ----- | ------ | -------- | ------ | ------ | --------- | -------------------- | -------------------- |
| 1     | 0      | 2        | 10     | 4,192  | 995       | yes                  | yes                  |
| 2     | 0      | 4        | 20     | 7,845  | 1,459     | yes                  | yes                  |
| 3     | 0      | 6        | 30     | 11,205 | 1,850     | yes                  | yes                  |
| **4** | 0      | 8        | 40     | 14,805 | **2,239** | **yes**              | **yes**              |
| 5     | 0      | 10       | 49     | 18,214 | 2,674     | yes                  | no                   |
| 6     | 0      | 12       | 58     | 21,620 | 3,083     | no                   | no                   |
| 4     | 1      | 10       | 50     | 19,464 | 2,939     | exactly              | no                   |

**Four foods.** That is the whole of what a QR can hand over on its own, and it
is the four-food meal the probe proved on hardware at version 35. v40-L would
buy a fifth, but v35 is the version two phones were actually observed reading.

The consequence is the design: **QR carries the handshake, the data channel
carries the meal.** The handshake is 395 B one way and 334 B the other whatever
the meal weighs, so it is always one symbol — the uniform case, not the lucky
one.

## The two paths, cheapest first

1. **QR only.** A real narrowed closure, raw-DEFLATE'd, split across a chain of
   symbols with our own 14-byte frame header, read back through the camera.
   Whether a normal meal fits one symbol is now an arithmetic question
   ([#199](https://github.com/palebluebytes/inventoria/issues/199) says 2.5 KiB
   gzipped against 2,953 bytes at v40-L) but whether that symbol _scans off a
   phone screen_ is not — Denso Wave's own FAQ puts a phone camera at "271 bytes
   or so". Hence the bytes-per-symbol slider.
2. **QR-signalled WebRTC.** Offer QR on the sender, answer QR on the recipient,
   a data channel between them, and `iceServers: []` — the empty default RFC
   8445 §5.1.1.2 permits. Both devices must show and both must read; #194 §4.4
   proved a one-way code can never connect, and #199 §8 adopted that as a stated
   property rather than a fallback.

## What it measures that #194 could only predict

- **The real SDP sizes.** #194 §4.2's table was reconstructed line by line from
  each engine's serializer and carries its own "Reconstruction caveat". The
  probe captures the browser's own offer, the compact field-extracted record,
  and both deflated, side by side.
- **What ICE actually gathered**, including the RFC 8828 §7 diagnostic: no host
  candidates at all means a policy suppressed them and the LAN path was gone
  before the exchange started.
- **The selected candidate pair** from `getStats()` — the difference between "it
  worked" and knowing how.
- **Whether binary bytes survive a QR round trip**, which #194 §4.3 reasoned
  about but never ran. `base64` is a switch beside it.
- **Whether the compact SDP rebuild is accepted by a real browser.** `full` is
  the switch beside it, so a rebuild that Chrome rejects fails the encoding
  rather than the probe.

## The ordering hypothesis, which #194 does not state

All three engines switch mDNS obfuscation off for a document once camera
permission is granted (#194 §5.2), and §5.3 says the fatal case is symmetric:
both sides obfuscating, neither able to resolve. **A QR flow grants camera
permission by construction.** So the order of camera-grant and candidate
gathering decides whether the peer is handed a `<uuid>.local` name or a real IP —
which is exactly the variable behind Google's "mDNS succeeded about half the
time". The `open the camera before gathering` checkbox runs both orderings so
the difference is measured rather than argued.

Note the asymmetry the flow creates on its own: the sender gathers before it
ever needs a camera, while the recipient must scan the offer first and therefore
gathers with obfuscation already off. #194 §5.3's peer-reflexive rescue predicts
that is enough. The probe reports whether it was.

## One scan, with a rendezvous

The third path, and the one a user would actually want: **the recipient scans
once and nothing else happens by hand.**

#194 §4.4 proves a session needs a _bidirectional exchange_ — ICE keys a check
on the peer's password, DTLS on the peer's fingerprint, and no shared seed
derives a certificate. #199 §8 wrote that up as "both devices must show and both
must read, in every mode", which was true under §4's no-server premise where a
human was the only channel there was. A rendezvous separates the two claims: the
exchange stays bidirectional, and only one leg stays human.

The QR carries three things and totals **100 characters** — smaller than the
two-QR handshake's 395 bytes:

| field                         | what it is for                                                                                                                                                                                                                           |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| room                          | where the rendezvous is holding the offer                                                                                                                                                                                                |
| the sender's DTLS fingerprint | #199 §9's no-MITM clause: it reaches the peer through the camera, never through the rendezvous, so a substituted offer is detectable                                                                                                     |
| a 256-bit AES-GCM key         | the direction the fingerprint cannot cover — the sender gets the _recipient's_ fingerprint from the rendezvous and cannot check it, so a hostile rendezvous could pose as the recipient and would hold ciphertext for a key it never saw |

The rendezvous is `probeRendezvousPlugin` in `vite.config.ts` — two routes, a
`Map`, a five-minute sweep, `configureServer` only so it cannot reach a build.
It holds two session descriptions for the seconds a handshake takes and never
the meal, so #199 §4's "exactly two places, never three" survives and the code's
life is still bounded by the sender waiting.

## Scan or paste, and why the difference is not cosmetic

#199 §2 made scan and paste both first-class addressing modes. They are not
equivalent to ICE. **Scanning opens a camera, and camera permission switches
mDNS obfuscation off in all three engines** (#194 §5.2), so a scanned exchange
hands both devices real IPs as a side effect of how the code travelled.
**Pasting grants nothing**, so both sides keep their `<uuid>.local` names — which
is exactly the symmetric case #194 §5.3 calls fatal: neither can resolve the
other, and with no STUN there is nothing to fall back to.

A scan-only probe cannot reach that case at all, because the answerer has to
scan the offer before it can gather. Paste mode is the only way to test the
failure a shipped design would actually hit, which is why it is here.

## What is worth keeping

The page is throwaway. Under it:

- `qr-chain.ts` — framing and reassembly, pure, order-independent,
  duplicate-tolerant.
- `sdp-compact.ts` — the field extraction, the canonical rebuild, and the
  candidate census.
- `probe-payload.ts` — #197's narrowing and the reference-closure walk,
  expressed as code for the first time.
- `probe-log.ts` — the timeline and the report that pastes into the ticket.
