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
    border: 1px solid var(--border-accent);
    border-radius: 0;
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
    border-color: #000;
    box-shadow: 0 0 0 1px #000;
    background: #fff;
  }

  .input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
