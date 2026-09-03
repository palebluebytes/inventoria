# Research: how the logging frameworks model a record and a verbosity dial (#264)

**Parent map:** [#212](https://github.com/palebluebytes/inventoria/issues/212) — the Log
facility redrawn around verbosity levels. Informs
[#262](https://github.com/palebluebytes/inventoria/issues/262) (what a channel declares)
and [#263](https://github.com/palebluebytes/inventoria/issues/263) (the three dial
positions applied); blocks neither.
**Grounds:** `src/lib/logs/log-facility.ts`, ADR-0053, ADR-0054, ADR-0071. The map's
locked decisions 3, 5, 6 and 9 name shapes — a level on every record, OTel
`SeverityNumber` stored, a level on a field, and shedding lowest-level-first — that this
note prices against what the frameworks actually do.
**Date:** 2026-08-31. Every source below was read that day; where a repository moves,
the branch and commit are named in §7. **Status:** research only. **No recommendation
is made for this codebase** — the decisions belong to #262 and #263.

**Out of scope by the map's locked decision 7:** redaction, scrubbing, PII detection and
field-level data classification. `os_log`'s `%{private}` annotations and Glean's data
categories were not read. Sentry's `beforeSend` is read below only as an _egress
ordering_ fact, never as a scrubber.

---

## TL;DR

| Question                      | The short answer                                                                                                                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Record shape**              | A small set of framework-reserved named fields plus **one open bag** the caller owns. pino has no bag and pays in collision rules; Glean has no bag and pays in a build-time declaration.                |
| **Record vs stream**          | OTLP nests three tiers on the wire — **resource → scope → record** — and Go's `slog` draws the same line as two API calls. Sentry flattens its resource onto every record instead.                       |
| **The dial**                  | Per-logger, resolved from the logger's **name** — where there is one at all: Sentry has no severity threshold, and `os_log` has **two** (capture and persist) at four scopes.                            |
| **Retention by level**        | **Nobody sheds lowest-level-first from a full buffer.** `os_log` lets level decide entry to the store and age decide exit. The one system that beats age — Android `logd` — sheds the noisiest _source_. |
| **Structured vs formatted**   | Split. OTel .NET and Rust `log` keep a **template plus arguments** and render late; Sentry keeps template, arguments _and_ the rendered body; pino renders at the call site and keeps neither.           |
| **Pre-registering the bar**   | **No framework has this.** Negative result; the name comes from research methodology, not software.                                                                                                      |
| **Structural absence of ids** | **No framework has a name for it.** The nearest analogues are all switches over collection, not properties of the record's shape.                                                                        |

---

## 1. How a record is structured

### 1.1 OpenTelemetry — what the spec says

The [log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/) defines
a `LogRecord` with twelve top-level fields: `Timestamp`, `ObservedTimestamp`, `TraceId`,
`SpanId`, `TraceFlags`, `SeverityText`, `SeverityNumber`, `Body`, `Resource`,
`InstrumentationScope`, `Attributes`, `EventName`.

The load-bearing split is between `Attributes` and `Resource`, and the spec states it
directly:

> "Additional information about the specific event occurrence. Unlike the Resource
> field, which is fixed for a particular source, Attributes can vary for each
> occurrence."
> — [log data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)

`Body` is explicitly allowed to be structured, not only a string:

> "A value containing the body of the log record... can be a human-readable string
> message... or it can be a structured data composed of arrays and maps."

### 1.2 OpenTelemetry — what the wire format actually carries

The spec's ideal and the implementation agree here, and the proto is the clearer
statement of the three-tier nesting. From
[`opentelemetry/proto/logs/v1/logs.proto`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-proto/main/opentelemetry/proto/logs/v1/logs.proto)
(read 2026-08-31):

```
LogsData → ResourceLogs { resource, scope_logs[] }
                        → ScopeLogs { scope, log_records[] }
                                    → LogRecord { ... }
```

`Resource` is stored **once per batch**, `InstrumentationScope` **once per group of
records**, and only the leaf `LogRecord` is per-occurrence. The record's own fields are
numbered `time_unix_nano`(1), `severity_number`(2), `severity_text`(3), `body`(5),
`attributes`(6), `dropped_attributes_count`(7), `flags`(8), `trace_id`(9), `span_id`(10),
`observed_time_unix_nano`(11), `event_name`(12) — field 4 is `reserved`.

Two constraints worth noting:

- `attributes` is a `repeated KeyValue`, and the proto warns: _"Attribute keys MUST be
  unique (it is not allowed to have more than one attribute with the same key). The
  behavior of software that receives duplicated keys can be unpredictable."_
- `event_name` is what turns a log record into an event: _"Presence of event_name on the
  log record identifies this record as an event... All events with the same event_name
  are expected to conform to the same schema for both their attributes and their body."_

### 1.3 OpenTelemetry — what the JS implementation actually stores

Read from `open-telemetry/opentelemetry-js` at `main`
(`f41805e769ba10fb6dae72a4b7a5a3dc67cca82e`, 2026-08-31); the packages
`@opentelemetry/api-logs` and `@opentelemetry/sdk-logs` both report version
`0.222.0-development.0`, i.e. **still pre-1.0**.

The API's record is a plain optional-everything interface —
[`experimental/packages/api-logs/src/types/LogRecord.ts`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/api-logs/src/types/LogRecord.ts):

```ts
export type LogBody = AnyValue;
export type LogAttributes = AnyValueMap;

export interface LogRecord {
  eventName?: string;
  timestamp?: TimeInput;
  observedTimestamp?: TimeInput;
  severityNumber?: SeverityNumber;
  severityText?: string;
  body?: LogBody;
  attributes?: LogAttributes;
  exception?: unknown; // @experimental
  context?: Context;
}
```

The same file carries the full `SeverityNumber` enum, `UNSPECIFIED = 0` through
`FATAL4 = 24`, matching the spec exactly.

The SDK's materialised record,
[`experimental/packages/sdk-logs/src/LogRecordImpl.ts`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/sdk-logs/src/LogRecordImpl.ts),
is where the record-versus-stream split becomes concrete:

- `readonly attributes: LogAttributes = {}` — the caller's bag, one flat object.
- `readonly resource: Resource` — assigned from `_sharedState.resource`, i.e. **the
  provider's**, not the record's.
- `readonly instrumentationScope` — **the logger's**.
- every other field is private with a getter/setter pair, and every setter is a no-op
  once `_makeReadonly()` has been called after emit.

Three implementation facts that the spec does not give you:

1. **The framework writes into the caller's bag under reserved names.** `_setException`
   maps an error onto `exception.type`, `exception.message` and `exception.stacktrace`
   (imported as `ATTR_EXCEPTION_*` from `@opentelemetry/semantic-conventions`) — but only
   `if (!Object.hasOwn(this.attributes, ...))`, so a caller who set the key first wins.
2. **Attribute values are validated and coerced, and rich objects are rejected.**
   [`sdk-logs/src/utils/validation.ts`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/sdk-logs/src/utils/validation.ts)
   accepts string/number/boolean, `Uint8Array`, arrays and _plain_ objects only — the
   check is `obj.constructor !== Object && obj.constructor !== undefined` → reject. A
   `Date`, a `RegExp` or an `Error` instance is dropped with a `diag.warn`, and circular
   references are rejected via a `WeakSet`.
3. **The bag is bounded.** `LoggerProvider` defaults `attributeCountLimit` to **128** and
   `attributeValueLengthLimit` to **`Infinity`**
   ([`LoggerProvider.ts:36-40`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/sdk-logs/src/LoggerProvider.ts));
   overflow increments `droppedAttributesCount` and warns exactly once per record
   (`// Only warn once per LogRecord to avoid log spam`). Truncation recurses into
   arrays and nested objects.

### 1.4 pino — the flat record, and what flatness costs

pino is the one framework read here with **no bag at all**: the caller's object is merged
into the top level of the line. Read at **v10.3.1** (the version resolved on 2026-08-31;
`lib/levels.js`, `lib/proto.js`, `lib/tools.js` and `lib/constants.js` were compared
byte-for-byte against the published package and are identical).

The log method's signature is
`([mergingObject], [message], [...interpolationValues])`, and
[`docs/api.md`](https://raw.githubusercontent.com/pinojs/pino/v10.3.1/docs/api.md) says
of the first parameter:

> "An object can optionally be supplied as the first parameter. Each enumerable key and
> value of the `mergingObject` is copied into the JSON log line."

```js
logger.info({ MIX: { IN: true } });
// {"level":30,"time":1531254555820,"pid":55956,"hostname":"x","MIX":{"IN":true}}
```

The framework's own keys sit in the same namespace: `level`, `time`, `pid`, `hostname`,
`msg`. `pid` and `hostname` come from the `base` option, documented as _"Key-value object
added as child logger to each log line"_ with default
`{pid: process.pid, hostname: os.hostname()}` — pino's equivalent of a Resource, except
that it is stamped onto **every line** rather than hoisted once.

**Flatness has a documented cost, and pino ships the escape hatch by name.** The
`nestedKey` option exists for exactly the collision this creates:

> "If there's a chance that objects being logged have properties that conflict with those
> from pino itself (`level`, `timestamp`, `pid`, etc) and duplicate keys in your log
> records are undesirable, pino can be configured with a `nestedKey` option that causes
> any `object`s that are logged to be placed under a key whose name is the value of
> `nestedKey`."

with a worked example whose comment reads `// has pino-conflicting properties!`. There is
one more precedence rule in the same direction: _"The `message` parameter takes precedence
over the `mergingObject`. That is, if a `mergingObject` contains a `msg` property, and a
`message` parameter is supplied in addition, the `msg` property in the output log will be
the value of the `message` parameter."_ So pino's reserved keys are reserved by _collision
rule_, not by structure — the caller can write `level` and get either a duplicate key or a
silent loss depending on which key it was.

`messageKey` (default `'msg'`) and `errorKey` (default `'err'`) let a deployment move
pino's own names out of the way, which is the same problem admitted from the other end.

### 1.5 Sentry — two record shapes, and a resource that is not hoisted

Read from `getsentry/sentry-javascript` at `develop`
(`604f142d26e95c5b1e243c8f65dd57b315f6981c`, 2026-08-31). Every claim below was
re-verified by fetching the file a second time directly from that branch.

**A breadcrumb** is a small closed struct
([`packages/core/src/types-hoist/breadcrumb.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/types-hoist/breadcrumb.ts)) —
`type`, `level`, `event_id`, `category`, `message`, `data`, `timestamp`, every one
optional. Exactly one of those, `data?: { [key: string]: any }`, is the caller's bag; the
rest are the framework's. `level` is a `SeverityLevel`, and the whole vocabulary is six
strings, with no numbers anywhere
([`packages/core/src/types-hoist/severity.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/types-hoist/severity.ts)):

```ts
export type SeverityLevel =
  | "fatal"
  | "error"
  | "warning"
  | "log"
  | "info"
  | "debug";
```

**A log** — the newer `Sentry.logger` API — is a different shape, and this one is
recognisably OTel's
([`packages/core/src/types-hoist/log.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/types-hoist/log.ts)):

```ts
export interface SerializedLog {
  timestamp: number;
  level: LogSeverityLevel; // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  body: Log["message"];
  trace_id?: string;
  attributes?: Attributes;
  severity_number?: Log["severityNumber"];
}
```

and the severity numbers are **OpenTelemetry's own**, taken at the bottom of each band
([`packages/core/src/logs/constants.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/logs/constants.ts)):

```ts
export const SEVERITY_TEXT_TO_SEVERITY_NUMBER: Partial<
  Record<LogSeverityLevel, number>
> = {
  trace: 1,
  debug: 5,
  info: 9,
  warn: 13,
  error: 17,
  fatal: 21,
};
```

Note that the two vocabularies do not agree with each other. A breadcrumb's level can be
`warning` or `log`; a log's cannot. A log's can be `trace` or `warn`; a breadcrumb's
cannot. Two record kinds in one SDK, two level scales. _(Flagged: the `Log` interface's
own doc comment lists `critical` among the "allowed values" and the `LogSeverityLevel`
union does not contain it. I read that as a stale comment rather than a seventh level,
but I did not confirm it against a changelog.)_

**The resource-equivalent is flattened onto every record, not hoisted.** This is the
sharpest divergence from OTLP's three tiers (§1.2). `_INTERNAL_captureLog`
([`packages/core/src/logs/internal.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/logs/internal.ts))
writes all of these into the _record's own_ attribute bag, once per record: `user.id`,
`user.email`, `user.name`, `sentry.release`, `sentry.environment`, `sentry.sdk.name`,
`sentry.sdk.version`, `sentry.replay_id`, `sentry.trace.parent_span_id`, plus a sequence
attribute.

So Sentry reserves a namespace inside the caller's bag — `sentry.*`, and `user.*` — the
way OTel reserves `otel.*` (§1.9), but it _populates_ that namespace on every record
rather than storing it once per stream. The `setLogAttribute` helper's `setEvenIfPresent`
parameter decides who wins a collision: it is `false` for the three `user.*` keys and
`true` for everything else, so a caller's own `sentry.release` attribute is overwritten
and their `user.id` is not.

On the declaration question, Sentry's docs take the opposite position from Glean's:

> "Sentry Logs are **high-cardinality** — you can pass any attributes you want and search
> or filter by them later. No need to decide upfront which fields are important."
> — [Set Up Logs](https://docs.sentry.io/platforms/javascript/logs/)

### 1.6 Apple's unified logging — a level that is a tag, not an ordinal

One fact here matters more than the rest, and it cuts against an assumption that is easy
to carry in from OTel. **`os_log_type_t`'s numeric values are not a severity ordering.**
From `libkern/os/log.h` in Apple's published XNU source
([`apple-oss-distributions/xnu`, `libkern/os/log.h:124-129`](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/libkern/os/log.h)):

```c
OS_ENUM(os_log_type, uint8_t,
    OS_LOG_TYPE_DEFAULT = 0x00,
    OS_LOG_TYPE_INFO    = 0x01,
    OS_LOG_TYPE_DEBUG   = 0x02,
    OS_LOG_TYPE_ERROR   = 0x10,
    OS_LOG_TYPE_FAULT   = 0x11);
```

`default` is `0`, below both `info` and `debug`, and there is a gap from `0x02` to `0x10`.
You cannot write `type >= threshold` over these values and get Apple's own ordering — the
documentation's table is _"in increasing order of severity"_ `debug`, `info`, `default`,
`error`, `fault`, which is not the numeric order. The numbers are a tag; the ordering
lives in the tooling and in the `level:`/`persist:` hierarchies (§2.5). Apple's docs
gloss the levels as: `debug` _"Captures verbose information during development that is
useful only for debugging your code"_, `info` _"Captures information that is helpful, but
not essential, to troubleshoot problems"_, `default` _"Captures information that is
essential for troubleshooting problems. For example, capture information that might
result in a failure"_
([Generating Log Messages from Your Code](https://developer.apple.com/documentation/os/generating-log-messages-from-your-code)).

The record itself is `subsystem` + `category` + `type` + a **constant format string** +
its arguments — see §4.4 for why the format string is constant. The header also states a
hard bound on the record's dynamic part, which is the only per-record size limit I found
stated in a primary source anywhere in this note:

> "There is a physical cap of 256 bytes per entry for dynamic content, i.e., `%s` and
> `%@`, that can be written to the persistence store. As such, all content exceeding the
> limit will be truncated before written to disk. Live streams will continue to show the
> full content."
> — [`libkern/os/log.h`](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/libkern/os/log.h)

Note what that implies: the persisted record and the streamed record are **not the same
record**. Truncation happens on the way to the store, not at the call site.

### 1.7 Mozilla Glean — no record at all, and no bag

Glean is in this note as the schema-first comparator, and the first thing to say is that
it does not have a log record. It has **declared metrics**, and a ping payload keyed by
metric type and metric name. Read from
[`mozilla/glean_parser`](https://raw.githubusercontent.com/mozilla/glean_parser/main/glean_parser/schemas/metrics.2-0-0.schema.yaml)
and the [ping transport schema](https://mozilla.github.io/glean/book/user/pings/index.html),
2026-08-31.

**Nothing is recordable until it is declared.** The metrics schema's own `required:` list
is six keys:

```yaml
required:
  - type
  - bugs
  - description
  - notification_emails
  - data_reviews
  - expires
```

and the enforcement is a build step, not a lint. `glean_parser` _"Contains various
utilities for handling `metrics.yaml` and `pings.yaml`... This includes producing
generated code for various integrations and linting"_
([glean_parser README](https://raw.githubusercontent.com/mozilla/glean_parser/main/README.md)).
A metric absent from `metrics.yaml` has no generated API, so it is not merely
discouraged — it is not expressible.

**A declaration can expire, and expiry is a build-time fact**
([Adding new metrics](https://raw.githubusercontent.com/mozilla/glean/main/docs/user/user/metrics/adding-new-metrics.md)):

> "When the metric passes its expiration date (determined at build time), it will
> automatically stop collecting data."

`expires` takes an ISO date, a major version integer, `never`, or `expired`; the schema
notes the date _"is checked at build time"_ and that _"mixing expiration by date and
version is not allowed within a product"_. Fourteen days out, mail goes to the
`notification_emails` on the declaration. This is the only mechanism found anywhere in
this note by which a collection **stops on its own**.

**The record-versus-stream split is three-way and explicit.** A ping's top-level
properties are `client_info`, `ping_info`, `metrics` and `events`, with `ping_info` and
`client_info` both required. `client_info` carries the per-installation facts —
`client_id`, `app_build`, `app_channel`, `os`, `os_version`, `architecture`, `locale`,
`device_model`, `first_run_date` among others — which is Glean's Resource. `ping_info`
carries the per-transmission facts — `seq`, `start_time`, `end_time`, `reason`,
`ping_type`, `experiments` — which has no OTel counterpart at all.

**And there is no bag.** `metrics` is keyed first by type and then by the declared metric
name: `metrics.counter` is `{ "<category.name>": integer }`, with the key constrained to
`^[a-z_][a-z0-9_\.]+$` and at most 111 characters. Twenty-five metric types exist
(`boolean`, `counter`, `quantity`, `string`, `string_list`, `timespan`,
`timing_distribution`, `uuid`, `url`, `text`, `object`, and the `labeled_*` family). There
is nowhere to put an undeclared key.

Events are the one place extra data rides along, and even there the keys are declared in
advance. `extra_keys` is _"The acceptable keys on the 'extra' object sent with events"_,
each requiring a `description`, and _"A maximum of 50 extra keys is allowed."_ On the wire
an event is `{ category, name, timestamp, extra }` where `extra` is string-to-**string**
with a 40-character key limit.

**There is no level, and nothing plays the part of one.** Grepping the metrics and pings
schemas for `severity`, `verbosity` and `level` returns nothing. What decides how much is
collected is a different pair of axes: `lifetime` (`ping`, `user`, `application`; default
`ping`) governs when a value is cleared, and `send_in_pings` governs which transmissions
carry it. Volume is managed by **what you declared and how often you send**, never by a
threshold on the record.

### 1.8 Go `log/slog` — the cleanest statement of record versus stream

Worth one short subsection because it draws the line the ticket asks about more sharply
than anything else read. A `Record` is four named fields plus a sequence of attributes
([`src/log/slog/record.go`](https://cs.opensource.google/go/go/+/master:src/log/slog/record.go)):

```go
type Record struct {
	Time    time.Time
	Message string
	Level   Level
	PC      uintptr
	// ... an inline array of Attrs, then a slice
}
```

The per-record attributes arrive as arguments. The **per-logger** attributes arrive
through a different door entirely — `Logger.With` _"returns a Logger that includes the
given attributes in each output operation"_, implemented as `handler.WithAttrs(...)` on a
cloned logger
([`src/log/slog/logger.go`](https://cs.opensource.google/go/go/+/master:src/log/slog/logger.go)).
So "this is true of every record from this logger" and "this is true of this record" are
different API calls with different lifetimes, and the handler is free to pre-render the
former once. That is OTLP's resource/scope/record hoisting (§1.2) expressed as a method
rather than as a wire format.

Note also that `Message` is a plain `string` and slog offers no format verbs — the
structure is in the attributes, not in the message, which is the same position pino takes
(§4.2) from the opposite direction.

### 1.9 What is reserved and what is the caller's

OpenTelemetry reserves the _record's named fields_ absolutely, and then reserves
_namespaces inside the caller's bag_ by convention. From
[semantic conventions — attribute naming](https://opentelemetry.io/docs/specs/semconv/general/naming/):

> "Attribute names that start with `otel.` are reserved to be defined by OpenTelemetry
> specification... Any additions to the `otel.*` namespace MUST be approved as part of
> OpenTelemetry specification."

and for anyone else:

> "To avoid clashes with names introduced by other companies... it is recommended to
> prefix the new name by your company's reverse domain name" ... "It is not recommended
> to use existing OpenTelemetry semantic convention namespace as a prefix for a new
> company- or application-specific attribute name. Doing so may result in a name clash
> in the future."

So the reservation is two-layer: a closed set of framework fields, and a soft,
convention-enforced namespace discipline inside the open bag.

---

## 2. How a verbosity dial works in practice

### 2.1 OpenTelemetry: per-logger, resolved from the logger's name

The spec's [logs SDK](https://opentelemetry.io/docs/specs/otel/logs/sdk/) defines a
`LoggerConfig` of exactly three knobs — `enabled`, `minimum_severity`, `trace_based` —
and states the rule:

> "If a log record's SeverityNumber is specified (i.e. not `0`) and is less than the
> configured `minimum_severity`, the log record MUST be dropped by the `Logger`."

with the escape hatch that _"Log records with an unspecified severity (i.e. `0`) are not
affected by this parameter."_ A `LoggerConfigurator` _"is a function which computes the
LoggerConfig for a Logger"_ from the logger's instrumentation scope.

The JS implementation matches, and is more informative about the mechanism.
[`sdk-logs/src/config/LoggerConfigurators.ts`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/sdk-logs/src/config/LoggerConfigurators.ts)
is a **pattern list, first match wins**, with `*` compiled to a regex:

```ts
const configurator = createLoggerConfigurator([
  {
    pattern: "debug-logger",
    config: { minimumSeverity: SeverityNumber.DEBUG },
  },
  { pattern: "prod-*", config: { minimumSeverity: SeverityNumber.WARN } },
  { pattern: "*", config: { minimumSeverity: SeverityNumber.INFO } },
]);
```

**This is not hierarchical inheritance.** There is no parent/child relation between
`a.b` and `a.b.c`; a logger matches the first pattern in the array or falls to
`DEFAULT_LOGGER_CONFIG` (`{ disabled: false, minimumSeverity: UNSPECIFIED, traceBased:
false }`). The whole feature is marked `@experimental` in every doc comment.

### 2.2 Where the dial is read, and what it costs

OTel JS resolves the config **once, at logger construction**, and says why in a comment
worth quoting ([`sdk-logs/src/Logger.ts`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/sdk-logs/src/Logger.ts)):

```ts
// Cache the logger configuration at construction time
// Since we don't support re-configuration, this avoids map lookups
// and string allocations on each emit() call
this._loggerConfig = this._sharedState.getLoggerConfig(
  this._instrumentationScope
);
```

and `emit()` checks `this.enabled(logRecord)` **before** allocating a `LogRecordImpl`.
Note the limit: by the time `emit()` is reached the caller has already built the
argument object, so the saving is the record's allocation and the processor chain, not
the caller's own work. That is exactly why the API exposes a separate predicate —
[`api-logs/src/types/Logger.ts`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/api-logs/src/types/Logger.ts):

```ts
/**
 * Will a log record with the given details get emitted?
 * This can be used to avoid expensive calculation of log record data.
 */
enabled(options?: { context?: Context; severityNumber?: SeverityNumber; eventName?: string }): boolean;
```

The [logs API spec](https://opentelemetry.io/docs/specs/otel/logs/api/) is blunter about
what it is for: _"To help users avoid performing computationally expensive operations
when generating a LogRecord, a Logger SHOULD provide this Enabled API"_ — _"a
performance optimization that is only relevant when constructing the LogRecord is
expensive."_ The same page is where OTel says who its logs API is for at all: _"The Logs
API is provided for logging library authors to build log appenders."_

The cheapest end of the spectrum is Rust's `log` crate, where the guard **encloses
argument evaluation** and one half of it is a compile-time constant
([`src/macros.rs`](https://raw.githubusercontent.com/rust-lang/log/master/src/macros.rs),
macro `__log!`):

```rust
let lvl = $lvl;
if lvl <= $crate::STATIC_MAX_LEVEL && lvl <= $crate::max_level() {
    $crate::__private_api::log($logger, $crate::__private_api::format_args!($($arg)+), lvl, ...);
}
```

`format_args!` sits inside the branch, so nothing is formatted — or even evaluated — when
the level is off, and the crate docs promise more than that
([`src/lib.rs`, "Compile time filters"](https://raw.githubusercontent.com/rust-lang/log/master/src/lib.rs)):

> "Log invocations at disabled levels will be skipped and will not even be present in the
> resulting binary. These features control the value of the `STATIC_MAX_LEVEL` constant."

`STATIC_MAX_LEVEL` (`src/lib.rs:1646`) is a `const` resolved from Cargo features, with a
separate `release_max_level_*` family so a release build can be quieter than a debug one.

### 2.3 pino — the dial is read when it is _set_, not when the call is made

pino is the sharpest answer to the ticket's "what does it cost at a hot call site"
question, because the answer is **nothing**: a disabled level is not a branch, it is a
different function.

Levels are integers, ascending with severity
([`lib/constants.js`](https://raw.githubusercontent.com/pinojs/pino/v10.3.1/lib/constants.js)):

```js
const DEFAULT_LEVELS = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};
```

`silent` is not in that table; it is `Infinity`, installed as a non-enumerable property in
`mappings()` ([`lib/levels.js`](https://raw.githubusercontent.com/pinojs/pino/v10.3.1/lib/levels.js)),
so no level can ever compare greater. The default `level` option is `'info'`.

The mechanism is `setLevel`, which **rebinds every level method on the instance** every
time the dial moves (`lib/levels.js`):

```js
for (const key in values) {
  if (levelComparison(values[key], levelVal) === false) {
    this[key] = noop;
    continue;
  }
  this[key] = isStandardLevel(key, useOnlyCustomLevelsVal)
    ? levelMethods[key](hook)
    : genLog(values[key], hook);
}
```

`noop` is `function noop () {}` ([`lib/tools.js:37`](https://raw.githubusercontent.com/pinojs/pino/v10.3.1/lib/tools.js)).
So `logger.debug(expensive())` at a disabled level still evaluates `expensive()` — the
arguments are the caller's problem — but the call itself does no work, reads no
threshold, and allocates nothing. `setLevel` then emits a `'level-change'` event.

For the argument-evaluation problem pino exposes the same predicate OTel does:

```js
function isLevelEnabled(logLevel) {
  const { values } = this.levels;
  const logLevelVal = values[logLevel];
  return (
    logLevelVal !== undefined &&
    this[levelCompSym](logLevelVal, this[levelValSym])
  );
}
```

**The comparison direction is configurable**, which is unusual and worth recording: the
`levelComparison` option takes `'ASC'` (default), `'DESC'`, or a function, and
`compareLevel` is literally `direction === 'DESC' ? current <= expected : current >=
expected`. `customLevels` adds names with caller-chosen numbers, and
`useOnlyCustomLevels` drops the defaults entirely — with `assertNoLevelCollisions` and
`assertDefaultLevelFound` refusing a set whose default level is not in it.

**Child loggers inherit through the prototype chain, not through a hierarchy.**
`child(bindings, options)` is `Object.create(this)`
([`lib/proto.js`](https://raw.githubusercontent.com/pinojs/pino/v10.3.1/lib/proto.js)),
and the level is only re-bound on the child when it actually differs:

```js
if (
  (options.level !== undefined && options.level !== this.level) ||
  options.hasOwnProperty("customLevels")
) {
  const childLevel = options.level || this.level;
  instance[setLevelSym](childLevel);
}
```

Because `setLevel` writes **own** properties, a child that did not override keeps
resolving its `info`/`debug` methods through its parent — so moving the parent's dial
moves the child's too, while a child that set its own level is detached from then on.
There is **no namespace, no dotted name, and no wildcard matching**: a child is a
bindings-carrying clone, and `name` is just another field on the line. Whatever
inheritance exists is JavaScript's, not the logger's.

### 2.4 Sentry — there is no dial

Worth stating plainly because it is a real design position rather than an omission.
**Sentry's JS SDK has no severity threshold on either record kind.** Nothing in
`addBreadcrumb` compares a level
([`packages/core/src/breadcrumbs.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/breadcrumbs.ts)),
and nothing in the log path compares one
([`packages/core/src/logs/internal.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/logs/internal.ts));
`captureLog` in
[`packages/core/src/logs/exports.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/logs/exports.ts)
routes `trace`, `debug`, `info`, `warn`, `error` and `fatal` through the identical path.
Level is carried as data and used downstream for display and query, not as a gate.

The only capture-time filters are a **predicate hook** each — `beforeBreadcrumb`, which
_"is called with a breadcrumb object before the breadcrumb is added to the scope. When
nothing is returned from the function, the breadcrumb is dropped"_, and `beforeSendLog`,
whose `null` return records a dropped event with reason `before_send`. Both are arbitrary
functions, so a level threshold is something the caller writes, not something the
framework offers. `maxBreadcrumbs <= 0` is the one built-in off switch.

### 2.5 Apple's unified logging — two dials on one scale, at four scopes

The most instructive dial read for this note, because it is **two** dials rather than one.
`log config` takes a comma-separated list of modes, and two of them are severity
thresholds over the same level vocabulary:

> `level:<off|default|info|debug>` — "Default logging level. The level is a hierarchy, so
> debug implies debug, info, and default."
>
> `persist:<off|default|info|debug>` — "Persistence level. The persist mode is a
> hierarchy, so debug implies debug, info, and default."

`level:` governs **capture**; `persist:` governs **what reaches the on-disk store**. They
are set independently, so "capture debug but do not persist it" is expressible as a
configuration rather than as code.

Both are settable at four scopes — system-wide, `--subsystem`, `--category` (which
_"requires"_ a subsystem), and `--process` — and the man page tabulates which modes each
scope accepts: system-wide and `--process` take `level, persist, stream`, while
`--subsystem` and `--category` take `level, persist` plus the signpost and oversize
switches. So the namespace is a fixed two-level hierarchy (subsystem, then category), and
the dial can be set at either tier, or globally, or per running process.

_(Source note: this is the `log(1)` man page as shipped with macOS. The canonical form is
`man 1 log` on a Mac, which I could not run from this environment; the text above is
quoted from the
[published rendering of Apple's shipped man page](https://keith.github.io/xcode-man-pages/log.1.html),
which is a mirror rather than an Apple-hosted page. Treat the wording as verified and the
host as second-hand.)_

Apple's naming guidance for the two tiers is asymmetric, which is worth recording:
_"The subsystem string identifies a large functional area within your app or apps...
Use reverse-DNS notation"_, while _"The category string identifies a particular component
or module in a given subsystem... Use any convention you want for these strings."_
([Generating Log Messages from Your Code](https://developer.apple.com/documentation/os/generating-log-messages-from-your-code))

### 2.6 The dial at the sink, and more than one of them

Two counter-examples where the dial is _not_ one number at the call site.

**Winston** puts a `level` on each transport
([README](https://raw.githubusercontent.com/winstonjs/winston/master/README.md)):

> "`winston` allows you to define a `level` property on each transport which specifies
> the **maximum** level of messages that a transport should log."

and it is mutable at runtime (`transports.console.level = 'info'`). Note also that
winston's scale runs the other way from OTel's and pino's — its npm levels are
`error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6`, documented as
_"prioritized from 0 to 6 (highest to lowest)"_. **The direction of a severity scale is
not a universal.**

**systemd-journald** goes further and has _six_ independent thresholds on one scale, one
per destination — `MaxLevelStore=`, `MaxLevelSyslog=`, `MaxLevelKMsg=`,
`MaxLevelConsole=`, `MaxLevelWall=`, `MaxLevelSocket=`
([`man/journald.conf.xml`](https://raw.githubusercontent.com/systemd/systemd/main/man/journald.conf.xml)):

> "Controls the maximum log level of messages that are stored in the journal, forwarded
> to syslog, kmsg, the console, the wall, or a socket... Messages equal or below the log
> level specified are stored/forwarded, messages above are dropped. Defaults to `debug`
> for `MaxLevelStore=`... to ensure that the all messages are stored in the journal."

The default for the _store_ is the most permissive level available. The thing that
bounds the journal is size, not severity — see §3.

---

### 2.7 Three more dial designs, and why this note widened to them

The ticket's list did not include these. I read them because the four named sources left
the ticket's sharpest sub-question — _whether the dial is read at the call site or at the
sink, and what that costs when the call site is hot_ — answered only at the extremes
(pino rebinds, Rust compiles out), and because none of the four models a **namespace
hierarchy**, which the map's locked decision 4 keeps as an axis.

**Chromium `//base/logging` measured the cost of pattern matching and refused to pay it
twice.** The macro that gates a log statement is
[`LAZY_STREAM`](https://raw.githubusercontent.com/chromium/chromium/main/base/logging.h),
whose comment is exactly the property being asked about — _"Helper macro which avoids
evaluating the arguments to a stream if the condition doesn't hold. Condition is
evaluated once and only once."_ For per-file verbosity, `--vmodule` matches the current
`__FILE__` against a pattern list, and the header is unusually candid about the price:

> "We don't do any caching tricks with `VLOG_IS_ON()` like the google-glog version since
> it increases binary size. This means that using the v-logging functions in conjunction
> with `--vmodule` may be slow."

and offers a compile-time escape for exactly the hot case:

> "Define a default `ENABLED_VLOG_LEVEL` if it is not defined. The macros allows code to
> enable vlog level at build time without the need of `--vmodule` switch at runtime. This
> is intended for VLOGs that needed from production code without the cpu overhead to
> match vmodule patterns on every VLOG instance."

So a name-pattern dial is not free, and Chromium's answer is a build-time constant for
the call sites that cannot afford it. Note also a fourth distinct severity scale
([`base/logging/log_severity.h`](https://raw.githubusercontent.com/chromium/chromium/main/base/logging/log_severity.h)):
`LOGGING_VERBOSE = -1`, `LOGGING_INFO = 0`, `LOGGING_WARNING = 1`, `LOGGING_ERROR = 2`,
`LOGGING_FATAL = 3`.

**Go's `log/slog` writes down why its numbers have gaps, and ties them to OTel.** From
[`src/log/slog/level.go`](https://cs.opensource.google/go/go/+/master:src/log/slog/level.go):

> "Level numbers are inherently arbitrary, but we picked them to satisfy three
> constraints... First, we wanted the default level to be Info. Since Levels are ints,
> Info is the default value for int, zero. Second, we wanted to make it easy to use levels
> to specify logger verbosity. Since a larger level means a more severe event, a logger
> that accepts events with smaller (or more negative) level means a more verbose logger.
> Logger verbosity is thus the negation of event severity... Third, we wanted some room
> between levels to accommodate schemes with named levels between ours... Our gap of 4
> matches OpenTelemetry's mapping. Subtracting 9 from an OpenTelemetry level in the DEBUG,
> INFO, WARN and ERROR ranges converts it to the corresponding slog Level range."

`LevelDebug = -4`, `LevelInfo = 0`, `LevelWarn = 4`, `LevelError = 8`. The dial is read at
the **handler**, but called from the logger _before the record exists_ — `Logger.log`
opens `if !l.Enabled(ctx, level) { return }`, and only then captures the program counter
and builds the `Record`
([`src/log/slog/logger.go`](https://cs.opensource.google/go/go/+/master:src/log/slog/logger.go)).
The `Handler` interface says why:

> "Enabled reports whether the handler handles records at the given level. The handler
> ignores records whose level is lower. It is called early, before any arguments are
> processed, to save effort if the log event should be discarded."

**`debug` (npm) is the pure namespace model with no levels whatsoever.** The dial is a
single environment string of comma-separated namespace patterns, `*` as wildcard and a
`-` prefix to exclude: _"`DEBUG=*,-connect:*` would include all debuggers except those
starting with 'connect:'"_
([README](https://raw.githubusercontent.com/debug-js/debug/master/README.md)). There is no
severity at all — a namespace is on or off. And the enabledness is cached per instance,
recomputed only when the global namespace string changes
([`src/common.js`](https://raw.githubusercontent.com/debug-js/debug/master/src/common.js)):

```js
get: () => {
  if (enableOverride !== null) { return enableOverride; }
  if (namespacesCache !== createDebug.namespaces) {
    namespacesCache = createDebug.namespaces;
    enabledCache = createDebug.enabled(namespace);
  }
  return enabledCache;
},
```

Taken together with §2.1–§2.6, the pattern is: **every implementation that cares about the
hot path resolves the name-to-threshold mapping once and caches it** — OTel JS at logger
construction, pino at `setLevel`, `debug` behind a generation check, Chromium at build time
where it matters. The variable part is only _when_ the cache is invalidated.

## 3. Retention by level

The map's locked decision 9 is _shed lowest-level-first, then oldest-first, within a
channel_. The question this note was asked is whether anyone does that and what it is
called.

### 3.1 The direct answer, so far

**Nothing read for this note evicts by level.** Every bounded buffer examined discards by
age or refuses the newcomer. Level enters at two other moments — deciding whether to
_capture_ at all, and deciding when to _flush_ — and those are the patterns that have
names. The system that comes closest, Apple's, does both of those and still evicts
oldest-first once a record is in the store (§3.5).

### 3.2 OpenTelemetry JS: the incoming record is dropped, not the oldest

`BatchLogRecordProcessorBase` is the only bounded buffer in OTel JS, and it is a queue in
front of an exporter, not a retention store
([`sdk-logs/src/export/BatchLogRecordProcessorBase.ts:196-203`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-js/main/experimental/packages/sdk-logs/src/export/BatchLogRecordProcessorBase.ts)):

```ts
private _addToBuffer(logRecord: ReadWriteLogRecord) {
  if (this._finishedLogRecords.length >= this._maxQueueSize) {
    this._metrics.dropLogs(1);
    return;
  }
  this._finishedLogRecords.push(logRecord);
  this._maybeStartTimer();
}
```

`maxQueueSize` defaults to **2048**, and `types.ts` documents it as _"The maximum queue
size. After the size is reached log records are dropped."_ **The record dropped is the
new one**, so under sustained overflow OTel JS keeps the oldest 2048 and loses everything
after — the exact opposite of a ring, and with no reference to severity.

### 3.3 The pattern that does exist: a cheap ring, flushed by level

Two long-standing Java designs pair an age-ordered buffer with a **level-triggered
push**. This is the closest named thing in the wild to "keep the noise cheaply, and let
severity decide what happens to it".

`java.util.logging.MemoryHandler`
([Java SE 21 javadoc](https://docs.oracle.com/en/java/javase/21/docs/api/java.logging/java/util/logging/MemoryHandler.html)):

> "Handler that buffers requests in a circular buffer in memory. Normally this Handler
> simply stores incoming LogRecords into its memory buffer and discards earlier records.
> This buffering is very cheap and avoids formatting costs. On certain trigger
> conditions, the MemoryHandler will push out its current buffer contents to a target
> Handler, which will typically publish them to the outside world."

The first documented trigger is _"An incoming LogRecord has a type that is greater than a
pre-defined level, the pushLevel."_ Defaults: `size` 1000, `push` `SEVERE`.

logback's `SMTPAppender`
([manual, network and mail appenders](https://logback.qos.ch/manual/appenders-network.html)):

> "The SMTPAppender keeps only the last 256 logging events in its cyclic buffer, throwing
> away older events when its buffer becomes full."

> "In the absence of this option, SMTPAppender is assigned an instance of OnErrorEvaluator
> which triggers email transmission when it encounters an event of level _ERROR_ or
> higher."

Both split the two concerns the same way: **eviction by age, emission by level.** Neither
is decision 9 — in both, a `DEBUG` record and an `ERROR` record are equally likely to be
evicted while they sit in the buffer.

### 3.4 Sentry's breadcrumb ring: oldest-first, and it says so in a counter

The breadcrumb buffer is the closest analogue in the wild to a capped local channel, and
it settles the question for this note. `Scope.addBreadcrumb`
([`packages/core/src/scope.ts:559-583`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/scope.ts)):

```ts
this._breadcrumbs.push(mergedBreadcrumb);
if (this._breadcrumbs.length > maxCrumbs) {
  this._breadcrumbs = this._breadcrumbs.slice(-maxCrumbs);
  this._client?.recordDroppedEvent("buffer_overflow", "log_item");
}
```

`slice(-maxCrumbs)` keeps the **last** N. **The oldest is dropped, unconditionally, and
the breadcrumb's `level` is never read.** A `fatal` breadcrumb from the start of a session
is discarded to make room for a `debug` one — the exact case the map's locked decision 9
was written against. The default `maxBreadcrumbs` is **100**
(`const DEFAULT_BREADCRUMBS = 100` in
[`packages/core/src/breadcrumbs.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/breadcrumbs.ts)),
and the same function truncates a breadcrumb's `message` to 2048 characters with the
comment _"Breadcrumb messages can theoretically be infinitely large and they're held in
memory so we truncate them not to leak (too much) memory"_.

Two adjacent facts. First, overflow is **counted**, under the reason `buffer_overflow` —
the buffer knows it lost something even though it does not know what. Second, the newer
log buffer is not a ring at all: `MAX_LOG_BUFFER_SIZE = 100` in
[`packages/core/src/logs/internal.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/logs/internal.ts),
and reaching it triggers `_INTERNAL_flushLogsBuffer` — a **send**, not an eviction. A
buffer whose overflow behaviour is "transmit" is only available to a facility that has
somewhere to transmit to.

For completeness on the egress ordering the ticket asked about: `Client._processEvent`
([`packages/core/src/client.ts:1504`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/client.ts))
runs `_prepareEvent` first — which is where `applyScopeDataToEvent` attaches the
breadcrumbs — then `beforeSend`, and only then the `sampleRate` check. So `beforeSend`
sees the assembled event including its breadcrumbs, can return `null` to drop it, and a
sampling decision can still discard an event that `beforeSend` approved.

### 3.5 Apple's unified logging — level decides entry, age decides exit

This is the closest thing in the wild to what the map's locked decision 9 describes, and
reading it carefully shows that it is **not** the same thing. Apple's system is
level-dependent at the _entrance_ to each store and strictly age-ordered _inside_ it.

Apple documents the storage behaviour per level, on the `OSLogType` case pages. Quoting
each, because the differences are the finding:

- **`debug`** — _"The system only captures debug-level messages in memory when you enable
  debug logging through a configuration change, and purges them in accordance with the
  configuration's persistence setting."_
  ([OSLogType.debug](https://developer.apple.com/documentation/os/oslogtype/debug))
- **`info`** — _"The system stores info-level messages in memory buffers and, without a
  configuration change, purges the oldest messages as those buffers fill up. However, the
  system writes the messages to the data store when faults and, optionally, errors occur.
  Info-level messages remain in the data store until the store's size exceeds its storage
  quota, at which point, the system purges the oldest messages in the data store to free
  up space."_
  ([OSLogType.info](https://developer.apple.com/documentation/os/oslogtype/info))
- **`default`** — _"The system stores default-level messages in memory buffers and,
  without a configuration change, compresses the messages and writes them to the data
  store as those buffers fill up. They remain in the data store until the store's size
  exceeds its storage quota, at which point, the system purges the oldest messages in the
  store to free up space."_
  ([OSLogType.default](https://developer.apple.com/documentation/os/oslogtype/default))
- **`error`** and **`fault`** — _"The system always writes error-level messages to the
  data store. They remain in the store until its size exceeds its storage quota, at which
  point, the system purges the oldest messages in the store to free up space."_ (the same
  sentence on both pages,
  [error](https://developer.apple.com/documentation/os/oslogtype/error) and
  [fault](https://developer.apple.com/documentation/os/oslogtype/fault))

Read those four together and the design is explicit:

1. **Level decides whether a record is captured at all** — `debug` needs a configuration
   change.
2. **Level decides whether a record is promoted from memory to the persistent store** —
   `default`, `error` and `fault` always; `info` only in the shadow of a fault.
3. **Once in the store, level buys nothing.** All four pages end on the same clause —
   _"the system purges the oldest messages in the store to free up space"_ — with no
   qualification by level. An `error` and a `default` of the same age age out together.

So the answer to the ticket's question is that **Apple does level-dependent capture and
level-dependent persistence, not level-ordered eviction.** Decision 9's shed-lowest-first
has no counterpart here, and therefore no name here.

The `info` clause is the striking one, because it is `MemoryHandler`'s pattern (§3.3) at
operating-system scale: cheap records live in a ring, and a _fault_ is what makes them
worth writing down. Apple's own summary of the scheme, from
[Generating Log Messages from Your Code](https://developer.apple.com/documentation/os/generating-log-messages-from-your-code):

> "The system stores all messages in memory initially, and it writes messages with more
> severe log levels to disk."

_(Flagged, and not closed: Apple documents that the store has a "storage quota" but I
found no primary source stating its size, nor the size of the in-memory buffers.
`log collect --size num[k|m]` bounds an **exported archive**, not the live store. I also
found no primary statement of how the quota is divided between subsystems, so I cannot
say whether one noisy subsystem can evict another's records — which is the analogue of
the map's locked decision 4.)_

### 3.6 The nearest thing to content-based retention: tail sampling

OpenTelemetry's Collector has a
[tail sampling processor](https://raw.githubusercontent.com/open-telemetry/opentelemetry-collector-contrib/main/processor/tailsamplingprocessor/README.md)
that buffers in memory (`num_traces` default 50000, `decision_wait` default 30s) and then
decides from policies, one of which is `status_code`: _"Sample based upon the status code
(`OK`, `ERROR` or `UNSET`)"_. That is retention decided from the record's own outcome
rather than its arrival order — but it is **traces, not logs**, it is a **network-side
collector** rather than a device-local store, and it chooses what to _forward_, not what
to _evict when full_. The name for the family is _tail sampling_, as against _head
sampling_.

### 3.7 A bounded store that is bounded by bytes, not by level

systemd-journald is the clearest example of a persistent local store whose retention is
purely a size budget. `SystemMaxUse=` and `SystemKeepFree=` bound the footprint, and the
reclamation is file-granular and age-ordered
([`man/journald.conf.xml`](https://raw.githubusercontent.com/systemd/systemd/main/man/journald.conf.xml)):

> "Also note that only archived files are deleted to reduce the space occupied by journal
> files. This means that, in effect, there might still be more space used than
> `SystemMaxUse=` ... limit after a vacuuming operation is complete."

Severity has already had its say at `MaxLevelStore=` (§2.3); once a record is in the
store, its level buys it nothing.

---

### 3.8 Android `logd` — the one system that sheds by something other than age, and it is not level

This is the second reason this note widened past the ticket's list. Android's `logd` is a
fixed-size on-device ring, which is structurally the closest thing to a capped local
channel, and it is the only implementation found that departs from oldest-first at all.
**The thing it departs to is the noisiest source, not the lowest level.**

The default pruning filter is documented in
[`logd/README.property`](https://android.googlesource.com/platform/system/logging/+/refs/heads/main/logd/README.property):

> `ro.logd.filter  string "~! ~1000/!"  default for persist.logd.filter. This default
means to prune the oldest entries of chattiest UID, and the chattiest PID of system
(1000, or AID_SYSTEM).`

and the rule grammar, verbatim from the same file:

> "Pruning filter rules are specified as UID, UID/PID or /PID. A '~' prefix indicates that
> elements matching the rule should be pruned with higher priority otherwise they're pruned
> with lower priority. **All other pruning activity is oldest first.** Special case `~!`
> represents an automatic pruning for the noisiest UID as determined by the current
> statistics. Special case `~1000/!` represents pruning of the worst PID within AID_SYSTEM
> when AID_SYSTEM is the noisiest UID."

`PruneList` carries this as `worst_uid_enabled_` and `worst_pid_of_system_enabled_`, with
the comment _"special case, prune the worst UID of those using at least 1/8th of the
buffer"_, and `SimpleLogBuffer::Prune` walks from `GetOldest`. **Priority in this system
means "whose records go first", and it is decided by who wrote too many, never by what the
record says about itself.**

Level does exist in Android logging — `V/D/I/W/E/F/S`, with a global `log.tag` property
and per-tag overrides — but it acts at **write admission**: `SimpleLogBuffer::ShouldLog`
calls `__android_log_is_loggable_len(prio, tag, tag_len, ANDROID_LOG_VERBOSE)` before the
record enters the buffer, and `logcat *:W` filters again at **read** time. Between those
two moments the level is inert.

The buffers are sized by bytes, not entries: `persist.logd.size` and
`persist.logd.size.<buffer>` per buffer id, with the range _"limited to between 64K and
256M for log buffer sizes"_ and a note that on non-debuggable builds _"logd.size is 64K
instead of 256K"_.

Two things worth carrying forward. First, the one production system that bothered to make
eviction smarter than age chose **fairness between sources** as the axis — the analogue of
the map's locked decision 4 (a channel's volume must not evict another channel's records),
not of decision 9. Second, it is configured as an ordered rule list with an explicit
"everything else is oldest first" fallback, which is a shape a level-ordered policy could
borrow even though nobody has.

## 4. Structured versus formatted

### 4.1 OpenTelemetry .NET stores the template and drops the rendered string

This is the strongest single finding in this section, and it is an _implementation_ fact
rather than a spec one — the log data model says nothing about message templates.

`OpenTelemetryLoggerOptions.IncludeFormattedMessage` defaults to `false`
([`src/OpenTelemetry/Logs/ILogger/OpenTelemetryLoggerOptions.cs`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet/main/src/OpenTelemetry/Logs/ILogger/OpenTelemetryLoggerOptions.cs)):

> "Gets or sets a value indicating whether or not formatted log message should be
> included on generated `LogRecord`s. Default value: `false`."
>
> "Note: When set to `false` a formatted log message will not be included if a message
> template can be found. If a message template is not found, a formatted log message is
> always included."

What is stored instead is the template plus its arguments as separate attributes. From
the project's own worked example
([`docs/logs/getting-started-console/README.md`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet/main/docs/logs/getting-started-console/README.md)):

```text
LogRecord.Body:                    Food `{name}` price changed to `{price}`.
LogRecord.Attributes (Key:Value):
    name: artichoke
    price: 9.99
    OriginalFormat (a.k.a Body): Food `{name}` price changed to `{price}`.
```

The OTLP exporter special-cases that attribute and promotes it to the record's `Body`
([`ProtobufOtlpLogSerializer.cs:282-296`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet/main/src/OpenTelemetry.Exporter.OpenTelemetryProtocol/Implementation/Serializer/ProtobufOtlpLogSerializer.cs)):
`// Special casing {OriginalFormat}`.

What it buys, in the project's own words
([`docs/logs/README.md`](https://raw.githubusercontent.com/open-telemetry/opentelemetry-dotnet/main/docs/logs/README.md)):

> ":heavy_check_mark: You should use structured logging. \* Structured logging is more efficient than unstructured logging. \* Filtering and redaction can happen on individual key-value pairs instead of the
> entire log message. \* Storage and indexing are more efficient."

and, on the other side, ":stop_sign: You should avoid string interpolation."

### 4.2 pino renders, and keeps nothing

pino is the counter-example, and it is unambiguous. The message may carry printf
placeholders, but what lands in the line is the finished string
([`docs/api.md`](https://raw.githubusercontent.com/pinojs/pino/v10.3.1/docs/api.md)):

```js
logger.info("%o hello %s", { worldly: 1 }, "world");
// {"level":30,"time":1531257826880,"msg":"{\"worldly\":1} hello world","pid":55956,"hostname":"x"}
```

> "All arguments supplied after `message` are serialized and interpolated according to any
> supplied printf-style placeholders (`%s`, `%d`, `%o`|`%O`|`%j`) to form the final output
> `msg` value for the JSON log line."

Neither the template nor the individual arguments survive. `LOG` in `lib/tools.js` calls
`this[writeSym](o, format(msg, formatParams, this[formatOptsSym]), level)` — `format`
runs at the call site — and `write` in `lib/proto.js` serialises and calls
`stream.write(s)` immediately. **pino has no bounded local buffer of any kind**; there is
nothing to retain, so the question of shedding by level does not arise for it.

pino's structure comes from the _merging object_, not from the message: the way to get
queryable fields is `logger.info({ user_id }, 'saved')`, and the string stays a string.

### 4.3 Sentry stores both, and puts the template in the attribute bag

Sentry is the only framework read here that keeps the rendered string **and** the
template **and** the arguments, and the mechanism is worth copying down because it needs
no new field on the record.

`Sentry.logger.fmt` is a tagged template literal — `parameterize` in
[`packages/core/src/utils/parameterize.ts`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/utils/parameterize.ts) —
which returns a `String` object carrying two extra properties:

```ts
formatted.__sentry_template_string__ = strings
  .join("\x00")
  .replace(/%/g, "%%")
  .replace(/\0/g, "%s");
formatted.__sentry_template_values__ = values;
```

so `fmt` + "`This is a log statement with ${x} and ${y} params`" yields the template
`'This is a log statement with %s and %s params'` alongside `['first', 'second']`. The
value is still a string everywhere else in the program; the structure rides along on it.

`_INTERNAL_captureLog` then unpacks it into **ordinary attributes**
([`packages/core/src/logs/internal.ts:128-134`](https://raw.githubusercontent.com/getsentry/sentry-javascript/develop/packages/core/src/logs/internal.ts)):

```ts
if (__sentry_template_values__?.length) {
  processedLogAttributes["sentry.message.template"] =
    __sentry_template_string__;
}
__sentry_template_values__.forEach((param, index) => {
  processedLogAttributes[`sentry.message.parameter.${index}`] = param;
});
```

and the record's `body` is set to `_removeLoneSurrogates(String(message))` — the fully
rendered string. So one log carries `body` = the sentence a human reads,
`sentry.message.template` = the shape you group by, and
`sentry.message.parameter.0…n` = the values you filter on. Note the price: the parameter
values are duplicated, once inside the rendered body and once as attributes. Note also
that the template is only stored when there is at least one parameter.

This is the same three-part split as OTel .NET (§4.1), reached with an open attribute bag
instead of a dedicated field, and without dropping the rendered form.

### 4.4 Apple defers the formatting to the reader, and says what it buys

`os_log` is the strongest case for template-plus-arguments, because the format string is
not merely kept — it is required to be a compile-time constant, and the rendering is
deferred to whoever reads the log later. From the `os_log` macro's own documentation
([`libkern/os/log.h`](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/libkern/os/log.h)):

> "`format` — A format string to generate a human-readable log message when the log line
> is decoded. This string must be a constant string, not dynamically generated. Supports
> all standard printf types and `%@` (objects)."

"When the log line is decoded" is the whole point: the string is never rendered at the
call site. Apple states the payoff directly, in
[Viewing Log Messages](https://developer.apple.com/documentation/os/viewing-log-messages):

> "The unified log system stores log messages in a binary compressed format, deferring
> much of the work to turn them into human-readable text messages. Using a binary format
> allows the log system to store more messages and reduces the overhead of logging data.
> However, this means you can't read and parse the log files directly; you need to use
> tools to convert the log messages into a binary format."

Two things bought, both named by Apple: **more messages in the same space**, and **less
work at the call site**. The cost is also named: the store is not readable without a
tool.

In Swift the same split is reached through the type system rather than a macro —
`OSLogMessage` is _"An object for writing interpolated string messages to the unified
logging system"_, and the docs say you do not construct one yourself, the system creates
it when you write a message
([OSLogMessage](https://developer.apple.com/documentation/os/oslogmessage)). _(Flagged: I
did not establish from a primary source how `OSLogMessage` compiles an interpolation down
to a format string plus arguments, only that a dedicated type exists to intercept the
interpolation before it becomes a `String`.)_

### 4.5 Rust keeps a lazy formatter, not a string

`log`'s macros pass `format_args!(...)` — a value that borrows its arguments and renders
only when written — rather than a `String`, and the same macro accepts structured
key-values alongside it:

```rust
log!(target: "my_target", Level::Info, key1:? = 42, key2 = true; "a {} event", "log");
```

([`src/macros.rs`](https://raw.githubusercontent.com/rust-lang/log/master/src/macros.rs).)
So the record carries a deferred template, its arguments, and a separate typed bag — the
same three-part split as OTel .NET, reached independently.

---

## 5. The two places this project believes it is ahead

### 5.1 Pre-registering the measurement bar before collecting

**Negative result. No logging or telemetry framework read for this note has any concept
of declaring, before collection begins, what result would count as evidence for a
decision.**

Frameworks declare _what will be collected_. None declares _what reading would settle the
question_, and none has machinery that would notice a threshold being chosen after the
numbers are in.

**Glean gets closest, and the gap is instructive.** It is the only system read here that
enforces a declaration before collection at all (§1.7), and its guidance opens on the
question rather than the measurement — the first step of _"Adding new metrics"_ is
_"Consider the question you are trying to answer with this data, and choose the metric
type and parameters to use"_
([Adding new metrics](https://raw.githubusercontent.com/mozilla/glean/main/docs/user/user/metrics/adding-new-metrics.md)).
But that sentence is advice in a paragraph, and the six keys the schema actually enforces
— `type`, `bugs`, `description`, `notification_emails`, `data_reviews`, `expires` — carry
no field for the question, no field for the expected reading, and no field for what would
count as an answer. `expires` bounds how long you may collect; it does not record what
you were going to conclude.

So the declaration is of an **instrument**, not of a **hypothesis**. Nothing read here
distinguishes a confirmatory reading from an exploratory one, or makes it awkward to move
a threshold after seeing the data.

The name for the practice exists, but it belongs to research methodology, not software.
The Center for Open Science defines it as
([cos.io/initiatives/prereg](https://www.cos.io/initiatives/prereg)):

> "When you preregister your research, you're simply specifying your research plan in
> advance of your study and submitting it to a registry."

and gives the reason ADR-0053 §7's own sentence gives — _"a threshold chosen once the
numbers are in is a rationalisation"_:

> "the same data cannot be used to generate _and_ test a hypothesis, which can happen
> unintentionally and reduce the credibility of your results."

There is therefore **nothing to rename this to.** If #216 wants a word for it, the word
is _preregistration_, and it will be borrowed from outside the software vocabulary.

### 5.2 Structural absence of identifiers in the record shape

**Negative result on the naming question.** No framework read for this note names the
property "the identifier cannot appear because the record has no field for it", as
distinct from "the identifier is removed on the way out".

Every analogue found is a _switch over collection_, defaulting one way, rather than a
property of the record's shape:

- Sentry's `sendDefaultPii` defaults to `false` and is documented as enabling collection
  when turned on — _"send default PII data to Sentry. Among other things, enabling this
  will enable automatic IP address collection on events"_
  ([JS configuration options](https://docs.sentry.io/platforms/javascript/configuration/options/)).
  It is now documented as deprecated in favour of a `dataCollection` option. A default-off
  switch is a different guarantee from a missing field: it can be turned on.
- OpenTelemetry's record has an open attribute bag by construction (§1.3), so nothing in
  its shape can prevent an identifier being written into it. The same holds for pino's
  flat line and for Sentry's `data` and `attributes`. An open bag makes structural absence
  unavailable as a property, whatever anybody calls it.
- **Glean is the one system whose shape could carry the property, and it spends it the
  other way.** There is no bag at all (§1.7), so an identifier cannot appear unless a
  metric declaring it exists — and then `client_info` carries `client_id` on every ping by
  construction. Glean shows that "no open bag" and "no identifier" are separate
  properties: it has the first and declines the second on purpose.
- Apple's record has a fixed shape and no bag, but its arguments are arbitrary, so what is
  absent is a _slot_, not the data.

The distinction ADR-0071 §4 draws — _"The privacy property is a consequence of the
record's shape, which is the only kind that survives somebody editing it later without
reading this"_ — has no counterpart term in the frameworks read.

_(Flagged: the nearest named concept anywhere is the legal principle of data
minimisation, GDPR Article 5(1)(c), and "data protection by design and by default",
Article 25. I could not verify the official wording — EUR-Lex returned a bot challenge
(HTTP 202 with no body) on two attempts on 2026-08-31 — so no quotation is offered and
the article numbers are cited from memory rather than read.)_

---

## 6. What this note could not establish

Listed rather than smoothed over. Anything below is a gap, not a finding.

1. **The size of Apple's log store, and how it is divided.** Apple's own docs say records
   remain _"until the store's size exceeds its storage quota"_ but I found no primary
   source giving that quota, nor the size of the in-memory buffers that precede it, nor
   whether the quota is shared across subsystems. That last one is the direct analogue of
   the map's locked decision 4 and I cannot answer it. `log collect --size num[k|m]`
   bounds an exported archive, not the live store.
2. **How Swift's `OSLogMessage` compiles an interpolation.** Established that the type
   exists to intercept an interpolation before it becomes a `String`, and that the C macro
   requires a constant format string. Did not establish, from a primary source, the
   representation `OSLogMessage` produces or where the arguments are stored.
3. **Whether Sentry's `Log` type admits a `critical` level.** The doc comment lists it
   among the allowed values; the `LogSeverityLevel` union does not contain it. Read as a
   stale comment, not confirmed against a changelog.
4. **The official wording of GDPR Article 5(1)(c) and Article 25.** EUR-Lex returned a bot
   challenge (HTTP 202 with an empty body) on repeated attempts on 2026-08-31, so §5.2's
   mention of data minimisation carries no quotation and the article numbers are cited
   from memory rather than read.
5. **`log(1)` from an Apple-hosted URL.** The man page text quoted in §2.5 is Apple's, but
   read from a published mirror. The canonical form is `man 1 log` on macOS, which this
   environment cannot run.
6. **Whether any framework names a level-ordered eviction policy under some term I did not
   think to search for.** I searched the sources read here for `severity`, `level`,
   `priority`, `prune`, `evict` and `oldest`, and found the policies described in §3. A
   term of art existing somewhere unread cannot be excluded — the claim in §3.1 is "nothing
   read for this note", not "nothing anywhere".
7. **Whether OpenTelemetry's `LoggerConfig` survives.** Every declaration of it in the JS
   SDK carries `@experimental This feature is in development as per the OpenTelemetry
specification`, and the packages are `0.222.0-development.0`. The per-logger dial
   described in §2.1 is the current shape of a moving target, not a settled one.

---

## 7. Sources, with the version read

All read 2026-08-31.

| Source                            | What was read                                                                                                                                                                                                                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenTelemetry specification       | logs [data model](https://opentelemetry.io/docs/specs/otel/logs/data-model/), [API](https://opentelemetry.io/docs/specs/otel/logs/api/), [SDK](https://opentelemetry.io/docs/specs/otel/logs/sdk/), [semconv naming](https://opentelemetry.io/docs/specs/semconv/general/naming/) |
| `opentelemetry-proto`             | `main`, `opentelemetry/proto/logs/v1/logs.proto`                                                                                                                                                                                                                                  |
| `opentelemetry-js`                | `main` @ `f41805e769ba10fb6dae72a4b7a5a3dc67cca82e`; `api-logs` and `sdk-logs` both `0.222.0-development.0`                                                                                                                                                                       |
| `opentelemetry-dotnet`            | `main`; `OpenTelemetryLoggerOptions.cs`, `ProtobufOtlpLogSerializer.cs`, `docs/logs/`                                                                                                                                                                                             |
| `opentelemetry-collector-contrib` | `main`, `processor/tailsamplingprocessor/README.md`                                                                                                                                                                                                                               |
| Rust `log`                        | `rust-lang/log` `master`, `src/macros.rs`, `src/lib.rs`                                                                                                                                                                                                                           |
| Winston                           | `winstonjs/winston` `master`, `README.md`                                                                                                                                                                                                                                         |
| Java SE                           | `java.util.logging.MemoryHandler`, Java SE 21 javadoc                                                                                                                                                                                                                             |
| logback                           | manual, network and mail appenders                                                                                                                                                                                                                                                |
| systemd                           | `systemd/systemd` `main`, `man/journald.conf.xml`                                                                                                                                                                                                                                 |
| `sentry-javascript`               | `develop` @ `604f142d26e95c5b1e243c8f65dd57b315f6981c`; `packages/core/src/` — scope, breadcrumbs, client, logs, types                                                                                                                                                            |
| Sentry docs                       | JS configuration options, and Set Up Logs (docs.sentry.io)                                                                                                                                                                                                                        |
| Apple — `os_log` levels and store | `OSLogType` case pages, Generating Log Messages from Your Code, Viewing Log Messages, `OSLogMessage` (developer.apple.com)                                                                                                                                                        |
| Apple — XNU source                | `apple-oss-distributions/xnu` `main`, `libkern/os/log.h`                                                                                                                                                                                                                          |
| Apple — `log(1)`                  | the shipped man page, read from a published mirror (see §2.5 source note)                                                                                                                                                                                                         |
| Mozilla Glean                     | `mozilla/glean_parser` `main` `schemas/metrics.2-0-0.schema.yaml`; the Glean Book ping schema; `mozilla/glean` `docs/user/user/metrics/adding-new-metrics.md`                                                                                                                     |
| Android `logd`                    | AOSP `platform/system/logging` `main`, `logd/README.property`, `logd/PruneList.cpp`, `logd/SimpleLogBuffer.cpp`                                                                                                                                                                   |
| Chromium                          | `chromium/chromium` `main`, `base/logging.h`, `base/logging/log_severity.h`                                                                                                                                                                                                       |
| Go `log/slog`                     | Go `master`, `src/log/slog/level.go`, `record.go`, `logger.go`, `handler.go`                                                                                                                                                                                                      |
| `debug` (npm)                     | `debug-js/debug` `master`, `README.md`, `src/common.js`                                                                                                                                                                                                                           |
| Center for Open Science           | preregistration definition                                                                                                                                                                                                                                                        |
