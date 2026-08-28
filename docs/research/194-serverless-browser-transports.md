# Research: what two browsers can exchange with nothing in between (#194)

**Parent map:** [#185](https://github.com/palebluebytes/inventoria/issues/185) — send a meal to another person, and let your own devices converge. This ticket discharges the map's decision 4, which admits a rendezvous or relay that never reads content but requires the zero-infrastructure path be explored properly first.
**Grounds:** the wire shape and both ends of it already exist — `src/lib/db/ledger-export.ts` (ADR-0064, NDJSON datoms), `src/lib/db/ledger-import.ts` (ADR-0067, merge never wipe), `src/lib/views/ledger/export-target.ts` and `src/lib/views/ledger/import-source.ts` (the save picker and the file input), and the `share_target` already declared in `vite.config.ts`.
**Siblings:** [#196](https://github.com/palebluebytes/inventoria/issues/196) measures the payload this note prices options against, and is **not yet done** — every payload figure here is either a platform ceiling or a per-datom cost derived from the export code, never a measured closure. [#193](https://github.com/palebluebytes/inventoria/issues/193) asks the same reachability question of iroh. [#182](https://github.com/palebluebytes/inventoria/issues/182) built the importer whose existence makes the file baseline real.
**Date:** 2026-08-28. **Status:** research only — no code, no ADR. Every claim carries the primary source that owns it; claims that could not be sourced primarily are marked **unsourced** rather than dropped.

---

## 1. The answer in one paragraph

**Two browsers can exchange an unbounded payload with no server of any kind, but only while they are on the same local network, and only if they can first swap two small blobs by some out-of-band channel — which a pair of QR codes does comfortably.** A WebRTC data channel needs no STUN and no TURN to connect over host candidates; the connection is end-to-end encrypted by DTLS and its payload has no total-size ceiling. The zero-server path stops being possible at exactly two places, and both are hard stops rather than inconveniences. The first is **the return leg**: a WebRTC connection cannot be established from a one-way offer, so the two devices must be able to show each other a code, which means they must be in the same room. The second is **a different network**: once the peers are not on the same link, discovering a routable address requires a STUN server, and a NAT pair that defeats hole punching requires a TURN relay — at which point a server exists, though a correctly built one still cannot read the ledger. Everything else the question asks about is worse: WebTransport is client-to-server only, Web NFC is tag-only and refuses peer-to-peer in its own scope section, Web Bluetooth cannot make a browser a peripheral so two phones can never pair, and none of the three exists on iOS Safari at all. The boring baseline — export the file, AirDrop it, import it — already crosses both networks and both platforms today, offline, with no server, and the fancier path buys exactly three things it cannot: a round trip, an ephemeral address, and no plaintext artifact left lying in two Downloads folders.

---

## 2. The table

Payload ceiling is the transport's own limit, not the meal's; #196 owns the meal's size.

| Option                                                       | Needs a server                                                     | No internet at all             | Cross-network                                                  | iOS Safari                                            | Payload ceiling                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **WebRTC data channel, QR signalling, host/mDNS candidates** | **Never**                                                          | **Yes**, same Wi-Fi or hotspot | **No** — host candidates are link-local                        | **Yes**, since iOS 11 (2017-09-19)                    | **Unbounded total**; 256 KB per message, 16 MiB queued                                |
| **WebRTC data channel + STUN**                               | Rendezvous only — STUN learns your public address and nothing else | No                             | Mostly — fails when either NAT does endpoint-dependent mapping | Yes                                                   | Unbounded total                                                                       |
| **WebRTC data channel + TURN**                               | **Relay** — sees both IPs, timing and volume; cannot read a byte   | No                             | **Yes**                                                        | Yes                                                   | Unbounded total                                                                       |
| **WebTransport**                                             | **Relay, always** — no peer shape exists                           | No                             | Yes, via the server                                            | Yes, but only since iOS 26.4 (2026-03-24)             | Server-bound, not peer-to-peer                                                        |
| **Web Bluetooth**                                            | Never                                                              | Yes                            | No                                                             | **No** — WebKit position `oppose`, 2025-12-02         | 512 bytes per attribute, and **browser-to-browser is impossible**: no peripheral role |
| **Web NFC**                                                  | Never                                                              | Yes                            | No                                                             | **No** — WebKit `WONTFIX`, "we will not implement it" | 144–888 bytes of tag memory, and **peer-to-peer is out of scope by spec**             |
| **Web Share (outgoing files)**                               | Depends on the app the user picks                                  | Depends                        | Depends                                                        | Yes, since iOS 15 (2021-09-20)                        | No documented limit, but Chromium's type allowlist excludes `.ndjson`                 |
| **Web Share Target (incoming files)**                        | Never                                                              | Yes                            | n/a                                                            | **No** — WebKit bug open since 2019-02-13             | Chromium only                                                                         |
| **File System Access**                                       | Never                                                              | Yes                            | n/a                                                            | **No** — WebKit position `oppose`; OPFS half only     | n/a — it is a picker, not a transport                                                 |
| **QR code, single symbol**                                   | Never                                                              | Yes                            | No                                                             | Yes                                                   | **2,953 bytes** at v40-L                                                              |
| **QR code, Structured Append**                               | Never                                                              | Yes                            | No                                                             | Yes                                                   | **≈47 KB** across 16 symbols, and see §9                                              |
| **The file: AirDrop / Quick Share**                          | **Never** for the local path                                       | **Yes**                        | **Yes** — hand it over, or post it                             | Yes                                                   | 64 MB on iOS (our own fallback ceiling), otherwise none documented                    |
| **The file: chat or email attachment**                       | **Relay, and it reads the file**                                   | No                             | Yes                                                            | Yes                                                   | 25 MB (Gmail send), 50 MB (receive)                                                   |

Read the first row against the AirDrop row. Both are "never" and both are "yes" on no-internet — they differ only on cross-network, and that difference is the whole design question.

**One correction to the vocabulary the map inherits.** "Rendezvous only" sounds safer than "relay", and for confidentiality it is the other way round. A TURN relay carries packets it cannot decrypt (§6.4) and cannot substitute the DTLS fingerprint it never sees. A signalling or rendezvous server carries **the fingerprint itself**, and RFC 8827 §9.1 says plainly that such a server "can potentially mount a man-in-the-middle attack unless implementations have some mechanism for independently verifying keys" (§6.5). The dangerous server is the one that introduces the peers, not the one that forwards their bytes.

---

## 3. What has to cross, and what one datom costs

#196 has not yet measured a meal's reference closure, so this note prices the _line_, not the meal. Both figures below are computed from `datomLine()` in `src/lib/db/ledger-export.ts`, which writes the seven columns in table order with `JSON.stringify`.

- **Structural floor per datom: 87 bytes.** That is the JSON keys, punctuation, the four pairs of quotes and the newline, with every value empty.
- **A realistic datom: 180–220 bytes.** A `event:consume_<uuid>` entity is 50 characters and the `device_id` is a `crypto.randomUUID()` at 36, so identity alone is 86 bytes of every line before any fact is stated.

The consequence for the QR question is blunt and worth stating before any of the platform research: **at ~200 bytes a line, a single QR code at its absolute maximum (2,953 bytes, §9) holds about 14 datoms, and a full 16-symbol Structured Append chain holds about 230.** QR is not a payload carrier for this app. It is a carrier for the 384-byte handshake in §4, and that is the only job it can do.

Two further repo facts bear on the options below:

- The export's non-Chromium path has a **64 MB ceiling** (`EXPORT_FALLBACK_CEILING_BYTES` in `ledger-export.ts`), because `showSaveFilePicker` is Chromium-only and the fallback assembles the file in memory. On iOS that ceiling is the real one.
- The importer reads the file **twice** — once to validate, once to write — so that a malformed file is refused before any row lands. A live transport that hands over a stream rather than a file has to satisfy the same all-or-nothing promise.

---

## 4. WebRTC signalling: how many bytes, and does it fit a QR code

### 4.1 The mandatory lines

JSEP is now **RFC 9429** (April 2024), which obsoletes RFC 8829; the normative text in the two sections that matter here is unchanged. ([RFC 9429](https://www.rfc-editor.org/rfc/rfc9429.txt))

RFC 9429 §5.8.3 "Semantics Verification" is the list a receiver actually enforces: ICE ufrag and password per [RFC 8839 §5.4](https://www.rfc-editor.org/rfc/rfc8839.html#section-5.4), a `tls-id` per [RFC 8842](https://www.rfc-editor.org/rfc/rfc8842.html), a DTLS setup value per [RFC 5763 §5](https://www.rfc-editor.org/rfc/rfc5763.html), and "DTLS fingerprint values, where **at least one fingerprint MUST be present**". §5.8.2 adds that an SCTP `m=` section "MUST" carry `a=sctp-port`; [RFC 8841 §5.1](https://www.rfc-editor.org/rfc/rfc8841.html#section-5.1) says the same from the other side. The data section itself is fixed by RFC 9429 §5.2.1: `m=application`, proto `UDP/DTLS/SCTP`, fmt `webrtc-datachannel`. On top of that [RFC 8866 §9](https://www.rfc-editor.org/rfc/rfc8866.html#section-9) requires `v=`, `o=`, `s=` and at least one `t=`.

> **Spec versus deployment.** `a=tls-id` is mandatory per RFC 9429 §5.2.1 and §5.8.3 and is implemented by **neither Chrome nor Firefox** — libwebrtc's SDP serializer has no such constant ([`api/webrtc_sdp.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/api/webrtc_sdp.cc)), and Gecko's attribute enum has no member for it ([`SdpAttribute.h`](https://github.com/mozilla/gecko-dev/blob/master/dom/media/webrtc/sdp/SdpAttribute.h)). This is cross-browser, not a Chrome quirk.

### 4.2 The byte counts

The fingerprint is the irreducible core. [RFC 8122 §5](https://www.rfc-editor.org/rfc/rfc8122.html#section-5) represents it as uppercase hex bytes separated by colons, so SHA-256 is 64 hex digits plus 31 colons = **95 characters**, and the whole line is **119 bytes with CRLF**. SHA-256 is not a choice: [`webrtc-pc` §4.9](https://www.w3.org/TR/webrtc/#certificate-management) requires a generated certificate set to include "an ECDSA certificate with a private key on the P-256 curve and a signature with a SHA-256 hash".

The credentials are near their floor already. RFC 8839 §5.4 gives `ufrag = 4*256ice-char` and `password = 22*256ice-char`, with 24 bits of randomness required in the ufrag and 128 in the password. libwebrtc ships `ICE_UFRAG_LENGTH = 4` and `ICE_PWD_LENGTH = 24` ([`p2p/base/p2p_constants.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/p2p/base/p2p_constants.cc)); nICEr ships 8 and 32 ([`ice_ctx.c`](https://github.com/mozilla/gecko-dev/blob/master/dom/media/webrtc/transport/third_party/nICEr/src/ice/ice_ctx.c)). Chrome is at the RFC minimum for the ufrag.

| Payload                                                                      | Bytes (CRLF) |
| ---------------------------------------------------------------------------- | ------------ |
| Chrome offer, pre-gathering (trickle)                                        | 458          |
| Chrome offer, gathering complete, one IPv4 host candidate                    | 578          |
| Chrome offer, gathering complete, one mDNS host candidate (Chrome's default) | 591          |
| Firefox offer, gathering complete, one IPv4 host candidate                   | 559          |
| **Spec-floor offer** (RFC 9429 §5.8.3 mandatory only, one candidate)         | **384**      |
| **Spec-floor answer**                                                        | **383**      |
| Same content re-encoded as a compact binary record                           | **60**       |

The spec-floor offer breaks down as: `v=` 5, `o=` 24, `s=` 5, `t=` 7, `m=` 50, `c=` 18, one candidate 60, ufrag 18, pwd 34, **fingerprint 119**, setup 17, mid 9, sctp-port 18. The fingerprint alone is 31% of the total, and `UDP/DTLS/SCTP webrtc-datachannel` is another 32 bytes carrying about two bits of information.

The 60-byte binary floor is: 32-byte raw fingerprint, 3-byte ufrag, 16-byte password, 4-byte IPv4, 2-byte UDP port, 2-byte SCTP port, one flags byte. **32 of those 60 bytes are a hash and are incompressible by construction.** Everything else in an SDP is squeezable; the fingerprint is not.

> **Reconstruction caveat.** The Chrome and Firefox SDPs above were built line by line from each engine's own SDP serializer, not captured from a running browser. The line inventory and ordering are sourced; the random values and three conditional Chrome session-level lines (`a=group:BUNDLE`, `a=extmap-allow-mixed`, `a=msid-semantic`, 49 bytes together) are not verified against live output. The `a=max-message-size:262144` value is also **unsourced** — the agent traced the assignment but not the constant's definition, so treat it as ±24 bytes.

### 4.3 It fits, comfortably

QR capacity is §9. Against it:

| Payload                                    | Bytes | Min version, byte mode, EC level L              |
| ------------------------------------------ | ----- | ----------------------------------------------- |
| Chrome offer, complete, one IPv4 candidate | 578   | **v16** (81×81)                                 |
| Chrome offer, complete, one mDNS candidate | 591   | v17 (85×85)                                     |
| Spec-floor offer                           | 384   | **v13** (69×69)                                 |
| Spec-floor offer, raw-DEFLATE first        | 288   | v11 (61×61)                                     |
| Spec-floor answer, raw-DEFLATE first       | 267   | **v10** (57×57)                                 |
| Binary floor                               | 60    | **v4** (33×33), and still only v7 at EC level H |

Two counter-intuitive results worth carrying:

- **Base64 makes it worse, not better.** QR alphanumeric mode's 45-character set is uppercase-only, so base64's lowercase excludes it from alphanumeric mode and it lands in byte mode anyway, at 10.67 bits per payload byte against raw byte mode's 8.00 — a 33% penalty. gzip+base64 is the worst combination available: the Chrome offer goes 578 → gzip 428 → base64 572 characters, needing v19, versus v13 for raw DEFLATE in byte mode. If you want reader robustness rather than density, [base45 (RFC 9285)](https://www.rfc-editor.org/rfc/rfc9285.html) costs 3.1% over byte mode and survives a reader that insists on decoding text.
- **The practical scanning ceiling is around v15–v20, not v40.** Denso Wave's own statement is that a phone camera reads "271 bytes or so (for Version 10 with error correction level L)" ([qrcode.com FAQ](https://www.qrcode.com/en/faq.html)), which is exactly the v10-L byte capacity. A v40 symbol on a 70 mm phone screen read at arm's length falls below the sampling floor of a 1080p preview pipeline. The offer and answer both land inside the comfortable band with headroom for error correction.

### 4.4 The answer must come back, and this is the first hard stop

A one-way offer QR can never establish a connection, for two independent reasons.

**ICE.** [RFC 8445 §7.2.2](https://www.rfc-editor.org/rfc/rfc8445.html#section-7.2.2) keys a connectivity check on the _peer's_ password: "A connectivity check from L to R utilizes the username RFRAG:LFRAG and a password of **RPASS**." §7.3 grants a narrow exemption — the initiating agent may _answer_ an inbound Binding request before it has the peer's candidates, because the response uses its own password — but the same paragraph continues "Once the answer is received, it MUST proceed with the remaining steps required." The offerer can reply; it cannot originate a check, validate a pair, or nominate. Appendix B.4 explains that the credentials are "actually **required for correct operation of ICE in the first place**", not merely for security.

**DTLS.** RFC 5763 §5: "The certificate presented during the DTLS handshake MUST match the fingerprint exchanged via the signaling path in the SDP… If the fingerprint does not match the hashed certificate, then the endpoint **MUST tear down the media session immediately**." The offerer has no way to obtain the answerer's fingerprint except from the answer.

And it cannot be engineered around in a browser. One might imagine putting a shared seed in the offer and having both sides derive identical credentials, but the fingerprint is over an X.509 certificate and the only certificate API is `RTCPeerConnection.generateCertificate(keygenAlgorithm)`, which takes **an algorithm, not key material** ([`webrtc-pc` §4.9](https://www.w3.org/TR/webrtc/#certificate-management)). The peer's fingerprint is unpredictable by construction.

The consolation is that the return leg is the _cheaper_ one: 383 bytes bare against 384, 267 deflated against 288, v10 against v13. The design cost is not bytes. It is that **both devices must have a camera pointed at the other's screen**, which is a statement about the room, not about the network.

### 4.5 Trickle does not apply, and what that changes

[RFC 8838](https://www.rfc-editor.org/rfc/rfc8838.html) Trickle ICE presupposes a signalling channel that stays open. A QR code is a one-shot human-mediated frame, so this is RFC 8838 §16 **half trickle**: gather a full generation of candidates first, then emit one description that "can thus be handled by a regular ICE agent".

In practice: `createOffer` → `setLocalDescription` → await `iceGatheringState === "complete"` → read `pc.localDescription`, which by then has the candidates folded in ([`webrtc-pc`](https://www.w3.org/TR/webrtc/#rtcicegatheringstate-enum); RFC 9429 §3.5.1). The legacy null-candidate event is documented as existing "only… for backwards compatibility, and this event does not need to be signaled to the remote peer". The visible cost is that the offer QR cannot be rendered instantly — with host-only candidates that is milliseconds, but with a STUN or TURN server it is seconds.

Candidate lines are where the compaction leverage is:

| Candidate line                                                           | Bytes |
| ------------------------------------------------------------------------ | ----- |
| Minimal IPv4 host, one-character foundation                              | 60    |
| Chrome's actual IPv4 host, with `generation`/`network-id`/`network-cost` | 111   |
| Chrome's actual **mDNS** host candidate                                  | 129   |
| `a=end-of-candidates`                                                    | 21    |

Chrome's overhead is entirely the non-standard `cand-extension` tail, appended unconditionally by [`api/candidate.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/api/candidate.cc). Nothing requires transmitting it — **stripping it saves 51 bytes per candidate**, and shortening the CRC32-derived foundation to one digit saves up to 9 more.

`a=end-of-candidates` is defined by [RFC 8840 §8](https://www.rfc-editor.org/rfc/rfc8840.html#section-8), not by 8838. **Chrome neither emits nor parses it**; Firefox does both, and additionally strips `a=ice-options:trickle` once gathering completes ([`SdpHelper.cpp`](https://github.com/mozilla/gecko-dev/blob/master/dom/media/webrtc/sdp/SdpHelper.cpp)). Include it anyway — 21 bytes buys a fast ICE failure verdict against a Firefox peer instead of a timeout.

---

## 5. Zero internet: host and mDNS candidates

### 5.1 No STUN server is required, and no browser refuses

[RFC 8445 §5.1.1](https://www.rfc-editor.org/rfc/rfc8445.txt) splits the four candidate types by what they cost: "The server-reflexive candidates are gathered using STUN or TURN, and relayed candidates are obtained through TURN." Host candidates are not in that sentence. §5.1.1.1 defines gathering one as binding a socket — "The agent obtains each candidate by binding to a UDP port on the specific IP address" — and nothing more.

The permission to skip servers is explicit, §5.1.1.2:

> "An ICE agent SHOULD gather server-reflexive and relayed candidates. However, use of STUN and TURN servers may be unnecessary in certain networks and use of TURN servers may be expensive, so some deployments may elect not to use them."

SHOULD, not MUST. The W3C WebRTC spec (**Recommendation, 13 March 2025**) matches: `iceServers` is `sequence<RTCIceServer> iceServers = []` — **the default is the empty list** ([`webrtc-pc` §4.2.1](https://www.w3.org/TR/webrtc/#dom-rtcconfiguration-iceservers)) — and no algorithm step makes gathering conditional on it being non-empty. MDN states the consequence: "If this isn't specified, the connection attempt will be made with no STUN or TURN server available, **which limits the connection to local peers**" ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/RTCPeerConnection)). Limits to local peers, not fails. The web-platform-tests suite asserts exactly this: every case in [`RTCPeerConnection-iceGatheringState.html`](https://github.com/web-platform-tests/wpt/blob/master/webrtc/RTCPeerConnection-iceGatheringState.html) constructs `new RTCPeerConnection()` with no configuration at all and requires gathering to reach `complete` having emitted non-null candidates.

No engine refuses. In libwebrtc — which is Chrome, Edge **and** Safari — the split is structural: `CreateUDPPorts()` (host) is unguarded, while `CreateStunPorts()` bails with `"AllocationSequence: No STUN server configured, skipping."` ([`basic_port_allocator.cc`](https://webrtc.googlesource.com/src/+/refs/heads/main/p2p/client/basic_port_allocator.cc)). Firefox runs nICEr, where host gathering is off only if `media.peerconnection.ice.no_host` is set, and it defaults to `false` ([`all.js`](https://hg.mozilla.org/mozilla-central/raw-file/tip/modules/libpref/init/all.js)).

One diagnostic worth building in, from [RFC 8828 §7](https://www.rfc-editor.org/rfc/rfc8828.txt): "Applications SHOULD detect when they don't have access to the full set of ICE candidates by checking for the presence of host candidates. If no host candidates are present, Mode 3 or 4 is in use" — that is, a policy has suppressed them, and the LAN path is gone before you start.

### 5.2 mDNS obfuscation is universal, default-on, and standardised nowhere

Every host candidate a browser hands the page is, by default, not an IP address. It is a `<uuid>.local` name.

**The specification for this does not exist as a specification.** `draft-ietf-mmusic-mdns-ice-candidates` is at revision **-03**, dated 2021-12-05, **expired 2022-06-09**, labelled "Expired & archived" by the datatracker, intended status _Informational_, and **never published as an RFC** ([datatracker](https://datatracker.ietf.org/doc/draft-ietf-mmusic-mdns-ice-candidates/), [text](https://www.ietf.org/archive/id/draft-ietf-mmusic-mdns-ice-candidates-03.txt)). The W3C WebRTC Recommendation mentions mDNS exactly once, only to forbid such candidates under a `relay` transport policy; RFC 9429 never mentions it at all. A mechanism that decides whether two phones in a room can talk is carried entirely by three independent implementations of a dead draft.

The mechanism, draft §3.1.1: generate a **version 4 UUID followed by `.local`**, register it per RFC 6762, and hand the page the name instead of the address. Three details matter downstream:

- **Failure is invisible to the page.** "the ICE agent SHOULD still provide mDNS candidates in step 6 **even if the local network does not support mDNS or mDNS registration fails**" — deliberately, so a page cannot use ICE to probe for mDNS support. You cannot detect the broken case from JavaScript.
- **The `c=` line cannot carry the name**: §3.1.2.4 requires `0.0.0.0`/`::` and port `9`, "as experimental deployment has indicated that many remote endpoints will fail to handle such a SDP."
- **Resolution is deliberately narrow**: §3.2.1 resolves only a name ending `.local` with exactly one dot, and §3.2.2 says agents "SHOULD NOT resolve mDNS names if they are not in the format defined by Section 3.1" — so a page cannot use ICE to resolve `my-nas.local`.

**All three engines obfuscate by default, and all three switch it off for a document once `getUserMedia` has been granted.** That is [RFC 8828 §5.2](https://www.rfc-editor.org/rfc/rfc8828.txt)'s suggested consent hook — "Mode 1 MUST NOT be used unless user consent has been provided… one potential mechanism is to tie this consent to getUserMedia" — implemented three times independently.

| Engine   | Default on since                                                                                                                                         | Rule                                                                           | Source                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium | Finch from **M76** (2019-07-30), compiled default **M78** (2019-10-22)                                                                                   | `GetMdnsResponder()` returns null once mic **or** camera permission is granted | [WebRTC PSA, 2019-08-13](https://groups.google.com/g/discuss-webrtc/c/6stQXi72BEU); [`features.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/common/features.cc); [`filtering_network_manager.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/platform/p2p/filtering_network_manager.cc) |
| Firefox  | **74**, 2020-03-10 (desktop); Android only in **149**                                                                                                    | `obfuscate_host_addresses &= !IsActivelyCapturingOrHasAPermission(winId)`      | [Firefox 74 release notes](https://www.mozilla.org/en-US/firefox/74.0/releasenotes/); [`PeerConnectionImpl.cpp`](https://searchfox.org/mozilla-central/source/dom/media/webrtc/jsapi/PeerConnectionImpl.cpp)                                                                                                                                                                        |
| WebKit   | STP 54 experimental **2018-04-05**, default on from STP 74 / [bug 193358](https://bugs.webkit.org/show_bug.cgi?id=193358) (2019-01-14), in **Safari 13** | `UserMediaRequest::allow` calls `disableICECandidateFilteringForDocument`      | [STP 54](https://webkit.org/blog/8232/release-notes-for-safari-technology-preview-54/), [STP 74](https://webkit.org/blog/8566/release-notes-for-safari-technology-preview-74/), [Safari 13 notes](https://developer.apple.com/documentation/safari-release-notes/safari-13-release-notes)                                                                                           |

WebKit was first, and its motivation is precisely our use case: [WebKit Bugzilla 174500](https://bugs.webkit.org/show_bug.cgi?id=174500) is titled "WebRTC data channel only applications require capture permissions for direct connections", and mDNS is the fix that let a data-channel-only page connect directly **without** asking for a camera. On Apple platforms WebKit registers the name through Bonjour directly — `makeString(WTF::UUID::createVersion4(), ".local"_s)` then `DNSServiceRegisterRecord` ([`NetworkMDNSRegister.cpp`](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/webrtc/NetworkMDNSRegister.cpp)), compiled in wherever `<dns_sd.h>` exists. So iOS Safari does mint and register mDNS ICE names.

**There is no web-facing opt-out.** The only levers are: obtain camera or microphone permission (all three engines); Chrome's admin-only enterprise policy [`WebRtcLocalIpsAllowedUrls`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/policy/resources/templates/policy_definitions/Miscellaneous/WebRtcLocalIpsAllowedUrls.yaml) (79+, "weakens the protection of local IPs if needed by administrators"); Firefox's `media.peerconnection.ice.obfuscate_host_addresses.blocklist` pref; and for WebKit, **nothing** — the `WebRTCMDNSICECandidatesEnabled` preference was [removed entirely in January 2023](https://bugs.webkit.org/show_bug.cgi?id=250252), and [bug 227741](https://bugs.webkit.org/show_bug.cgi?id=227741), asking for a p-list switch, is still NEW.

### 5.3 Can peer B resolve peer A's name? Only on the same link, and only about half the time

[RFC 6762 §3](https://www.rfc-editor.org/rfc/rfc6762.txt) is categorical: "any fully qualified name ending in '.local.' is link-local, and **names within this domain are meaningful only on the link where they originate**… Any DNS query for a name ending with '.local.' MUST be sent to the mDNS IPv4 link-local multicast address 224.0.0.251 (or its IPv6 equivalent FF02::FB)." §11 requires discarding any response not from the local link.

So the zero-server path is a **same-link** path by definition. Within that constraint, the draft's own §5.1 is candid about how often it works:

> "First, some networks may entirely disable mDNS. Second, mDNS queries have limited scope. On large networks, this may mean that an mDNS name cannot be resolved if the remote endpoint is too many segments away. When mDNS fails, ICE will attempt to fall back to either NAT hairpin, if supported, or TURN relay if not."

And Google's measurement, same section: on a corpus with a STUN server but no TURN, enabling mDNS on both sides rather than one raised the share of connections needing STUN from 94% to 97%, "**indicating that mDNS succeeded about half the time**". Read against our case that is worse than it sounds, because we have no STUN and no TURN to fall back to: for us, the failure is total.

There is one rescue, §5.3: **peer-reflexive learning**. If _one_ side can resolve, it sends a check from its real address and the other side learns a peer-reflexive candidate, so ICE completes anyway. The fatal case is symmetric — both obfuscating, neither able to resolve — which on a LAN with no servers configured means ICE fails outright.

**What breaks it, concretely:**

- **AP client isolation.** Cisco Meraki: "Wireless Client Isolation is a security feature that prevents wireless clients from communicating with one another"; with it on, "clients will only be able to communicate with the default gateway". It is **disabled by default in Bridge mode but enabled by default in NAT mode and cannot be disabled** ([Meraki](https://documentation.meraki.com/Wireless/Operate_and_Maintain/How_Tos/Firewall_and_Traffic_Shaping/Wireless_Client_Isolation)) — and NAT mode is the shape of most guest and captive-portal Wi-Fi. Aruba calls it "Deny Intra VLAN Traffic" ([Aruba Central](https://help.central.arubanetworks.com/latest/documentation/online_help/content/access-points/cfg/networks/client-isolation.htm)), UniFi calls it "Client Device Isolation" ([UniFi](https://help.ui.com/hc/en-us/articles/18965560820247-Implementing-Network-and-Client-Isolation-in-UniFi)). On such a network no LAN path exists at all — raw host candidates would fail too.
- **A phone acting as the hotspot.** Android's SoftAP has a client-isolation switch defaulting to `false` in the framework builder, but it is `@SystemApi` behind a feature flag, so it is OEM and carrier territory, not app territory ([`SoftApConfiguration.java`](https://android.googlesource.com/platform/packages/modules/Wifi/+/refs/heads/main/framework/java/android/net/wifi/SoftApConfiguration.java)). **Unsourced:** no Apple first-party documentation was found on whether two devices joined to an iPhone's Personal Hotspot can address each other or exchange multicast. The map's "one hotspotting the other" scenario is therefore **unverified on the platform that matters most**.
- **iOS Local Network privacy — and the exemption that saves us.** Apple [TN3179](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) (iOS 14+) requires local network access for UDP unicast, UDP multicast, resolving "a local DNS name… ending with `.local`", and "**All Bonjour operations**". But it states an exception verbatim: "**Traffic originating from WKWebView, SFSafariViewController, and Safari doesn't require local network access.**" Since every iOS browser is WebKit, and a home-screen PWA is WebKit, Safari is documented as exempt from the prompt.
  > **Flagged.** That exemption sentence sits under the TCP/UDP "Local network operations" heading. The separate DNS and Bonjour sections restate their own requirements without repeating the exemption, and **no first-party text was found resolving whether the exemption covers the Bonjour registration and resolution WebKit performs on a page's behalf**. The observable facts are that WebKit compiles mDNS in on Cocoa and registers via `DNSServiceRegisterRecord`, and that no iOS-Safari bug reporting a Local Network prompt for WebRTC was found. This is the single most load-bearing unverified claim in this note and belongs in [#198](https://github.com/palebluebytes/inventoria/issues/198)'s test plan.
- **The native-app precedent shows the failure mode is real, and worse than expected.** [WebRTC issue 42221977](https://issues.webrtc.org/issues/42221977), "Ice failure when Local Network Permissions are declined on iOS 14": "An ice failure might occur when permissions are declined because Apple will close any sockets that send to the local network. **While somewhat extreme, forcing a relay connection doesn't help in the case where the remote Peer has mDNS host candidates.**" An unresolvable `.local` from the peer poisons the pair even when you _do_ have a TURN server. That is consistent with draft §3.3.2, which forbids pairing your own relay candidates with remote mDNS candidates precisely so the TURN server never learns the host IP.
- **Flakiness is on the record in the vendors' own trackers.** Firefox [1698141](https://bugzilla.mozilla.org/show_bug.cgi?id=1698141) ("mDNS ICE candidates breaks WebRTC-P2P connection between two computers on same private LAN", NEW) and [1733382](https://bugzilla.mozilla.org/show_bug.cgi?id=1733382) ("mDNS seems to be unreliable in CI", NEW); WebKit [187180](https://bugs.webkit.org/show_bug.cgi?id=187180), the `mdns-ice-candidates.html` layout test filed flaky in 2018 and still NEW; WebKit [231733](https://bugs.webkit.org/show_bug.cgi?id=231733), mDNS names minted on a cellular interface where they can never resolve.

### 5.4 A direction of travel worth pricing now

Chrome shipped **Local Network Access restrictions in Chrome 142** — a permission prompt gating requests from a public site to a local IP ([chromestatus](https://chromestatus.com/feature/5152728072060928), [WICG spec](https://wicg.github.io/local-network-access/)). A companion entry, **"Local Network Access Restrictions for WebRTC"**, is filed at [chromestatus 5065884686876672](https://chromestatus.com/feature/5065884686876672), status **"Proposed"**, no milestone: "Restricts the ability to make requests to the user's local network using WebRTC, gated behind a permission prompt." The plumbing already exists in libwebrtc ([`local_network_access_permission.h`](https://webrtc.googlesource.com/src/+/refs/heads/main/api/local_network_access_permission.h)). The WICG spec does not currently mention WebRTC, so this is Chromium-side and unspecified — but if it ships, the LAN-direct path acquires a permission prompt, and a design that assumed silence gets a dialog. WebKit is separately implementing the same web spec ([bug 250607](https://bugs.webkit.org/show_bug.cgi?id=250607), NEW, last touched 2026-07-21).

---

## 6. Cross-network: what becomes unavoidable, and what a relay can read

### 6.1 STUN is a server, but the thinnest one imaginable

Server-reflexive candidates come only from a server: RFC 8445 §5.1.1.2 obtains them by sending a Binding or Allocate request and reading the mapped address. [RFC 8489 §4](https://www.rfc-editor.org/rfc/rfc8489.txt) defines the term plainly — "A STUN server is an entity that receives STUN requests and STUN indications and that sends STUN responses" — so formally, yes, a server exists the moment you leave the link.

But note what it is and what it learns. "Binding requests to a STUN server are not authenticated" (RFC 8445 §5.1.1.2). It carries no media, holds no session state that matters, needs no credentials, and returns exactly one fact: the "Reflexive Transport Address… that identifies that client as seen by another host on an IP network". It learns your public IP:port and that you asked, at that moment. Against the map's decision 4 — a server may exist but must never read — **a STUN server is admissible without argument**, because there is nothing for it to read.

### 6.2 When a relay becomes unavoidable

[RFC 8835 §3.2](https://www.rfc-editor.org/rfc/rfc8835.txt), the WebRTC transports requirements document, states the condition normatively:

> "In order to deal with situations where both parties are behind NATs of the type that perform endpoint-dependent mapping (as defined in [RFC5128], Section 2.4), TURN [RFC8656] MUST be supported."

The behaviour that defeats hole punching is defined in [RFC 4787 §4.1](https://www.rfc-editor.org/rfc/rfc4787.txt): with **Endpoint-Independent Mapping** the NAT "reuses the port mapping for subsequent packets sent from the same internal IP address and port to **any** external IP address and port", whereas with Address-Dependent or Address-and-Port-Dependent Mapping it does not. That is the whole problem in one sentence: under endpoint-dependent mapping, the address your peer learned from the STUN server is _not_ the address your NAT will use when sending to the peer, so the candidate you advertised is stale by construction. RFC 4787's own justification for REQ-1 says the consequence: "Failure to meet REQ-1 will force the use of a UDP relay, which is very often impractical."

Filtering is a second, independent axis that can force a relay even with good mapping. REQ-8's justification gives the exact pairing: "**When the endpoints use ICE, if NAT-A uses Address and Port-Dependent Filtering, connectivity will require a UDP relay**" when the peer's NAT does not meet REQ-1.

Two further mandates: RFC 8835 §3.2 also requires TURN-over-TCP and TURN-over-TLS "In order to deal with firewalls that block all UDP traffic"; and the mDNS draft §3.3.2's ban on pairing relay candidates with remote mDNS candidates means a relay cannot rescue an unresolvable `.local` name (§5.3).

> **Terminology.** "Symmetric NAT" is deprecated in the IETF's own text. RFC 4787 §3: the RFC 3489 Cone/Symmetric vocabulary "has been the source of much confusion, as it has proven inadequate at describing real-life NAT behavior." "Symmetric" conflates address-and-port-dependent _mapping_ with address-and-port-dependent _filtering_, which have different consequences. Use RFC 4787's terms in the ADR.

### 6.3 How often, honestly

**No first-party, connection-level figure for the fraction of WebRTC sessions requiring TURN could be sourced.** Everything found was vendor-blog or aggregator material, much of it circular. Cloudflare's own TURN documentation describes when TURN is needed and publishes no rate. Rather than launder a number, here is what is sourceable and what each measures:

- The mDNS draft §5.1: on a corpus of mDNS-aware endpoints with STUN but no TURN, **94–97% of connections went through a NAT** and therefore needed STUN. That is a STUN-required rate on a self-selected population, not a TURN rate.
- [RFC 5128 §4](https://www.rfc-editor.org/rfc/rfc5128.txt), summarising 2008 academic NAT-CHECK measurements: "UDP hole punching works widely on more than 80% of the NAT devices… less than 25% of the devices passed the tests for Hairpinning." These are **device-level figures from 2008**, reported second-hand, and are not a modern session-level relay rate.

The IETF's own working assumption is that you have a relay: RFC 8828 §7 says applications "SHOULD deploy a TURN server with support for both UDP and TCP connections to the server". A design that refuses one is choosing to fail on some fraction of network pairs that nobody in this note could size.

### 6.4 A TURN server cannot read the ledger — and this is structural

[RFC 8831 §5](https://www.rfc-editor.org/rfc/rfc8831.txt) states the guarantee: "**DTLS protects the complete SCTP packet, so it provides confidentiality, integrity, and source authentication of the complete SCTP packet.**" §6.1 makes it mandatory: "The DTLS encapsulation of SCTP packets as described in [RFC8261] MUST be used." A data channel is encrypted end to end whether you ask for it or not.

TURN itself confirms it is outside that envelope. [RFC 8656 §21.1.6](https://www.rfc-editor.org/rfc/rfc8656.txt): "Confidentiality for the application data relayed by TURN is best provided by the application protocol itself since running TURN over (D)TLS does not protect application data between the server and the peer." For a WebRTC data channel that protection is always present. Cloudflare's first-party statement about its own service says the same in operator language: "Cloudflare cannot access the contents of the media being relayed… Cloudflare only relays encrypted packets and cannot decrypt or inspect the media content, which may include audio, video, or **data channel information**" ([Realtime TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/)).

**But the metadata is not incidental — it is the protocol's payload.** RFC 8656 §2.4 requires the client to hand the server the peer's address in every Send indication: "an XOR-PEER-ADDRESS attribute specifying the (server-reflexive) transport address of the peer and… a DATA attribute holding the application data", and §9 requires at least one XOR-PEER-ADDRESS in every CreatePermission. §21.1.6 summarises: "**The primary protocol content of the messages is the IP address of the peer.**" Cloudflare's own list of what it processes matches: "IP addresses of the TURN clients, port numbers, and session timing information."

So the honest statement for the ADR: **a relay sees who talked to whom, from where, when, for how long, and how much — and none of what was said.** For a personal food ledger that is the right trade, but it should be written down as a trade rather than as "the relay sees nothing".

### 6.5 Who can actually mount a man-in-the-middle, and why it is not the relay

The binding is the SDP fingerprint, and [RFC 8122 §3.3](https://www.rfc-editor.org/rfc/rfc8122.txt) states the condition it rests on:

> "If two endpoints have no prior relationship, self-signed certificates cannot generally be trusted, as there is no guarantee that an attacker is not launching a man-in-the-middle attack. Fortunately, however, **if the integrity of SDP session descriptions can be assured, it is possible to consider those SDP descriptions themselves as a prior relationship**."

The abstract makes the conditional explicit — secure "so long as the integrity of session descriptions is assured" — and §7 assigns the duty: "It is the responsibility of the encapsulating protocol to ensure the integrity of the SDP security descriptions."

[RFC 8827 §9.1](https://www.rfc-editor.org/rfc/rfc8827.txt) then names both halves of the threat:

> "If HTTPS is not used to secure communications to the signaling server… **any on-path attacker can replace the DTLS-SRTP fingerprints in the handshake** and thus substitute its own identity for that of either endpoint.
>
> Even if HTTPS is used, **the signaling server can potentially mount a man-in-the-middle attack unless implementations have some mechanism for independently verifying keys**."

[RFC 8826 §4.3.2](https://www.rfc-editor.org/rfc/rfc8826.txt) puts the same point in operational terms: a calling service "can simply mount a man-in-the-middle attack on the connection, telling Alice that she is calling Bob and Bob that he is calling Alice… Protecting against this form of attack requires positive authentication of the remote endpoint such as explicit out-of-band key verification (e.g., by a fingerprint)."

The precise conclusion, and it is the one the map's decision 4 needs:

- **A TURN relay is on the media path but not the signalling path.** It never sees the fingerprint being agreed and cannot alter it. To interpose it would have to complete a DTLS handshake presenting a certificate matching a fingerprint already committed in the SDP — it does not have the private key. It can drop and delay packets, and it sees all the metadata in §6.4, but it cannot read or forge content. **A relay is admissible under decision 4; it genuinely cannot read.**
- **Whoever carries the SDP can MITM**, by substituting fingerprints in both directions. In a browser app that is the signalling server — in most designs, the same origin that served the JavaScript. HTTPS protects the fingerprint from network attackers en route; it does not protect it from the server itself. **A rendezvous server is the dangerous one, not the relay** — which inverts the intuition the words "rendezvous only" invite.
- **And this is the strongest argument for the QR path that this note found.** If the SDP travels by QR code, NFC or a read-aloud code rather than through any server, RFC 8122's integrity assumption is satisfied by a channel an attacker would have to be physically present to modify. That is a materially stronger position than any HTTPS signalling server can offer, and it is a security property, not merely a convenience. [#199](https://github.com/palebluebytes/inventoria/issues/199) owns what the short code must guarantee; this is the specification-level reason the answer is not "TLS is enough".

---

## 7. The other four APIs, and why none of them is a peer transport

### WebTransport — no peer shape

Supported on Safari and iOS **26.4**, released **2026-03-24** ([Safari 26.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-26_4-release-notes): "Added support for WebTransport. (165721145)"; [WebKit Features for Safari 26.4](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/); [caniuse](https://caniuse.com/webtransport) gives Chrome 97+, Firefox 114+). WebKit's standards position is **support** ([standards-positions #18](https://github.com/WebKit/standards-positions/issues/18)).

None of which helps, and the refusal is structural rather than incidental.

The [W3C spec](https://www.w3.org/TR/webtransport/) (Candidate Recommendation Snapshot, 30 July 2026) defines "a set of ECMAScript APIs… to allow data to be sent and received **between a browser and server**", and the constructor enforces it: _"If url's scheme is not `https`, throw a `SyntaxError` exception."_ **There is no way to name a peer — only an `https` origin.** The [`draft-ietf-webtrans-overview`](https://datatracker.ietf.org/doc/draft-ietf-webtrans-overview/) model admits exactly two roles ("Endpoint: An endpoint refers to either a Server or a Client"), and the [IETF charter](https://www.ietf.org/charter/charter-ietf-webtrans-01.txt) says the group "will define new **client-server** protocols or protocol extensions". None of the three drafts is an RFC; all are in WG Last Call.

The WG's own explainer lists it under Non-Goals: **"Peer-to-Peer: WebTransport is strictly client-server. P2P use cases should continue to use WebRTC."** ([explainer.md](https://github.com/w3c/webtransport/blob/main/explainer.md))

And the peer-to-peer sibling is dead, not pending. **`w3c/p2p-webtransport` was archived on 2026-06-23** with the commit "Mark repository and spec as discontinued", and its README carries: _"The ORTC (Object Real-time Communications) Community Group was closed in April 2023. This document is no longer being pursued."_ ([repo](https://github.com/w3c/p2p-webtransport)) It was never a WebRTC WG deliverable — its `w3c.json` names the ORTC CG, which W3C records as closed 2023-04-07. It never shipped anywhere: Chrome's `RTCQuicTransport` was a flagged developer trial ([chromestatus](https://chromestatus.com/feature/6311472179183616), stale since 2022) and is absent from current trunk; MDN has no compat entry. Related IETF work — `draft-thatcher-p2p-quic` and `draft-seemann-quic-nat-traversal` — is expired and unadopted.

The one live thread, [w3c/webtransport#590](https://github.com/w3c/webtransport/issues/590), is parked: the co-chairs' recorded decision (2025-08-26) is to _"add to Future Version milestone, leave issue open but stop discussing for v1"_, with the ideal being to revisit "a year after client-server spec is released and in production". A **proposed** (not adopted) next charter says the group "is also considering incubating mechanisms for peer-to-peer capability".

> **Caution when reading around this.** The gh-pages render at `w3c.github.io/p2p-webtransport/` is stale and still describes a QUIC API for peer-to-peer connections without the discontinued warning. Only the repository README carries it. Anyone arriving at that URL will believe this option is alive.

So a WebTransport design has a relay in it by definition, and unlike TURN that relay **terminates** the connection rather than forwarding opaque packets — it is a server that can read, which decision 4 forbids. Note also that iOS 26.4 is roughly five months old as of this note; anything below it has nothing at all.

> `webkit.org/status/` is **retired** — the page now redirects readers to MDN, caniuse and the standards-positions repo. Any claim citing it is citing a dead page.

### Web Bluetooth — a browser cannot be a peripheral

Not on iOS, and formally refused: [WebKit standards-positions #570](https://github.com/WebKit/standards-positions/issues/570), closed **2025-12-02**, position **oppose** — "The low-level nature of this API means that it is insecure, has a massive privacy risk, and perhaps most importantly doesn't meet the web platform's device-independence bar." [WebKit Bugzilla 101034](https://bugs.webkit.org/show_bug.cgi?id=101034) is **RESOLVED WONTFIX**. Firefox: "Not supported and no plan to support it" ([WebBluetoothCG implementation-status](https://github.com/WebBluetoothCG/web-bluetooth/blob/main/implementation-status.md)).

Even where it exists, it cannot do this job. The [spec's introduction](https://webbluetoothcg.github.io/web-bluetooth/) scopes itself: "**The first version of this specification allows web pages, running on a UA in the Central role, to connect to GATT Servers**". There is no `BluetoothLocalGATTServer`, no advertising API, no peripheral interface in the IDL; the CG's status document has no peripheral row for any browser on any platform. **Two phones both running a web page cannot pair, because neither can be the peripheral.** The CG's own suggested way to experiment is an external native Android app "providing another device to connect to" — because the web cannot be that device.

The ceiling would not matter even if it could. The Bluetooth Core Specification fixes "the maximum length of an attribute value shall be **512 octets**" ([Core Spec v6.0, Vol 3 Part F §3.2.9](https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Core-60/out/en/host/attribute-protocol--att-.html)), and the Web Bluetooth spec rejects a longer write with `InvalidModificationError`. Default LE ATT_MTU is 23 octets, giving 20 bytes per notification, and Web Bluetooth exposes no way to raise it. L2CAP connection-oriented channels appear **zero times** in the spec.

### Web NFC — peer-to-peer is out of scope, in the spec's own words

Not on iOS: [WebKit Bugzilla 163196](https://bugs.webkit.org/show_bug.cgi?id=163196) is **RESOLVED WONTFIX** — "We oppose this feature and will not implement it. We do not believe a permission prompt is a sufficient mitigation for the serious security and privacy risks raised by this specification." Where it does exist it is **Chrome for Android 89 only**, with `desktop`, `webview` and `ios` all null ([chromestatus 6261030015467520](https://chromestatus.com/feature/6261030015467520)).

The spec moved: `w3c.github.io/web-nfc/` now says only "Moved to https://w3c-cg.github.io/web-nfc/", and the live document is a **Community Group Draft**. Its terminology section is unambiguous: "An NFC peer is an active, powered device which can interact with other devices in order to exchange data using NFC. **As currently spec'ed, peer-to-peer is not supported.**" ([w3c-cg.github.io/web-nfc](https://w3c-cg.github.io/web-nfc/)) Google's own docs repeat it ([Chrome for Developers](https://developer.chrome.com/docs/capabilities/nfc)).

Capacity is set by the tag, and NXP's datasheet title is the answer: "NTAG213/215/216 — NFC Forum Type 2 Tag compliant IC with **144/504/888 bytes user memory**" ([NXP data sheet](https://www.nxp.com/docs/en/data-sheet/NTAG213_215_216.pdf)). It is a bearer for a URL or a short token, and it is tag-only.

### Web Share and Web Share Target — one direction works on iOS, the other never has

**Outgoing** works: Web Share is a [W3C Recommendation](https://www.w3.org/TR/web-share/) (2023-05-30); Safari 12.1 added it (**2019-03-25**), and Safari 15 (**2021-09-20**) "Added support for Web Share level 2 enhancements to Web Share that enable sharing files from a web page to an app" ([Safari 15 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15-release-notes)). No first-party Apple or WebKit document states any file-size or type limit; the spec sets none numerically and only permits discretionary refusal on grounds including "size".

But Chromium ships a **fixed permitted-extension allowlist**, and neither `.ndjson` nor `.json` is on it — the list runs `pdf`, common audio, common images, `css csv ehtml htm html shtm shtml text txt`, common video ([Chromium `webshare/FILE_TYPES.md`](https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/webshare/FILE_TYPES.md); MDN publishes the same list). So a share-out of the ledger must be gated on `navigator.canShare({files})` and may need the file relabelled as `text/plain`.

**Incoming does not work on iOS at all.** Web Share Target is a **WICG Community Group Draft** for level 2 and an _unofficial_ draft for level 1 ([w3c.github.io/web-share-target](https://w3c.github.io/web-share-target/), [level-2](https://w3c.github.io/web-share-target/level-2/)); the editor's own words in WebKit's thread are "It's an unofficial draft, but it's in scope for WebApps WG should another implementer become interested". Support is Chromium only — desktop 89, Android 71, level 2 files Android 76, **`ios: null`** ([chromestatus 5662315307335680](https://chromestatus.com/feature/5662315307335680), [6124071381106688](https://chromestatus.com/feature/6124071381106688)); MDN BCD records `safari: false`. WebKit's position is **neutral with security and integration concerns** ([standards-positions #11](https://github.com/WebKit/standards-positions/issues/11)) and [WebKit Bugzilla 194593](https://bugs.webkit.org/show_bug.cgi?id=194593) has been **NEW since 2019-02-13**. caniuse has **no entry at all** for this feature.

> **A trap if we ever add it.** The manifest already declares a `share_target` with `method: "GET"`. The level-2 processing algorithm says that if `params.files` is present and the method is not POST with `multipart/form-data`, the UA must "issue a developer warning… and **return `undefined`**" — which invalidates the _entire_ `share_target` member, losing the working title/text/url target too. Declare both `"application/x-ndjson"` and `".ndjson"` in `accept`, since the spec requires an implementation to filter on MIME types **or** extensions and does not say which.

The **File Handling API** (`file_handlers` + `launchQueue`) is Chromium **desktop only** — 102 on desktop, `android: null`, `ios: null` ([chromestatus 5721776357113856](https://chromestatus.com/feature/5721776357113856)); no WebKit standards-position issue exists for it. "Double-click a `.ndjson` and it opens in the app" is a desktop-Chrome-only feature.

### File System Access — opposed, and we already have the fallback

[WebKit standards-positions #28](https://github.com/WebKit/standards-positions/issues/28), closed 2023-03-23, position **oppose**: "we don't see a way to grant write access to the end user's local file system in a way that safeguards the end user's interests… **Allowing usage of the new APIs for read access makes sense.**" [caniuse](https://caniuse.com/native-filesystem-api) shows no Safari support at any version.

Which is exactly why `export-target.ts` already feature-detects `showSaveFilePicker` and falls back to a Blob URL and an `<a download>`. The `download` attribute is supported on **Safari on iOS 13+** ([caniuse](https://caniuse.com/download)) with no iOS footnote recorded, and `download` works for `blob:` URLs per [MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a). Apple did ship the _sandboxed_ half — OPFS, in Safari 15.2, **2021-12-13** ([Safari 15.2 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15_2-release-notes)) — which is what the ledger already sits on.

---

## 8. The boring baseline: export the file and send it

#182's importer means "send Sam a meal" already has a working answer today, on every platform pair, with no server. It deserves to be stated at its full strength before anything is built to beat it.

**AirDrop needs no internet for the transfer.** Apple Platform Security: AirDrop uses "Bluetooth Low Energy (BLE) and Apple-created peer-to-peer Wi-Fi technology", operating "**without using any internet connection or wireless access point (AP)**", with the connection "encrypted with TLS" ([AirDrop security](https://support.apple.com/guide/security/airdrop-security-sec2261183f4/web)). Requirements are Wi-Fi and Bluetooth on, Personal Hotspot off, within about 10 metres ([HT119857](https://support.apple.com/en-us/119857), [user guide](https://support.apple.com/guide/iphone/use-airdrop-to-send-items-to-nearby-devices-iphcd8b9f0af/ios)). Two honest caveats from Apple's own pages: identity "uses iCloud services to help users authenticate", so contact discovery is not offline; and "**If you leave Bluetooth or Wi-Fi range after an AirDrop transfer is initiated, the transfer continues over the internet**". A received file with no owning app lands in Files, which Safari's picker browses — so the round trip into our importer closes.

**Quick Share is the same story on Android**, and since 2025 it reaches iOS. Google: "Quick Share uses Bluetooth to find nearby devices, then transfers files directly between devices using a fast, local, Wi-Fi connection" ([android.com/quick-share](https://www.android.com/quick-share/)); received files land in Files → Downloads → Quick Share ([support](https://support.google.com/android/answer/9286773)). The AirDrop interop path is genuinely peer-to-peer — "the connection is **direct and peer-to-peer**, meaning your data is **never routed through a server**, shared content is never logged" ([Google Security Blog, 2025-11](https://security.googleblog.com/2025/11/android-quick-share-support-for-airdrop-security.html)). **Do not confuse it with the QR fallback path** for devices without AirDrop support, which is a relay: files "remain available for download for **24 hours on Google servers**", "both devices need internet access", up to 10 GB per 24 hours.

**A chat or email attachment puts the ledger on a third party's disk, by mechanism, not by accident.** It is copied to a provider's storage, retained under their policy, subject to their scanning and legal process, and neither party can revoke it. Gmail's documented ceilings are 25 MB to send and 50 MB to receive, with the note that these are "the limit after encoding, which adds about a **37% increase**", and that an over-limit attachment is silently converted into a Google Drive link ([Gmail](https://support.google.com/mail/answer/6584), [Workspace](https://knowledge.workspace.google.com/admin/gmail/gmail-receiving-limits-in-google-workspace)).

**What the file honestly cannot do**, which is the list any fancier transport has to justify itself against:

1. **No round trip.** The sender learns nothing about what happened — no merge result, no "412 of your 480 datoms were new".
2. **No interactive confirmation**, so no reconciliation dialogue without a second manual transfer the other way.
3. **No ephemeral addressing.** A file has a name and a location and both persist; a live channel can die with the session.
4. **The plaintext persists twice over** — in the sender's export directory _and_ in whatever app carried it. Nobody sweeps these up, and no forward secrecy applies to an artifact at rest.
5. **Several manual steps, each a failure point**, including toggling AirDrop to "Everyone for 10 Minutes" and, on recent iOS, exchanging a spoken AirDrop code.
6. **Silent staleness.** A file is a snapshot with no identity; only the ledger's own merge semantics save an out-of-order import.

But it works on every platform pair, offline, with no signalling server, no STUN, no TURN, no peripheral role and no browser-support matrix. Every live option in this note fails at least one of those.

> **Flagged risk on the iOS read path.** `import-source.ts` sets `accept=".ndjson,application/x-ndjson"`. On iOS, WebKit maps `accept` extensions to MIME types and then to UTIs, silently dropping any extension it does not know; with an empty accepted-UTI set it builds the picker with `UTTypeItem`, making everything selectable — so `.ndjson` alone **fails open** ([WebKit Bugzilla 279606](https://bugs.webkit.org/show_bug.cgi?id=279606), NEW since 2024-09-12: "On iOS, any file can be selected, as if the accept attribute had not been specified"). Supplying the MIME type as well may make the set non-empty via a _dynamic_ UTI — Apple's docs for `UTType.init(mimeType:conformingTo:)` say it "**may** provide a dynamic type… if the parameters are valid, but the system doesn't find any types with the MIME type" ([UniformTypeIdentifiers](https://developer.apple.com/documentation/uniformtypeidentifiers/uttype-swift.struct)) — which could grey out the user's own export. **Unsourced**: no primary source settles whether `application/x-ndjson` yields a dynamic UTI or nil. This wants a device test, and it is a live risk to import on iOS today, independent of anything in this map.

---

## 9. QR capacity, precisely

**ISO/IEC 18004:2024** is the current edition ([ISO catalogue](https://www.iso.org/standard/83389.html)). **The normative text is paywalled and could not be read** — iso.org returns 403 to automated fetches. Every capacity figure below is from Denso Wave, the format's originator and the party that submitted it for standardisation, cross-checked against GS1, which normatively incorporates 18004.

Versions run 1 to 40, side = 4V + 17 modules, 21×21 up to 177×177 ([Denso Wave](https://www.qrcode.com/en/about/version.html); [GS1 General Specifications §5.7.4.2](https://www.gs1.org/docs/barcodes/GS1_General_Specifications.pdf)).

**Version 40 (177×177):**

| EC level | Numeric | Alphanumeric | Byte      |
| -------- | ------- | ------------ | --------- |
| L (~7%)  | 7,089   | 4,296        | **2,953** |
| M (~15%) | 5,596   | 3,391        | 2,331     |
| Q (~25%) | 3,993   | 2,420        | 1,663     |
| H (~30%) | 3,057   | 1,852        | 1,273     |

The v40-L row is independently confirmed by GS1 General Specifications §5.7.2. Denso Wave attaches a caveat to every table: the figures assume a **single mode segment with no ECI**, and a second segment pays the mode and count indicator overhead again.

**Structured Append is in the standard**, and its limit is the number that matters: "**One data symbol can be divided into up to 16 symbols**" ([Denso Wave](https://www.qrcode.com/en/about/featurePage/featurePage6.html)). So the standardised ceiling is 16 × 2,953 = **47,248 bytes ≈ 46 KB** at level L, or 16 × 1,273 = 20,368 bytes at level H. Two deductions could not be confirmed against the paywalled text and are **unsourced**: each symbol carries a Structured Append header and a parity byte, so the real total is slightly below 47,248; and a browser-based reader cannot reassemble a Structured Append set through `BarcodeDetector`, which exposes no Structured Append metadata.

Beyond 16 symbols the de facto scheme is Blockchain Commons' `ur:` ([BCR-2020-005](https://github.com/BlockchainCommons/Research/blob/master/papers/bcr-2020-005-ur.md)), which adds fountain codes so a receiver reconstructs without fixed ordering. It is a research document, not a standards-body specification — cite it as a convention. And at that point you have built a transport rather than used one.

On physical scannability, the primary sources speak in millimetres, not ratios. Denso Wave recommends "each module is made up of 4 or more dots" and gives 0.17 mm per module as a scanner-resolution limit ([qrcode.com](https://www.qrcode.com/en/howto/cell.html)); a 4-module quiet zone is required on all four sides ([qrcode.com](https://www.qrcode.com/en/howto/code.html)); GS1 Table 5-46 gives an X-dimension minimum of 0.396 mm and target 0.495 mm for "a read range typical of mobile device scanning". **Unsourced and widely repeated: the "scan distance = 10× symbol size" rule and any "N camera pixels per module" figure.** Neither appears in Denso Wave, ISO, GS1 or AIM material; they exist only in vendor blogs.

---

## 10. The iOS floor, with dates

The map's browser-only constraint makes WebKit the floor, and it stays the floor for a home-screen PWA everywhere. Apple's Review Guideline 2.5.6 still requires WebKit, with alternative-engine entitlements available only for the **EU from iOS 17.4** and **Japan from iOS 26.2** ([App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [alternative browser engines](https://developer.apple.com/support/alternative-browser-engines/), [Japan](https://developer.apple.com/support/alternative-browser-engines-jp/)).

| Feature                                    | iOS Safari | Since                          | Source                                                                                                                |
| ------------------------------------------ | ---------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `RTCPeerConnection` / `RTCDataChannel`     | **Yes**    | iOS 11, 2017-09-19             | [WebKit blog](https://webkit.org/blog/7726/announcing-webrtc-and-media-capture/), MDN BCD                             |
| WebRTC in a home-screen PWA                | **Yes**    | iOS 13.4, 2020-03-24           | [WebKit Bugzilla 185448](https://bugs.webkit.org/show_bug.cgi?id=185448), RESOLVED FIXED                              |
| WebRTC in third-party (WKWebView) browsers | Yes        | iOS 14.3, 2020-12-14           | [WebKit blog](https://webkit.org/blog/11353/mediarecorder-api/)                                                       |
| mDNS ICE candidate obfuscation             | **Yes**    | Safari 13 / iOS 13, 2019-09-19 | [Safari 13 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-13-release-notes)     |
| WebTransport                               | Yes        | iOS 26.4, 2026-03-24           | [Safari 26.4 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-26_4-release-notes) |
| Web Share                                  | Yes        | iOS 12.2, 2019-03-25           | [Safari 12.1 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-12_1-release-notes) |
| Web Share with files                       | Yes        | iOS 15, 2021-09-20             | [Safari 15 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15-release-notes)     |
| OPFS and `navigator.storage.persist()`     | Yes        | iOS 15.2, 2021-12-13           | [Safari 15.2 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-15_2-release-notes) |
| `<a download>`                             | Yes        | iOS 13                         | [caniuse](https://caniuse.com/download)                                                                               |
| Web Share Target                           | **No**     | —                              | [WebKit Bugzilla 194593](https://bugs.webkit.org/show_bug.cgi?id=194593), NEW since 2019                              |
| File Handling / `launchQueue`              | **No**     | —                              | Chromium desktop only                                                                                                 |
| File System Access (local)                 | **No**     | —                              | [standards-positions #28](https://github.com/WebKit/standards-positions/issues/28), oppose                            |
| Web Bluetooth                              | **No**     | —                              | [standards-positions #570](https://github.com/WebKit/standards-positions/issues/570), oppose, 2025-12-02              |
| Web NFC                                    | **No**     | —                              | [WebKit Bugzilla 163196](https://bugs.webkit.org/show_bug.cgi?id=163196), WONTFIX                                     |

The load-bearing good news is the top of that table. **The one transport the map actually needs has been on the floor platform for nine years, works in a home-screen PWA, and needs no permission prompt at all** — WebKit deliberately removed the capture-permission dependency for data-channel-only connections, which is why mDNS obfuscation exists in Safari in the first place ([WebKit Bugzilla 174500](https://bugs.webkit.org/show_bug.cgi?id=174500), RESOLVED FIXED). Everything Apple has refused is something this design does not need.

One relevant note on persistence, since the ledger sits on OPFS: WebKit grants `persist()` "based on heuristics", **one of which is whether the site is running as a Home Screen Web App** ([WebKit storage policy, 2023-08-10](https://webkit.org/blog/14403/updates-to-storage-policy/)). Calling it from an installed PWA is worth more than calling it from a tab, but it is not a contract.

---

## 11. What this note does not settle

- **The size of the thing being sent.** [#196](https://github.com/palebluebytes/inventoria/issues/196) is open. This note gives the per-datom cost (§3) and every transport's ceiling (§2), but the two only meet once a real closure is measured. The one place the answer is already forced is QR: at ~200 bytes a datom, no QR arrangement carries a meal.
- **Whether an ICE exchange over mDNS actually completes between two phones on a given network**, as opposed to being permitted by the specifications. That is [#198](https://github.com/palebluebytes/inventoria/issues/198)'s job, and it is the right shape for a prototype rather than a reading task. §5 names the specific things that would break it.
- **How often a relay is actually needed.** No first-party, session-level figure for the share of WebRTC connections requiring TURN could be sourced (§6.3), and the two numbers that _are_ sourceable measure different things a decade and a half apart. A design that refuses a relay is accepting an unsized failure rate, and this note cannot size it. If that number matters to the decision, it has to be measured, not read.
- **What a relay costs to run and who runs it.** The map already lists relay operations as unspecified; this note only establishes what a relay can and cannot see.
- **Whether Chrome's proposed Local Network Access gate for WebRTC ships** (§5.4). It is "Proposed" with no milestone, and it would put a permission prompt in front of the one path this note recommends.
- **The iOS `accept` risk on the import path** (§8), which is a live defect risk in shipped code rather than a transport question, and wants a device test.
