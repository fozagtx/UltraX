<script lang="ts">
  import { onMount } from "svelte";

  let { text }: { text: string } = $props();
  let words = $derived(text.split(" "));
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
</script>

<span class="flip" aria-label={text}>
  {#each words as w, i (i)}
    <span
      class="w"
      class:in={mounted}
      style:transition-delay="{i * 60}ms"
      aria-hidden="true">{w}&nbsp;</span
    >
  {/each}
</span>

<style>
  .flip {
    display: inline;
    perspective: 600px;
  }
  .w {
    display: inline-block;
    transform-origin: 50% 100%;
    transform: rotateX(-88deg) translateY(0.35em);
    opacity: 0;
    transition:
      transform 0.55s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.4s ease-out;
    will-change: transform;
  }
  .w.in {
    transform: none;
    opacity: 1;
  }
  @media (prefers-reduced-motion: reduce) {
    .w {
      transform: none;
      opacity: 1;
      transition: none;
    }
  }
</style>
