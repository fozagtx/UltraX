<script lang="ts">
  let { label = "loading" }: { label?: string } = $props();
</script>

<span class="kinetic" role="status" aria-label={label}>
  <span class="bars" aria-hidden="true">
    {#each [0, 1, 2, 3, 4] as i (i)}
      <i style:animation-delay="{i * 90}ms"></i>
    {/each}
  </span>
  <span class="word mono">{label}</span>
</span>

<style>
  .kinetic {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--ink-3);
  }
  .bars {
    display: inline-flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }
  .bars i {
    width: 2.5px;
    height: 4px;
    border-radius: 1px;
    background: var(--accent);
    animation: bounce 0.9s ease-in-out infinite;
  }
  .word {
    font-size: 11.5px;
    letter-spacing: 0.04em;
  }
  @keyframes bounce {
    0%,
    100% {
      height: 4px;
      opacity: 0.5;
    }
    40% {
      height: 12px;
      opacity: 1;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bars i {
      animation: none;
      height: 8px;
      opacity: 0.7;
    }
  }
</style>
