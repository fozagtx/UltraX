# Handoff: Know What You Hold (KWYH)

Repo: https://github.com/fozagtx/UltraX (branch `main`). Hackathon: OKX Dev Day, Remote Build route, Build a Company track. Deadline was 25 Sep 2026; the OKX AI listing review takes 24-48 h, so listing is the most time-critical item.

## What this is

A paid pre-trade safety check for tokenized stocks (xStocks) on X Layer, sold to AI agents over x402. `POST /check {ticker, side, sizeUSD}` costs 0.005 USDT0 and returns a verdict (OK / CAUTION / STOP) plus four facts: price gap vs the real stock and vs OKX's exchange price, US market open/closed, expected exit value for the size, and the token's rights card. Full PRD: `docs/PRD-know-what-you-hold.md`.

History: commits `ea20150`..`4c4c615` were a previous product (ULTRA X, an on-chain metrics API + dashboard). Commit `e0d4dec` pivoted the repo to KWYH and removed the collector, Postgres and dashboard. Only the Scrivo design system (light theme, `apps/web/src/components/{ui,site-header,background-*,reveal,mockups}`, `globals.css`) was kept from that era. Ignore the ULTRA X history unless you need the Drizzle/Postgres patterns back.

## Layout

```
packages/core   @kwyh/core   tokens, rights, NYSE hours, formulas, verdict, sources (okxAuth, okxMarket, okxDexQuote, okxTicker, redstone, multiplier), check.ts (runCheck), catalog.ts
apps/api        @kwyh/api    Express: /health, /catalog, /status, /payments/recent, POST /check (validate -> x402 pay -> answer), smoke.ts
apps/web        @kwyh/web    Next 15 landing (/) and /docs, Scrivo style, reads the API's free endpoints server-side
agent           @kwyh/demo-agent  demo-agent.ts (--dry works without a wallet; paid path uses @okxweb3/x402-fetch)
render.yaml     kwyh-api + kwyh-web (Singapore, Starter), no database
```

Commands: `npm ci`, `npm run build`, `npm test` (62 tests, all green at `e0d4dec`), `npm run smoke -w apps/api` (live RedStone + OKX ticker + RPC multiplier for the 3 tokens), `npm run dev -w apps/api` (needs `apps/api/.env`, see `.env.example`), `npm run dev -w apps/web` (needs `apps/web/.env.local` with `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`).

## Verified facts (do not re-derive)

- OKX x402 SDK (`@okxweb3/x402-express 0.1.1`, `x402-core 0.1.0`, `x402-evm 0.2.1`): API is `new x402ResourceServer(facilitator).register(network, new ExactEvmScheme())` + `paymentMiddleware(routes, server, paywallConfig?, paywall?, syncFacilitatorOnStart?)`. Route keys look like `"POST /check"`. Default asset for `eip155:196` is USDT0 `0x779ded0c9e1022225f8e0630b35a9b54be713736` (6 dp); testnet `eip155:1952` is `0x9e29b3aada05bf2d2c827af80bd28dc0b9b4fb0c`. `$0.005` becomes `amount: "5000"`.
- The express middleware buffers the handler response and settles AFTER it, so the settlement tx hash can never be put in the JSON body. It is returned in the `PAYMENT-RESPONSE` header (base64 JSON, field `transaction`). `rs.onAfterSettle(ctx => ctx.result.transaction)` gives it server-side. Set `syncSettle: true` on `OKXFacilitatorClient` to get a confirmed status.
- The 402 challenge needs the facilitator's "supported kinds"; without OKX keys `apps/api/src/server.ts` uses a `challengeOnlyFacilitator` that advertises `{x402Version: 2, scheme: 'exact', network}` and rejects verify/settle. `x402Version` must be 2.
- OKX HMAC: prehash = `timestamp + METHOD + requestPath(with query) + body`, HMAC-SHA256 base64, headers `OK-ACCESS-KEY/SIGN/TIMESTAMP/PASSPHRASE`. Responses `{code, msg, data}`; treat `String(code) === "0"` as success (some dex endpoints return a number).
- Confirmed OKX endpoint shapes (official docs via context7 `/websites/web3_okx_onchainos_dev-docs`): `POST /api/v6/dex/index/current-price` body `[{chainIndex, tokenContractAddress}]`; `GET /api/v6/dex/market/token/cluster/top-holders?rangeFilter=1|2|3`; `GET /api/v6/dex/aggregator/quote?chainIndex&fromTokenAddress&toTokenAddress&amount[&slippagePercent]`. `POST /api/v6/dex/market/price-info` and the quote response fields (`toTokenAmount`, `priceImpactPercent`) are implemented from the docs but NOT live-verified (no keys).
- RedStone: `requestDataPackages` from `@redstone-finance/sdk` needs a gateway API key. Implemented instead: fetch signed packages from public gateways `oracle-gateway-{1,2}.a.redstone.finance`, verify signers with `getSignersForDataServiceId("redstone-primary-prod")` and take the median (`verifyAndComputeMedian`). Works without a key.
- xStock wrapper addresses from the PRD are real and respond on-chain: `wNVDAx`, `wTSLAx`, `wAAPLx`, 18 decimals, `convertToAssets(1e18)` gave m = 1.0017 / 1.0000 / 1.0033 on 25 Sep.
- Public X Layer RPCs cap `eth_getLogs` at 100 blocks and rate-limit; `apps/api/src/payments.ts` rotates providers and paces calls.
- Smoke on 25 Sep 03:52Z: NVDA 224.58 (OKX XNVDA-USDT 224.61), TSLA 377.71 (379.49), AAPL 335.90 (335.62). NYSE hours logic returned closed/after-hours with next change 13:30Z.

## Unfinished work (in priority order)

1. Three small code fixes that were specified but interrupted before landing:
   - `packages/core/src/rules/verdict.ts`: currently early-returns on the first STOP condition. Change to accumulate every applicable reason (missing/stale, market closed, gap band, exit band) and return the worst severity. For OK return one reason: "Market open, token within 1% of the stock, exit returns at least 98%". Update `verdict.test.ts` (use `toContain`).
   - `apps/api/src/payments.ts`: the payments feed re-scans ~50k blocks (about 5 min) every 10 min. Make it incremental: binary-search the block at now-24h, scan forward once, then every 2 min scan only `lastScanned+1..head`. Keep rows in memory for 7 days. Return `warming: true` + `scannedFrom` during the initial scan so the landing can show "Scanning X Layer" instead of "No paid checks yet".
   - Landing/docs label: rename "Recent paid checks" to "USDT0 received by the service wallet" with caption "Transfers to the payTo address, read from X Layer RPC. Each x402 settlement lands here as a 0.005 USDT0 transfer." Add a "0.005 = 1 check" pill on rows whose amount is 0.005 +-0.0001. Summary: "{n} transfers, {usd} in the last 24h, {k} exact 0.005 payments".
2. Secrets from the owner (blocking everything below): OKX Developer Portal `OKX_API_KEY`, `OKX_SECRET_KEY`, `OKX_PASSPHRASE`; Agentic Wallet address as `PAY_TO`; a second wallet's `DEMO_AGENT_PRIVATE_KEY` funded with a little USDT0 and OKB on X Layer.
3. With keys: run the paid `/check` end to end. Verify live the `price-info` and `aggregator/quote` parsers (`packages/core/src/sources/okxMarket.ts`, `okxDexQuote.ts`), the facilitator sync on startup, and that `PAYMENT-RESPONSE` carries a tx hash. Check each wrapper has a pool deep enough to quote $500 into USDT0; if not, demo with a smaller size. Consider testing on `eip155:1952` first.
4. Deploy: push, create a Render Blueprint from `render.yaml`, set the `sync: false` env vars on `kwyh-api` (and `API_BASE_URL`/`NEXT_PUBLIC_API_BASE_URL` on `kwyh-web` if the domain differs). Confirm `curl -i -X POST https://<domain>/check -d '{}'` gives 400 with the input schema and a valid body gives 402.
5. OKX AI listing (see PRD "OKX AI listing" for the exact 4-line serviceDescription and the seven `onchainos agent ...` commands). Needs a logo PNG (not made yet). Replace `<live-domain>` with the real Render domain; placeholders are rejected. Set `NEXT_PUBLIC_OKXAI_LISTING_URL` on the web service once approved.
6. Demo agent paid run: `npm run demo -w agent -- --ticker NVDAx --side sell --size 500` with the funded key; capture the explorer link for the video.
7. README.md (setup, APIs, token addresses, listing URL, restricted regions, disclaimer), demo video (2-4 min, script in the PRD), submission checklist.

## Rules the owner insists on

- Never add `Co-Authored-By` trailers or mention AI assistants in commits, PRs, code or docs.
- No mock or placeholder data anywhere in the UI; empty states must say why.
- Every response and the landing must carry "Information only, not investment advice" and the restricted regions (US, EU, CA, UK, AU).
- No emojis in code or UI.

## Suggested skills for the next session

`okx-agent-payments-protocol` (x402 flows, PAYMENT-REQUIRED/RESPONSE), `okx-ai` (ASP registration / listing), `okx-agentic-wallet` (funding the demo wallet), `frontend-design-guidelines` if touching `apps/web`.
