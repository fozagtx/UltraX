<script lang="ts">
  import { onMount } from "svelte";

  let {
    values,
    positive,
    width = 96,
    height = 28,
  }: { values: number[]; positive: boolean; width?: number; height?: number } =
    $props();

  let pathEl = $state<SVGPathElement | null>(null);
  let drawn = $state(false);
  const pad = 3;
  const uid = Math.random().toString(36).slice(2, 8);

  function smoothPath(vals: number[], w: number, h: number) {
    if (vals.length === 0) return { line: "", area: "" };
    if (vals.length === 1) vals = [vals[0]!, vals[0]!];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const span = max - min || 1;
    const iw = w - pad * 2;
    const ih = h - pad * 2;
    const pts = vals.map((v, i) => [
      pad + (i / (vals.length - 1)) * iw,
      pad + ih - ((v - min) / span) * ih,
    ]);
    let line = `M${pts[0]![0].toFixed(2)},${pts[0]![1].toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1]!;
      const [x1, y1] = pts[i]!;
      const mx = (x0 + x1) / 2;
      line += ` Q${x0.toFixed(2)},${y0.toFixed(2)} ${mx.toFixed(2)},${((y0 + y1) / 2).toFixed(2)}`;
    }
    const [lx, ly] = pts[pts.length - 1]!;
    line += ` L${lx.toFixed(2)},${ly.toFixed(2)}`;
    const area = `${line} L${lx.toFixed(2)},${h} L${pts[0]![0].toFixed(2)},${h} Z`;
    return { line, area };
  }

  let paths = $derived(smoothPath(values, width, height));
  let color = $derived(positive ? "var(--ok)" : "var(--stop)");

  onMount(() => {
    if (!pathEl) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      drawn = true;
      return;
    }
    const len = pathEl.getTotalLength();
    pathEl.style.strokeDasharray = `${len}`;
    pathEl.style.strokeDashoffset = `${len}`;
    pathEl.getBoundingClientRect();
    pathEl.style.transition = "stroke-dashoffset 0.6s ease-out";
    pathEl.style.strokeDashoffset = "0";
    drawn = true;
  });
</script>

{#if values.length}
  <svg
    {width}
    {height}
    viewBox="0 0 {width} {height}"
    class="spark"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="sg-{uid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style:stop-color={color} stop-opacity="0.28" />
        <stop offset="1" style:stop-color={color} stop-opacity="0" />
      </linearGradient>
    </defs>
    <path d={paths.area} fill="url(#sg-{uid})" />
    <path
      bind:this={pathEl}
      d={paths.line}
      fill="none"
      style:stroke={color}
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
{/if}

<style>
  .spark {
    display: block;
    overflow: visible;
  }
</style>
