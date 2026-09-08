<script lang="ts">
  import { onMount } from "svelte";
  import Button from "../../ui/Button.svelte";
  import Input from "../../ui/Input.svelte";
  import { codeDetector, type CodeDetector } from "../../p2p/code-camera";
  import { readPairingCode, type PairingCode } from "../../p2p/pairing-code";
  import { RoomCodeError } from "../../p2p/room-code";

  // The other half of the act: reading the code the first device is showing
  // (ADR-0096 §8).
  //
  // **Two carriers, and capability decides only what is offered.** The live
  // camera is the platform's own `BarcodeDetector` and nothing else — there is
  // none on any iPhone and none on desktop Firefox — so the field below is not
  // a fallback for a failure but the second carrier, always present and always
  // usable. Which one the person uses is theirs to choose.
  //
  // **It is not Scan.** Rations' way in reads a barcode and a Send code and is
  // reached from the food screen; this reads a Pairing code and refuses both of
  // those, which is why it has its own control and its own words rather than
  // borrowing that one (`CONTEXT.md`, Pairing).
  let { oncode }: { oncode: (code: PairingCode) => void } = $props();

  let video = $state<HTMLVideoElement | null>(null);
  /** What the last read was not, over the preview or under the field. */
  let refused = $state("");
  let typed = $state("");

  // Read once: whether this platform has a detector does not change while the
  // section is open, and asking again per frame would construct one per frame.
  // svelte-ignore state_referenced_locally
  const detector = codeDetector();

  let stream: MediaStream | null = null;
  let frame: number | null = null;
  let reading = false;

  onMount(() => {
    if (detector) void startCamera(detector);
    return () => stopCamera();
  });

  async function startCamera(reader: CodeDetector) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
    } catch {
      // Denied, or no camera on a device whose browser has a detector. The
      // field below is a whole carrier rather than a consolation, so this says
      // nothing and leaves the person with the one that works.
      return;
    }
    if (!video) return;
    video.srcObject = stream;
    void video.play();
    reading = true;
    frame = requestAnimationFrame(() => void readFrame(reader));
  }

  async function readFrame(reader: CodeDetector) {
    if (!reading || !video) return;
    if (video.readyState >= 2) {
      try {
        for (const seen of await reader.detect(video)) {
          if (took(seen.rawValue)) return;
        }
      } catch {
        // An unreadable frame is a non-decode rather than an error: the person's
        // next act is to move the phone, and the next frame is already coming.
      }
    }
    if (reading) frame = requestAnimationFrame(() => void readFrame(reader));
  }

  /**
   * One decode or one paste, read for what it turned out to be.
   *
   * Three answers, and the middle one is why this is not a boolean: a code that
   * is not a Pairing code at all is what a camera mostly sees and is said
   * nothing about, while a Pairing code that is broken is worth a line.
   */
  function took(raw: string): boolean {
    let code: PairingCode | null;
    try {
      code = readPairingCode(raw);
    } catch (broken) {
      refused =
        broken instanceof RoomCodeError
          ? "That is a pairing code, and it is damaged. Show a new one."
          : "That could not be read.";
      return false;
    }
    if (!code) return false;
    stopCamera();
    oncode(code);
    return true;
  }

  function stopCamera() {
    reading = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
  }

  function readTyped() {
    if (!took(typed.trim())) {
      refused ||= "That is not a pairing code.";
    }
  }
</script>

<div class="reader" data-testid="pairing-reader">
  {#if detector}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class="preview" playsinline muted autoplay></video>
    <p class="say">Point this at the code on your other device.</p>
  {/if}

  <label class="field">
    <span class="label">Or paste the code</span>
    <Input
      bind:value={typed}
      placeholder="inventoria-pair …"
      oninput={() => (refused = "")}
    />
  </label>
  <Button variant="secondary" onclick={readTyped} disabled={!typed.trim()}>
    Use this code
  </Button>

  {#if refused}
    <p class="refused" role="status">{refused}</p>
  {/if}
</div>

<style>
  .reader {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2xs);
  }
  .preview {
    width: 100%;
    /* The symbol being read is square and held up at arm's length, so a square
       preview shows the whole of it without the person having to aim. */
    aspect-ratio: 1;
    object-fit: cover;
    background: var(--ink);
    border: var(--edge);
    box-shadow: var(--shadow-2);
  }
  .say {
    margin: 0;
    text-align: center;
    font-weight: 700;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3xs);
  }
  .label {
    font-size: var(--step-n2);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary);
  }
  .refused {
    margin: 0;
    font-size: var(--step-n2);
    color: var(--text-secondary);
  }
</style>
