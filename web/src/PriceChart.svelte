<script lang="ts">
  import { untrack } from "svelte";
  import { tweened } from "svelte/motion";
  import { cubicOut } from "svelte/easing";
  import Logo from "./Logo.svelte";

  let {
    symbol,
    last,
    returnPct,
    closes,
    preIpo,
    periodLabel,
  }: {
    symbol: string;
    last: number | null;
    returnPct: number | null;
    closes: number[];
    preIpo: boolean;
    periodLabel: string;
  } = $props();

  const W = 560;
  const H = 200;
  const padX = 8;
  const padY = 14;
  const N = 30;
  const uid = Math.random().toString(36).slice(2, 8);

  function resample(vals: number[]): number[] {
    if (vals.length === 0) return [];
    if (vals.length === 1) return Array(N).fill(vals[0]);
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * (vals.length - 1);
      const lo = Math.floor(t);
      const hi = Math.min(vals.length - 1, lo + 1);
      out.push(vals[lo]! + (vals[hi]! - vals[lo]!) * (t - lo));
    }
    return out;
  }

  const reduced =
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;
  const shown = tweened<number[]>(untrack(() => resample(closes)), {
    duration: reduced ? 0 : 450,
    easing: cubicOut,
  });

  $effect(() => {
    shown.set(resample(closes));
  });

  let hover = $state<number | null>(null);

  let min = $derived(closes.length ? Math.min(...closes) : 0);
  let max = $derived(closes.length ? Math.max(...closes) : 0);
  let span = $derived(max - min || 1);

  function xy(vals: number[], i: number): [number, number] {
    return [
      padX + (i / (vals.length - 1 || 1)) * (W - padX * 2),
      padY + (H - padY * 2) * (1 - (vals[i]! - min) / span),
    ];
  }

  function linePath(vals: number[]): string {
    if (vals.length < 2) return "";
    let d = `M${xy(vals, 0).map((v) => v.toFixed(2)).join(",")}`;
    for (let i = 1; i < vals.length; i++) {
      const [x0, y0] = xy(vals, i - 1);
      const [x1, y1] = xy(vals, i);
      d += ` Q${x0.toFixed(2)},${y0.toFixed(2)} ${((x0 + x1) / 2).toFixed(2)},${((y0 + y1) / 2).toFixed(2)}`;
    }
    const [lx, ly] = xy(vals, vals.length - 1);
    return d + ` L${lx.toFixed(2)},${ly.toFixed(2)}`;
  }

  let line = $derived(linePath($shown));
  let area = $derived(
    line
      ? `${line} L${xy($shown, $shown.length - 1)[0].toFixed(2)},${H - padY} L${xy($shown, 0)[0].toFixed(2)},${H - padY} Z`
      : "",
  );

  let minIdx = $derived(closes.indexOf(min));
  let maxIdx = $derived(closes.indexOf(max));
  let minPt = $derived($shown.length ? xy($shown, Math.min(minIdx, $shown.length - 1)) : [0, 0]);
  let maxPt = $derived($shown.length ? xy($shown, Math.min(maxIdx, $shown.length - 1)) : [0, 0]);
  let hoverPt = $derived(
    hover !== null && $shown.length ? xy($shown, hover) : null,
  );

  let positive = $derived((returnPct ?? 0) >= 0);
  let accent = $derived(positive ? "var(--ok)" : "var(--stop)");

  function onMove(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const idx = Math.round(
      ((x - padX) / (W - padX * 2)) * (($shown.length || 1) - 1),
    );
    hover = Math.max(0, Math.min(($shown.length || 1) - 1, idx));
  }

  const price = (n: number | null | undefined) =>
    n == null
      ? "—"
      : n.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: n != null && Math.abs(n) < 1 ? 4 : 2,
          maximumFractionDigits: n != null && Math.abs(n) < 1 ? 4 : 2,
        });
  const fmtPct = (n: number | null | undefined) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
</script>

<div class="chart-card">
  <header class="chart-head">
    <Logo {symbol} size={26} listed={!preIpo} />
    <div class="chart-id">
      <strong>{symbol}</strong>
      <span class="mono sub-id">{symbol}-USDT-SWAP · {periodLabel}</span>
    </div>
    <div class="chart-nums">
      <span class="last mono">{hover !== null && closes[hover] != null ? price(closes[hover]) : price(last)}</span>
      <span class="ret mono" class:up={positive} class:dn={!positive}>{fmtPct(returnPct)}</span>
    </div>
  </header>
  {#if closes.length}
    <svg
      class="chart"
      viewBox="0 0 {W} {H}"
      preserveAspectRatio="none"
      role="img"
      aria-label="30 day price chart for {symbol}"
      onpointermove={onMove}
      onpointerleave={() => (hover = null)}
    >
      <defs>
        <linearGradient id="pc-{uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style:stop-color={accent} stop-opacity="0.22" />
          <stop offset="1" style:stop-color={accent} stop-opacity="0" />
        </linearGradient>
      </defs>
      {#each [0.25, 0.5, 0.75] as g (g)}
        <line
          x1={padX}
          x2={W - padX}
          y1={padY + (H - padY * 2) * g}
          y2={padY + (H - padY * 2) * g}
          class="grid"
        />
      {/each}
      <path d={area} fill="url(#pc-{uid})" />
      <path
        d={line}
        fill="none"
        style:stroke={accent}
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
      <circle cx={maxPt[0]} cy={maxPt[1]} r="3" class="extreme" style:fill={accent} />
      <circle cx={minPt[0]} cy={minPt[1]} r="3" class="extreme" style:fill={accent} />
      <text x={Math.min(Math.max(maxPt[0], 40), W - 40)} y={Math.max(maxPt[1] - 8, 10)} class="lbl">{price(max)}</text>
      <text x={Math.min(Math.max(minPt[0], 40), W - 40)} y={Math.min(minPt[1] + 16, H - 4)} class="lbl">{price(min)}</text>
      {#if hoverPt && hover !== null}
        <line x1={hoverPt[0]} x2={hoverPt[0]} y1={padY} y2={H - padY} class="cross" />
        <circle cx={hoverPt[0]} cy={hoverPt[1]} r="4" class="dot" style:fill={accent} />
        <text
          x={Math.min(Math.max(hoverPt[0], 44), W - 44)}
          y={Math.max(hoverPt[1] - 10, 12)}
          class="lbl hover-lbl"
        >{price(closes[hover] ?? $shown[hover])}</text>
      {/if}
    </svg>
    <div class="axis mono">
      <span>30d ago</span>
      <span>today</span>
    </div>
  {:else}
    <div class="chart empty-chart">
      <span class="mono">no series for {symbol}</span>
    </div>
  {/if}
</div>

<style>
  .chart-card {
    padding: 16px 18px 12px;
    border-radius: 14px;
    background: var(--panel-soft);
    box-shadow: inset 0 0 0 1px var(--line);
    margin-bottom: 14px;
  }
  .chart-head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .chart-id {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  .chart-id strong {
    font-size: 14px;
  }
  .sub-id {
    color: var(--ink-3);
    font-size: 10.5px;
  }
  .chart-nums {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .last {
    font-family: var(--display);
    font-size: 22px;
    letter-spacing: -0.02em;
  }
  .ret {
    font-size: 12.5px;
    font-weight: 600;
  }
  .ret.up {
    color: var(--ok);
  }
  .ret.dn {
    color: var(--stop);
  }
  .chart {
    display: block;
    width: 100%;
    height: 200px;
    margin-top: 10px;
    cursor: crosshair;
    touch-action: pan-y;
  }
  .grid {
    stroke: var(--line);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    vector-effect: non-scaling-stroke;
  }
  .lbl {
    fill: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    text-anchor: middle;
  }
  .hover-lbl {
    fill: var(--ink);
    font-weight: 600;
  }
  .extreme {
    opacity: 0.9;
  }
  .cross {
    stroke: var(--ink-3);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  .dot {
    stroke: var(--bg);
    stroke-width: 1.5;
  }
  .axis {
    display: flex;
    justify-content: space-between;
    padding: 2px 8px 0;
    color: var(--ink-3);
    font-size: 10px;
  }
  .empty-chart {
    display: grid;
    place-items: center;
    color: var(--ink-3);
    font-size: 12px;
    cursor: default;
  }
</style>
