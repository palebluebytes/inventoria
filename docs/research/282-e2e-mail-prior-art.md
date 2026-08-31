# Research: how comparable products hold end-to-end sealed mail on a server they do not trust (#282)

**Ticket:** [#282](https://github.com/palebluebytes/inventoria/issues/282) — parent map [#248](https://github.com/palebluebytes/inventoria/issues/248) (let a device that was asleep converge later).
**Question:** the [#254](https://github.com/palebluebytes/inventoria/issues/254) session decided the store **retains a sealed deposit until it is collected**, which [ADR-0072](https://github.com/palebluebytes/inventoria/blob/main/docs/adr/0072-a-meal-crosses-through-a-relay-that-cannot-read-it.md) §5 refused _at any layer_ and [ADR-0075](https://github.com/palebluebytes/inventoria/blob/main/docs/adr/0075-your-own-devices-converge-on-a-version-vector-read-off-the-ledger.md) §1 refused again. This is a well-trodden problem. Two things are asked of every product: **does the server hold a stable per-recipient identifier**, and **what is the retention policy and what enforces it**.
**Sources:** primary only — Signal's protocol specifications, blog, transparency pages and `Signal-Server` source; the Apple Platform Security guide, Apple Support, CloudKit developer documentation and Apple's Legal Process Guidelines; WhatsApp's Encryption Overview and Encrypted Backups whitepapers, its Privacy Policy and Help Centre, and Meta's own engineering post; the Matrix specification, Synapse documentation and source, and matrix.org's own blog; Syncthing's specs and `strelaysrv`/`stdiscosrv`; Tailscale's KB, blog and the `derp` package; the Magic Wormhole protocol docs and mailbox server; Session's whitepaper and `oxen-storage-server`; Threema's cryptography whitepaper; Briar's Mailbox README and API spec; Delta Chat's chatmail relay configuration and source. No journalism, no third-party write-ups.
**Date:** 2026-08-31. **Status:** research only — nothing built, nothing decided, no design recommended. This note reports what is done and by whom.

**Sibling tickets this feeds:** [#281](https://github.com/palebluebytes/inventoria/issues/281) (how a collector finds mail without a stable handle), [#283](https://github.com/palebluebytes/inventoria/issues/283) (what a retaining store leaks), [#252](https://github.com/palebluebytes/inventoria/issues/252) (what the server may hold and for how long). [#195](https://github.com/palebluebytes/inventoria/issues/195) already measured Magic Wormhole's code and PAKE in depth; §7 here covers only its _mailbox_ and does not repeat that work.

**Evidence classes.** Every claim is tagged:

- **[spec]** — quoted verbatim from the owning specification.
- **[source]** — read out of the product's own published source code.
- **[vendor]** — the vendor's own prose: whitepaper, help page, privacy policy, legal-process guidelines, first-party engineering blog.
- **[absent]** — the primary source was searched and the claim is **not** in it. The absence is the finding, not a failure to look.

---

## TL;DR — the two answers, eleven products

| Product                   | (a) Stable per-recipient identifier at the store                                                                                 | (b) Retention, and what enforces it                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Signal**                | **Yes — the ACI**, a UUID whose own source comment says "never changes". Plus PNI, E.164, per-device id and two registration ids | Delete on ack **and** a DynamoDB TTL attribute. A **lifecycle rule in code**; the duration is only evidenced from a _sample_ config |
| **Apple — iMessage**      | **Yes — the "lookup handle"**: phone number or email, mapped by IDS to per-device keys and APNs addresses                        | "up to 30 days". A **bare promise** — Apple states the duration and no mechanism                                                    |
| **Apple — CloudKit/ADP**  | **Yes** — a per-container user identifier, plus `userRecordName` **and `deviceID` stamped on every record write**                | **No retention policy at all.** Unbounded, client-deleted only                                                                      |
| **WhatsApp**              | **Yes — the phone number**, mandatory, plus a server-held **Signed Device List** per account                                     | Deleted on delivery, 30 days if undelivered. A **promise plus a lifecycle rule**; no mechanism published                            |
| **Matrix**                | **Yes — `@localpart:domain`**, in cleartext in every event and every federation transaction; device ids enumerable by _anyone_   | **None in the spec.** MSC1763 open since 2018. Synapse's rule is **off by default** and federation ignores it                       |
| **Syncthing relay**       | **Yes — the Device ID**, a hash of the TLS certificate, derived from the cert not asserted                                       | **Structural: it stores nothing.** Not store-and-forward — absent peer gets `ResponseNotFound`                                      |
| **Tailscale DERP**        | **Yes — the node public key**, which is literally the address field of every frame                                               | **Structural: it stores nothing.** 32 packets of slack for a _connected_ client, dropped on disconnect                              |
| **Session**               | **Yes — the account public key**, and it is **unrotatable by design**; swarm assignment is publicly computable                   | 30 days private / 14 public inbox. **Enforced in node code** — an over-cap store is refused `FORBIDDEN`                             |
| **Threema**               | **Yes — the Threema ID**, 8 characters, **minted by the server** and "permanently assigned"                                      | 14 days or until delivered. A **bare promise** on a closed server                                                                   |
| **Delta Chat / chatmail** | **Yes — an email address**, the most stable identifier in the set                                                                | 20 days unconditionally, 7 for large, 90 for inactive. A **configured lifecycle rule**, in open source                              |
| **Magic Wormhole**        | **No — the only one.** A recycled numeric nameplate, a random mailbox id, a random per-run side                                  | ~11 minutes, then swept. **Structural by lifetime**                                                                                 |
| **Briar Mailbox**         | **The question dissolves** — the store is the user's own spare phone; ids are random and per-mailbox                             | **Not documented.** Retention is whatever the owner's hardware does                                                                 |

**The headline finding is the one the ticket predicted, and it is stronger than predicted.** Every product that holds mail for an absent recipient holds a stable identifier for that recipient. So does every product that does _not_ hold mail. **Syncthing and Tailscale pay the full price of a stable handle and get no retention at all for it** — which locates the cost precisely: the identifier is the price of _addressing_, not of _retention_. Retention is bought separately, and mostly with a promise.

**The second finding is that nobody rotates.** Signal's ACI "never changes"; Session's ID exists to be preserved across device loss and cannot be rotated; Threema's is "permanently assigned"; Syncthing's is a certificate hash; Matrix's is a global name; Delta Chat's changes only by becoming a different profile. The single documented rotation anywhere in the corpus is Apple's DSID, and Apple does not document it as the iCloud or iMessage handle (§3.1). **The refusal in ADR-0075 §5 has no company in the shipped mainstream.**

---

## 1. What everybody's seal actually covers

Before the per-product answers, one thing every vendor says in its own words, and it is the same thing. The guarantee is scoped to **content**. Not one of the eleven claims to hide who mail is for.

> "This end-to-end encryption protocol is designed to prevent third parties and WhatsApp from having **plaintext access to messages or calls**." — WhatsApp, Encryption Overview v9, Introduction **[vendor]**

> "WhatsApp defines end-to-end encryption as communications that remain encrypted from a device controlled by the sender to one controlled by the recipient, where no third parties, not even WhatsApp or our parent company Meta, **can access the content** in between." — _ibid._, "Defining End-to-End Encryption" **[vendor]**

> "Apple doesn't store message content or attachments, which are all secured with end-to-end encryption so that no one but the sender and receiver can access them." — [Apple Platform Security, iMessage security overview](https://support.apple.com/guide/security/imessage-security-overview-secd9764312f/web) **[vendor]**

> "Matrix optionally supports end-to-end encryption, allowing rooms to be created whose **conversation contents** are not decryptable or interceptable on any of the participating homeservers." — [Matrix spec, End-to-End Encryption](https://spec.matrix.org/latest/client-server-api/#end-to-end-encryption) **[spec]**

> "There is never a way for a DERP server to decrypt your traffic. It just blindly forwards already-encrypted traffic from one node to another." — [Tailscale, How Tailscale works](https://tailscale.com/blog/how-tailscale-works) **[vendor]**

Signal is the only product in the corpus that has _tried_ to reduce the addressing metadata, and its own announcement says exactly which half it gave up on:

> "While the service always needs to know where a message should be delivered, ideally it shouldn't need to know who the sender is. It would be better if the service could handle packages where **only the destination is written on the outside**, with a blank space where the "from" address used to be." — [Signal, Technology preview: Sealed sender](https://signal.org/blog/sealed-sender/) **[vendor]**

That sentence is the whole of the prior art on recipient anonymity in shipped messengers. **Sealed sender hides the sender. The recipient handle is handed over in the clear**, and Signal's own send procedure says so — step 4 is "hand the encrypted envelope to the service along with **the recipient's delivery token**" **[vendor]**.

---

## 2. Signal

### 2a. The identifier: the ACI, and its own source says it never changes

The persisted account record is the Jackson-serialised `Account` object, and its fields are the answer **[source]** ([`Account.java` L56–L122](https://github.com/signalapp/Signal-Server/blob/33bf9ccae5766a768605d7502321e917df72d3a2/service/src/main/java/org/whispersystems/textsecuregcm/storage/Account.java#L56-L122), at `main` HEAD `33bf9cc`):

```java
@JsonProperty private UUID uuid;                       // the ACI
@JsonProperty("pni") @Nullable private UUID phoneNumberIdentifier;
@JsonProperty @Nullable private String number;         // E.164
@JsonProperty @Nullable private byte[] usernameHash;
@JsonProperty private List<Device> devices = new ArrayList<>();
@JsonProperty private IdentityKey identityKey;
@JsonProperty("uak") @Nullable private byte[] unidentifiedAccessKey;
@JsonProperty("inCds") private boolean discoverableByPhoneNumber = true;
```

Stability is not inferred — it is a doc comment on the getter **[source]** (same file, L178–L184):

> `/// Returns the core account identifier (ACI) for this account. An account's core identifier never changes.`

The E.164 is the _mutable_ one: `number` is `@Nullable`, and `setNumber(number, phoneNumberIdentifier)` moves the phone number and the PNI together. The schema now admits a numberless account — there is a `DeviceCapability` called `OPTIONAL_PHONE_NUMBER` and a serialisation test fixture named `…NumberlessJson…` **[source]**. **Signal has made the phone number optional and left the ACI permanent.** That is the shape of every "we removed the phone number" story in this corpus (§6).

Per device, the server holds `id` (a byte, primary = 1), **two** 14-bit registration ids (one per identity), push tokens, `lastSeen`, `created`, `userAgent` and a capability set **[source]** ([`Device.java` L27–L89](https://github.com/signalapp/Signal-Server/blob/33bf9ccae5766a768605d7502321e917df72d3a2/service/src/main/java/org/whispersystems/textsecuregcm/storage/Device.java#L27-L89)).

The underlying protocol vocabulary is unembarrassed about it:

> "Each user has a **_UserID_** (e.g. a username or phone number)." … "At any point in time each user has a nonempty set of devices." — [Sesame specification](https://signal.org/docs/specifications/sesame/) **[spec]**

**What the server can enumerate with it.** `AccountsManager` exposes lookup by E164, PNI, username hash, username link handle, ACI and `ServiceIdentifier` **[source]**. `KeysController`'s `parseDeviceId` accepts `"*"`, so **the whole device set plus prekeys plus per-device registration ids comes back in one call** **[source]**. `MessagesDynamoDb` exposes `mayHaveMessages(accountIdentifier, device)` and `mayHaveUrgentMessages(...)` — **existence of pending mail per (account, device), without reading it** **[source]**.

Signal is careful about the one thing it _can_ withhold — account existence is deliberately not leaked to an unauthenticated caller **[source]** ([`OptionalAccess.java` L67–L73](https://github.com/signalapp/Signal-Server/blob/33bf9ccae5766a768605d7502321e917df72d3a2/service/src/main/java/org/whispersystems/textsecuregcm/auth/OptionalAccess.java#L67-L73)):

> `// Anything past this point can only be authenticated by an access key. … if the target account does not exist, we *also* report unauthorized here (*not* not-found, since that would provide a free exists check).`

### 2b. What sealed sender costs, measured in Signal's own code

This is the most useful part of the Signal record, because it prices anonymity rather than asserting it. Signal's blog names the two jobs sender authentication was doing:

> "1. The service can validate the sender's identity to help prevent spoofing … 2. The service can use the sender's identity to apply rate limiting and abuse protection." **[vendor]**

Removing the sender re-keys both onto the **recipient**. The contrast is visible in one file **[source]** (`MessageController.java`):

```java
// authenticated path — keyed on (source, destination)
rateLimiters.getMessagesLimiter().validate(source.accountIdentifier(), destination.getAccountIdentifier());

// sealed-sender path — sender is passed as null, so the only key left is the recipient
rateLimiters.getInboundMessageBytes().validate(destinationIdentifier.uuid(), totalContentLength);
```

And the capability check that replaces sender identity is a **128-bit unidentified access key derived from the recipient's profile key** — you may only send sealed mail to someone whose profile key you already hold, or under a group send endorsement **[source]** (`UnidentifiedAccessUtil.UNIDENTIFIED_ACCESS_KEY_LENGTH = 16`; note the 2018 blog says 96-bit — cite the code, not the post).

A second, quieter cost: **the server can no longer mint the delivery receipt**, because it has no source to attribute it to **[source]** (`WebSocketConnection.java` L242–L248):

> `final boolean shouldSendDeliveryReceipt = message.hasSourceServiceId() && message.getType() != Envelope.Type.SERVER_DELIVERY_RECEIPT;`

### 2c. Retention: a lifecycle rule in code, and a duration only evidenced from a sample

Undelivered mail sits in Redis first — "a low-latency holding area for new messages" — and is moved to DynamoDB only once it is older than a configured `persistDelay` (`persistDelayMinutes: 1` in the sample config) **[source]**. In DynamoDB the TTL is an attribute literally named `"E"` **[source]** ([`MessagesDynamoDb.java` L184–L186](https://github.com/signalapp/Signal-Server/blob/33bf9ccae5766a768605d7502321e917df72d3a2/service/src/main/java/org/whispersystems/textsecuregcm/storage/MessagesDynamoDb.java#L184-L186)):

```java
private static final String KEY_TTL = "E";
private long getTtlForMessage(MessageProtos.Envelope message) {
  return message.getServerTimestamp() / 1000 + timeToLive.getSeconds();
}
```

**Deletion happens twice over**: on ack, and on expiry. The ack path deletes only on a success response, and does nothing otherwise **[source]** (`WebSocketConnection.java` L266–L281):

```java
if (isSuccessResponse(response)) {
  result = messageStream.acknowledgeMessage(messageGuid, serverTimestamp);
```

**The duration is the weak link in the evidence.** `expiration: P30D` appears in `service/config/sample.yml` **[source]** — an _example_ file in the repo, not a statement about production. I found no Signal document stating a production message TTL **[absent]**. What Signal _does_ state, twice a decade apart, is what a subpoena produced:

> "the only information we can produce in response to a request like this is the date and time a user registered with Signal and the last date of a user's connectivity to the Signal service." — [Eastern District of Virginia](https://signal.org/bigbrother/eastern-virginia-grand-jury/) **[vendor]**

> "We received a grand jury subpoena … which requested customer or subscriber account information for a list of 37 phone numbers." … "Of the **37 accounts** for which information was sought, seven accounts did not exist." — [District of Columbia, 2026-03-06](https://signal.org/bigbrother/district-of-columbia/) **[vendor]**

Two things to read off that. The subpoena was keyed on **phone numbers** — i.e. the `getByE164` surface above. And the two fields Signal produced correspond exactly to `Device.created` and `Device.lastSeen`: **the retained fields are per-device, and they are a presence timeline.**

---

## 3. Apple

Apple is two different answers under one brand, and the difference is instructive: **iMessage is fan-out store-and-forward with a stated window; CloudKit is a pull-based store with no window at all.**

### 3a. iMessage — the identifier is a directory entry, and Apple names it

> "**Apple Identity Service (IDS)** — Apple's directory of iMessage public keys, Apple Push Notification service (APNs) addresses, and phone numbers and email addresses that are used to look up the keys and device addresses." — [Apple Platform Security glossary](https://support.apple.com/guide/security/aside/secf752dc2e2/1/web/1) **[vendor]**

> "When a user turns on iMessage on a device, the device generates encryption and signing pairs of keys for use with the service. The public keys are sent to Apple Identity Service (IDS), where they are **associated with the user's phone number or email address**, along with the device's APNs address." — [iMessage security overview](https://support.apple.com/guide/security/imessage-security-overview-secd9764312f/web) **[vendor]**

So the mapping IDS holds is `phone number / email` → one tuple of `{encryption public key, signing public key, APNs address}` **per registered device**. Apple's own term for the key of that directory, from the Legal Process Guidelines, is the **"lookup handle"**:

> "These logs indicate that a query has been initiated by a device application … and routed to Apple's servers for a **lookup handle** (which can be a phone number, email address, or Apple ID) to determine whether that lookup handle is 'iMessage capable.'" — [Legal Process Guidelines, §X](https://www.apple.com/legal/privacy/law-enforcement-guidelines-us.pdf) **[vendor]**

Note what that paragraph concedes in passing: **Apple keeps a log of who asked whether whom is reachable**, and keeps it for 25 days (§3c). The capability _query_ is retained even though the message is not.

Apple states plainly what is and is not encrypted on the way through:

> "Metadata, such as the timestamp and APNs routing information, isn't encrypted." — [How iMessage sends and receives messages](https://support.apple.com/guide/security/how-imessage-sends-and-receives-messages-sec70e68c949/web) **[vendor]**

### 3b. CloudKit — the server stamps a device id on every write

> "When a user accesses a container for the first time, CloudKit assigns them a unique identifier and uses it to create two user records — one in the app's public database and another in that user's private database." — [`CKContainer`](https://developer.apple.com/documentation/cloudkit/ckcontainer) **[vendor]**

The identifier is per-container, which is the _weakest_ per-recipient handle Apple offers, and it is still stable. But the sharper finding is in the wire format: every record carries, on both creation and modification **[vendor]** ([CloudKit Web Services Reference, Common Response Keys](https://developer.apple.com/library/archive/documentation/DataManagement/Conceptual/CloudKitWebServicesReference/Types.html)):

> "`userRecordName` — the record name representing the user. `deviceID` — the device where the change occurred."

**A sync store that E2E-encrypts field values still records which of your devices wrote each row, and when.** That is a per-device activity log produced as a side effect of the storage format, not as a feature.

And Advanced Data Protection does not remove it. Apple enumerates what stays under its own keys regardless **[vendor]** ([support.apple.com/en-us/102651](https://support.apple.com/en-us/102651)):

> "Some metadata and usage information stored in iCloud remains under standard data protection, even when Advanced Data Protection is enabled."

The examples Apple gives include, for iCloud Backup, "Name, model, color, and **serial number** of the device associated with each backup" and "Date, time, and size of each backup snapshot"; for iCloud Drive, "The raw byte checksums of the file content **and the file name**"; for Photos, "**How many times an item has been viewed**"; for Messages in iCloud, "When the last sync was completed and whether syncing has been disabled". Three whole categories are not E2EE at all:

> "Because of the need to interoperate with the global email, contacts, and calendar systems, iCloud Calendar, Contacts, and Mail aren't end-to-end encrypted." — [Advanced Data Protection for iCloud](https://support.apple.com/guide/security/advanced-data-protection-for-icloud-sec973254c5f/web) **[vendor]**

One trap worth recording for anyone reading CloudKit as a model: **encryption is opt-in per field, not per record.**

> "CloudKit Record fields need to be explicitly declared as encrypted in the container's schema to be protected, and reading and writing encrypted fields requires the use of dedicated APIs." — _ibid._ **[vendor]**

### 3c. Retention: a bare promise for iMessage, nothing at all for CloudKit

The iMessage sentence, in full, is three sentences at the foot of one page and contains no mechanism **[vendor]**:

> "As with all push notifications, the message is deleted from APNs when it's delivered. Unlike other APNs notifications, however, iMessage messages are queued for delivery to offline devices. **Messages are stored on Apple servers for up to 30 days.**" — [How iMessage sends and receives messages](https://support.apple.com/guide/security/how-imessage-sends-and-receives-messages-sec70e68c949/web)

**For CloudKit there is no retention statement of any kind** — no TTL, no expiry, no change-history window, in the framework docs, the web services reference, or the guide **[absent]**. The only deletion Apple documents is client-initiated. Records persist until someone deletes them.

The logs, by contrast, are all pinned at the same figure **[vendor]** (Legal Process Guidelines, October 2025): "iMessage capability query logs are retained up to 25 days"; "FaceTime call invitation logs are retained up to 25 days"; "Connection logs are retained up to 25 days"; "iCloud mail logs are retained up to 25 days".

**Promise, rule, or structure?** A promise — and the evidence for that reading is that **Apple knows how to write a structural claim and did not write one here.** Compare the escrow HSM, where the enforcer is named and the escape hatch destroyed **[vendor]** ([Escrow security for iCloud Keychain](https://support.apple.com/guide/security/escrow-security-for-icloud-keychain-sec3e341e75d/web)):

> "The escrow service allows only 10 attempts to authenticate and retrieve an escrow record. … After the 10th failed attempt, **the HSM cluster destroys the escrow record** and the keychain is lost forever."

> "These policies are coded in the HSM firmware. **The administrative access cards that permit the firmware to be changed have been destroyed.**"

That is a structural claim. "Messages are stored on Apple servers for up to 30 days" is not one.

### 3d. How a second device converges

**iMessage: sender-side fan-out, decided at send time.**

> "The user's outgoing message is **individually encrypted for each of the receiver's devices**. The public encryption keys and signing keys of the receiving devices are retrieved from IDS." … "The resulting messages, one for each receiving device … are then dispatched to the APNs for delivery." **[vendor]**

A device that was off still gets its own ciphertext minted and queued, and drains it on return. **A device that was not registered at send time gets nothing, ever** — there is no re-encryption for late joiners in the published design. Joining the keychain circle at all requires either a live sponsoring device or the escrow path:

> "New devices, as they sign into iCloud, join the iCloud Keychain syncing circle in one of two ways: either by pairing with and being sponsored by an existing iCloud Keychain device, or by using iCloud Keychain recovery." — [Secure keychain syncing](https://support.apple.com/guide/security/secure-keychain-syncing-sec0a319b35f/web) **[vendor]**

**CloudKit: pull-based, with a server-held change history and no window.**

> "For the initial fetch, pass `nil` as the token to retrieve all changes in the database's history." … "Because the system coalesces notifications, don't rely on them for specific changes. Consider notifications an indication of remote changes, and use the fetch operations to reliably retrieve all changes." — [Remote Records](https://developer.apple.com/documentation/cloudkit/remote-records) **[vendor]**

The push is a hint; the change token is the mechanism. This is the only design in the corpus where an arbitrarily long absence costs nothing — and it costs nothing precisely because the server retains everything indefinitely under a stable per-user, per-device index.

---

## 4. WhatsApp

### 4a. The identifier: a mandatory phone number, plus a server-held device list

> "You must provide your mobile phone number and basic information … to create a WhatsApp account. If you don't provide us with this information, you will not be able to create an account to use our Services." — [Privacy Policy](https://www.whatsapp.com/legal/privacy-policy) **[vendor]**

> "**Primary device** — A device that is used to register a WhatsApp account with a phone number. Each WhatsApp account is associated with a single primary device." — Encryption Overview v9 (2026-02-25), Terms **[vendor]**

> "At registration time, a WhatsApp client transmits its public Identity Key, public Signed Pre Key (with its signature), and a batch of public One-Time Pre Keys to the server. **The WhatsApp server stores these public keys associated with the user's identifier.**" — _ibid._, Client Registration **[vendor]**

Multi-device added a per-device identity and a server-stored list of them:

> "Prior to the introduction of multi-device, everyone on WhatsApp was identified by a single identity key … With multi-device, each device now has its own identity key." — [Meta, How WhatsApp enables multi-device capability](https://engineering.fb.com/2021/07/14/security/whatsapp-multi-device/) **[vendor]**

> "**The WhatsApp server maintains a mapping between each person's account and all their device identities.** When someone wants to send a message, they get their device list keys from the server." — _ibid._ **[vendor]**

> "The primary sends ListData, ListSignature, Ldata and PHMAC to WhatsApp server." … "**The server stores ListData and ListSignature**" — Encryption Overview v9, Companion Linking **[vendor]**

**There is no sealed sender, and the absence is total.** The full text of Encryption Overview v9 contains no sender-anonymity mechanism **[absent]**. The single "identity is not revealed" claim in the document is scoped to the transport layer against a network observer, not against WhatsApp:

> "Encrypts metadata to hide it from unauthorized **network observers**. No information about the connecting user's identity is revealed." — _ibid._, Transport Security **[vendor]**

**Sourcing correction, for anyone chasing this later:** there is no separate, currently-published "WhatsApp Multi-Device Security" whitepaper. The multi-device material was published in 2021 as versions 4 and 5 of the _same_ Encryption Overview and is now folded into v9. Candidate standalone URLs 404 **[absent]**. And "identity list" is not WhatsApp's term — the published terms are "Signed Device List Data" and "device identities" **[absent]**.

### 4b. Convergence, and a device list that goes stale while you sleep

Fan-out is done by the client, once per destination device:

> "WhatsApp uses this "**client-fanout**" approach for transmitting messages to multiple devices, where the WhatsApp client transmits a single message N number of times to N number of different devices." — Encryption Overview v9 **[vendor]**

Which produces the same late-joiner problem as Apple's, and WhatsApp says so:

> "the sender client must specify all the destination devices at the sending time. **Any device which is not listed at the sending time will not be able to receive the encrypted message.**" — _ibid._, Sender Side Backfill **[vendor]**

The repair — "Sender Side Backfill" — is triggered by the _server_ noticing a hash mismatch between the sender's device list and its own records, and is "only allowed within **a short duration** after the initial message sending". The duration is not quantified **[absent]**.

**The finding most relevant to a sleeping peer is that the addressing state itself expires, and only the phone can renew it:**

> "In end-to-end encrypted chats, Signed Device Lists are expired with a Time to Live of **35 days or less** … **Clients will only send and receive messages and calls with the primary device of an account with an expired Signed Device List.**" — _ibid._, Signed Device List Expiry **[vendor]**

> "Linked devices work without your phone online, but will **log out if your phone is unused for over 14 days**." — [About linked devices, WhatsApp Help Centre](https://faq.whatsapp.com/378279804439436) **[vendor]**

The 14-day figure appears _only_ in the Help Centre — not in the whitepaper, not in Meta's engineering post **[absent]**. It is the product-level expression of a deeper protocol lease that only the primary can renew. **Meta's claim that multi-device "no longer requir[es] a smartphone to be the source of truth" is true for reads and sends and false for three things**: minting the device list, linking a new companion, and seeding message history — all primary-only, all documented.

WhatsApp does store sealed _state_ for absent devices, and describes both what it holds and how it is keyed:

> "The synchronization of App State between a user's devices **requires storage of end-to-end encrypted data on the WhatsApp server**. … WhatsApp servers do not have access to the keys that could be used to decrypt the App State data that is stored." **[vendor]**

> "**HMAC of the index is used as an identifier** of the index-value record the Mutations refers to. This also makes sure that the indexes that the server sees have the same length and prevents the server from guessing the record for which the Mutation is applied." **[vendor]**

That is the one construction in the whole corpus that deliberately blinds a _record_ key while keeping an account key — the index is hidden, the account is not. Its retention window is published as literally "**the last X days**" — an unfilled variable in WhatsApp's own document **[absent]**.

### 4c. Retention: a promise plus a lifecycle rule, and the modality gives it away

The statement lives in the Privacy Policy, not the whitepaper — the Encryption Overview contains no retention statement at all **[absent]**:

> "**We do not retain your messages in the ordinary course** of providing our Services to you. … **Once your messages are delivered, they are deleted from our servers.** … **Undelivered Messages.** If a message cannot be delivered immediately (for example, if the recipient is offline), we keep it in encrypted form on our servers for **up to 30 days** as we try to deliver it. If a message is still undelivered after 30 days, we delete it." — [Privacy Policy](https://www.whatsapp.com/legal/privacy-policy) **[vendor]**

**Read the modality.** This is "_we_ do not retain / _we_ keep / _we_ delete" — a statement about behaviour. Two paragraphs earlier in the same corpus WhatsApp writes "no third parties … **can** access the content" and "WhatsApp servers **do not have access to** the keys" — statements about capability. It also hedges here and nowhere else: "not **typically** stored", "in the **ordinary course**". And no mechanism for the 30-day deletion is published anywhere **[absent]**.

The contrast within WhatsApp's own documents is exact. The encrypted-backup vault _is_ described structurally:

> "**The HSM Backup Key Vault is responsible for enforcing password verification attempts and rendering the key permanently inaccessible** after a certain number of unsuccessful attempts to access it." — [Security of End-To-End Encrypted Backups v2](https://www.whatsapp.com/security/WhatsApp_Security_Encrypted_Backups_Whitepaper.pdf) **[vendor]**

with the count decremented on _request_, before the client proves anything: "The client sends CredentialRequest to the server, **which in turn decrements the attempt count**". The permitted number is never stated **[absent]**, and neither is the identifier the vault records against — the whitepaper says only "associated with the particular client" **[absent]**. Do not assert that the HSM holds the phone number; the document does not say so, and the account identity arrives from the front end over Noise before the vault is reached.

---

## 5. Matrix

Matrix is the extreme case, and useful precisely because it is honest about being one.

### 5a. The identifier is in cleartext in every event and every federation hop

> "Users within Matrix are uniquely identified by their Matrix user ID. The user ID is namespaced to the homeserver which allocated the account and has the form: `@localpart:domain`" — [Appendices](https://spec.matrix.org/latest/appendices/#user-identifiers) **[spec]**

The room version's event format makes `sender`, `room_id`, `type` and `origin_server_ts` **required top-level fields**, outside the encrypted payload **[spec]** ([Room v12 event format](https://spec.matrix.org/latest/rooms/v12/#event-format)). Only message events are encrypted, and the Megolm plaintext carries `type`/`content`/`room_id` — **state events are not in it** **[spec]**. So `m.room.member` — the entire social graph — is in the clear by construction.

The sharpest structural proof is the redaction key list. These are the fields a server keeps _even after an event is deliberately redacted_ **[spec]** ([Room v12 redactions](https://spec.matrix.org/latest/rooms/v12/#redactions)): `event_id`, `type`, `room_id`, `sender`, `state_key`, `depth`, `prev_events`, `auth_events`, `origin_server_ts` — and, for `m.room.member`, the `membership` value itself. **Membership survives redaction.**

**Device enumeration is not even a server privilege.** `/keys/query` is an ordinary authenticated client endpoint, an empty device list means "all", and the spec imposes no requirement that the caller share a room with the target **[spec]**:

> "| device_keys | {User ID: [string]} | **Required**: The keys to be downloaded. A map from user ID, to a list of device IDs, **or to an empty list to indicate all devices** for the corresponding user. |" — [POST /keys/query](https://spec.matrix.org/latest/client-server-api/#post_matrixclientv3keysquery)

Any authenticated user anywhere in the federation can name a user ID and get back the full current device list, identity keys, and human-readable device display names. And changes are pushed unasked to every server sharing a room:

> "Servers must send `m.device_list_update` EDUs to all the servers who share a room with a given local user" — [Server-Server API, Device Management](https://spec.matrix.org/latest/server-server-api/#device-management) **[spec]**

**The spec never states what E2EE fails to hide.** Zero occurrences of "metadata", "not encrypted", "unencrypted", "cleartext" or "in the clear" across the Client-Server API, Server-Server API, Appendices and Room v12 pages **[absent]**. The nearest first-party admission is the Matrix Foundation's own blog:

> "Matrix currently exposes the metadata of who's talking in which rooms to the admins of the servers whose users are in a given conversation." … "sometimes metadata is a requirement: in practice a lot of professional Matrix users (i.e. large government installations) often actually want to know who's talking to who on their servers for compliance and access control reasons." — [matrix.org, Dispelling myths and misinformation](https://matrix.org/blog/2025/06/dispelling-myths/) **[vendor]**

### 5b. The sleeping-peer mechanism: to-device messaging

This is the closest analogue in the corpus to a deposit-and-collect store, and the spec spells out the whole lifecycle **[spec]** ([Send-to-Device messaging](https://spec.matrix.org/latest/client-server-api/#send-to-device-messaging)):

> "**Servers should store pending messages for local users until they are successfully delivered to the destination device.** When a client calls /sync with an access token which corresponds to a device with pending messages, the server should list the pending messages, in order of arrival, in the response body.
>
> **When the client calls /sync again with the next_batch token from the first response, the server should infer that any send-to-device messages in that response have been delivered successfully, and delete them from the store.**
>
> If there is a large queue of send-to-device messages, the server should limit the number sent in each /sync response. 100 messages is recommended as a reasonable limit."

Note the shape: **retain until collected, and infer collection from the advance of the sync token.** No expiry is specified. The addressing envelope is unencrypted by construction — the `messages` map is `{User ID: {device ID: content}}` — so the server sees sender, recipient user id, recipient device id, event type, arrival order, timing and count. Only `content` is opaque.

Key backup leaks structure as well as ciphertext: room ids and session ids are **URL path components** of `/room_keys/keys/{roomId}/{sessionId}`, and the server actively _reasons over_ the metadata, choosing which of two uploaded keys to keep by comparing `is_verified`, then `first_message_index`, then `forwarded_count` **[spec]**. SSSS likewise stores each secret under an event type equal to its name, so the server knows exactly which secrets exist **[spec]**.

### 5c. Retention: none in the spec, off by default in practice, and unenforceable across federation

**"Retention" does not appear in the Matrix specification at all** **[absent]**. MSC1763 has been open since 2018-12-30 and is still labelled `needs-implementation` **[source]**.

Synapse's own documentation states the consequence:

> "**If a room doesn't have a message retention policy, and there's no default one for a given server, then no message sent in that room is ever purged on that server.**" — [Synapse, Message retention policies](https://github.com/element-hq/synapse/blob/develop/docs/message_retention_policies.md) **[vendor]**

> "`enabled` (boolean): Enforce message retention policies **Defaults to `false`**." — [Synapse config documentation](https://github.com/element-hq/synapse/blob/develop/docs/usage/configuration/config_documentation.md) **[vendor]**, confirmed in source as `retention_config.get("enabled", False)` **[source]**

And even where it is on, the federation undoes it:

> "Note that over every server in the room, **only the ones with support for message retention policies will actually remove expired events. This support is currently not enabled by default in Synapse.**" — Synapse, _ibid._ **[vendor]**

Even a deliberate admin purge preserves the graph:

> "By default, events sent by local users are not deleted, as they may represent the only copies of this content in existence." … "**Room state data (such as joins, leaves, topic) is always preserved.**" — [Purge History API](https://github.com/element-hq/synapse/blob/develop/docs/admin_api/purge_history_api.md) **[vendor]**

**Matrix is the corpus's worked example of what a retention policy is worth when it is a per-operator knob rather than a property of the design**: a room-level `m.room.retention` event is a _request_ that each participating homeserver may honour, cap, ignore, or never have implemented — and the operator most likely to ignore it is the default-configured one.

---

## 6. The products that removed the phone number — and kept a stable handle anyway

The ticket's premise deserves a sharper answer than "essentially all of them". **Three products set out explicitly to eliminate the phone number, succeeded, and still ended up with a stable per-recipient identifier at the store.** What changed in each case was _who mints it_ and _what it is linked to_ — never whether it is stable.

**Session** replaced it with a self-minted keypair:

> "Session does not require users to provide a phone number, email address, or other similar identifier when registering a new account. Instead, pseudonymous public-private key pairs are the basis of an account's identity." — [Session whitepaper §1](https://arxiv.org/pdf/2002.04609) **[vendor]**

That key is exactly what the store indexes by, and the mapping from key to storage location is **deterministic and computable offline by anyone**:

> "we divide the user-generated public key space into distinct, deterministic groupings and map each grouping directly to a swarm responsible for storing messages for users within that grouping." … "a user can always determine their swarm without the use of a centralised resolver." — _ibid._ §4.4 **[vendor]**

The `store` RPC takes "`pubkey` (required) contains the pubkey of the recipient, encoded in hex" and the node refuses keys outside its swarm — `if (!swarm_.is_pubkey_for_us(req.pubkey)) return cb(handle_wrong_swarm(req.pubkey));` **[source]**. With swarms sized `Nmin = 5 … Nmax = 10`, an adversary who wants a given account's arrival timeline knows _in advance_ which handful of nodes to run.

**And the design actively fights rotation**, because there is no server-side account to re-point:

> "users are prompted to write down their long-term private key upon account generation. … This enables the user's contacts to keep communicating with the same Account ID, instead of needing to establish contact with a new Account ID." — _ibid._ §4.3.1 **[vendor]**

What Session actually buys is a different axis entirely: onion routing severs the **identifier ↔ IP** link. "The IP address of the recipient is unknown to all parties except the first node in the onion requests path" (§2.2) **[vendor]**. **It answers "who" permanently and refuses to answer "where".** That is the reverse of the trade ADR-0075 §5 contemplates, which rotates the handle while conceding the IP.

Its retention is the most structurally enforced of the store-and-forward set — a rejection branch in publishable code **[source]**:

```cpp
inline constexpr auto TTL_MAXIMUM         = 14 * 24h;   // public inbox namespaces
inline constexpr auto TTL_MAXIMUM_PRIVATE = 30 * 24h;   // ordinary private messages
...
if (ttl < TTL_MINIMUM || ttl > max_ttl)
    return cb(Response{http::FORBIDDEN, "Provided expiry/TTL is not valid."sv});
```

(**Correction to a common belief**: the private-message TTL is **30 days**, not 14. The 14-day figure applies only to public-inbox namespaces.) The limit is on what an _honest_ node will accept; the network is permissionless, so a modified node's disk is not bound by it.

**Threema** replaced the phone number with a short opaque string — but the _server_ mints it:

> "The server stores the public key and assigns a new random Threema ID, consisting of 8 characters out of A-Z/0-9." — [Cryptography Whitepaper](https://threema.com/press-files/2_documentation/cryptography_whitepaper.pdf) **[vendor]**

> "The public key of each user is stored on the directory server, along with its **permanently assigned** Threema ID." — _ibid._ (emphasis in original) **[vendor]**

And the phone number survives as an opt-in linkage the directory will resolve: lookups accept "a full 8-character Threema ID", "a hash of a E.164 mobile phone number that is linked with a Threema ID", or "a hash of an email address" **[vendor]**. Retention is 14 days:

> "Messages and files are stored on the servers until they are successfully delivered or until 14 days have elapsed (whichever happens first)." — [threema.com/en/faq/message_storage](https://threema.com/en/faq/message_storage) **[vendor]**

**Enforced by nothing an outsider can check** — the server is closed. Threema's own _other_ subsystem shows the contrast: Threema Safe backups carry a server-advertised `retentionDays` configuration key **[vendor]**, which is a rule; the message queue's 14 days is a promise.

**Delta Chat** replaced it with a randomly generated email address, which removes personalness and nothing else:

> "Get a chatmail address in a few seconds" — "No questions asked, no name, numbers or e-mail." — [delta.chat/en/2023-12-13-chatmail](https://delta.chat/en/2023-12-13-chatmail) **[vendor]**

An email address is the most stable, most enumerable, most cross-service-linkable identifier in the corpus. What Delta Chat _does_ have is **the best-documented retention enforcement of the whole set** — a named job with published defaults **[source]** (`chatmaild/ini/chatmail.ini.f`, confirmed in `config.py`):

```ini
#max_mailbox_size = 500M          # oldest messages removed automatically
#delete_mails_after = 20          # days, unconditionally
#delete_large_after = 7           # days, for messages >200k
#delete_inactive_users_after = 90 # days without a successful login
```

> "chatmail-expire deletes old messages, large messages, and entire mailboxes of users who have not logged in for longer than `delete_inactive_users_after` days." — [chatmail relay overview](https://chatmail.at/doc/relay/overview.html) **[vendor]**

(**Correction to another common belief**: chatmail relays do _not_ delete on delivery. The default is 20 days unconditionally, plus size-pressure eviction.)

---

## 7. The two that manage without — and exactly what each gives up

### 7a. Magic Wormhole: no stable identifier, bought with a ten-minute window

This is the only product in the corpus whose store holds no stable per-recipient handle. The construction is a **two-level indirection**: the short human-spoken thing is not the thing that names the store.

> "Mailboxes are identified by a large random string. "Nameplates", in contrast, have short numeric identities: in a wormhole code like "4-purple-sausages", the "4" is the nameplate." — [Rendezvous Server Protocol](https://magic-wormhole.readthedocs.io/en/latest/server-protocol.html) **[spec]**

> "Nameplates (on the server) must live until the second client has learned about the associated mailbox, **after which point they can be reused by other clients**." — _ibid._ **[spec]**

> "Each client has a **randomly-generated "side"**, a short hex string, used to differentiate between echoes of a client's own message, and real messages from the other client." — _ibid._ **[spec]**

The scarce, guessable, human-scale name is recycled the moment it has done its job; the durable-ish name is random and per-transfer; the per-connection pseudonym is random and per-run. The only stable string the server sees is the **AppID** — the application, not the person. The entire client→server vocabulary (`bind`, `list`, `allocate`, `claim`, `release`, `open`, `add`, `close`) contains no account and no registration **[spec]**.

It genuinely queues, unlike the transport relays:

> "These messages are queued in a "Mailbox" until the other side connects and retrieves them, but are delivered immediately if both sides are connected to the server at the same time." … "The server stores all messages in a database, so it should not lose any information when it is restarted." **[spec]**

**And the retention is structural on two independent axes.** Explicit release/close by both sides ("Mailboxes are kept alive by either an open client, or a Nameplate which points to the mailbox"), and a hard sweep **[source]** (`server_tap.py`):

```python
CHANNEL_EXPIRATION_TIME = 11*MINUTE
EXPIRATION_CHECK_PERIOD = 5*MINUTE
```

Deletion cascades nameplate → mailbox → messages as real `DELETE` statements. What survives is an aggregate usage row — `(app_id, for_nameplate, started, total_time, waiting_time, result)` — with `started` coarsened when the operator sets `blur_usage` **[source]**.

**What it gives up, in the project's own words and not paraphrased:**

1. **Offline delivery does not exist.** The eleven minutes _is_ the delivery window. The docs point at a "Journal Mode" for apps whose two sides are never running at once — and that document says "(note: this section is speculative, **the code has not yet been written**)" **[spec]**.
2. **The address is carried by a human, and is 16 bits.** "By default, wormhole codes contain 16 bits of entropy. If an attacker can intercept your network connection (either by owning your network, or owning the mailbox server), they can attempt an attack." **[spec]**
3. **Nameplate reuse is itself an attack surface**, mitigated only by an open issue: "If the server refused to reuse the same channel id (aka "nameplate") right away (issue #31), a network attacker would be unable to set up the second connection, cutting this attack in half." **[spec]**
4. **No identity means no rate-limiting handle, and the author says there is no answer.** "In particular, grumpy people could disrupt service for everyone by writing a program that just keeps connecting to the mailbox server… **I do not have any good mitigations for this attack**, and functionality may depend upon the continued goodwill of potential vandals." **[spec]**

That fourth point is the mirror image of Signal §2b: **Signal removed the sender and had to re-key abuse prevention onto the recipient; Magic Wormhole removed both and has no key to re-target onto.** Rate limiting is the component that most reliably forces a durable identifier into a design.

The deeper analysis of the code's entropy, the PAKE and the browser story is in the [#195](https://github.com/palebluebytes/inventoria/issues/195) note (`docs/research/195-magic-wormhole-guarantees.md`, on its own branch) and is not repeated here.

### 7b. Briar: the question dissolves because the store is your own phone

Briar's base design has no store at all, and its own README states the cost before stating the fix:

> "This kind of synchronous message exchange requires contacts to be online and connected to each other. While this is great for privacy (no central server which can log things or be censored) it's bad for reachability… **Message delivery could be delayed for an arbitrary time (or even indefinitely) until both Bob and Alice are online at the same time.** The mailbox solves this problem by providing a message buffer where contacts can leave messages for the owner of the mailbox and which is connected to a stable internet connection (e.g. the wifi at home, cable internet) and a power source." — [briar-mailbox README](https://code.briarproject.org/briar/briar-mailbox/-/blob/main/README.md) **[vendor]**

> "The target for this project will come as Android application since it will be easy to setup and besides **a spare phone**, no special hardware is required." — _ibid._ **[vendor]**

The identifiers on that mailbox are random, per-contact, per-mailbox, and minted by the owner's own device:

> "Briar generates random 32-byte `token`, `inboxId` and `outboxId` encoded as hexadecimal strings and sends them along with its `contactId`." — [briar-mailbox API.md](https://code.briarproject.org/briar/briar-mailbox/-/blob/main/API.md) **[source]**

Uploads are addressed to a folder, not a person; `contactId` is a small integer scoped to that one mailbox. **There is no cross-user namespace, because there is no third party.** That is not a solution to the stable-handle problem — it is a refusal to have the problem, purchased with hardware.

Retention: **no time-based policy is documented** **[absent]**. The API offers explicit deletion and a full wipe. Retention is whatever the owner's device does.

Costs, stated in Briar's own manual: contacts are added by scanning each other's QR codes in person, or by exchanging a `briar://` link whose add attempt **expires after 48 hours** if no connection succeeds, after which both parties must delete and re-exchange **[vendor]**.

### 7c. Syncthing and Tailscale: stable handle, zero retention

Both are worth recording because they show the two properties are independent. Both hold a stable per-peer identifier. Neither stores anything.

**Syncthing.** The Device ID is a hash of the device's certificate, and the docs volunteer that this is really a key id:

> "The device ID is used for address resolution, authentication and authorization. The term "device ID" could interchangeably have been "key ID" since the device ID is a direct property of the public key in use." — [Understanding Device IDs](https://docs.syncthing.net/dev/device-ids.html) **[vendor]**

It is not asserted by the client but _derived from the presented certificate_, which makes it unforgeable and unavoidable:

> "The device ID of the announcing device is not part of the announcement. Instead, the server requires that the client perform certificate authentication. The device ID is deduced from the presented certificate." — [Global Discovery v3](https://docs.syncthing.net/specs/globaldisco-v3.html) **[spec]**

And the relay is keyed on it: `ConnectRequest` carries exactly one field, "Device ID to which the client would like to connect" **[spec]**. Syncthing's own security page states the leak without hedging:

> "The operator of the discovery server can map arbitrary device addresses to IP addresses, and **deduce which devices are connected to each other**." … "The selected relay server will learn the connecting device's device ID. Relay servers can be run by **anyone in the general public**." — [Security Principles](https://docs.syncthing.net/users/security.html) **[vendor]**

**The relay is a live circuit, not a store.** An absent peer gets `ResponseNotFound = Response{1, "not found"}`; the session serves nothing until two sockets are present (`if (len(s.conns) < 2) { continue }`); it abandons at a one-minute timer; and the proxy is a bare read/write loop over one reused 64 KiB buffer **[source]** (`cmd/strelaysrv/session.go`). Retention is zero because there is no database. The _discovery_ server retains addresses for `addressExpiryTime = 2 * time.Hour` **[source]**.

**Tailscale.** The identifier is the address:

> "DERP routes packets to clients using curve25519 keys as addresses." — [`derp/derp.go`](https://github.com/tailscale/tailscale/blob/main/derp/derp.go) **[source]**

```go
FrameSendPacket    = FrameType(0x04) // 32B dest pub key + packet bytes
FrameForwardPacket = FrameType(0x0a) // 32B src pub key + 32B dst pub key + packet bytes
```

Neither Tailscale's DERP KB page nor the "How Tailscale works" post says anything about buffering, queuing or retention **[absent]**. The source shows why there is nothing to say: the queue is `defaultPerClientSendQueueDepth = 32`, allocated as part of a live `sclient`; a packet for an absent peer is dropped and counted (`dropReasonUnknownDest`, `dropReasonGoneDisconnected`); a full queue drops the **oldest** packet; and on disconnect the queue is drained straight into the drop counter **[source]** (`derp/derpserver/derpserver.go`).

**Tailscale's node key is the one identifier in the corpus that rotates** — but only on re-authentication, and the coordination server republishes the new key to every peer **[vendor]** ([Node keys](https://tailscale.com/kb/1010/node-keys)); the machine key beneath it "cannot be rotated". So even here rotation is a re-auth event mediated by a central directory, not per-session unlinkability.

---

## 8. Retention: the taxonomy the corpus actually supports

Sorting the eleven by _what enforces it_ rather than by _how long_:

| Enforcement                                                   | Products                                               | Wording that establishes it                                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Structural — there is nothing to retain**                   | Syncthing relay, Tailscale DERP                        | No database in either; absent peer gets `ResponseNotFound` / `dropReasonUnknownDest`. **Price: both peers awake.**                                                          |
| **Structural — the store is yours**                           | Briar Mailbox                                          | The node is the owner's spare phone. **Price: a second device you own and power.**                                                                                          |
| **Structural by lifetime — state cannot outlive the meeting** | Magic Wormhole                                         | `CHANNEL_EXPIRATION_TIME = 11*MINUTE` plus release-on-close. **Price: a ten-minute window and no DoS defence.**                                                             |
| **Lifecycle rule, visible in code**                           | Signal, Session, Delta Chat, Synapse                   | DynamoDB TTL attribute `"E"` + delete-on-ack; `http::FORBIDDEN` on an over-cap store; `chatmail-expire` with published defaults; `retention.enabled` — **default `false`**. |
| **Bare promise, no published mechanism**                      | WhatsApp (30 d), Apple iMessage (30 d), Threema (14 d) | "we do not retain… we delete it"; "Messages are stored on Apple servers for up to 30 days"; "until they are successfully delivered or until 14 days have elapsed".          |
| **No policy at all**                                          | Apple CloudKit, Matrix by default                      | No TTL documented anywhere in CloudKit; "no message sent in that room is ever purged on that server".                                                                       |

Three observations that fall out of that table and are not obvious from any single product:

**1. The three largest products all state retention in the modality of behaviour, and all three demonstrably know how to write a capability claim.** WhatsApp: "we do not retain" beside "no third parties… _can_ access the content". Apple: "Messages are stored… for up to 30 days" beside "the administrative access cards that permit the firmware to be changed have been destroyed". The grammatical difference is not accidental, and it is the cheapest available test of whether a stated retention window is a structure or a policy.

**2. "Delete on delivery" is bought with a delivery signal, and a delivery signal is a per-recipient acknowledgement the server must be able to attribute.** Signal deletes only on `isSuccessResponse` → `acknowledgeMessage` **[source]**. Matrix's spec instructs the server to _infer_ delivery from the advance of the sync token **[spec]**. Magic Wormhole needs both sides to `close`. Every "we drop it once you've got it" rests on the server knowing that _you_ got it — which is a second use for the recipient handle, independent of routing.

**3. The addressing state is the thing that actually goes stale during an absence — not the mail.** WhatsApp's Signed Device List expires at 35 days and only the primary can renew it, after which senders address the primary alone. Apple's fan-out enumerates devices at send time, so a device unknown then receives nothing ever. Syncthing's discovery addresses expire at two hours. **Three independent designs have the same failure mode: the absence outlives the freshness of the routing information, and the repair path in every case runs through a device that was awake.**

---

## 9. What I could not verify

Every gap below was searched for in the primary source and not found. None is filled from memory.

- **Signal's production message TTL.** `expiration: P30D` is in `service/config/sample.yml`, an example file. No Signal statement of production retention exists. Also unresolved: which store is authoritative today (both a DynamoDB and a FoundationDB message store are wired into `MessagesManager`), the registration-id rotation policy, and the 96-bit-versus-128-bit discrepancy between the 2018 sealed-sender post and the shipped `UNIDENTIFIED_ACCESS_KEY_LENGTH = 16`.
- **No signal.org post announcing the ACI/PNI split.** The usernames post never uses either term; the support-centre "Deeper Dive" article returned HTTP 403. The only primary evidence for the design is the server source.
- **Apple's DSID as the account handle.** Zero hits in the Legal Process Guidelines and in every iCloud/CloudKit/iMessage security page. The only Apple attestation is the Instant Hotspot page, which expands it as "Destination Signaling Identifier", says it is "tied to the Apple Account", and says it is "**rotated periodically**" — which contradicts "stable". Do not cite DSID as Apple's stable per-recipient identifier.
- **The literal `__defaultOwner`.** Apple documents `_defaultZone` as a wire literal and `CKOwnerDefaultName`/`CKCurrentUserDefaultName` as SDK constants; `__defaultOwner` appears only in third-party forum output.
- **Any CloudKit TTL, change-history window, or statement of user-identifier lifetime.** None documented.
- **Any mechanism behind Apple's or WhatsApp's 30 days.** Both state a duration and nothing else.
- **WhatsApp's App State Patch Queue window** — published as literally "the last X days"; **Sender Side Backfill's "short duration"** — unquantified; **the HSM vault's record identifier** — "associated with the particular client" is all the document says; **the permitted backup password attempts** — "a certain number".
- **Any "is this number on WhatsApp" enumeration primitive.** Meta's developer reference pages are JS-rendered and yielded no extractable verbatim text. The Privacy Policy's contact-upload paragraph implies the capability without describing an API.
- **A Matrix spec statement of what E2EE does not hide.** There is none; the metadata position exists only on the matrix.org blog.
- **A Briar Mailbox retention policy.** Not in the README or API.md.
- **A Threema primary source open-sourcing the message server**, which is what would let the 14 days be verified rather than trusted.
- **Syncthing's Device ID stability as a stated guarantee.** It is structural (a hash of a long-lived keypair, with a certificate valid to 2049) but no sentence says "never changes".
