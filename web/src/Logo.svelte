<script lang="ts">
  let {
    symbol,
    size = 20,
    listed = true,
  }: { symbol: string; size?: number; listed?: boolean } = $props();

  const OKX_ICON = "https://static.okx.com/cdn/oksupport/asset/currency/icon";
  const FALLBACK_ICON = "https://financialmodelingprep.com/image-stock";

  let sources = $derived.by(() => {
    const s = symbol.trim();
    const base = /^X[A-Z0-9]{2,}$/.test(s) ? s.slice(1) : null;
    const list = [`${OKX_ICON}/${s.toLowerCase()}.png`];
    if (base) list.push(`${OKX_ICON}/${base.toLowerCase()}.png`);
    if (listed) list.push(`${FALLBACK_ICON}/${(base ?? s).toUpperCase()}.png`);
    return list;
  });
  let attempt = $state(0);
  let src = $derived(sources[attempt] ?? null);

  $effect(() => {
    symbol;
    attempt = 0;
  });
</script>

{#if src}
  <img
    class="logo"
    {src}
    alt=""
    width={size}
    height={size}
    loading="lazy"
    referrerpolicy="no-referrer"
    style:width="{size}px"
    style:height="{size}px"
    onerror={() => (attempt += 1)}
  />
{:else}
  <span class="logo mono-mark" style:width="{size}px" style:height="{size}px" style:font-size="{Math.round(size * 0.42)}px" aria-hidden="true">
    {symbol.slice(0, 2)}
  </span>
{/if}

<style>
  .logo {
    display: inline-grid;
    place-items: center;
    flex: none;
    border-radius: 999px;
    background: var(--panel-soft);
    box-shadow: 0 0 0 1px var(--line);
    object-fit: cover;
  }
  .mono-mark {
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--ink-2);
  }
</style>
