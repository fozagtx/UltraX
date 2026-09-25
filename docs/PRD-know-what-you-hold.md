# Know What You Hold — PRD (OKX Dev Day, 25 Sep 2026, kaizen V2)

## Summary

A paid safety check that AI agents call before they trade a tokenized stock on X Layer. Send a stock token and a trade size ("sell $500 of NVDAx"); get one verdict (OK, CAUTION, STOP) plus four facts: the price gap between the token on X Layer and both the real stock and OKX's exchange price, whether the US market is open, what you would actually get back for that size, and what the token does and does not give you. Each check costs 0.005 USDT, paid over x402 in USDT0 on X Layer.

Route: Remote Build (Best Remote Demo awards). Primary track: Build a Company (service published on OKX AI as an A2MCP tool).

Why it wins: xStocks are OKX's flagship tokenized-stock product on X Layer, but there is no on-chain stock oracle there, pool depth is thin, and no agent service explains what a token really is before a trade. Every paid call is a visible X Layer transaction.

## Problem and users

| User | What they do | What goes wrong today |
|---|---|---|
| AI trading agents on OKX AI | Buy and sell xStocks for their owners | Trade on a token price with no reference, including off-hours when prices are estimates |
| Agent builders | Build trading or portfolio agents | Must build their own price checks and safety rules; most skip |
| Non-US traders using agents | Let an agent trade xStocks | Do not know about premiums, thin pools, or token rights |

Evidence: no stock oracle on X Layer (Chainlink has no equity feed there, Pyth does not list X Layer); X Layer DEX depth for xStocks reported as "a few dollars" (Agama); OKX prices tokenized stocks off-hours as last close plus an estimate; AAPL token traded +12% intraday and an AMZN token hit about 4x underlying off-hours in July 2025; tokenized stocks give no voting and no claim on the company, dividends arrive through a multiplier; agents fail by acting confidently on stale data.

Competitors: Statera (reference price + realisable value, not a paid service, no rights/market-status), XORR (one trading agent, not a purchasable check), Agama (lending), OKX AI finance listings (none check tokenized-stock integrity). Our position: the pre-trade check any agent can call and pay for, combining price, market status, exit value and rights in one answer.

## Goals

1. Live x402 endpoint, listed on OKX AI as an A2MCP service, returning a verdict and four facts.
2. Paid calls settle in USDT on X Layer.
3. NVDAx, TSLAx, AAPLx fully covered.
4. A demo agent that pays for a check before trading and changes its action based on the verdict.

Non-goals: no trading/swapping, no investment advice (facts + rule-based verdict, labelled information), no custody, no service to users in the US, EU, Canada, UK or Australia.

## User flow

1. Agent finds "Know What You Hold" in the OKX AI marketplace.
2. Before a trade it calls `POST /check` with ticker, side, sizeUSD.
3. It pays 0.005 USDT automatically (Onchain OS: `onchainos payment pay`; scripts: `@okxweb3/x402-fetch`).
4. Owner's rules decide: trade on OK, ask the owner on CAUTION, cancel on STOP.

## Service spec

One paid endpoint `POST /check`, $0.005 per call in USDT0 on X Layer.

Input: `{ "ticker": "NVDAx", "side": "sell", "sizeUSD": 500 }`

Output (illustrative numbers):

```json
{
  "verdict": "STOP",
  "reasons": ["US market closed", "You'd get back 86% of $500"],
  "price": {
    "realStock": 228.86, "okxExchange": 233.10, "multiplier": 1.0004, "xlayerToken": 235.27,
    "gapVsStockPct": 2.8, "gapVsOkxPct": 0.9, "marketOpen": false, "stockPriceAsOf": "2026-09-25T20:00:00Z"
  },
  "exit": { "sizeUSD": 500, "expectedUSD": 431.2, "priceImpactPct": 13.8 },
  "rights": {
    "type": "Tracker certificate, 1:1 backed", "voting": false,
    "dividends": "Reinvested through the token multiplier",
    "redemption": "Eligible holders only, US business days",
    "restricted": ["US", "EU", "CA", "UK", "AU"]
  },
  "payment": { "txHash": "0x..." },
  "disclaimer": "Information only, not investment advice."
}
```

Implementation note: the x402 express middleware settles after the handler responds, so the tx hash is delivered in the `PAYMENT-RESPONSE` header, not the body.

### Verdict rules (use the larger of the two gaps)

| Verdict | When |
|---|---|
| STOP | gap above 3%, or you'd get back less than 90% of the size, or a price is missing or stale |
| CAUTION | US market closed, or gap 1-3%, or you'd get back 90-98% |
| OK | market open, gap below 1%, and you'd get back at least 98% |

### Formulas

m = wrapper `convertToAssets(1e18) / 1e18` (includes dividends and splits).

- gapVsStockPct = (xlayerToken - realStock * m) / (realStock * m) * 100
- gapVsOkxPct = (xlayerToken - okxExchange * m) / (okxExchange * m) * 100
- exitPct = expectedUSD / sizeUSD * 100

Exit value. Sell: quote the wrapper into USDT for sizeUSD / xlayerToken tokens; expectedUSD is the USDT out. Buy: quote sizeUSD of USDT into the wrapper; expectedUSD is tokens out * realStock * m. Market open/closed is computed from NYSE hours and holidays.

## APIs

| # | API | Call | Use |
|---|---|---|---|
| 1 | OKX Payment SDK | `@okxweb3/x402-express`, `x402-core`, `x402-evm`; network `eip155:196`; default asset USDT0 | Charge $0.005 |
| 2 | OKX AI A2MCP registration | `npx -y @okxweb3/onchainos-installer install`, Agentic Wallet login | List the service |
| 3 | Onchain OS Market API | `POST https://web3.okx.com/api/v6/dex/market/price-info` body `[{"chainIndex":"196","tokenContractAddress":"<wrapper lowercase>"}]` | Token price on X Layer |
| 4 | OKX DEX quote | `GET https://web3.okx.com/api/v6/dex/aggregator/quote` with chainIndex, amount (smallest units), fromTokenAddress, toTokenAddress; returns toTokenAmount, priceImpactPercent | Exit value |
| 5 | OKX exchange ticker | `GET https://www.okx.com/api/v5/market/ticker?instId=XNVDA-USDT` (XTSLA-USDT, XAAPL-USDT) | OKX price; ignored if ts stale |
| 6 | RedStone | `redstone-primary-prod`, ids NVDA, TSLA, AAPL, 3 signers | Real stock price |

Plus `convertToAssets(1e18)` from each wrapper over X Layer RPC.

### Tokens (pools trade the wrapper; every price and quote uses the wrapper)

| Token | Wrapper (use this) | Raw rebasing token | OKX ticker | RedStone id |
|---|---|---|---|---|
| NVDAx | 0xa8ddb5cd96b5222afe198316e9a57caa642850d5 | 0xc845b2894dbddd03858fd2d643b4ef725fe0849d | XNVDA-USDT | NVDA |
| TSLAx | 0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171 | 0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0 | XTSLA-USDT | TSLA |
| AAPLx | 0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f | 0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a | XAAPL-USDT | AAPL |

RedStone has no SPY, so AAPLx replaces SPYx.

## Payment setup rules

1. Validate inputs BEFORE payment. OKX's client first calls with `{}` and reads the reply to learn the parameters. `{}` -> 400 with `{ status: "input_required", method: "POST", message, fields: [ticker, side, sizeUSD] }`. Invalid values -> 400 with an error.
2. Then `paymentMiddleware({ "POST /check": { accepts: { scheme: "exact", network: "eip155:196", payTo, price: "$0.005" }, description: "xStock pre-trade check on X Layer", mimeType: "application/json" } }, rs)`.
3. Then the handler.

Set `syncSettle: true` so settlement is confirmed on-chain; read the tx hash in `rs.onAfterSettle`. Time limits from OKX's client: unpaid call answers within 10 s, paid call within 30 s. Give each data source an 8 s timeout and run them in parallel.

## OKX AI listing

Identity (ASP): name "Know What You Hold"; description "Pre-trade checks for tokenized stocks on X Layer."; avatar PNG/JPEG/WebP up to 1 MB via `onchainos agent upload`.

Service: serviceType A2MCP; serviceName "xStock Pre-Trade Check" (5-30 chars, noun phrase, no price); fee "0.005"; endpoint `https://<live-domain>/check` (deployed public HTTPS, no placeholders); serviceDescription exactly four numbered lines:

1. [Service Description] Checks a tokenized stock on X Layer before you trade: returns OK, CAUTION or STOP with the price gap against the real stock and OKX, whether the US market is open, what you would get back for your size, and what the token gives you. Information only, not investment advice. Not for users in the US, EU, Canada, UK or Australia.
2. [Parameter Spec] ticker(string, required): NVDAx, TSLAx or AAPLx; side(string, required): buy or sell; sizeUSD(number, required): trade size in USD
3. [Request Method] POST
4. [Request Example] curl -X POST https://<live-domain>/check -H "Content-Type: application/json" -d '{"ticker":"NVDAx","side":"sell","sizeUSD":500}'

Commands, in order:

1. `npx -y @okxweb3/onchainos-installer install`, log in to the Agentic Wallet with email.
2. `onchainos agent pre-check --role asp`
3. `onchainos agent upload --file logo.png` -> avatar URL
4. `onchainos agent validate-listing --role asp --name ... --description ... --service '<json>'`
5. `onchainos agent create --role asp --name ... --description ... --picture <url> --service '<json>'` -> Agent ID
6. `npm i -g @okxweb3/a2a-node`, then `okx-a2a doctor --fix`
7. `onchainos agent activate --agent-id <id> --preferred-language en-US`

Review takes 24-48 h; results go to the account email. The endpoint is stored on-chain, so changing it later needs an update.

## Architecture

One Node/TypeScript server. x402 middleware takes payment; the handler calls five data sources in parallel, applies the rules and returns the answer. Hosting in Singapore with an HTTPS domain. Seller wallet = Agentic Wallet (payTo and the OKX AI identity). Demo agent uses `@okxweb3/x402-fetch` with a wallet holding a little USDT.

(Our repo adds a small landing page and `/docs`; see HANDOFF.md for the actual layout.)

## Done when

| Piece | Done when |
|---|---|
| Price check | For NVDAx, TSLAx, AAPLx returns X Layer price, OKX price, real stock price, both gaps and market status |
| Exit check | Returns what you'd get back for the size, buy and sell |
| Verdict and rights card | Every response has a verdict, reasons and a rights card |
| x402 payment | Unpaid call returns 402; paid call returns the result with the payment tx hash |
| OKX AI listing | A2MCP service registered and approved |
| Demo agent | Pays for a check before a trade and cancels on STOP |

## Demo video (2-4 minutes)

1. Problem (20 s): xStocks trade 24/7 on X Layer, off-hours prices are estimates, pools are thin, no oracle, no warning.
2. The listing (15 s): "Know What You Hold" in the OKX AI marketplace.
3. Unpaid call (15 s): `curl -i -X POST` returns 402 with X Layer payment details.
4. Agent run (60 s): demo agent wants to sell $500 NVDAx while the US market is closed; pays 0.005 USDT; gets STOP ("market closed, +2.8% gap, you'd get back $431") and cancels.
5. On-chain proof (20 s): open the payment on the X Layer explorer.
6. Market-hours contrast (20 s): same check during US hours returns OK.
7. Close (10 s): "Know what you hold."

## Submission checklist

- Team name, members, project name, track (Build a Company), route (Remote Build)
- Project summary: product, intended user, core integration
- Public GitHub repo with README (setup, APIs, token addresses, listing URL)
- New features built in the build period, with commit history
- OKX AI listing URL
- Live endpoint URL
- 2-4 minute demo video
- Declaration accepted

## Risks

| Risk | Mitigation |
|---|---|
| Listing review 24-48 h | Register as soon as the curl test passes; demo the live endpoint either way |
| OKX ticker stale | Ignore if ts over 10 min old during market hours; verdict uses the RedStone gap |
| No DEX pool deep enough | Return STOP with reason "no exit available" |
| Off-hours prices are estimates, RedStone is last close | Always return marketOpen and stockPriceAsOf; CAUTION when closed |

Compliance: label every output "information only, not investment advice"; never claim ownership or voting rights; state restricted regions in the listing and every response; no fake or self-paid checks.

Open questions: confirm wrapper addresses on-chain (done, see HANDOFF.md); check each wrapper has a pool that can quote $500 (pending, needs OKX keys); USDT0 address for the DEX quote is `0x779ded0c9e1022225f8e0630b35a9b54be713736` (from the Payment SDK default).
