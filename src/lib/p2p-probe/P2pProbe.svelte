<script lang="ts">
  /**
   * PROTOTYPE — throwaway, dev-only, mounted at `?demo=p2p198`.
   *
   * #198: two phones on a table, no server between them — does a meal cross?
   *
   * #194 said what the platform CLAIMS. This finds out what it DOES. It walks
   * the two paths that ticket names, cheapest first, and instruments both so a
   * failure names the wall rather than just failing:
   *
   *   1. QR only. A real narrowed closure (#197), encoded as a chain of
   *      symbols, read back through a camera.
   *   2. QR-signalled WebRTC. Offer QR on one phone, answer QR on the other, a
   *      data channel between them, no STUN and no TURN configured at all.
   *
   * The page is the throwaway half. The modules under it — `qr-chain`,
   * `sdp-compact`, `probe-payload`, `probe-log` — are where anything worth
   * keeping lives.
   */
  import {
    MEAL_SIZES,
    buildMealPayload,
    deflate,
    inflate,
    type BuiltPayload,
    type MealSize,
  } from "./probe-payload";
  import {
    Reassembler,
    toFrames,
    parseFrame,
    FRAME_HEADER_BYTES,
  } from "./qr-chain";
  import {
    renderSymbol,
    readSymbols,
    type QrEncoding,
    type EcLevel,
  } from "./qr-codec";
  import {
    compactSdp,
    expandSdp,
    censusCandidates,
    type CandidateCensus,
  } from "./sdp-compact";
  import { ProbeLog } from "./probe-log";

  type Path = "menu" | "qr-send" | "qr-receive" | "rtc-offer" | "rtc-answer";

  let path = $state<Path>("menu");
  let note = $state("");
  let failure = $state("");

  const log = new ProbeLog();
  let timeline = $state<{ at: number; stage: string; detail?: string }[]>([]);
  const mark = (stage: string, detail?: string) => {
    log.mark(stage, detail);
    timeline = log.timeline();
  };
  const begin = (stage: string) => {
    failure = "";
    // reset() before start(): `start` clears the timeline but NOT the facts, so
    // without this a run inherits the previous one's facts and a QR-only report
    // comes out carrying candidate counts and SDP sizes from an earlier WebRTC
    // attempt on the same page load. The first run of this probe did exactly
    // that, and the stale facts read as if the QR path had gathered candidates.
    log.reset();
    log.start(stage);
    timeline = log.timeline();
  };

  // ── Shared controls ──────────────────────────────────────────────────────

  let size = $state<MealSize>(MEAL_SIZES[0]);
  let ecLevel = $state<EcLevel>("L");
  let encoding = $state<QrEncoding>("binary");
  /**
   * Bytes per symbol, header included. #194 §9 records the standard's ceiling
   * as 2,953 at v40-L, and Denso Wave's own FAQ putting the practical phone
   * camera at "271 bytes or so (for Version 10 with error correction level L)".
   * The gap between those two numbers is the single biggest unknown in the QR
   * path, so it is a slider rather than a constant.
   */
  let symbolBytes = $state(1200);
  let frameMs = $state(400);

  let payload = $state<BuiltPayload | null>(null);
  let building = $state(false);

  async function build() {
    building = true;
    failure = "";
    try {
      begin("build payload");
      payload = await buildMealPayload(size);
      mark(
        "payload built",
        `${payload.lines} datoms, ${payload.entities} entities, ${payload.rawBytes} raw, ${payload.deflatedBytes} deflated`
      );
      log.fact("meal", size.label);
      log.fact("payload raw bytes", payload.rawBytes);
      log.fact("payload deflated bytes", payload.deflatedBytes);
      log.fact("#199 expected raw KiB", size.expectedRawKiB);
    } catch (e: any) {
      failure = `payload build failed: ${e?.message ?? e}`;
    } finally {
      building = false;
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────

  let video = $state<HTMLVideoElement | null>(null);
  let stream = $state<MediaStream | null>(null);
  let scanning = $state(false);
  let cameraGranted = $state(false);
  let scanTimer: number | null = null;
  let frameCanvas: HTMLCanvasElement | null = null;

  /**
   * Attaches whichever stream is live to whichever `<video>` is mounted.
   *
   * This is an effect rather than a line inside `startCamera` because the two
   * events are genuinely independent: `warmCameraFirst` grants the camera
   * BEFORE the offer QR is on screen, and on that path the `<video>` element
   * does not exist yet, so an assignment at grant time lands on null and the
   * stream is never displayed or decoded. The first run of this probe lost a
   * whole WebRTC attempt to exactly that — the camera was on, the preview was
   * blank, and the answer could never be read.
   */
  $effect(() => {
    if (video && stream && video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {});
    }
  });

  async function startCamera(): Promise<boolean> {
    if (stream) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1920 } },
        audio: false,
      });
      cameraGranted = true;
      mark("camera granted");
      return true;
    } catch (e: any) {
      failure = `camera refused: ${e?.name ?? e}`;
      return false;
    }
  }

  function stopCamera() {
    if (scanTimer !== null) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
    scanning = false;
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  /** Grabs the current video frame as ImageData for the decoder. */
  function grab(): ImageData | null {
    if (!video || video.videoWidth === 0) return null;
    frameCanvas ??= document.createElement("canvas");
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    const ctx = frameCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return ctx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
  }

  /** Runs `onBytes` for every symbol decoded, until `stopCamera` or a stop signal. */
  function scanLoop(onBytes: (bytes: Uint8Array) => boolean | void) {
    scanning = true;
    let busy = false;
    scanTimer = window.setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const frame = grab();
        if (!frame) return;
        for (const bytes of await readSymbols(frame, encoding)) {
          scanAttempts += 1;
          if (onBytes(bytes) === true) {
            stopCamera();
            return;
          }
        }
      } catch (e: any) {
        failure = `decode failed: ${e?.message ?? e}`;
      } finally {
        busy = false;
      }
    }, 120);
  }

  let scanAttempts = $state(0);

  // A pasted code is text, so the deflated record is base64'd. #194 §4.3 shows
  // base64 is the wrong choice INSIDE a QR symbol; in a messenger it is the only
  // choice, and #199 §2 already accepted a 22-character floor for a pasted code.
  const bytesToBase64 = (b: Uint8Array): string => {
    let out = "";
    for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i]);
    return btoa(out);
  };
  const base64ToBytes = (text: string): Uint8Array => {
    const raw = atob(text.trim());
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  };

  // ── Path 1: QR only ──────────────────────────────────────────────────────

  let frames = $state<Uint8Array[]>([]);
  let symbols = $state<string[]>([]);
  let cursor = $state(0);
  let cycling = $state(false);
  let cycleTimer: number | null = null;
  let symbolPixels = $state("");

  async function prepareChain() {
    if (!payload) return;
    failure = "";
    try {
      mark("compressing");
      const bytes = await deflate(new TextEncoder().encode(payload.ndjson));
      const seqId = Math.floor(Math.random() * 0xffff);
      frames = toFrames(bytes, symbolBytes, seqId);
      mark("chunked", `${frames.length} symbols of <=${symbolBytes} B`);
      // A chain is not a design. Handing someone a meal cannot mean holding a
      // cycling slideshow steady while they film it, so one symbol is the whole
      // budget for the QR-only path — and at 2,939 usable bytes that buys about
      // four foods. Everything larger is the data channel's job, which is why
      // the handshake stays one symbol no matter how big the meal is.
      if (frames.length > 1) {
        failure =
          `${frames.length} symbols. The QR-only path is one symbol or nothing: ` +
          `${bytes.length} B deflated against a ${symbolBytes - FRAME_HEADER_BYTES} B body. ` +
          `Send this meal over the data channel instead — its handshake is one symbol at any size.`;
        log.fact("refused: symbols needed", frames.length);
        mark("refused", failure);
        frames = [];
        symbols = [];
        return;
      }
      log.fact("symbols in chain", frames.length);
      log.fact("bytes per symbol", symbolBytes);
      log.fact("QR encoding", encoding);
      log.fact("EC level", ecLevel);
      const rendered = [];
      for (const f of frames)
        rendered.push(await renderSymbol(f, ecLevel, encoding));
      symbols = rendered.map((r) => r.svg);
      symbolPixels = rendered[0]?.version ?? "";
      log.fact("symbol modules", symbolPixels);
      mark("symbols rendered", `${symbolPixels} modules each`);
      cursor = 0;
      startCycling();
    } catch (e: any) {
      failure = `chain failed: ${e?.message ?? e}`;
    }
  }

  function startCycling() {
    stopCycling();
    if (frames.length <= 1) return;
    cycling = true;
    cycleTimer = window.setInterval(() => {
      cursor = (cursor + 1) % symbols.length;
    }, frameMs);
  }

  function stopCycling() {
    if (cycleTimer !== null) clearInterval(cycleTimer);
    cycleTimer = null;
    cycling = false;
  }

  let assembler = new Reassembler();
  let received = $state({ have: 0, total: 0, missing: [] as number[] });
  let verdict = $state("");

  async function receiveChain() {
    begin("receive: start");
    assembler = new Reassembler();
    received = { have: 0, total: 0, missing: [] };
    verdict = "";
    scanAttempts = 0;
    if (!(await startCamera())) return;
    mark("scanning");
    let firstSeen = false;
    scanLoop((bytes) => {
      const chunk = parseFrame(bytes);
      if (!chunk) return;
      if (!firstSeen) {
        firstSeen = true;
        mark("first symbol read", `chain of ${chunk.total}`);
      }
      const result = assembler.accept(chunk);
      received = {
        have: assembler.have(),
        total: assembler.expected(),
        missing: assembler.missing(),
      };
      if (result.kind === "complete") {
        mark("chain complete", `${scanAttempts} symbol reads`);
        void settle(result.payload, result.checksumOk);
        return true;
      }
      return false;
    });
  }

  /** Inflates, parses and checks what landed — the "did a meal cross" question. */
  async function settle(bytes: Uint8Array, checksumOk: boolean) {
    try {
      if (!checksumOk) {
        verdict = "REASSEMBLED BUT CRC MISMATCH — the bytes are corrupt";
        mark("verdict", verdict);
        return;
      }
      const ndjson = new TextDecoder().decode(await inflate(bytes));
      const lines = ndjson.split("\n").filter(Boolean);
      const envelope = JSON.parse(lines[0]);
      const datoms = lines.slice(1).map((l) => JSON.parse(l));
      const roots = new Set<string>(envelope.roots ?? []);
      const entities = new Set(datoms.map((d: any) => d.entity));
      verdict =
        `A MEAL CROSSED. artifact=${envelope.artifact}, ` +
        `${datoms.length} datoms over ${entities.size} entities, ` +
        `${roots.size} declared roots, ${bytes.length} B on the wire`;
      log.fact("datoms received", datoms.length);
      log.fact("entities received", entities.size);
      log.fact("wire bytes", bytes.length);
      log.fact("symbol reads to complete", scanAttempts);
      mark("verdict", verdict);
    } catch (e: any) {
      verdict = `reassembled but unreadable: ${e?.message ?? e}`;
      mark("verdict", verdict);
    }
  }

  // ── Path 2: QR-signalled WebRTC ──────────────────────────────────────────

  /**
   * No `iceServers` at all — the empty default RFC 8445 §5.1.1.2 permits and
   * `webrtc-pc` §4.2.1 makes the default. That is the whole zero-infrastructure
   * claim, expressed as a missing argument.
   */
  const NO_SERVERS: RTCConfiguration = { iceServers: [] };

  /**
   * Whether to open the camera BEFORE gathering candidates.
   *
   * This is the probe's own hypothesis, and #194 does not state it. All three
   * engines switch mDNS obfuscation off for a document once camera permission
   * is granted (§5.2), and §5.3 says the fatal case is symmetric — both sides
   * obfuscating, neither able to resolve. A QR flow grants camera permission by
   * construction. So the ORDER of camera-grant and candidate-gathering decides
   * whether a peer sees a `.local` name or a real IP, which is exactly the
   * variable §5.3's "about half the time" is about. Both orderings are runnable
   * so the difference can be measured rather than argued.
   */
  let warmCameraFirst = $state(true);

  /** Compact carries #194 §4.2's extracted fields; full carries the browser's own SDP. */
  let signalling = $state<"compact" | "full">("compact");

  /**
   * How the description reaches the other device.
   *
   * #199 §2 made scan AND paste both first-class addressing modes, and they are
   * not equivalent here. Scanning opens a camera, and camera permission
   * switches mDNS obfuscation off in all three engines (#194 §5.2) — so a
   * scanned exchange hands both devices real IPs as a side effect of how the
   * code travelled. Pasting grants nothing, so both sides keep their
   * `<uuid>.local` names, which is precisely the symmetric case #194 §5.3 calls
   * fatal: neither can resolve the other, and with no STUN there is nothing to
   * fall back to.
   *
   * A scan-only probe cannot reach that case at all, because the answerer must
   * scan the offer before it can gather. Paste mode is the only way to test the
   * failure a shipped design would actually hit.
   */
  let addressing = $state<"scan" | "paste">("scan");

  /** The local description as a pasteable code, and the peer's as pasted in. */
  let outgoingCode = $state("");
  let incomingCode = $state("");
  let codeCopied = $state(false);

  let pc: RTCPeerConnection | null = null;
  let channel: RTCDataChannel | null = null;
  let census = $state<CandidateCensus | null>(null);
  let iceState = $state("");
  let connState = $state("");
  let selectedPair = $state("");
  let sdpSizes = $state({
    raw: 0,
    rawDeflated: 0,
    compact: 0,
    compactDeflated: 0,
  });
  let transferred = $state(0);
  let expectedBytes = $state(0);

  function newConnection() {
    pc?.close();
    pc = new RTCPeerConnection(NO_SERVERS);
    pc.oniceconnectionstatechange = () => {
      iceState = pc?.iceConnectionState ?? "";
      mark("ice", iceState);
      if (iceState === "failed")
        failure =
          "ICE failed with no STUN and no TURN — this is the wall #194 §5.3 names";
    };
    pc.onconnectionstatechange = () => {
      connState = pc?.connectionState ?? "";
      mark("pc", connState);
      if (connState === "connected") void readSelectedPair();
    };
    return pc;
  }

  /** What ICE actually chose, which is the difference between "it worked" and "how". */
  async function readSelectedPair() {
    if (!pc) return;
    const stats = await pc.getStats();
    let pair: any = null;
    const byId = new Map<string, any>();
    stats.forEach((r: any) => byId.set(r.id, r));
    stats.forEach((r: any) => {
      if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated)
        pair = r;
    });
    if (!pair) return;
    const local = byId.get(pair.localCandidateId);
    const remote = byId.get(pair.remoteCandidateId);
    selectedPair =
      `${local?.candidateType ?? "?"} ${local?.address ?? "?"} -> ` +
      `${remote?.candidateType ?? "?"} ${remote?.address ?? "?"}` +
      (pair.currentRoundTripTime
        ? ` (rtt ${Math.round(pair.currentRoundTripTime * 1000)} ms)`
        : "");
    log.fact("selected candidate pair", selectedPair);
    mark("candidate pair", selectedPair);
  }

  /** Half trickle, RFC 8838 §16: gather a full generation, then read one description. */
  function gatheringComplete(connection: RTCPeerConnection): Promise<void> {
    if (connection.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const check = () => {
        if (connection.iceGatheringState === "complete") {
          connection.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };
      connection.addEventListener("icegatheringstatechange", check);
    });
  }

  function describe(sdp: string): string {
    const compact = compactSdp(sdp);
    census = censusCandidates(compact.candidates);
    log.fact("host candidates", census.host);
    log.fact("mDNS host candidates", census.mdns);
    log.fact("literal-IP host candidates", census.literalIp);
    log.fact("srflx candidates", census.srflx);
    log.fact("relay candidates", census.relay);
    log.fact("camera granted before gathering", cameraGranted);
    log.fact("max-message-size the browser declared", compact.maxMessageSize);
    if (census.host === 0)
      failure =
        "no host candidates at all — RFC 8828 §7: a policy has suppressed them " +
        "and the LAN path is gone before the exchange starts";
    const encoded = JSON.stringify(compact);
    sdpSizes = {
      raw: new TextEncoder().encode(sdp).length,
      rawDeflated: 0,
      compact: new TextEncoder().encode(encoded).length,
      compactDeflated: 0,
    };
    return encoded;
  }

  async function showDescription(sdp: string, label: string) {
    const compactJson = describe(sdp);
    const chosen = signalling === "compact" ? compactJson : sdp;
    const bytes = await deflate(new TextEncoder().encode(chosen));
    sdpSizes = {
      ...sdpSizes,
      rawDeflated:
        signalling === "full"
          ? bytes.length
          : (await deflate(new TextEncoder().encode(sdp))).length,
      compactDeflated:
        signalling === "compact"
          ? bytes.length
          : (await deflate(new TextEncoder().encode(compactJson))).length,
    };
    log.fact("signalling encoding", signalling);
    log.fact("SDP raw bytes", sdpSizes.raw);
    log.fact("SDP deflated bytes", sdpSizes.rawDeflated);
    log.fact("compact record bytes", sdpSizes.compact);
    log.fact("compact deflated bytes", sdpSizes.compactDeflated);
    log.fact("addressing", addressing);
    outgoingCode = bytesToBase64(bytes);
    if (addressing === "paste") {
      symbols = [];
      frames = [];
      log.fact(`${label} code characters`, outgoingCode.length);
      mark(`${label} ready to paste`, `${outgoingCode.length} characters`);
      return;
    }
    frames = toFrames(bytes, symbolBytes, Math.floor(Math.random() * 0xffff));
    const rendered = [];
    for (const f of frames)
      rendered.push(await renderSymbol(f, ecLevel, encoding));
    symbols = rendered.map((r) => r.svg);
    symbolPixels = rendered[0]?.version ?? "";
    cursor = 0;
    startCycling();
    mark(`${label} shown`, `${bytes.length} B in ${frames.length} symbol(s)`);
  }

  /** Reads a description back off the camera, whichever encoding it was sent in. */
  /** Turns a carried description back into an SDP, whichever way it travelled. */
  async function applyDescription(
    label: string,
    bytes: Uint8Array,
    onSdp: (sdp: string) => void
  ) {
    const text = new TextDecoder().decode(await inflate(bytes));
    const sdp = text.startsWith("{")
      ? expandSdp(JSON.parse(text), label === "offer" ? "offer" : "answer")
      : text;
    mark(`${label} read`, `${bytes.length} B`);
    onSdp(sdp);
  }

  function scanDescription(label: string, onSdp: (sdp: string) => void) {
    const local = new Reassembler();
    mark(`scanning for ${label}`);
    scanLoop((bytes) => {
      const chunk = parseFrame(bytes);
      if (!chunk) return;
      const result = local.accept(chunk);
      received = {
        have: local.have(),
        total: local.expected(),
        missing: local.missing(),
      };
      if (result.kind !== "complete") return false;
      void applyDescription(label, result.payload, onSdp);
      return true;
    });
  }

  // The sending side: make the offer, show it, scan the answer, then push bytes.
  async function rtcOffer() {
    if (!payload) return;
    begin("offer: start");
    stopCamera();
    cameraGranted = false;
    incomingCode = "";
    // The ordering under test — see `warmCameraFirst`. In paste mode there is
    // no camera at any point, which is the whole reason paste mode exists: it
    // is the only way this probe reaches the symmetric-obfuscation case.
    if (addressing === "scan" && warmCameraFirst && !(await startCamera()))
      return;
    const connection = newConnection();
    channel = connection.createDataChannel("meal", { ordered: true });
    channel.binaryType = "arraybuffer";
    channel.onopen = () => {
      mark("data channel open");
      void sendPayload();
    };
    channel.onerror = (e: any) =>
      (failure = `data channel error: ${e?.error?.message ?? e}`);
    mark("creating offer");
    await connection.setLocalDescription(await connection.createOffer());
    await gatheringComplete(connection);
    mark("gathering complete");
    await showDescription(connection.localDescription!.sdp, "offer");
  }

  const takeAnswer = async (sdp: string) => {
    await pc!.setRemoteDescription({ type: "answer", sdp });
    mark("answer applied");
    stopCycling();
  };

  async function rtcScanAnswer() {
    if (!pc) return;
    mark("scanning the answer");
    if (!(await startCamera())) return;
    scanDescription("answer", takeAnswer);
  }

  async function rtcPasteAnswer() {
    if (!pc || !incomingCode.trim()) return;
    mark("pasting the answer");
    try {
      await applyDescription("answer", base64ToBytes(incomingCode), takeAnswer);
    } catch (e: any) {
      failure = `that answer code will not decode: ${e?.message ?? e}`;
    }
  }

  const CHUNK = 16 * 1024;

  async function sendPayload() {
    if (!channel || !payload) return;
    const bytes = await deflate(new TextEncoder().encode(payload.ndjson));
    expectedBytes = bytes.length;
    channel.send(JSON.stringify({ bytes: bytes.length }));
    mark(
      "sending",
      `${bytes.length} B in ${Math.ceil(bytes.length / CHUNK)} chunks`
    );
    channel.bufferedAmountLowThreshold = CHUNK * 4;
    let at = 0;
    while (at < bytes.length) {
      if (channel.bufferedAmount > CHUNK * 8) {
        await new Promise<void>((r) =>
          channel!.addEventListener("bufferedamountlow", () => r(), {
            once: true,
          })
        );
      }
      channel.send(bytes.subarray(at, at + CHUNK) as unknown as ArrayBuffer);
      at += CHUNK;
      transferred = at;
    }
    mark("sent", `${bytes.length} B`);
    log.fact("bytes sent", bytes.length);
  }

  // The receiving side: scan the offer, answer it, show that, then take bytes.
  async function rtcAnswer() {
    begin("answer: start");
    stopCamera();
    cameraGranted = false;
    transferred = 0;
    verdict = "";
    incomingCode = "";
    // Paste mode opens no camera, so this side gathers with mDNS obfuscation
    // still ON — which, together with the offerer doing the same, is the
    // symmetric case #194 §5.3 calls fatal.
    if (addressing === "scan" && !(await startCamera())) return;
    const connection = newConnection();
    const parts: Uint8Array[] = [];
    let want = 0;
    connection.ondatachannel = (ev) => {
      const ch = ev.channel;
      ch.binaryType = "arraybuffer";
      mark("data channel offered");
      ch.onopen = () => mark("data channel open");
      ch.onmessage = (m) => {
        if (typeof m.data === "string") {
          want = JSON.parse(m.data).bytes;
          expectedBytes = want;
          mark("incoming", `${want} B announced`);
          return;
        }
        parts.push(new Uint8Array(m.data));
        transferred = parts.reduce((n, p) => n + p.length, 0);
        if (want > 0 && transferred >= want) {
          const all = new Uint8Array(transferred);
          let at = 0;
          for (const p of parts) {
            all.set(p, at);
            at += p.length;
          }
          mark("transfer complete", `${transferred} B`);
          void settle(all, true);
        }
      };
    };
    takeOffer = async (sdp: string) => {
      await connection.setRemoteDescription({ type: "offer", sdp });
      mark("offer applied");
      await connection.setLocalDescription(await connection.createAnswer());
      await gatheringComplete(connection);
      mark("gathering complete");
      await showDescription(connection.localDescription!.sdp, "answer");
    };
    if (addressing === "scan") scanDescription("offer", takeOffer);
    else mark("waiting for a pasted offer");
  }

  /** Set by `rtcAnswer`, so a pasted offer reaches the same handler a scan does. */
  let takeOffer: ((sdp: string) => Promise<void>) | null = null;

  async function rtcPasteOffer() {
    if (!takeOffer || !incomingCode.trim()) return;
    mark("pasting the offer");
    try {
      await applyDescription("offer", base64ToBytes(incomingCode), takeOffer);
    } catch (e: any) {
      failure = `that offer code will not decode: ${e?.message ?? e}`;
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────

  let copied = $state(false);
  async function copyReport() {
    const text =
      log.report(`#198 probe — ${path}`) + (note ? `\n${note}\n` : "");
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      note = text;
    }
  }

  function home() {
    stopCamera();
    stopCycling();
    pc?.close();
    pc = null;
    channel = null;
    symbols = [];
    frames = [];
    census = null;
    verdict = "";
    failure = "";
    path = "menu";
  }
</script>

<div class="probe">
  <header>
    <h1>#198 — does a meal cross?</h1>
    <p>
      Two phones, no server between them. #194 said what the platform claims;
      this finds out what it does. Nothing here writes to the ledger.
    </p>
  </header>

  {#if failure}
    <p class="bad">{failure}</p>
  {/if}

  {#if path === "menu"}
    <section>
      <h2>1 · Build a meal to send</h2>
      <div class="row">
        {#each MEAL_SIZES as s (s.key)}
          <button
            class:on={size.key === s.key}
            onclick={() => {
              size = s;
              payload = null;
            }}
            >{s.label}<small
              >{s.foods} foods · #199 said {s.expectedRawKiB} KiB</small
            ></button
          >
        {/each}
      </div>
      <button class="go" onclick={build} disabled={building}>
        {building ? "building…" : "Build it"}
      </button>
      {#if payload}
        <dl class="facts">
          <dt>datoms</dt>
          <dd>{payload.lines}</dd>
          <dt>entities</dt>
          <dd>{payload.entities}</dd>
          <dt>raw</dt>
          <dd>{(payload.rawBytes / 1024).toFixed(1)} KiB</dd>
          <dt>deflated</dt>
          <dd>{(payload.deflatedBytes / 1024).toFixed(1)} KiB</dd>
          <dt>#199 said</dt>
          <dd>{size.expectedRawKiB} KiB raw</dd>
        </dl>
      {/if}
    </section>

    <section>
      <h2>2 · Settings both phones must match</h2>
      <label
        >bytes per symbol <input
          type="range"
          min="60"
          max="2900"
          step="20"
          bind:value={symbolBytes}
        />
        <b>{symbolBytes}</b></label
      >
      <label
        >symbol cycle <input
          type="range"
          min="120"
          max="1500"
          step="20"
          bind:value={frameMs}
        />
        <b>{frameMs} ms</b></label
      >
      <div class="row">
        {#each ["L", "M", "Q", "H"] as level (level)}
          <button
            class:on={ecLevel === level}
            onclick={() => (ecLevel = level as EcLevel)}>EC {level}</button
          >
        {/each}
      </div>
      <div class="row">
        <button
          class:on={encoding === "binary"}
          onclick={() => (encoding = "binary")}>binary bytes</button
        >
        <button
          class:on={encoding === "base64"}
          onclick={() => (encoding = "base64")}
          >base64 <small>+33% capacity</small></button
        >
      </div>
      <div class="row">
        <button
          class:on={addressing === "scan"}
          onclick={() => (addressing = "scan")}
          >scan the code <small>camera, mDNS off</small></button
        >
        <button
          class:on={addressing === "paste"}
          onclick={() => (addressing = "paste")}
          >paste the code <small>no camera, mDNS ON</small></button
        >
      </div>
      <div class="row">
        <button
          class:on={signalling === "compact"}
          onclick={() => (signalling = "compact")}
          >compact SDP <small>#194 §4.2 fields</small></button
        >
        <button
          class:on={signalling === "full"}
          onclick={() => (signalling = "full")}
          >full SDP <small>the browser's own</small></button
        >
      </div>
      <label class="check">
        <input type="checkbox" bind:checked={warmCameraFirst} />
        open the camera before gathering
        <small
          >camera permission switches mDNS obfuscation off in all three engines
          (#194 §5.2), so this decides whether the peer sees a <code
            >.local</code
          >
          name or a real IP</small
        >
      </label>
    </section>

    <section>
      <h2>3 · Pick a path</h2>
      <p class="hint">
        Cheapest first. Stop at the first that works, or the last that fails.
      </p>
      <div class="paths">
        <button
          class="go"
          disabled={!payload}
          onclick={() => {
            path = "qr-send";
            begin("qr send: start");
            void prepareChain();
          }}
        >
          QR only — send
        </button>
        <button
          class="go"
          onclick={() => {
            path = "qr-receive";
            void receiveChain();
          }}
        >
          QR only — receive
        </button>
        <button
          class="go"
          disabled={!payload}
          onclick={() => {
            path = "rtc-offer";
            void rtcOffer();
          }}
        >
          WebRTC — offer (sender)
        </button>
        <button
          class="go"
          onclick={() => {
            path = "rtc-answer";
            void rtcAnswer();
          }}
        >
          WebRTC — answer (receiver)
        </button>
      </div>
    </section>
  {:else}
    <button class="back" onclick={home}>&larr; back</button>

    {#if path === "qr-send" || path === "rtc-offer" || path === "rtc-answer"}
      {#if symbols.length > 0}
        <section class="stage">
          <div class="symbol">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html symbols[cursor]}
          </div>
          <p class="counter">
            symbol {cursor + 1} / {symbols.length} · {symbolPixels} modules · {ecLevel}
            · {encoding}
          </p>
          {#if frames.length > 1}
            <div class="row">
              <button onclick={() => (cycling ? stopCycling() : startCycling())}
                >{cycling ? "pause" : "cycle"}</button
              >
              <button
                onclick={() =>
                  (cursor = (cursor + symbols.length - 1) % symbols.length)}
                >prev</button
              >
              <button onclick={() => (cursor = (cursor + 1) % symbols.length)}
                >next</button
              >
            </div>
          {/if}
        </section>
      {/if}
    {/if}

    {#if path === "rtc-offer"}
      <section>
        <p class="hint">
          Show this to the other phone, then scan the answer it shows back. Both
          devices must show and both must read — RFC 8445 §7.2.2 keys a
          connectivity check on the peer's password and RFC 5763 §5 needs the
          peer's fingerprint, so a one-way code can never connect.
        </p>
        {#if addressing === "scan"}
          <button class="go" onclick={rtcScanAnswer}>Scan the answer</button>
        {:else}
          <button class="go" onclick={rtcPasteAnswer}
            >Apply the pasted answer</button
          >
        {/if}
      </section>
    {/if}

    {#if stream}
      <section class="stage">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} playsinline muted autoplay></video>
        <p class="counter">
          {#if !scanning}
            camera live, not decoding yet
          {:else if received.total > 0}
            {received.have} / {received.total} symbols · {scanAttempts} reads
            {#if received.missing.length > 0 && received.missing.length < 40}
              · missing {received.missing.join(", ")}
            {/if}
          {:else}
            {scanAttempts} reads, nothing of ours yet
          {/if}
        </p>
      </section>
    {/if}

    {#if addressing === "paste" && (path === "rtc-offer" || path === "rtc-answer")}
      <section>
        <h2>The code</h2>
        {#if outgoingCode}
          <p class="hint">Send this to the other device however you like.</p>
          <textarea readonly rows="3" value={outgoingCode}></textarea>
          <button
            onclick={async () => {
              await navigator.clipboard.writeText(outgoingCode);
              codeCopied = true;
              setTimeout(() => (codeCopied = false), 2000);
            }}
            >{codeCopied
              ? "copied"
              : `copy ${outgoingCode.length} characters`}</button
          >
        {/if}
        <p class="hint">Paste the other device's code here.</p>
        <textarea
          bind:value={incomingCode}
          rows="3"
          placeholder="paste the code"
        ></textarea>
        {#if path === "rtc-answer"}
          <button class="go" onclick={rtcPasteOffer}
            >Apply the pasted offer</button
          >
        {/if}
      </section>
    {/if}

    {#if census}
      <section>
        <h2>What ICE gathered</h2>
        <dl class="facts">
          <dt>host</dt>
          <dd>{census.host}</dd>
          <dt>· as mDNS name</dt>
          <dd>{census.mdns}</dd>
          <dt>· as literal IP</dt>
          <dd>{census.literalIp}</dd>
          <dt>srflx</dt>
          <dd>{census.srflx}</dd>
          <dt>relay</dt>
          <dd>{census.relay}</dd>
          <dt>camera first</dt>
          <dd>{cameraGranted ? "yes" : "no"}</dd>
        </dl>
        <ul class="addrs">
          {#each census.addresses as a (a)}<li>{a}</li>{/each}
        </ul>
        <dl class="facts">
          <dt>SDP raw</dt>
          <dd>{sdpSizes.raw} B</dd>
          <dt>SDP deflated</dt>
          <dd>{sdpSizes.rawDeflated} B</dd>
          <dt>compact record</dt>
          <dd>{sdpSizes.compact} B</dd>
          <dt>compact deflated</dt>
          <dd>{sdpSizes.compactDeflated} B</dd>
        </dl>
        <p class="hint">
          #194 §4.2 predicted 578–591 B for a browser offer and 384 B at the
          spec floor, reconstructed from source rather than captured. These are
          captured.
        </p>
      </section>
    {/if}

    {#if iceState || connState}
      <section>
        <dl class="facts">
          <dt>ice</dt>
          <dd>{iceState}</dd>
          <dt>connection</dt>
          <dd>{connState}</dd>
          {#if selectedPair}<dt>pair</dt>
            <dd>{selectedPair}</dd>{/if}
          {#if expectedBytes}<dt>transfer</dt>
            <dd>{transferred} / {expectedBytes} B</dd>{/if}
        </dl>
      </section>
    {/if}

    {#if verdict}
      <p class={verdict.startsWith("A MEAL CROSSED") ? "good" : "bad"}>
        {verdict}
      </p>
    {/if}

    <section>
      <h2>Timeline</h2>
      <table>
        <tbody>
          {#each timeline as m, i (i)}
            <tr
              ><td>{m.at.toFixed(0)} ms</td><td>{m.stage}</td><td
                >{m.detail ?? ""}</td
              ></tr
            >
          {/each}
        </tbody>
      </table>
      <textarea
        bind:value={note}
        rows="4"
        placeholder="How did it feel to hand someone a meal?"
      ></textarea>
      <button class="go" onclick={copyReport}
        >{copied ? "copied" : "Copy report"}</button
      >
    </section>
  {/if}
</div>

<style>
  .probe {
    font-family: var(--font-sans, system-ui);
    max-width: 44rem;
    margin: 0 auto;
    padding: var(--space-s);
    color: var(--ink);
    background: var(--paper);
    min-height: 100vh;
  }
  header {
    border-bottom: var(--edge-thick);
    padding-bottom: var(--space-2xs);
    margin-bottom: var(--space-s);
  }
  h1 {
    font-size: var(--step-2);
    margin: 0;
  }
  h2 {
    font-size: var(--step-0);
    margin: 0 0 var(--space-2xs);
  }
  p {
    margin: 0 0 var(--space-2xs);
  }
  section {
    border: var(--edge);
    padding: var(--space-2xs);
    margin-bottom: var(--space-s);
  }
  .row,
  .paths {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3xs);
    margin-bottom: var(--space-2xs);
  }
  .paths {
    flex-direction: column;
  }
  button {
    font: inherit;
    font-size: var(--step-n1);
    padding: var(--space-3xs) var(--space-2xs);
    border: var(--edge);
    background: var(--paper);
    color: var(--ink);
    border-radius: 0;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  button.on {
    background: var(--ink);
    color: var(--paper);
  }
  button.go {
    box-shadow: var(--shadow-1);
    font-weight: 700;
    align-items: center;
    width: 100%;
  }
  button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  button.back {
    box-shadow: none;
    width: auto;
    margin-bottom: var(--space-2xs);
  }
  small {
    font-size: var(--step-n3);
    opacity: 0.7;
    font-weight: 400;
  }
  label {
    display: block;
    font-size: var(--step-n1);
    margin-bottom: var(--space-2xs);
  }
  label.check small {
    display: block;
  }
  input[type="range"] {
    width: 60%;
    vertical-align: middle;
  }
  .facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0 var(--space-2xs);
    font-size: var(--step-n1);
    margin: 0 0 var(--space-2xs);
  }
  .facts dt {
    font-weight: 700;
  }
  .facts dd {
    margin: 0;
    font-family: var(--font-mono);
  }
  .stage {
    text-align: center;
  }
  .symbol :global(svg) {
    width: min(88vw, 30rem);
    height: auto;
    image-rendering: pixelated;
  }
  video {
    width: 100%;
    max-height: 60vh;
    border: var(--edge);
    background: var(--bg-input);
  }
  .counter {
    font-family: var(--font-mono);
    font-size: var(--step-n2);
  }
  .hint {
    font-size: var(--step-n2);
    opacity: 0.8;
  }
  .good,
  .bad {
    border: var(--edge);
    padding: var(--space-2xs);
    font-weight: 700;
    font-size: var(--step-n1);
  }
  .good {
    background: var(--green-bg);
  }
  .bad {
    background: var(--red-bg);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--step-n3);
    font-family: var(--font-mono);
  }
  td {
    border-bottom: var(--edge-thin);
    padding: 2px 4px;
    vertical-align: top;
  }
  .addrs {
    font-family: var(--font-mono);
    font-size: var(--step-n3);
    padding-left: var(--space-s);
    margin: 0 0 var(--space-2xs);
  }
  textarea {
    width: 100%;
    font: inherit;
    font-size: var(--step-n1);
    border: var(--edge);
    border-radius: 0;
    padding: var(--space-3xs);
    margin-bottom: var(--space-2xs);
  }
</style>
