<script lang="ts">
  let {
    value = $bindable(""),
    placeholder = "",
    type = "text",
    id = "",
    disabled = false,
    onkeydown,
    class: className = "",
  }: {
    value?: string;
    placeholder?: string;
    type?: "text" | "password" | "email" | "number";
    id?: string;
    disabled?: boolean;
    onkeydown?: (e: KeyboardEvent) => void;
    class?: string;
  } = $props();
</script>

<div class="input-wrapper {className}">
  <input
    {id}
    {type}
    {placeholder}
    bind:value
    {disabled}
    {onkeydown}
    class="input"
  />
  <div class="input-glow"></div>
</div>

<style>
  .input-wrapper {
    position: relative;
    display: inline-flex;
    width: 100%;
  }

  .input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: var(--space-2xs) var(--space-s);
    color: var(--text-primary);
    font-size: var(--step-n1);
    outline: none;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: inherit;
    position: relative;
    z-index: 1;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.2);
  }

  .input::placeholder {
    color: var(--text-muted);
    transition: opacity 0.2s;
  }

  .input:focus::placeholder {
    opacity: 0.5;
  }

  .input:hover:not(:disabled) {
    border-color: rgba(255, 255, 255, 0.15);
  }

  .input:focus {
    border-color: var(--accent);
    box-shadow:
      inset 0 2px 4px rgba(0, 0, 0, 0.2),
      0 0 0 2px var(--bg-base),
      0 0 0 4px var(--accent-glow);
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
