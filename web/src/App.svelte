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

<div class="strip">
  Free teaser from <code>GET /preview</code>. Scores, probabilities and positioning are paid — this page
  never calls a paid endpoint.
</div>

<header class="nav">
  <a class="brand" href="/">
    <span class="mark"></span>
    UltraX
  </a>
  <nav class="links">
    <a href="#runners">Runners</a>
    <a href="#preipo">Pre-IPO</a>
    <a href="#api">API</a>
    <a href="#payments">Payments</a>
    <a href={`${API_BASE}/catalog`} target="_blank" rel="noreferrer">Catalog</a>
  </nav>
  <div class="actions">
    <span class="dot-status" class:live={health?.status === "ok"} class:down={error && !health}>
      <i></i>
      {#if health}
        {health.network} · up {uptime(health.uptime)}
      {:else if error}
        offline
      {:else}
        connecting
      {/if}
    </span>
    <a class="btn" href="https://web3.okx.com/ai/marketplace" target="_blank" rel="noreferrer">
      Open on OKX AI
    </a>
    <button class="theme" onclick={toggleTheme} aria-label="Toggle dark mode" title="Toggle dark mode">
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
    <div class="pill">OKX AI · A2MCP agent service · x402 on X Layer</div>
    <h1>Predictive intelligence<br class="desktop" /> for stocks on OKX.</h1>
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
      <span class="chip">
        <i class="okx" class:on={health?.universe.ready}></i>
        {#if health?.universe.ready}
          {health.universe.perps} stock perps · {health.universe.spots} xStocks · {health.universe.preIpo} pre-IPO
        {:else if health}
          Universe warming up…
        {:else}
          OKX universe…
        {/if}
      </span>
      {#if lastRefresh}
        <span class="chip muted">refreshed {ago(lastRefresh.getTime())}</span>
      {/if}
    </div>
    {#if error}
      <p class="error">{error}</p>
    {/if}
  </section>

  <section id="runners" class="card wide">
    <header class="row">
      <div>
        <h2>Top runners</h2>
        <p class="lead">Biggest movers among OKX stock perpetuals with at least $100K 24h volume.</p>
      </div>
      <div class="seg" role="tablist" aria-label="Runner period">
        {#each PERIODS as p (p.key)}
          <button role="tab" aria-selected={period === p.key} class:on={period === p.key} onclick={() => (period = p.key)}>
            {p.label}
          </button>
        {/each}
      </div>
    </header>
    {#if runners.length}
      <table>
        <thead><tr><th>#</th><th>Symbol</th><th class="r">Last</th><th class="r">Return</th></tr></thead>
        <tbody>
          {#each runners as r, i (r.symbol)}
            <tr>
              <td class="rank">{i + 1}</td>
              <td>
                <span class="sym">{r.symbol}</span>
                {#if r.preIpo}<span class="badge">Pre-IPO</span>{/if}
              </td>
              <td class="r">{price(r.last)}</td>
              <td class="r strong" style:color={pctColor(r.returnPct)}>{fmtPct(r.returnPct)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if preview}
      <p class="empty">No runners for this period yet.</p>
    {:else}
      <p class="empty">Loading runners…</p>
    {/if}
    <div class="calib">
      <span class="tiny">Model <span class="mono">{preview?.model.name ?? "ultrax-momentum-v1"}</span> · walk-forward backtest on OKX history</span>
      <span class="tiny">
        {#if cal}
          hit rate <strong>{rate(cal.hitRate)}</strong> · base up-rate {rate(cal.baseUpRate)} · {cal.samples.toLocaleString("en-US")} samples
        {:else}
          calibrating…
        {/if}
      </span>
    </div>
  </section>

  <section id="preipo" class="card wide">
    <header class="row">
      <div>
        <h2>Pre-IPO contracts</h2>
        <p class="lead">
          Cash-settled perpetuals tracking private-company valuations. No shares, votes or IPO allocation.
        </p>
      </div>
    </header>
    {#if preview && preview.preIpo.length}
      <div class="grid preipo">
        {#each preview.preIpo as c (c.symbol)}
          <article class="mini">
            <header>
              <div>
                <h3>{c.company ?? c.symbol}</h3>
                <span class="tiny mono">{c.symbol}-USDT-SWAP</span>
              </div>
              <span class="gap" style:color={pctColor(c.change24hPct)}>{fmtPct(c.change24hPct)}</span>
            </header>
            <div class="big">{price(c.last)}</div>
            <dl>
              <div><dt>Implied valuation</dt><dd>{compactUsd(c.impliedValuationUsd)}</dd></div>
            </dl>
          </article>
        {/each}
      </div>
    {:else if preview}
      <p class="empty">No pre-IPO contracts are live on OKX right now.</p>
    {:else}
      <p class="empty">Loading pre-IPO contracts…</p>
    {/if}
  </section>

  <section id="api" class="card wide code">
    <h2>Call it from your agent</h2>
    <p class="lead">
      Unpaid requests answer <code>402</code> with a <code>PAYMENT-REQUIRED</code> header; x402-aware
      clients pay and retry automatically. Missing inputs answer <code>400 input_required</code> before
      any payment.
    </p>
    <pre>{`curl -s -X POST ${API_BASE}/runners \\
  -H 'content-type: application/json' \\
  -d '${exampleBody}'`}</pre>
    {#if catalog}
      <table class="endpoints-table">
        <thead><tr><th>Endpoint</th><th class="desc">What it returns</th><th class="r">Price</th></tr></thead>
        <tbody>
          {#each catalog.endpoints.paid as e (e.path)}
            <tr>
              <td class="mono nowrap">{e.method} {e.path}</td>
              <td class="desc">{e.description}</td>
              <td class="r nowrap">{e.priceUsd} USDT0</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <div class="endpoints">
        {#each catalog.endpoints.free as e (e)}
          <span class="tag free">{e}</span>
        {/each}
      </div>
    {/if}
  </section>

  <section id="payments" class="card wide">
    <header class="row">
      <div>
        <h2>Service payments</h2>
        <p class="lead">USDT0 received by the service wallet on X Layer.</p>
      </div>
      <div class="stats">
        <div><span class="n">{payments?.count24h ?? "—"}</span><span class="tiny">calls / 24h</span></div>
        <div><span class="n">{payments ? usd(payments.totalUsd24h, 3) : "—"}</span><span class="tiny">earned / 24h</span></div>
      </div>
    </header>
    {#if payments?.warming}
      <p class="tiny">Scanner is warming up — history is still being indexed.</p>
    {/if}
    {#if payments && payments.payments.length}
      <table>
        <thead><tr><th>When</th><th>From</th><th>Amount</th><th>Tx</th></tr></thead>
        <tbody>
          {#each payments.payments as p (p.txHash)}
            <tr>
              <td>{ago(p.timestamp)}</td>
              <td class="mono">{short(p.from)}</td>
              <td>{usd(p.amountUsd, 3)}</td>
              <td><a class="mono" href={`${EXPLORER}/tx/${p.txHash}`} target="_blank" rel="noreferrer">{short(p.txHash)}</a></td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if payments}
      <p class="empty">No payments in the current scan window yet.</p>
    {/if}
    {#if payments?.payTo}
      <p class="tiny">
        Pay-to <a class="mono" href={`${EXPLORER}/address/${payments.payTo}`} target="_blank" rel="noreferrer">{payments.payTo}</a>
      </p>
    {/if}
  </section>
</main>

<footer>
  <span>{catalog?.disclaimer ?? "Information only, not investment advice."}</span>
  <span>Data: OKX public market API · updated {ago(preview?.updatedAt)}</span>
</footer>

<style>
  .strip {
    background: var(--ink);
    color: var(--bg);
    text-align: center;
    font-size: 12px;
    padding: 8px 16px;
  }
  .strip code {
    opacity: 0.8;
  }

  .nav {
    max-width: 1120px;
    margin: 0 auto;
    padding: 20px 24px 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
    letter-spacing: -0.01em;
  }
  .mark {
    width: 18px;
    height: 18px;
    border-radius: 6px;
    background: var(--ink);
    box-shadow: inset 0 0 0 5px var(--bg);
  }
  .links {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid var(--line);
    backdrop-filter: blur(8px);
  }
  :global([data-theme="dark"]) .links {
    background: rgba(255, 255, 255, 0.05);
  }
  .links a {
    padding: 6px 12px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--ink-2);
    transition: background 0.2s, color 0.2s;
  }
  .links a:hover {
    background: var(--panel);
    color: var(--ink);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .dot-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-size: 12px;
    color: var(--ink-2);
  }
  .dot-status i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .dot-status.live i {
    background: var(--ok);
    box-shadow: 0 0 0 4px rgba(22, 163, 74, 0.18);
  }
  .dot-status.down i {
    background: var(--stop);
  }
  .btn {
    background: var(--ink);
    color: var(--bg);
    padding: 9px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    transition: transform 0.2s ease, opacity 0.2s;
  }
  .btn:hover {
    transform: translateY(-1px);
    opacity: 0.9;
  }
  .theme {
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--panel);
    cursor: pointer;
  }

  main {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 24px 64px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .hero {
    text-align: center;
    padding: 88px 0 48px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
  }
  .pill {
    font-size: 12px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-2);
  }
  h1 {
    font-size: clamp(38px, 6vw, 68px);
    line-height: 1.02;
    letter-spacing: -0.035em;
    font-weight: 600;
    margin: 0;
  }
  .sub {
    max-width: 620px;
    margin: 0;
    color: var(--ink-2);
    font-size: 17px;
    line-height: 1.5;
  }
  .sub strong {
    color: var(--ink);
    font-weight: 600;
  }
  .hero-meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
    margin-top: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 999px;
    background: var(--panel);
    border: 1px solid var(--line);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
  }
  .chip.muted {
    color: var(--ink-3);
  }
  .chip i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ink-3);
  }
  .chip.open i {
    background: var(--ok);
  }
  .chip.closed i {
    background: var(--caution);
  }
  .chip i.okx.on {
    background: var(--ok);
  }
  .error {
    color: var(--stop);
    font-size: 13px;
    margin: 0;
  }

  .grid {
    display: grid;
    gap: 20px;
  }
  @media (max-width: 860px) {
    .links {
      display: none;
    }
  }
  @media (max-width: 640px) {
    .strip {
      font-size: 11px;
      padding: 8px 12px;
    }
    .nav {
      padding: 14px 16px 0;
      gap: 10px;
    }
    .brand {
      font-size: 14px;
      white-space: nowrap;
    }
    .dot-status {
      font-size: 0;
    }
    .dot-status i {
      width: 9px;
      height: 9px;
    }
    .btn {
      padding: 8px 12px;
      font-size: 12px;
      white-space: nowrap;
    }
    .actions {
      gap: 8px;
    }
    main {
      padding: 0 16px 48px;
      gap: 14px;
    }
    .hero {
      padding: 48px 0 28px;
      gap: 14px;
    }
    .desktop {
      display: none;
    }
    .sub {
      font-size: 15px;
    }
    .chip {
      font-size: 12px;
      padding: 7px 12px;
    }
    .card {
      padding: 20px;
      border-radius: 18px;
    }
    .card:hover {
      transform: none;
    }
    .big {
      font-size: 34px;
    }
    .wide .row {
      flex-direction: column;
      gap: 14px;
    }
    .stats {
      width: 100%;
      justify-content: flex-start;
    }
    .stats div {
      align-items: flex-start;
    }
    .n {
      font-size: 24px;
    }
    table {
      display: block;
      overflow-x: auto;
      white-space: nowrap;
      font-size: 12px;
    }
    td,
    th {
      padding-right: 14px;
    }
    pre {
      font-size: 12px;
      padding: 14px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    footer {
      padding: 0 16px 32px;
      flex-direction: column;
    }
  }

  .card {
    background: var(--panel);
    border-radius: var(--radius);
    border: 1px solid var(--line);
    box-shadow: var(--shadow);
    padding: 28px;
    transition: transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.35s;
  }
  .card:hover {
    transform: translateY(-2px);
  }
  .card h2 {
    margin: 0 0 4px;
    font-size: 20px;
    letter-spacing: -0.02em;
    font-weight: 600;
  }
  .card h3 {
    margin: 0;
    font-size: 22px;
    letter-spacing: -0.02em;
    font-weight: 600;
  }
  .lead {
    margin: 0 0 18px;
    color: var(--ink-3);
    font-size: 14px;
  }
  .tiny {
    font-size: 12px;
    color: var(--ink-3);
  }

  .big {
    font-size: 40px;
    font-weight: 600;
    letter-spacing: -0.03em;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  dl {
    margin: 22px 0 0;
    display: grid;
    gap: 10px;
  }
  dl div {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  dt {
    color: var(--ink-3);
  }
  dd {
    margin: 0;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }


  .wide .row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 24px;
    flex-wrap: wrap;
  }
  .stats {
    display: flex;
    gap: 28px;
  }
  .stats div {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
  }
  .n {
    font-size: 28px;
    font-weight: 600;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    margin-top: 8px;
  }
  th {
    text-align: left;
    font-weight: 500;
    color: var(--ink-3);
    font-size: 12px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  td {
    padding: 12px 0;
    border-bottom: 1px solid var(--line);
    font-variant-numeric: tabular-nums;
  }
  td a:hover {
    text-decoration: underline;
  }
  .empty {
    margin: 8px 0 0;
    padding: 28px;
    text-align: center;
    color: var(--ink-3);
    background: var(--panel-soft);
    border-radius: 14px;
    font-size: 14px;
  }
  .wide .tiny {
    margin: 14px 0 0;
    word-break: break-all;
  }

  pre {
    margin: 0 0 16px;
    padding: 18px 20px;
    border-radius: 14px;
    background: var(--ink);
    color: var(--bg);
    font-size: 13px;
    line-height: 1.55;
    overflow-x: auto;
  }
  .endpoints {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .tag {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 999px;
    background: var(--panel-soft);
    border: 1px solid var(--line);
  }

  footer {
    max-width: 1120px;
    margin: 0 auto;
    padding: 0 24px 40px;
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    font-size: 12px;
    color: var(--ink-3);
  }

  #runners,
  #preipo,
  #api {
    margin-bottom: 20px;
  }
  .seg {
    display: inline-flex;
    padding: 4px;
    gap: 2px;
    border-radius: 999px;
    background: var(--panel-soft);
    border: 1px solid var(--line);
  }
  .seg button {
    border: 0;
    background: transparent;
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 13px;
    color: var(--ink-2);
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
  }
  .seg button.on {
    background: var(--panel);
    color: var(--ink);
    box-shadow: 0 1px 2px rgba(15, 17, 22, 0.08);
  }
  .r {
    text-align: right;
  }
  .strong {
    font-weight: 600;
  }
  .rank {
    width: 36px;
    color: var(--ink-3);
  }
  .sym {
    font-weight: 600;
  }
  .badge {
    margin-left: 8px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    padding: 3px 8px;
    border-radius: 999px;
    color: var(--caution);
    background: color-mix(in srgb, var(--caution) 12%, transparent);
  }
  .calib {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 16px;
  }
  .calib .tiny {
    margin: 0;
  }
  .preipo {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }
  .mini {
    padding: 20px;
    border-radius: 16px;
    background: var(--panel-soft);
    border: 1px solid var(--line);
  }
  .mini header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 16px;
  }
  .mini h3 {
    font-size: 18px;
  }
  .mini header > div {
    min-width: 0;
  }
  .mini header .mono {
    display: block;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .mini .big {
    font-size: 30px;
  }
  .mini .gap {
    font-size: 12px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--panel);
  }
  .endpoints-table {
    margin-bottom: 16px;
  }
  .endpoints-table .desc {
    color: var(--ink-2);
    padding-right: 16px;
  }
  #runners td + td,
  #runners th + th {
    padding-left: 12px;
  }
  .nowrap {
    white-space: nowrap;
    padding-right: 16px;
  }
  @media (max-width: 640px) {
    .endpoints-table .desc {
      display: none;
    }
  }
</style>
