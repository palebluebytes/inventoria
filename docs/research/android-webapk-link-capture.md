# Research: can a scanned receive link reach the installed Rations WebAPK?

**Prior art:** [`217-receive-link-landing.md`](217-receive-link-landing.md) §3.1 and §3.2 — which
established, from Chromium's own `AndroidManifest.xml` template, that a Chrome-minted WebAPK
declares an `autoVerify` intent filter over the Web App Manifest's `scope`, and measured this
origin serving no `/.well-known/assetlinks.json`. **This note extends that; it does not redo it.**
§3.2 then concluded the Android half was cosmetic because app and tab share one profile. That
conclusion still holds for _storage_. It is the wrong frame for the thing now being asked, which
is not "does the meal land" but "why does the QR open a tab".

**Why this exists:** a real device observation, 2026-09-02. A meal code was displayed on one
Android phone and scanned with the stock camera / Google Lens on another. The link
`https://inventoria.palebluebytes.space/food/#r=<room>&k=<key>` opened **Chrome, showing Rations
in a tab**, not the installed Rations WebAPK. Two questions followed: does the camera path even
give a WebAPK a chance (Q2), and could this site fix it by publishing an `assetlinks.json` (Q1).

**Grounds:** Chromium `main` as of today (`components/webapk/*`, `components/external_intents/*`,
`chrome/browser/android/webapk/webapk_installer.cc`, `chrome/android/webapk/shell_apk/`), two
Chromium commit messages, AOSP `frameworks/base` (`Intent.java`, SystemUI's QR scanner
controller), AndroidX `browser` (`CustomTabsIntent.java`), developer.android.com, and this
origin's live responses.

**Date:** 2026-09-03. **Status:** research only — no application code touched, no ADR written.
Every claim carries the source that owns it. Claims that could not be settled from primary
sources are marked **[unverified]**, and §8 says what would settle each one. Where a claim is
_measured_, _documented_ or _inferred from source_, it says which.

---

## 1. The answer, Q2 then Q1

**Q2 — the camera path gives the WebAPK no chance, and which container it uses turns out not to
matter.** Which app actually opens a scanned URL — the stock camera itself, Google Lens, an
explicit Chrome launch, a Custom Tab, or an in-app WebView — is **not documented by Google and
not open source** ([unverified], §3.2), and AOSP's own QR entry point delegates to a
device-configured closed component by explicit `ComponentName` (§3.3). But every one of the
three possible containers routes past the WebAPK today, for a different reason each. An
**implicit `ACTION_VIEW` + `BROWSABLE`** intent — the only one App Links could ever act on —
lands in the browser, because Android states plainly that from Android 12 "a generic web intent
resolves to an activity in your app only if your app is approved for the specific domain
contained in that web intent. If your app isn't approved for the domain, the web intent resolves
to the user's default browser app instead", and this origin is approved for nothing: its
`/.well-known/assetlinks.json` returns **404, measured today**. A **Custom Tab** is
`new Intent(Intent.ACTION_VIEW)` in AndroidX's own source, and the recommended launch attaches
the browser's package to it — and AOSP defines `setPackage` as limiting the components the
intent "can only match" to that one application package, so a WebAPK, living in a _different_
package (`org.chromium.webapk.…`), is excluded before domain approval is ever consulted. An
**in-app WebView** issues no intent at all. The one route that _can_ still open a WebAPK from a
link is not App Links: it is a hand-written workaround inside Chrome that relaunches the URL into
the WebAPK by package name (§4.5) — and that workaround has a guard, `packages.size() != 1`,
which **this repo is unusually likely to trip**, because a user with both Inventoria (scope `/`)
and Rations (scope `/food/`) installed presents Chrome with _two_ WebAPKs matching `/food/…` and
Chrome then launches neither (§4.6, inferred from source, device probe in §8).

**Q1 — no. Publishing an `assetlinks.json` is not a supported fix, and it is not merely
unestablished: Chromium says the mechanism does not exist, in its own words.** The certificate
half of the problem is, surprisingly, solvable — upstream Chromium ships the WebAPK Minting
Server's signing certificate as a literal byte array, and it decodes to a self-signed
`C=US, O=Google, OU=Chrome WebAPK, CN=CA` valid to 2044 whose SHA-256 fingerprint is
`F9:A8:F7:5A:7F:0B:5D:2C:CA:E8:C2:B5:70:85:56:40:E7:09:99:55:58:CD:97:06:AF:74:B8:4E:68:96:2F:AA`
(measured, §4.3). The package name is the first real blocker: `webapk.proto` declares
`WebApkResponse.package_name` as "Package name to install WebAPK at", and
`webapk_installer.cc` takes it straight off the server's response, so the site is not the party
that chooses it and cannot know it before an install happens (§4.2). But the decisive blocker
sits underneath both fields. A Chromium commit of 2022-06-22 states: **"On S+ Android doesn't
verify WebApk Url Handlers, so they can't be default handlers for Web Intents"**, and its
predecessor of 2021-08-23: "Due to changes in Android S, WebAPKs are no longer launched for
Intents to the WebAPK's domain. We are hoping to fix this at the Android level by allowing
WebAPKs to pass App Link verification, but until that fix rolls out, we'll make Chrome manually
launch the WebAPK." The verification is not failing for want of a file on this origin; it is not
being performed for WebAPKs at all. Four years later the workaround is still in `main`
(fetched today), which is evidence — not proof — that the Android-level fix never rolled out
([unverified], §8). **There is a user-side fix that costs this site nothing**: Android documents
"Request the user to associate your app with the domain in system settings", the
Settings → **Open by default** → "Links to open in this app" screen (§5.3).

---

## 2. What was read, what was measured, what was not

**Measured, today, against the live deployment** (`curl`, 2026-09-03):

| Request                            | Status  | Content type                | Body                                                       |
| ---------------------------------- | ------- | --------------------------- | ---------------------------------------------------------- |
| `GET /.well-known/assetlinks.json` | **404** | `text/plain`                | `Not found` — the Worker, not the assets                   |
| `GET /manifest.webmanifest`        | 200     | `application/manifest+json` | `"scope": "/"`, `"start_url": "/"`, name Inventoria        |
| `GET /food/manifest.webmanifest`   | 200     | `application/manifest+json` | `"scope": "/food/"`, `"start_url": "/food/"`, name Rations |

The 404's `content-type: text/plain` and body match `worker/src/index.ts`'s catch-all, exactly as
§8.2 of the prior-art note described. This re-confirms the prior art's measurement a year on and
adds nothing new; it is recorded because Q1 turns on it.

**Measured, today, from source**: the SHA-256 fingerprint and X.509 fields of the certificate
bytes in `ChromeWebApkHostSignature.java`, by decoding the Java byte array to DER and running
`openssl x509` (§4.3). This is a reproducible computation over a public file, not a claim about a
device.

**Read** (all fetched today, all `main`/`androidx-main` unless stated): Chromium
`components/webapk/webapk.proto`, `WebApkConstants.java`, `WebApkValidator.java`,
`ChromeWebApkHostSignature.java`, `chrome/browser/android/webapk/webapk_installer.cc`,
`chrome/android/webapk/README.md`, `chrome/android/webapk/shell_apk/AndroidManifest.xml`,
`chrome/browser/resources/webapks/about_webapks.ts`,
`components/external_intents/.../ExternalNavigationHandler.java` (3,105 lines) and its
`ExternalNavigationDelegate` interface, `externalnav/ExternalNavigationDelegateImpl.java`,
`customtabs/CustomTabDelegateFactory.java`; the Chromium commit messages for `eddc8be0259e`,
`aff7fc1bb02c`, `869bff0ea813`, `21c66c7c766c`; AOSP `core/java/android/content/Intent.java` and
`SystemUI/.../QRCodeScannerController.java`; AndroidX
`browser/.../customtabs/CustomTabsIntent.java`; and five developer.android.com / Google support
pages.

**Not done**: no device was driven, no Playwright spec run, no browser automated (AGENTS.md §1).
No claim below is a measurement of a phone's behaviour. **The reported symptom is the user's
observation, and this note treats it as one datum, not as a reproduction.**

**Not established, and named as such rather than guessed**: what Google Lens and the stock
camera actually do with a scanned URL (§3.2); whether crbug 1232514's Android-level fix ever
shipped (§4.4); and whether both Facets are in fact installed on the device that showed the
symptom (§4.6). All three are §8 probes.

---

## 3. Q2 — does the camera / Lens path give a WebAPK a chance?

### 3.1 What decides routing, stated once

Android's App Links resolver acts on **intent resolution**, and only on intents it is given the
freedom to resolve. Three properties of the intent decide everything:

1. **Is it implicit?** Verified App Links are a property of _intent filters_, and
   developer.android.com is explicit that filters are not consulted otherwise: "An explicit intent
   is always delivered to its target, regardless of any intent filters the component declares"
   ([Intents and intent filters](https://developer.android.com/guide/components/intents-filters)).
2. **Is the package pinned?** AOSP's own javadoc for `Intent.setPackage`, verbatim: "(Usually
   optional) Set an explicit application package name that limits the components this Intent will
   resolve to. If left to the default value of null, all components in all applications will
   considered. If non-null, **the Intent can only match the components in the given application
   package**"
   ([`Intent.java`](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/content/Intent.java)).
   A package-pinned intent is not an explicit intent in the `ComponentName` sense — filters are
   still consulted — but they are consulted **only within that package**. A WebAPK is a separate
   package, so this excludes it as completely as a `ComponentName` would.
3. **Is the app approved for the domain?** From Android 12:

   > "Starting in Android 12 (API level 31), a generic web intent resolves to an activity in your
   > app only if your app is approved for the specific domain contained in that web intent. If
   > your app isn't approved for the domain, the web intent resolves to the user's default browser
   > app instead."
   > — [Behavior changes: all apps, Android 12](https://developer.android.com/about/versions/12/behavior-changes-all#web-intent-resolution)

   Approval is by App Links verification (which queries
   `https://hostname/.well-known/assetlinks.json` — [Verify Android App
   Links](https://developer.android.com/training/app-links/verify-android-applinks)) **or** by the
   user, in system settings.

### 3.2 What is actually documented about the stock camera and Google Lens: almost nothing

This is the honest state of the evidence, and it is thin.

- Google's own help page for Camera from Google says a scanned QR can "open a browser, view text,
  or open apps like a payment app", and "To open a browser page, app, or payments app after a QR
  code is scanned, click the banner that appears" ([Scan QR codes on Camera from
  Google](https://support.google.com/camerafromgoogle/answer/12033278)). It says _browser_. It
  does not say what kind of intent produces the browser, and "open apps like a payment app" shows
  the same banner can reach a non-browser app — which is what a link-capturing app looks like from
  the outside.
- Pixel's help page is weaker still: the camera "automatically recognizes the code and shows a
  bubble or link on the screen", and you "tap the link that appears" ([Scan QR codes with your
  Pixel phone](https://support.google.com/pixelphone/answer/16561572)). It names no handler.
- **Google Lens has no published statement about the intent it issues.** Nothing on
  developer.android.com, developers.google.com, lens.google or the Chrome for Developers site
  describes it.

Camera from Google, Google Lens and the Google app are all closed source. **Which container a
scanned URL lands in is therefore [unverified] and cannot be made otherwise by reading.** It is a
handset observation (§8).

### 3.3 AOSP's own QR entry point launches a closed component, explicitly

The one QR-scanning path that _is_ open source shows the shape of the problem. Android's
Quick Settings QR tile does not scan anything itself; SystemUI reads a component name out of
device config and starts it by `ComponentName`:

```java
private String getDefaultScannerActivity() {
    return mContext.getResources().getString(
        com.android.internal.R.string.config_defaultQrCodeComponent);
}
…
ComponentName componentName = ComponentName.unflattenFromString(qrCodeScannerActivity);
intent.setComponent(componentName);
intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_NEW_TASK);
```

— [`QRCodeScannerController.java`](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/packages/SystemUI/src/com/android/systemui/qrcodescanner/controller/QRCodeScannerController.java)

So even the platform treats "the QR scanner" as an opaque, per-device, vendor-supplied activity.
Whatever that activity does with a decoded URL is outside AOSP entirely. **This is why §3.2 cannot
be closed by reading more source: the source is not there.**

### 3.4 Why the container does not decide the outcome anyway

Take the three possibilities in turn. Each fails for its own reason, and the reasons do not
overlap — which is what makes the conclusion robust to not knowing which one is real.

| Container the scanner uses               | Does an intent leave the app? | Can the WebAPK be in the resolution set?                                        | Outcome today                                                                                                                                                                  |
| ---------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Implicit `ACTION_VIEW` + `BROWSABLE`** | Yes                           | Yes, in principle                                                               | **Browser.** The app is not approved for the domain — no `assetlinks.json` (404, measured) — so Android 12+ resolves to the default browser (§3.1 point 3).                    |
| **Chrome Custom Tab, session-bound**     | Yes, but package-pinned       | **No.** `setPackage` restricts matching to the browser's package (§3.1 point 2) | **Browser**, by construction, whatever the site publishes.                                                                                                                     |
| **Chrome Custom Tab, session-less**      | Yes, implicit                 | Yes, in principle                                                               | Same as row 1. AndroidX's `CustomTabsIntent.Builder()` with no session never calls `setPackage`, so the intent is a bare `ACTION_VIEW` — but domain approval still decides it. |
| **In-app `WebView`**                     | No                            | No                                                                              | **Rendered inside the scanner app.** No resolver runs.                                                                                                                         |

The Custom Tab rows rest on AndroidX's own source, not on a description of it:

```java
private final Intent mIntent = new Intent(Intent.ACTION_VIEW);
…
public @NonNull Builder setSession(@NonNull CustomTabsSession session) {
    mIntent.setPackage(session.getComponentName().getPackageName());
```

```java
public void launchUrl(@NonNull Context context, @NonNull Uri url) {
    intent.setData(url);
    ContextCompat.startActivity(context, intent, startAnimationBundle);
}
```

— [`CustomTabsIntent.java`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:browser/browser/src/main/java/androidx/browser/customtabs/CustomTabsIntent.java)

So a Custom Tab **is** an `ACTION_VIEW` intent, and it is package-pinned exactly when the caller
binds a session (the documented pattern, since a session is what buys warm-up, callbacks and the
Custom Tab UI at all). The Builder's own javadoc says the session "Guarantees that the `Intent`
will be sent to the same component as the one the session is associated with" — a guarantee that
is, mechanically, the exclusion of every other package including the WebAPK.

**The one thing that changes this picture is not App Links at all.** §4.5.

---

## 4. Q1 — can a site author a valid `assetlinks.json` for a Chrome-minted WebAPK?

### 4.1 What `autoVerify` demands, and who owns each field

Android queries, "for each unique hostname found in the intent filters",
`https://hostname/.well-known/assetlinks.json`, and the statement must carry a `package_name` and
a `sha256_cert_fingerprints` list ([Verify Android App
Links](https://developer.android.com/training/app-links/verify-android-applinks)). For an
ordinary app the developer owns both fields. For a WebAPK the site owns neither. Take them
separately, because they have different answers.

### 4.2 The package name is minted server-side, and the site never chooses it

Chromium's WebAPK protocol makes this explicit. The server's response carries the package name,
and the comment says what it is for:

```protobuf
// Response after creating or updating a WebAPK.
message WebApkResponse {
  // Package name to install WebAPK at.
  optional string package_name = 1;
```

— [`components/webapk/webapk.proto`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/webapk.proto)

and the browser takes it from there without deriving anything:

```cpp
if (token.empty() || response->package_name().empty()) {
  LOG(WARNING) << "WebAPK server returned incomplete proto.";
  OnResult(webapps::WebApkInstallResult::SERVER_ERROR);
  return;
}

InstallOrUpdateWebApk(response->package_name(), token);
```

— [`chrome/browser/android/webapk/webapk_installer.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/android/webapk/webapk_installer.cc)

The only constraint visible in open source is a prefix: `WEBAPK_PACKAGE_PREFIX = "org.chromium.webapk"`
([`WebApkConstants.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/android/libs/common/src/org/chromium/components/webapk/lib/common/WebApkConstants.java)),
which `WebApkValidator.verifyV1WebApk` enforces
(`!webappPackageName.startsWith(WEBAPK_PACKAGE_PREFIX)` → invalid). **How the remainder of the
name is derived, and whether it is stable per-origin, per-`start_url`, per-`id`, per-user or
per-install, is [unverified]** — the minting server is not open source, and nothing in the client
predicts the name. The request proto sends `manifest_url`, `manifest.id` and an `app_key`, any of
which could key it, but the client never computes a package name from them.

**A site author can read one, after the fact, off a device.** `chrome://webapks` prints
`Package name:` among `Scope:`, `Manifest URL:`, `Manifest Id:` and `Owning Browser:`
([`about_webapks.ts`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/resources/webapks/about_webapks.ts)).
That makes the field _observable_ on one handset. It does not make it _authorable_ — publishing a
statement for a package name observed on one device is only correct if the name is the same for
every device, which is exactly the part that is [unverified].

### 4.3 The certificate is not the blocker — measured

This is the one part of Q1 that turns out to be solvable, and it is worth recording precisely so
nobody spends effort here.

Upstream Chromium ships the WebAPK Minting Server's signing certificate as a literal Java byte
array, `ChromeWebApkHostSignature.EXPECTED_SIGNATURE`, commented "The public key to verify whether
a WebAPK is signed by WebAPK Server"
([`ChromeWebApkHostSignature.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/android/libs/client/src/org/chromium/components/webapk/lib/client/ChromeWebApkHostSignature.java)).
`WebApkValidator` byte-compares an installed package's signature against it
(`Arrays.equals(sExpectedSignature, signature.toByteArray())`), so the array is the DER of an
X.509 certificate. Decoding the 1,132 bytes and running `openssl x509 -inform DER` (measured
today):

```
subject = C=US, O=Google, OU=Chrome WebAPK, CN=CA
issuer  = C=US, O=Google, OU=Chrome WebAPK, CN=CA
serial  = 7821EADC8D0774427471868284202C48D57FF3F5
notBefore = Aug 23 20:08:11 2016 GMT
notAfter  = Jan 10 20:08:11 2044 GMT
SHA-256 = F9:A8:F7:5A:7F:0B:5D:2C:CA:E8:C2:B5:70:85:56:40:E7:09:99:55:58:CD:97:06:AF:74:B8:4E:68:96:2F:AA
```

So the fingerprint a hypothetical statement would need **is** publicly obtainable, and has been
since 2016. Two caveats before anyone treats that as half a solution:

- `verifyV1WebApk` rejects any package whose `packageInfo.signatures.length != 2`, so a minted
  WebAPK carries **two** signatures, only one of which is checked against the array above. What
  Android's verifier requires of `sha256_cert_fingerprints` for a two-signer APK is
  **[unverified]** and was not chased, because §4.4 makes it moot.
- The array is upstream Chromium's. Whether Google Chrome's shipped build uses the same value is
  not observable from open source, though `WebApkValidator` rejecting real WebAPKs on real Chrome
  would be immediately visible, so it almost certainly does. Marked **inferred**.

### 4.4 The mechanism does not exist — Chromium says so

This is the finding that settles Q1, and it is first-party and unambiguous.

> **"On S+ Android doesn't verify WebApk Url Handlers, so they can't be default handlers for Web
> Intents."**
> — Michael Thiessen, Chromium commit
> [`aff7fc1bb02c`](https://chromium.googlesource.com/chromium/src/+/aff7fc1bb02c), _"Work around S+
> WebApks being unverified"_, 2022-06-22, `Bug: 1232514`

> **"Due to changes in Android S, WebAPKs are no longer launched for Intents to the WebAPK's
> domain. We are hoping to fix this at the Android level by allowing WebAPKs to pass App Link
> verification, but until that fix rolls out, we'll make Chrome manually launch the WebAPK when it
> gets a suitable Intent."**
> — Peter Conn, Chromium commit
> [`eddc8be0259e`](https://chromium.googlesource.com/chromium/src/+/eddc8be0259e), _"🕸️ Trampoline
> out to WebAPKs for initial Intents on Android S."_, 2021-08-23, `Bug: 1232514`

And the same statement survives as a comment in `main` today:

```java
// https://crbug.com/1232514: On Android S, since WebAPKs aren't verified apps they are
// never launched as the result of a suitable Intent, the user's default browser will be
// opened instead. As a temporary solution, have Chrome launch the WebAPK.
//
// Note that we also need to query for non-default handlers as WebApks being non-default
// Web Intent handlers is the cause of the issue.
```

— [`ExternalNavigationHandler.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/external_intents/android/java/src/org/chromium/components/external_intents/ExternalNavigationHandler.java)

Read that carefully, because it is stronger than "verification fails". It says verification is
**not performed** for WebAPK URL handlers on Android 12 and above. A site-hosted
`assetlinks.json` is an input to a process that, for this class of package, does not run.
Publishing one would change nothing that anyone has documented.

**Whether the hoped-for Android-level fix ever rolled out is [unverified].** crbug 1232514 maps to
`issues.chromium.org/40191153` and that tracker requires sign-in, so its status could not be read.
The evidence available is circumstantial and points one way: the workaround, its `Bug: 1232514`
comment, and its 2022 non-default-query repair are all still in `main` as fetched today, and the
2021 feature flag `WebApkTrampolineOnInitialIntent` has since been removed in favour of an
unconditional `Build.VERSION.SDK_INT >= Build.VERSION_CODES.S` (§4.5) — that is code that got
_more_ permanent, not less.

### 4.5 What does still open a WebAPK from a link: Chrome's trampoline

Since Android will not route to the WebAPK, Chrome relaunches the navigation into it itself, by
package name:

```java
private boolean launchWebApkIfSoleIntentHandler(
        QueryIntentActivitiesSupplier resolvingInfos,
        Intent targetIntent,
        ExternalNavigationParams params) {
    String packageName = pickWebApkIfSoleIntentHandler(params, resolvingInfos);
    if (packageName == null) return false;
    …
    Intent webApkIntent = new Intent(targetIntent);
    webApkIntent.setPackage(packageName);
```

Three properties of this path matter to this repo.

- **It only runs on Android 12+.** `ExternalNavigationDelegateImpl.shouldLaunchWebApksOnInitialIntent()`
  is `return Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;`. Below S the ordinary resolver still
  reached WebAPKs (that is what the 2021 commit says Android S broke), so **pre-S and post-S
  devices behave differently for the same link** — a fact worth holding when comparing two
  handsets.
- **It only runs for the _initial_ navigation from an intent.** Both entry points are gated on
  `params.isFromIntent() && mDelegate.shouldLaunchWebApksOnInitialIntent()`. Chrome must query
  `getIncludingNonDefaultResolveInfos()` to see the WebAPK at all, precisely because an unverified
  WebAPK is not a _default_ handler; the ordinary query is
  `queryIntentActivities(intent, GET_RESOLVED_FILTER | MATCH_DEFAULT_ONLY)`, which excludes it.
  **So a link tapped inside a page Chrome is already showing cannot reach the WebAPK at all**
  (inferred from source) — if Lens renders a results page and the user taps the URL from there,
  that is not an initial intent navigation.
- **It is available in Custom Tabs too.** `CustomTabDelegateFactory.CustomTabNavigationDelegate
extends ExternalNavigationDelegateImpl` and does **not** override
  `shouldLaunchWebApksOnInitialIntent`. That is a source-level fact, not a behavioural one: a
  package-pinned Custom Tab intent still means Chrome is the process that received the URL, and
  Chrome's own navigation handling is what would then trampoline. Whether it does in practice is
  **[unverified]**.

### 4.6 The sole-handler guard, and why two Facets are likely to defeat it

The gate is one line:

```java
private @Nullable String pickWebApkIfSoleIntentHandler(
        ExternalNavigationParams params, QueryIntentActivitiesSupplier resolvingInfos) {
    ArrayList<String> packages =
            getSpecializedHandlers(getResolveInfosForWebApks(params, resolvingInfos));
    if (packages.size() != 1 || !isValidWebApk(packages.get(0))) return null;
    return packages.get(0);
}
```

"Specialized handler" is defined in the same file: a `ResolveInfo` whose `IntentFilter` has at
least one data authority or data path and whose host is not `*`
(`matchResolveInfoExceptWildCardHost`). A browser's generic `http`/`https` filter has no
authority, so browsers are excluded — but **every WebAPK for this origin qualifies**, because the
minting template writes a concrete host and a path rule into the filter:

```xml
<data android:scheme="{{{scope_url_scheme}}}" android:host="{{{scope_url_host}}}"
      {{{scope_url_path_type}}}="{{{scope_url_path}}}"></data>
```

— [`chrome/android/webapk/shell_apk/AndroidManifest.xml`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/webapk/shell_apk/AndroidManifest.xml)

This repo's roster is two Facets on **one origin with nested scopes**: root `scope: "/"` and
Rations `scope: "/food/"` (measured, §2). A URL of `/food/#…` is inside both. So on a device with
both installed, `packages` has **two** entries, `packages.size() != 1` is true, and Chrome's
trampoline returns `null` and launches neither. The link stays in the tab — which is exactly the
reported symptom.

**This is inferred from source, not measured, and it is the single most valuable thing in this
note to go and check** (§8 probe 2). It also has a sharp implication if it holds: the failure is
_caused by_ shipping two Facets, and a Rations-only install on Android 12+ would very likely have
opened the WebAPK. ADR-0084 §9 guessed at this case and guessed the wrong shape — §6.

---

## 5. What this means for the repo

### 5.1 Do not publish an `assetlinks.json`

There is no statement a site can write that Android will act on for a WebAPK, because Android does
not perform the verification (§4.4). Writing a file with a guessed or device-observed
`org.chromium.webapk.…` package name would be a plausible-looking artefact that changes nothing,
takes a `public/.well-known/` directory, a precache decision and a Cloudflare header question with
it, and would need maintaining against a package name nobody can prove is stable (§4.2). **The
answer to "is publishing an assetlinks.json a supported, workable fix here" is _no_, documented,
not _unestablished_.**

### 5.2 The QR-scan door is not the link-capture door, and conflating them costs nothing to avoid

The receive link's job is to deliver a fragment to _some_ instance of the app at this origin. On
Android that job is done: §3.2 of the prior art established that the WebAPK and a Chrome tab are
the same profile, the same OPFS ledger and the same service worker, so a meal accepted in the tab
lands in the same place. **The symptom is a presentation defect, not a data one** — the same
conclusion the prior art reached, now with the mechanism underneath it. What has changed since is
only that the prior art's predicted cause ("the `autoVerify` will not verify for this site,
because there is no `assetlinks.json`") turns out to be the wrong cause: the file's absence is
real but inert. The cause is that WebAPK verification does not happen, plus, probably, §4.6.

### 5.3 The one fix that exists is the user's, and Android documents it

Android's own list of ways an app gets approved for a domain has two entries, and the second does
not involve the site: "Request the user to associate your app with the domain in system settings"
([Behavior changes: all apps, Android
12](https://developer.android.com/about/versions/12/behavior-changes-all#web-intent-resolution)),
which is Settings → **Open by default** → "Open supported links" → "Links to open in this app"
([Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)).
Android also notes "Only one app at a time can be associated with a particular domain" — which,
for two Facets on one host, is a constraint the roster has never had to think about. **Whether
that screen is reachable and functional for a `org.chromium.webapk.…` package is [unverified]**
and is §8 probe 3.

### 5.4 Nothing here reopens a decision

No ADR is contradicted in its decision, only in a stated non-claim and a stated expectation (§6).
This note recommends no code change and no manifest change. `launch_handler` remains what the
prior art §3.4 found it to be: harmless and inert on Android.

---

## 6. What this corrects or qualifies upstream

- **ADR-0084 §9, "Android link capture": "Capture is on by default with no site opt-out and is
  keyed to a WebAPK's declared scope."** The second half is right; **the first half is wrong on
  Android 12 and above**. Capture is off by default and there is no site opt-_in_ either: Android
  does not verify WebAPK URL handlers, so a scanned or messaged link resolves to the browser
  (§4.4). What remains is Chrome's own trampoline, which is not "capture" and does not behave like
  it — it needs an initial-intent navigation and a single matching WebAPK (§4.5, §4.6).
- **ADR-0084 §9, "Which app Android hands the link to when both are installed is untested and
  unsettled by the spec."** Untested remains true. But the reading now available says Android
  hands it to **neither**, and Chrome's fallback also declines, because two installed Facets on
  nested scopes make `packages.size()` two (§4.6, inferred). The record's next sentence — "Both
  outcomes are harmless" — surveys two outcomes and the actual one is a third. It is still
  harmless for the ledger, for the reason the record gives, so this is a correction to the
  reasoning rather than to the conclusion.
- **ADR-0078's "What was never verified": "Whether a browser hands `/food/` off to an installed
  Rations when §4's link opens it, or renders it in the tab."** For Android this is now answered
  at the mechanism level: it renders it in the tab, and §4.4 says why. The iOS half of that
  paragraph is untouched and stays with [#287](https://github.com/palebluebytes/inventoria/issues/287).
- **`217-receive-link-landing.md` §3.1, "The `autoVerify` will not verify for this site."** True in
  outcome, wrong in mechanism, and the difference matters because the stated mechanism implies a
  fix that does not exist. It is not that the fetch of `assetlinks.json` fails; it is that for a
  WebAPK the fetch is not attempted (§4.4). **The prior art's §11 Android probe — "whether the
  WebAPK actually receives the intent with no `assetlinks.json` (predicted: no, unless the user
  enabled it under Open by default)" — predicted the right answer for the wrong reason**, and its
  parenthesis is now the only remaining lever (§5.3).
- **`217-receive-link-landing.md` §3.2, "…and on Android it does not matter."** Unchanged for
  storage and correctness, and this note relies on it (§5.2). It is worth saying that the ticket
  it answered asked about the ledger; a user looking at the wrong chrome is a different complaint
  that §3.2 was never addressed to.

---

## 7. Sources

| Claim                                                                                                                               | Source                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| An explicit intent bypasses intent filters                                                                                          | [Intents and intent filters](https://developer.android.com/guide/components/intents-filters)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `setPackage` limits which components an intent "can only match"                                                                     | [AOSP `Intent.java`](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/core/java/android/content/Intent.java)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Android 12+: unapproved web intents resolve to the default browser                                                                  | [Behavior changes: all apps, Android 12](https://developer.android.com/about/versions/12/behavior-changes-all#web-intent-resolution)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Verification queries `https://hostname/.well-known/assetlinks.json`; `package_name` + `sha256_cert_fingerprints`; "Open by default" | [Verify Android App Links](https://developer.android.com/training/app-links/verify-android-applinks)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Deep links are subject to the disambiguation dialog; verified App Links are not                                                     | [About App Links](https://developer.android.com/training/app-links/about)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| A Custom Tab is `new Intent(ACTION_VIEW)`; `setSession` calls `setPackage`                                                          | [AndroidX `CustomTabsIntent.java`](https://cs.android.com/androidx/platform/frameworks/support/+/androidx-main:browser/browser/src/main/java/androidx/browser/customtabs/CustomTabsIntent.java)                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| A Custom Tab is launched by an Intent                                                                                               | [Chrome for Developers, Custom Tabs](https://developer.chrome.com/docs/android/custom-tabs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| AOSP's QR tile starts a device-configured component explicitly                                                                      | [`QRCodeScannerController.java`](https://cs.android.com/android/platform/superproject/main/+/main:frameworks/base/packages/SystemUI/src/com/android/systemui/qrcodescanner/controller/QRCodeScannerController.java)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Scanning a QR "opens a browser"; tap the banner                                                                                     | [Scan QR codes on Camera from Google](https://support.google.com/camerafromgoogle/answer/12033278)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pixel shows "a bubble or link"; tap it                                                                                              | [Scan QR codes with your Pixel phone](https://support.google.com/pixelphone/answer/16561572)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| WebAPK intent filter is `autoVerify` over the manifest scope, with a concrete host and path                                         | [`shell_apk/AndroidManifest.xml`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/webapk/shell_apk/AndroidManifest.xml)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| The server returns the package name to install at                                                                                   | [`webapk.proto`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/webapk.proto)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Chrome installs at the server-supplied package name                                                                                 | [`webapk_installer.cc`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/android/webapk/webapk_installer.cc)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `WEBAPK_PACKAGE_PREFIX = "org.chromium.webapk"`                                                                                     | [`WebApkConstants.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/android/libs/common/src/org/chromium/components/webapk/lib/common/WebApkConstants.java)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Two signatures, prefix check, byte-equality against the minting server's cert                                                       | [`WebApkValidator.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/android/libs/client/src/org/chromium/components/webapk/lib/client/WebApkValidator.java)                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| The minting server's certificate, as bytes                                                                                          | [`ChromeWebApkHostSignature.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/webapk/android/libs/client/src/org/chromium/components/webapk/lib/client/ChromeWebApkHostSignature.java)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `chrome://webapks` prints the package name and scope                                                                                | [`about_webapks.ts`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/browser/resources/webapks/about_webapks.ts)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| The trampoline, its S+ gate, the sole-handler guard, the specialized-handler definition                                             | [`ExternalNavigationHandler.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/external_intents/android/java/src/org/chromium/components/external_intents/ExternalNavigationHandler.java), [`ExternalNavigationDelegateImpl.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/java/src/org/chromium/chrome/browser/externalnav/ExternalNavigationDelegateImpl.java), [`CustomTabDelegateFactory.java`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/java/src/org/chromium/chrome/browser/customtabs/CustomTabDelegateFactory.java) |
| "On S+ Android doesn't verify WebApk Url Handlers"                                                                                  | Chromium commit [`aff7fc1bb02c`](https://chromium.googlesource.com/chromium/src/+/aff7fc1bb02c), 2022-06-22                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| "WebAPKs are no longer launched for Intents to the WebAPK's domain"                                                                 | Chromium commit [`eddc8be0259e`](https://chromium.googlesource.com/chromium/src/+/eddc8be0259e), 2021-08-23                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| A WebAPK is installed by "Add to Home screen" and is a single APK from the minting server                                           | [`chrome/android/webapk/README.md`](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/chrome/android/webapk/README.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 8. What this note does not settle, and what would settle it

**Needs an Android phone with the app installed.** In the style of the prior art's §387: these are
five checks, they need one handset and one session, and the first two decide everything else.

1. **What the scanner actually does.** Enable Chrome's external-intent logging
   (`chrome://flags`, or `adb logcat -s UrlHandler` — `ExternalNavigationHandler`'s `debug()`
   logging is what prints "Matches possibly non-default WebApk", "Launched WebAPK" and
   "Already in WebAPK"), then scan the meal QR with the stock camera and again with Google Lens.
   Record: does Chrome log the navigation at all (if not, it was a WebView), does the URL bar
   carry a Custom Tab's chrome, and does any WebAPK line appear. **This is the only way to close
   §3.2**, which no amount of reading can.
2. **Whether §4.6 is the cause.** Open `chrome://webapks` and record how many WebAPKs list a
   `Scope:` covering `/food/`. If the answer is two (Inventoria at `/` and Rations at `/food/`),
   uninstall Inventoria, rescan the same QR, and see whether Rations now opens. A change of
   behaviour confirms `packages.size() != 1`; no change refutes it and points back at probe 1.
   **This is the highest-value single check in the note** and it is five minutes.
3. **Whether the user-side association works for a WebAPK.** Settings → Apps → Rations → **Open by
   default**. Record whether "Open supported links" is offered at all for a
   `org.chromium.webapk.…` package, whether `inventoria.palebluebytes.space` appears under "Links
   to open in this app", and whether enabling it changes probe 1's outcome. If it does, §5.3 is a
   real, documentable instruction to a user; if it does not, the Android door is fully shut and
   the record should say so.
4. **Android version.** Record `Build.VERSION.SDK_INT` on both handsets. Everything in §4.4 and
   §4.5 is keyed to S (Android 12); a pre-S device is a different regime and would explain a
   discrepancy between two people's experience of the same link.
5. **The nested-scope tie itself.** With both installed, tap a plain `https://…/food/` link from a
   messaging app (not a QR) and record which app opens. This separates "the scanner is the
   problem" from "two Facets are the problem" without involving the camera at all.

**Needs sign-in to `issues.chromium.org` and was not obtainable.** The current status of crbug
1232514 (`issues.chromium.org/40191153`), and therefore whether Android ever shipped the
"allowing WebAPKs to pass App Link verification" fix the 2021 commit hoped for. §4.4 records what
the code says instead. If someone with an account reads it and it is fixed, **§4.4's conclusion
changes and this note needs a correction at the bottom**, not an edit in place.

**Unverified and deliberately not chased.** What Android's verifier requires of
`sha256_cert_fingerprints` when an APK carries two signatures (§4.3) — moot while §4.4 holds, and
it would become live only if crbug 1232514 turns out fixed. Also: whether the package name minted
for a given `start_url` is the same on every device (§4.2), which is unanswerable without two
handsets and is moot for the same reason.

**Out of scope and not answered.** Whether the app should detect that it is running in a tab
rather than an installed Facet, and say something. That is a design call for whoever picks this
up, and this note deliberately offers no opinion beyond §5.2's finding that nothing is lost.
