# What can wake a web app while nobody is looking at it, on all five platforms

Measured 2026-09-04 for [#259](https://github.com/palebluebytes/inventoria/issues/259), against
Chromium source, Chrome Platform Status, MDN browser-compat-data, WebKit Bugzilla and the
Mozilla and WebKit standards-positions repositories. Blog posts and Stack Overflow were not
used.

[`257-ios-pwa-background-capabilities.md`](257-ios-pwa-background-capabilities.md) answered
this for iOS and sketched an Android comparison. This note answers it for **Windows, macOS,
Linux, Android and iOS**, which is the device set [#248](https://github.com/palebluebytes/inventoria/issues/248)
was told to design for, and it **corrects that note's Android section in one load-bearing
place** (§4).

## The answer in two sentences

**Every silent wake the web platform offers is a poll, and the only remotely-triggerable one
forces a visible notification.** Reachability and silence are mutually exclusive on the web,
on every engine, today.

## 1. Periodic Background Sync: shipped widely, wakes the browser almost nowhere

Shipped in Chrome 80 with no flag and no origin trial since (the trial ran 77–80),
[chromestatus 5689383275462656](https://chromestatus.com/feature/5689383275462656). Edge
mirrors it from 80, Samsung Internet 13+, Opera 67+.

**Shipping the API is not the same as being able to wake a shut device**, and Chrome's own
documentation does not distinguish the two. [The Chrome capabilities
page](https://developer.chrome.com/docs/capabilities/periodic-background-sync) contains **no
statement** about whether the browser must be running, no desktop-versus-Android section, and
no minimum interval. The distinction is only visible in source.

| Platform                         | API shipped | Fires while the browser is **shut**                |
| -------------------------------- | ----------- | -------------------------------------------------- |
| **Chrome / Edge, Android**       | yes         | **yes** — a real OS wakeup                         |
| **Chrome / Edge, Windows**       | yes         | **no** — unless the user leaves background mode on |
| **Chrome / Edge, Linux**         | yes         | **no** — same caveat                               |
| **Chrome / Edge, macOS**         | yes         | **no**, and no background mode exists to rescue it |
| **Firefox**, desktop and Android | **no**      | —                                                  |
| **Safari**, macOS and iOS        | **no**      | —                                                  |
| Android WebView                  | no          | —                                                  |

- **The Android wakeup is genuine and is the only one.**
  `BackgroundSyncDelegateImpl::ScheduleBrowserWakeUpWithDelay` hands off to
  `BackgroundSyncLauncherAndroid`, which uses Android's `BackgroundTaskScheduler`, and the
  whole path is compiled `#if BUILDFLAG(IS_ANDROID)`
  ([`background_sync_delegate_impl.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/background_sync/background_sync_delegate_impl.cc),
  [`background_sync_scheduler.cc`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/background_sync/background_sync_scheduler.cc)).
- **Desktop schedules with a `base::OneShotTimer` inside the live browser process.** What
  desktop gets instead of a wakeup is a `KeepAlive` (`CreateBackgroundSyncEventKeepAlive`,
  `#if !BUILDFLAG(IS_ANDROID)`) that merely stops Chrome shutting down _while an event is
  already in flight_. Registrations do persist: `InitDidGetDataFromBackend` calls
  `FireReadyEvents(PERIODIC, reschedule=true, …)`
  ([`background_sync_manager.cc`](https://chromium.googlesource.com/chromium/src/+/main/content/browser/background_sync/background_sync_manager.cc)),
  so a due event fires shortly after Chrome is **next launched** — which is not earlier than
  the user opening things anyway.
- **Windows and Linux have a partial rescue and macOS does not.** Chrome's
  `BackgroundModeEnabled` policy keeps a process alive after the last window closes, and its
  `supported_on` list is `chrome.win:19-, chrome.linux:19-`
  ([policy definition](https://raw.githubusercontent.com/chromium/chromium/main/components/policy/resources/templates/policy_definitions/Miscellaneous/BackgroundModeEnabled.yaml)).
  macOS is absent from that list.
- **Installation is required**, checked by `IsPwaInstalled` in
  [`periodic_background_sync_permission_context.cc`](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/background_sync/periodic_background_sync_permission_context.cc);
  otherwise the permission is `CONTENT_SETTING_BLOCK`. On Android an installed TWA
  short-circuits to `ALLOW` before the PWA check is reached.
- **Only on a known network.** Both Chrome's and
  [Edge's](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/background-syncs)
  documentation state that syncs occur only on a network the device has previously connected
  to.

**Firefox has refused it twice on the record** — Mozilla standards-positions
[#214](https://github.com/mozilla/standards-positions/issues/214) (Periodic Background Sync)
and [#173](https://github.com/mozilla/standards-positions/issues/173) (Web Background
Synchronization), both closed **negative**. **WebKit has refused it once and not answered
once**: [bug 204117](https://bugs.webkit.org/show_bug.cgi?id=204117) is **RESOLVED WONTFIX**
(2019-12-10), while the standards-position on Web Background Synchronization
([WebKit/standards-positions#14](https://github.com/WebKit/standards-positions/issues/14)) is
still open with `position: null`.

## 2. The engagement gate: not "unreliable", but _suspended by name_

The documented sentence — _"a `periodicsync` event won't be fired at all unless the engagement
score is greater than zero"_ — understates it. In source, a zero score does not lengthen the
interval; it disables the origin.

```cpp
int site_engagement_factor = delegate_->GetSiteEngagementPenalty(...);
if (!site_engagement_factor)
  return base::TimeDelta::Max();
int64_t effective_gap_ms = site_engagement_factor *
    parameters->min_periodic_sync_events_interval.InMilliseconds();
```

[`background_sync_controller_impl.cc`](https://raw.githubusercontent.com/chromium/chromium/main/components/background_sync/background_sync_controller_impl.cc).
The penalties are `None = 0, HighOrMax = 1, LowOrMedium = 2, Minimal = 3`
([`background_sync_delegate_impl.h`](https://raw.githubusercontent.com/chromium/chromium/main/chrome/browser/background_sync/background_sync_delegate_impl.h)),
and `min_periodic_sync_events_interval` defaults to **12 hours**
([`background_sync_parameters.cc`](https://chromium.googlesource.com/chromium/src/+/main/content/public/browser/background_sync_parameters.cc)).
A zero-scoring origin is additionally added to `suspended_periodic_sync_origins_`.

| Site Engagement Score | Level        | Effective floor |
| --------------------- | ------------ | --------------- |
| ≥ 50                  | HIGH / MAX   | 12 h            |
| ≥ 1                   | LOW / MEDIUM | 24 h            |
| > 0                   | MINIMAL      | 36 h            |
| **0**                 | **NONE**     | **never**       |

A caller's `minInterval` is a lower bound snapped **up** to this gap; it can never shorten it.

**How a score is earned and lost**
([`site_engagement_score.cc`](https://raw.githubusercontent.com/chromium/chromium/main/components/site_engagement/content/site_engagement_score.cc),
[`site_engagement_service.cc`](https://raw.githubusercontent.com/chromium/chromium/main/components/site_engagement/content/site_engagement_service.cc)):

- Navigation 1.5, user input 0.6, first daily engagement 1.5, visible media 0.06, notification
  interaction 1 — capped at **15 per day**, 100 overall.
- **Decay** is `raw_score × pow(0.984, hours_since_engagement / 2)` — about **17.6 % a day,
  74 % a week**.
- **An installed app carries a +5 floor, but only for 10 days.** `BonusIfShortcutLaunched()`
  returns the installed bonus only while `days_since_shortcut_launch <= 10`.
- **Deletion.** `CleanupEngagementScores` removes any origin scoring ≤ 0.5 from content
  settings. A removed origin reads back as 0, which is `NONE`, which is never.
- **One mercy.** That cleanup rebases last-engagement timestamps to `now − 8 h`, so stretches
  where **Chrome itself is not running** do not count as decay. Time when Chrome is in use and
  your app is not visited does count.

**Derived, not documented — flagged as such.** The constants above are measured; the following
arithmetic is this note's own and should be read as an estimate. An app launched once and not
returned to holds ≥ 5 (24 h cadence) for 10 days on the shortcut bonus; on day 11 only the
decayed base remains, `15 × 0.984^(12d)`, which crosses the 0.5 deletion threshold at roughly
**day 18 of Chrome-active time**, after a window of 36 h cadence. **A monthly-opened installed
app is therefore suspended rather than slowed.**

## 3. Everything else, and why none of it is reachable

| Mechanism                | Remotely triggerable                                | Visible notification                                                                                                                                                    | Wakes a shut browser                                                                          |
| ------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Web Push**             | **yes**                                             | **mandatory** — Chrome and Edge reject `subscribe()` without `userVisibleOnly: true`; WebKit revokes a silent handler's subscription                                    | yes                                                                                           |
| Periodic Background Sync | no — a poll on the browser's schedule               | no                                                                                                                                                                      | Android only                                                                                  |
| One-shot Background Sync | no — must be registered by a running page or worker | no                                                                                                                                                                      | Android only; desktop re-fires at next launch                                                 |
| Background Fetch         | no — app-initiated                                  | **yes** — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/BackgroundFetchManager): the browser "performs the fetches in a user-visible way, displaying progress" | n/a                                                                                           |
| Notification Triggers    | no — locally scheduled                              | yes, it _is_ a notification                                                                                                                                             | [development has ended](https://developer.chrome.com/docs/web-platform/notification-triggers) |

One-shot Background Sync is unsupported in Firefox and Safari
([BCD `SyncManager`](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/SyncManager.json)),
retries at most 3 times, and — like the periodic form — has no OS wakeup off Android.

**The pattern is the finding.** The one mechanism a peer can trigger is the one that cannot be
silent. Every silent mechanism is a poll the device schedules for itself, which is why none of
them makes a device _reachable_ and why refusing push is a different act from refusing them.

## 4. Correction to `257-ios-pwa-background-capabilities.md`

That note's Android addendum says Periodic Background Sync _"genuinely works, and this is the
real difference"_ and that _"the mailbox drains itself"_, with the limits given as engagement
gating and a frequency Chrome chooses. Both sentences are true on Android and **do not
generalise the way the note's summary table implies**:

- The table's _"Android (installed)"_ column describes the only platform with an OS wakeup.
  **Chrome on Windows, macOS and Linux ships the same API and cannot wake a shut browser**, so
  a note read as "Chromium has this and WebKit does not" reads the split in the wrong place.
- _"Engagement gating"_ is stated as a frequency limit. At score 0 it is not a frequency, it is
  an off switch, and §2's arithmetic puts the rarely-used device on the wrong side of it.

The note's decisive wall is unaffected and remains correct: a Service Worker cannot spawn a
dedicated worker (`Worker` is undefined in `ServiceWorkerGlobalScope` in every engine), so no
worker on any platform can reach the OPFS sync access handle the ledger needs.

## 5. What this means for the device set #248 was given

For **Windows, macOS, Linux, Android and iOS**, with the app installed:

- **No silent mechanism reaches a shut device anywhere except Android**, and on Android it
  suspends itself on the rarely-used device.
- **No mechanism of any kind exists in Firefox or Safari.**
- **The one universal mechanism is Web Push**, which is remotely triggerable precisely because
  it is a persistent address, and which is unsilenceable on every engine that ships it.

So a design that converges only when the app is opened is not settling for less than the
platform offers. On four of five platforms it _is_ what the platform offers.
