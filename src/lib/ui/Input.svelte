<script lang="ts">
  let {
    value = $bindable(""),
    placeholder = "",
    type = "text",
    id = "",
    disabled = false,
    inputmode = undefined,
    onkeydown,
    oninput,
    class: className = "",
  }: {
    value?: string;
    placeholder?: string;
    type?: "text" | "password" | "email" | "number";
    id?: string;
    disabled?: boolean;
    /** Hints the on-screen keyboard (e.g. "numeric" for a barcode → number pad). */
    inputmode?:
      | "none"
      | "text"
      | "tel"
      | "url"
      | "email"
      | "numeric"
      | "decimal"
      | "search";
    onkeydown?: (e: KeyboardEvent) => void;
    /**
     * Every way text lands in the field, which a `onkeydown` cannot see: a
     * paste from the platform's own menu fires no key event at all.
     */
    oninput?: (e: Event & { currentTarget: HTMLInputElement }) => void;
    class?: string;
  } = $props();
</script>

<div class="input-wrapper {className}">
  <input
    {id}
    {type}
    {placeholder}
    {inputmode}
    bind:value
    {disabled}
    {onkeydown}
    {oninput}
    class="input"
  />
</div>

<style>
  .input-wrapper {
    position: relative;
    display: inline-flex;
    width: 100%;
  }

  .input {
    width: 100%;
    background: transparent;
    border: var(--edge-thin);
    border-radius: var(--radius);
    padding: var(--space-2xs) var(--space-s);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: inherit;
    position: relative;
    z-index: 1;
  }

  .input::placeholder {
    color: var(--text-muted);
    transition: opacity 0.2s;
  }

  .input:focus::placeholder {
    opacity: 0.5;
  }

  .input:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.02);
  }

  .input:focus {
    border-color: var(--ink);
    box-shadow: 0 0 0 1px var(--ink);
    background: var(--paper);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
