<script lang="ts">
  import { onMount } from "svelte";
  import {
    API_BASE,
    fetchCatalog,
    fetchHealth,
    fetchPayments,
    fetchStatus,
    type Catalog,
    type Health,
    type Payments,
    type Status,
  } from "./api";

  let health = $state<Health | null>(null);
  let status = $state<Status | null>(null);
  let catalog = $state<Catalog | null>(null);
  let payments = $state<Payments | null>(null);
  let error = $state<string | null>(null);
  let lastRefresh = $state<Date | null>(null);
  let dark = $state(false);

  const EXPLORER = "https://www.okx.com/web3/explorer/xlayer";

  async function load() {
    const [h, s, c, p] = await Promise.allSettled([
      fetchHealth(),
      fetchStatus(),
      fetchCatalog(),
      fetchPayments(),
    ]);
    if (h.status === "fulfilled") health = h.value;
    if (s.status === "fulfilled") status = s.value;
    if (c.status === "fulfilled") catalog = c.value;
    if (p.status === "fulfilled") payments = p.value;
    const failed = [h, s, c, p].filter((r) => r.status === "rejected");
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
    localStorage.setItem("kwyh-theme", dark ? "dark" : "light");
  }

  onMount(() => {
    dark =
      localStorage.getItem("kwyh-theme") === "dark" ||
      (!localStorage.getItem("kwyh-theme") &&
        matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  });

  const usd = (n: number | null, digits = 2) =>
    n == null
      ? "—"
      : n.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });

  const gapPct = (a: number | null, b: number | null) =>
    a == null || b == null || b === 0 ? null : ((a - b) / b) * 100;

  const fmtPct = (n: number | null) =>
    n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

  const short = (addr: string) => `${addr.slice(0, 6)}…${addr.slice(-4)}`;

  function ago(ts: number | string | null) {
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

  const verdictColor: Record<string, string> = {
    OK: "var(--ok)",
    CAUTION: "var(--caution)",
    STOP: "var(--stop)",
  };
</script>

<div class="strip">
  Free, read-only view of the service. The paid <code>POST /check</code> is
  never called from this page.
</div>

<header class="nav">
  <a class="brand" href="/">
    <span class="mark"></span>
    Know What You Hold
  </a>
  <nav class="links">
    <a href="#tokens">Tokens</a>
    <a href="#rules">Rules</a>
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
    <div class="pill">
      OKX AI · A2MCP agent service · X Layer
    </div>
    <h1>Know what you hold<br class="desktop" /> before you trade it.</h1>
    <p class="sub">
      A pre-trade check for tokenized stocks on X Layer. Agents pay
      <strong>{catalog?.fee ?? "0.005"} USDT0</strong> per call and get a rule-based
      OK / CAUTION / STOP with live reference prices, market status and token rights.
    </p>
    <div class="hero-meta">
      <span class="chip" class:open={status?.marketOpen} class:closed={status && !status.marketOpen}>
        <i></i>
        {#if status}
          NYSE {status.marketOpen ? "open" : "closed"}
          {#if status.nextChange} · {status.marketOpen ? "closes" : "opens"} {new Date(status.nextChange).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}{/if}
        {:else}
          Market status…
        {/if}
      </span>
      <span class="chip">
        <i class="okx" class:on={health?.okxConfigured}></i>
        OKX data {health ? (health.okxConfigured ? "connected" : "public only") : "…"}
      </span>
      {#if lastRefresh}
        <span class="chip muted">refreshed {ago(lastRefresh.getTime())}</span>
      {/if}
    </div>
    {#if error}
      <p class="error">{error}</p>
    {/if}
  </section>

  <section id="tokens" class="grid tokens">
    {#each catalog?.tokens ?? [{ ticker: "NVDAx" }, { ticker: "TSLAx" }, { ticker: "AAPLx" }] as t (t.ticker)}
      {@const row = status?.tokens.find((x) => x.ticker === t.ticker)}
      {@const gap = gapPct(row?.okxExchange ?? null, row?.realStock ?? null)}
      <article class="card token">
        <header>
          <div>
            <h3>{t.ticker}</h3>
            <span class="tiny">{t.ticker.slice(0, -1)} · xStock wrapper</span>
          </div>
          <span
            class="gap"
            style:color={gap == null ? "var(--ink-3)" : Math.abs(gap) <= 1 ? "var(--ok)" : Math.abs(gap) <= 3 ? "var(--caution)" : "var(--stop)"}
            title="OKX price vs real stock"
          >{fmtPct(gap)}</span>
        </header>
        <div class="big">{usd(row?.okxExchange ?? null)}</div>
        <div class="tiny">OKX exchange · {ago(row?.okxTs ?? null)}</div>
        <dl>
          <div><dt>Real stock</dt><dd>{usd(row?.realStock ?? null)}</dd></div>
          <div><dt>As of</dt><dd>{ago(row?.stockPriceAsOf ?? null)}</dd></div>
          <div><dt>Token multiplier</dt><dd>{row?.multiplier == null ? "—" : row.multiplier.toFixed(6)}</dd></div>
          {#if "wrapper" in t}
            <div>
              <dt>Wrapper</dt>
              <dd><a class="mono" href={`${EXPLORER}/token/${t.wrapper}`} target="_blank" rel="noreferrer">{short(t.wrapper)}</a></dd>
            </div>
          {/if}
        </dl>
      </article>
    {/each}
  </section>

  <section class="grid two">
    <article id="rules" class="card">
      <h2>Verdict rules</h2>
      <p class="lead">Deterministic. Same inputs, same answer.</p>
      <ul class="rules">
        {#each catalog?.verdictRules ?? [] as r (r.verdict)}
          <li>
            <span class="verdict" style:--c={verdictColor[r.verdict] ?? "var(--ink)"}>{r.verdict}</span>
            <span>{r.condition}</span>
          </li>
        {:else}
          <li class="tiny">Loading catalog…</li>
        {/each}
      </ul>
    </article>

    <article class="card">
      <h2>What the token gives you</h2>
      <p class="lead">Rights attached to every covered xStock.</p>
      {#if catalog}
        {@const r = catalog.rights[catalog.tokens[0]?.ticker ?? "NVDAx"]}
        <dl class="rights">
          <div><dt>Type</dt><dd>{r.type}</dd></div>
          <div><dt>Voting</dt><dd>{r.voting ? "Yes" : "No"}</dd></div>
          <div><dt>Dividends</dt><dd>{r.dividends}</dd></div>
          <div><dt>Redemption</dt><dd>{r.redemption}</dd></div>
          <div><dt>Restricted</dt><dd>{catalog.restricted.join(", ")}</dd></div>
        </dl>
      {:else}
        <p class="tiny">Loading catalog…</p>
      {/if}
    </article>
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

  <section class="card wide code">
    <h2>Call it from your agent</h2>
    <p class="lead">Unpaid requests answer <code>402</code> with a <code>PAYMENT-REQUIRED</code> header; x402-aware clients pay and retry automatically.</p>
    <pre>{`curl -s -X POST ${API_BASE}/check \\
  -H 'content-type: application/json' \\
  -d '{"ticker":"NVDAx","side":"sell","sizeUSD":500}'`}</pre>
    <div class="endpoints">
      {#each catalog?.endpoints.free ?? ["GET /health", "GET /status", "GET /payments/recent", "GET /catalog"] as e (e)}
        <span class="tag free">{e}</span>
      {/each}
      {#each catalog?.endpoints.paid ?? [] as e (e)}
        <span class="tag paid">{e}</span>
      {/each}
    </div>
  </section>
</main>

<footer>
  <span>{catalog?.disclaimer ?? "Information only, not investment advice."}</span>
  <span>Not available in {catalog?.restricted.join(", ") ?? "US, EU, CA, UK, AU"}.</span>
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
  .tokens {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  @media (max-width: 860px) {
    .tokens,
    .two {
      grid-template-columns: 1fr;
    }
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
    .token header {
      margin-bottom: 16px;
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

  .token header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 22px;
  }
  .token .gap {
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--panel-soft);
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
  dd a:hover {
    text-decoration: underline;
  }
  .rights div {
    align-items: flex-start;
  }

  .rules {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
  }
  .rules li {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    font-size: 14px;
    line-height: 1.45;
    color: var(--ink-2);
  }
  .verdict {
    flex: none;
    width: 84px;
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 5px 0;
    border-radius: 999px;
    color: var(--c);
    background: color-mix(in srgb, var(--c) 12%, transparent);
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
  .tag.paid {
    background: color-mix(in srgb, var(--caution) 12%, transparent);
    border-color: transparent;
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
</style>
