<script lang="ts">
  import { onMount } from "svelte";
  import {
    API_BASE,
    fetchCatalog,
    fetchHealth,
    fetchPayments,
    fetchPreview,
    type Catalog,
    type Health,
    type Payments,
    type Period,
    type Preview,
  } from "./api";
  import Logo from "./Logo.svelte";

  let health = $state<Health | null>(null);
  let preview = $state<Preview | null>(null);
  let catalog = $state<Catalog | null>(null);
  let payments = $state<Payments | null>(null);
  let error = $state<string | null>(null);
  let lastRefresh = $state<Date | null>(null);
  let dark = $state(false);
  let period = $state<Period>("daily");

  const EXPLORER = "https://www.okx.com/web3/explorer/xlayer";
  const PERIODS: { key: Period; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
  ];

  async function load() {
    const [h, pv, c, p] = await Promise.allSettled([
      fetchHealth(),
      fetchPreview(),
      fetchCatalog(),
      fetchPayments(),
    ]);
    if (h.status === "fulfilled") health = h.value;
    if (pv.status === "fulfilled") preview = pv.value;
    if (c.status === "fulfilled") catalog = c.value;
    if (p.status === "fulfilled") payments = p.value;
    const failed = [h, pv, c, p].filter((r) => r.status === "rejected");
    error =
      failed.length === 4
        ? `Cannot reach the service at ${API_BASE}`
        : failed.length
          ? `${failed.length} endpoint${failed.length > 1 ? "s" : ""} unavailable`
          : null;
    lastRefresh = new Date();
  }

  function toggleTheme() {
    dark = !dark;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("ultrax-theme", dark ? "dark" : "light");
  }

  onMount(() => {
    dark =
      localStorage.getItem("ultrax-theme") === "dark" ||
      (!localStorage.getItem("ultrax-theme") &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  });

  const usd = (n: number | null | undefined, digits = 2) =>
    n == null
      ? "—"
      : n.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });

  const price = (n: number | null | undefined) =>
    usd(n, n != null && Math.abs(n) < 1 ? 4 : 2);

  const compactUsd = (n: number | null | undefined) =>
    n == null
      ? "—"
      : n.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          notation: "compact",
          maximumFractionDigits: 1,
        });

  const fmtPct = (n: number | null | undefined) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

  const pctColor = (n: number | null | undefined) =>
    n == null || n === 0 ? "var(--ink-3)" : n > 0 ? "var(--ok)" : "var(--stop)";

  const rate = (n: number | null | undefined) =>
    n == null ? "—" : `${(n * 100).toFixed(1)}%`;

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  function ago(ts: number | string | null | undefined) {
    if (ts == null) return "—";
    const ms = Date.now() - new Date(ts).getTime();
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 48) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }

  function uptime(s: number) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }

  let runners = $derived(preview?.runners[period] ?? []);
  let cal = $derived(preview?.model.calibration[period] ?? null);
  let exampleBody = $derived(
    period === "daily"
      ? `{"period":"daily","direction":"up","limit":10}`
      : period === "weekly"
        ? `{"period":"weekly","direction":"up","limit":10}`
        : `{"period":"monthly","direction":"up","limit":10}`,
  );
</script>

<div class="frame">
<header class="topbar">
  <a class="brand" href="/">
    <span class="mark" aria-hidden="true"></span>
    <span>ultra<span class="dim">x</span></span>
  </a>
  <nav class="links">
    <a href="#runners">Runners</a>
    <a href="#preipo">Pre-IPO</a>
    <a href="#api">API</a>
    <a href="#payments">Payments</a>
    <a href={`${API_BASE}/catalog`} target="_blank" rel="noreferrer">Catalog <span class="arrow">↗</span></a>
  </nav>
  <div class="actions">
    <span class="kbd status" class:live={health?.status === "ok"} class:down={error && !health}>
      <i></i>
      {#if health}
        {health.network} · up {uptime(health.uptime)}
      {:else if error}
        offline
      {:else}
        connecting
      {/if}
    </span>
    <button class="icon-btn" onclick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
      {#if dark}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
      {/if}
    </button>
  </div>
</header>

<main>
  <section class="hero">
    <div class="hero-copy">
      <span class="eyebrow">OKX AI · A2MCP agent service · x402 on X Layer</span>
      <h1>Predictive intelligence for stocks on OKX.</h1>
      <p class="sub">
        Daily, weekly and monthly runners, per-stock signals and pre-IPO intelligence across every
        stock perpetual and xStock listed on OKX. Agents pay per call in <strong>USDT0</strong> and get
        calibrated scores, up-probabilities, positioning and valuation data.
      </p>
      <div class="hero-meta">
        <span class="chip" class:open={preview?.usMarket.open} class:closed={preview && !preview.usMarket.open}>
          <i></i>
          {#if preview}
            US market {preview.usMarket.open ? "open" : "closed"}
            {#if preview.usMarket.nextChange} · {preview.usMarket.open ? "closes" : "opens"} {new Date(preview.usMarket.nextChange).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}{/if}
          {:else}
            Market status…
          {/if}
        </span>
        {#if lastRefresh}
          <span class="chip muted">refreshed {ago(lastRefresh.getTime())}</span>
        {/if}
      </div>
      {#if error}
        <p class="error">{error}</p>
      {/if}
    </div>
    <aside class="promo">
      <div class="promo-head">
        <span class="promo-title">Universe</span>
        <span class="label accent">Live · OKX v5</span>
      </div>
      <dl class="counts">
        <div><dt>Stock perps</dt><dd>{health?.universe.ready ? health.universe.perps : "—"}</dd></div>
        <div><dt>xStocks</dt><dd>{health?.universe.ready ? health.universe.spots : "—"}</dd></div>
        <div><dt>Pre-IPO</dt><dd>{health?.universe.ready ? health.universe.preIpo : "—"}</dd></div>
      </dl>
      <a class="promo-link" href="https://web3.okx.com/ai/marketplace" target="_blank" rel="noreferrer">Open on OKX AI <span class="arrow">↗</span></a>
    </aside>
  </section>

  <section id="runners" class="block">
    <header class="block-head">
      <span class="num">01</span>
      <h2>Top runners</h2>
      <p class="lead">Biggest movers among OKX stock perps with at least $100K 24h volume.</p>
      <div class="seg" role="tablist" aria-label="Runner period">
        {#each PERIODS as p (p.key)}
          <button role="tab" aria-selected={period === p.key} class:on={period === p.key} onclick={() => (period = p.key)}>
            {p.label}
            <span class="count">{preview?.runners[p.key]?.length ?? 0}</span>
          </button>
        {/each}
      </div>
    </header>
    {#if runners.length}
      <ol class="list">
        {#each runners as r, i (r.symbol)}
          <li class="item runner">
            <span class="rank mono">{String(i + 1).padStart(2, "0")}</span>
            <Logo symbol={r.symbol} listed={!r.preIpo} />
            <span class="name">{r.symbol}</span>
            <span class="sep">·</span>
            <span class="meta">
              {#if r.preIpo}<span class="badge">Pre-IPO</span>{:else}<span class="mono">{r.symbol}-USDT-SWAP</span>{/if}
            </span>
            <span class="price mono">{price(r.last)}</span>
            <span class="ret" style:color={pctColor(r.returnPct)}>{fmtPct(r.returnPct)}</span>
          </li>
        {/each}
      </ol>
    {:else if preview}
      <p class="empty">No runners for this period yet.</p>
    {:else}
      <p class="empty">Loading runners…</p>
    {/if}
    <div class="calib">
      <span>Model <span class="mono">{preview?.model.name ?? "ultrax-momentum-v1"}</span> · walk-forward backtest on OKX history</span>
      <span>
        {#if cal}
          hit rate <strong>{rate(cal.hitRate)}</strong> · base up-rate {rate(cal.baseUpRate)} · {cal.samples.toLocaleString("en-US")} samples
        {:else}
          calibrating…
        {/if}
      </span>
    </div>
  </section>

  <section id="preipo" class="block">
    <header class="block-head">
      <span class="num">02</span>
      <h2>Pre-IPO contracts</h2>
      <p class="lead">Cash-settled perps tracking private-company valuations. No shares, votes or IPO allocation.</p>
    </header>
    {#if preview && preview.preIpo.length}
      <div class="grid">
        {#each preview.preIpo as c (c.symbol)}
          <article class="tile">
            <header>
              <Logo symbol={c.symbol} size={28} listed={false} />
              <div class="tile-name">
                <h3>{c.company ?? c.symbol}</h3>
                <span class="mono">{c.symbol}-USDT-SWAP</span>
              </div>
              <span class="delta" style:color={pctColor(c.change24hPct)}>{fmtPct(c.change24hPct)}</span>
            </header>
            <div class="big">{price(c.last)}</div>
            <div class="kv"><span>Implied valuation</span><strong>{compactUsd(c.impliedValuationUsd)}</strong></div>
          </article>
        {/each}
      </div>
    {:else if preview}
      <p class="empty">No pre-IPO contracts are live on OKX right now.</p>
    {:else}
      <p class="empty">Loading pre-IPO contracts…</p>
    {/if}
  </section>

  <section id="api" class="block">
    <header class="block-head">
      <span class="num">03</span>
      <h2>Call it from your agent</h2>
      <p class="lead">
        Unpaid requests answer <code>402</code> with a <code>PAYMENT-REQUIRED</code> header; missing inputs answer
        <code>400 input_required</code> before any payment.
      </p>
    </header>
    <pre>{`curl -s -X POST ${API_BASE}/runners \\
  -H 'content-type: application/json' \\
  -d '${exampleBody}'`}</pre>
    {#if catalog}
      <ul class="list">
        {#each catalog.endpoints.paid as e (e.path)}
          <li class="item endpoint">
            <span class="verb mono">{e.method}</span>
            <span class="name mono">{e.path}</span>
            <span class="sep desc">·</span>
            <span class="meta desc">{e.description}</span>
            <span class="price-pill">{e.priceUsd} USDT0</span>
          </li>
        {/each}
      </ul>
      <div class="tags">
        <span class="label">Free</span>
        {#each catalog.endpoints.free as e (e)}
          <span class="kbd">{e}</span>
        {/each}
      </div>
    {/if}
  </section>

  <section id="payments" class="block">
    <header class="block-head">
      <span class="num">04</span>
      <h2>Service payments</h2>
      <p class="lead">USDT0 received by the service wallet on X Layer.</p>
      <div class="stats">
        <span class="kbd"><strong>{payments?.count24h ?? "—"}</strong> calls / 24h</span>
        <span class="kbd"><strong>{payments ? usd(payments.totalUsd24h, 3) : "—"}</strong> earned / 24h</span>
      </div>
    </header>
    {#if payments?.warming}
      <p class="empty">Scanner is warming up — history is still being indexed.</p>
    {/if}
    {#if payments && payments.payments.length}
      <ul class="list">
        {#each payments.payments as p (p.txHash)}
          <li class="item pay">
            <span class="rank mono">{ago(p.timestamp)}</span>
            <span class="name mono">{short(p.from)}</span>
            <span class="sep">·</span>
            <a class="meta mono" href={`${EXPLORER}/tx/${p.txHash}`} target="_blank" rel="noreferrer">{short(p.txHash)} ↗</a>
            <span class="ret">{usd(p.amountUsd, 3)}</span>
          </li>
        {/each}
      </ul>
    {:else if payments}
      <p class="empty">No payments in the current scan window yet.</p>
    {/if}
    {#if payments?.payTo}
      <p class="payto">
        <span class="label">Pay-to</span>
        <a class="mono" href={`${EXPLORER}/address/${payments.payTo}`} target="_blank" rel="noreferrer">{payments.payTo}</a>
      </p>
    {/if}
  </section>
</main>

<footer>
  <span>{catalog?.disclaimer ?? "Information only, not investment advice."}</span>
  <span class="mono">Data: OKX public market API · updated {ago(preview?.updatedAt)}</span>
</footer>
</div>

<style>
  .frame {
    max-width: 1040px;
    margin: 0 auto;
    min-height: 100vh;
    border-left: 1px dashed var(--dash);
    border-right: 1px dashed var(--dash);
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 24px;
    background: color-mix(in srgb, var(--bg) 86%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px dashed var(--dash);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--display);
    font-size: 18px;
    letter-spacing: -0.01em;
  }
  .brand .dim {
    color: var(--ink-3);
  }
  .mark {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background:
      radial-gradient(circle at 30% 30%, #9fd3ff 0 18%, transparent 19%),
      conic-gradient(from 200deg, #1f7aa8, #6c8cff, #b8e1ff, #1f7aa8);
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  }
  .links {
    display: flex;
    gap: 2px;
  }
  .links a {
    padding: 5px 10px;
    border-radius: 8px;
    font-size: 13px;
    color: var(--ink-2);
    transition: background-color 0.15s ease, color 0.15s ease;
  }
  .links a:hover {
    background: var(--panel-soft);
    color: var(--ink);
  }
  .arrow {
    color: var(--ink-3);
    font-size: 11px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .kbd {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--panel-soft);
    box-shadow: inset 0 0 0 1px var(--line);
    font-family: var(--mono);
    font-size: 11.5px;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .kbd strong {
    color: var(--ink);
    font-weight: 500;
  }
  .status i,
  .chip i {
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: var(--ink-3);
  }
  .status.live i,
  .chip.open i {
    background: var(--ok);
  }
  .status.down i {
    background: var(--stop);
  }
  .chip.closed i {
    background: var(--caution);
  }
  .icon-btn {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--ink-2);
    cursor: pointer;
  }
  .icon-btn:hover {
    background: var(--panel-soft);
    color: var(--ink);
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    gap: 32px;
    align-items: start;
    padding: 48px 24px 40px;
    border-bottom: 1px dashed var(--dash);
  }
  .eyebrow,
  .label {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }
  .label.accent {
    color: var(--accent);
  }
  h1 {
    margin: 14px 0 12px;
    font-family: var(--display);
    font-weight: 500;
    font-size: clamp(32px, 5vw, 48px);
    line-height: 1.04;
    letter-spacing: -0.03em;
    max-width: 14ch;
  }
  .sub {
    margin: 0;
    max-width: 56ch;
    color: var(--ink-2);
    font-size: 15px;
  }
  .sub strong {
    color: var(--ink);
    font-weight: 600;
  }
  .hero-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 20px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--line);
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .chip.muted {
    color: var(--ink-3);
  }
  .error {
    margin: 14px 0 0;
    color: var(--stop);
    font-size: 13px;
  }

  .promo {
    padding: 16px 18px;
    border-radius: 14px;
    background: var(--tint);
  }
  .promo-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .promo-title {
    font-weight: 600;
  }
  .counts {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 14px 0;
  }
  .counts div {
    display: flex;
    flex-direction: column-reverse;
    gap: 2px;
  }
  .counts dt {
    font-size: 12px;
    color: var(--ink-2);
  }
  .counts dd {
    margin: 0;
    font-family: var(--display);
    font-size: 26px;
    letter-spacing: -0.02em;
  }
  .promo-link {
    font-size: 13px;
    font-weight: 500;
    color: var(--accent);
  }
  .promo-link .arrow {
    color: inherit;
  }

  .block {
    padding: 28px 24px 32px;
    border-bottom: 1px dashed var(--dash);
  }
  .block-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
    margin-bottom: 14px;
  }
  .num {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
  }
  h2 {
    margin: 0;
    font-family: var(--display);
    font-weight: 500;
    font-size: 17px;
    letter-spacing: -0.01em;
  }
  .lead {
    flex: 1 1 280px;
    margin: 0;
    color: var(--ink-3);
    font-size: 13.5px;
  }
  .lead code {
    color: var(--ink-2);
  }

  .seg {
    display: flex;
    gap: 2px;
    align-self: center;
  }
  .seg button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 5px 10px;
    border: 0;
    border-radius: 8px;
    background: transparent;
    font-size: 13px;
    color: var(--ink-2);
    cursor: pointer;
    transition: background-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
  }
  .seg button:hover {
    color: var(--ink);
  }
  .seg button.on {
    background: var(--panel);
    color: var(--ink);
    font-weight: 500;
    box-shadow: var(--shadow);
  }
  .count {
    font-family: var(--mono);
    font-size: 10.5px;
    color: var(--ink-3);
  }

  .list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    padding: 6px 8px;
    margin: 0 -8px;
    border-radius: 10px;
    transition: background-color 0.15s ease;
  }
  .item:hover {
    background: var(--panel-soft);
  }
  .rank {
    width: 22px;
    color: var(--ink-3);
    font-size: 11px;
  }
  .pay .rank {
    width: 64px;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
  }
  .sep {
    color: var(--ink-3);
  }
  .meta {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-3);
    font-size: 13px;
  }
  .meta.mono {
    font-size: 11.5px;
  }
  a.meta:hover {
    color: var(--ink);
  }
  .badge {
    padding: 1px 6px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--caution) 14%, transparent);
    color: var(--caution);
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .price {
    color: var(--ink-2);
    font-size: 12.5px;
  }
  .ret {
    width: 76px;
    text-align: right;
    font-weight: 600;
  }
  .calib {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 16px;
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px dashed var(--dash);
    font-size: 12px;
    color: var(--ink-3);
  }
  .calib strong {
    color: var(--ink);
    font-weight: 600;
  }
  .empty {
    margin: 8px 0;
    color: var(--ink-3);
    font-size: 13px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
  }
  .tile {
    padding: 14px 16px;
    border-radius: 14px;
    background: var(--panel-soft);
    box-shadow: inset 0 0 0 1px var(--line);
    transition: box-shadow 0.15s ease, background-color 0.15s ease;
  }
  .tile:hover {
    background: var(--panel);
    box-shadow: var(--shadow);
  }
  .tile header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .tile-name {
    flex: 1;
    min-width: 0;
  }
  .tile-name .mono {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink-3);
    font-size: 10.5px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .delta {
    font-size: 12px;
    font-weight: 600;
  }
  .big {
    margin: 14px 0 10px;
    font-family: var(--display);
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .kv {
    display: flex;
    justify-content: space-between;
    padding-top: 10px;
    border-top: 1px dashed var(--dash);
    font-size: 12.5px;
    color: var(--ink-3);
  }
  .kv strong {
    color: var(--ink);
    font-weight: 600;
  }

  pre {
    margin: 0 0 14px;
    padding: 14px 16px;
    border-radius: 12px;
    background: var(--panel-soft);
    box-shadow: inset 0 0 0 1px var(--line);
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.6;
    overflow-x: auto;
  }
  .verb {
    width: 38px;
    font-size: 10.5px;
    color: var(--accent);
  }
  .endpoint .name {
    font-weight: 500;
    font-size: 12.5px;
  }
  .price-pill {
    margin-left: auto;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--tint);
    color: var(--accent);
    font-family: var(--mono);
    font-size: 11.5px;
    white-space: nowrap;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 14px;
  }
  .tags .label {
    margin-right: 4px;
  }
  .stats {
    display: flex;
    gap: 6px;
    align-self: center;
  }
  .payto {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 14px 0 0;
    font-size: 12px;
    color: var(--ink-2);
    word-break: break-all;
  }
  .payto a:hover {
    color: var(--ink);
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 16px;
    padding: 20px 24px 28px;
    font-size: 12px;
    color: var(--ink-3);
  }

  @media (max-width: 820px) {
    .hero {
      grid-template-columns: 1fr;
    }
    .links {
      display: none;
    }
  }
  @media (max-width: 560px) {
    .topbar,
    .hero,
    .block,
    footer {
      padding-left: 16px;
      padding-right: 16px;
    }
    .hero {
      padding-top: 32px;
    }
    .desc,
    .runner .sep,
    .runner .meta .mono {
      display: none;
    }
    .seg {
      width: 100%;
    }
    .seg button {
      flex: 1;
      justify-content: center;
    }
    .item .meta {
      font-size: 11px;
    }
  }
</style>
