---
title: UltraX
emoji: 📈
colorFrom: gray
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# UltraX — predictive market intelligence for everything stocks on OKX

A paid market-intelligence API for AI agents covering every stock listed on OKX:
stock perpetuals (for example `NVDA-USDT-SWAP`), xStock spot pairs (`XNVDA-USDT`)
and pre-IPO contracts (`OPENAI-USDT-SWAP`, `ANTHROPIC-USDT-SWAP`, ...).

- **Runners.** Daily, weekly and monthly top movers (or worst movers), with a
  predictive score, a calibrated up-probability and positioning data for each.
- **Signal.** A full read on one stock over three horizons: score, up-probability,
  expected range, technicals, support and resistance, funding, open interest, the
  long/short ratio, taker flow, and basis against the xStock spot and the index.
- **Pre-IPO.** Every OKX pre-IPO contract, with its implied valuation, performance
  since listing, order-book depth, funding, OI and the contract rules.

Agents pay per call in USDT0 on X Layer using the x402 protocol (OKX Payment
SDK). The service is listed on OKX AI as an A2MCP service. All market data comes
live from OKX's public v5 market API, and the universe is discovered from OKX's
instrument list, so newly listed stocks appear automatically.

## Live deployment

| Component            | URL                                                    |
| -------------------- | ------------------------------------------------------ |
| API (HF Docker Space) | https://pima5-ultrax.hf.space                          |
| Space repo            | https://huggingface.co/spaces/pima5/ultrax             |
| Status page (Render)  | https://ultrax-web.onrender.com                        |
| Source                | https://github.com/fozagtx/UltraX                      |

Settlement: `eip155:196` (X Layer mainnet), asset USDT0
`0x779ded0c9e1022225f8e0630b35a9b54be713736`, receiving wallet
`0xfd5e5c8b94dd46913e2a0cf556f16d09be317341` (OKX Agentic Wallet).

```bash
curl -s https://pima5-ultrax.hf.space/health
curl -i -X POST https://pima5-ultrax.hf.space/runners \
  -H 'content-type: application/json' -d '{"period":"weekly"}'
# HTTP/2 402 + PAYMENT-REQUIRED header (base64 x402 v2 challenge)
```

## How it works

```
agent -> POST /runners {period:"weekly"}
      -> 402 Payment Required (x402, USDT0 on X Layer)
      -> pays, retries with payment signature
      -> ranked runners + scores + pUp + positioning + model calibration
```

Missing or invalid inputs are rejected with `400` **before** payment. An empty
body returns `status: "input_required"` with the input schema, so x402 clients
can discover the parameters. The settlement transaction hash is in the
`PAYMENT-RESPONSE` header (base64 JSON, field `transaction`).

## API

### Paid

| Endpoint        | Price      | Body                                                                                                       |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------------------- |
| `POST /runners` | 0.01 USDT  | `{period: daily\|weekly\|monthly, market?: perp\|spot, direction?: up\|down, limit?: 1-50, minVolumeUsd?}` |
| `POST /signal`  | 0.005 USDT | `{symbol, period?: daily\|weekly\|monthly}`; `NVDA`, `NVDA-USDT-SWAP`, `XNVDA-USDT` and `NVDAx` all resolve |
| `POST /preipo`  | 0.01 USDT  | `{symbol?}`; omit it to get every live pre-IPO contract                                                    |

### Free

| Endpoint               | Description                                                                        |
| ---------------------- | ---------------------------------------------------------------------------------- |
| `GET /health`          | Liveness, payment config, universe counts and refresh times                        |
| `GET /catalog`         | Machine-readable catalog: endpoints, input schemas, prices, model, data sources    |
| `GET /universe`        | Every covered instrument (stock perps, xStocks, pre-IPO flag, spot/perp links)     |
| `GET /preview`         | Teaser: top 5 runners per period (return only), pre-IPO valuations, model hit rates |
| `GET /payments/recent` | Recent USDT0 payments to the service wallet, read from X Layer RPC                 |

### Example: `POST /runners`

```bash
curl -s -X POST $API/runners -H 'content-type: application/json' \
  -d '{"period":"weekly","direction":"up","limit":10}'
```

Each row has `symbol`, `instId`, `preIpo`, `last`, `returnPct`, `vol24hUsd`,
`score` (-100..100), `signal` (bullish/neutral/bearish), `pUp`, `confidence`,
`volumeRatio`, `rsi14`, `trend` and `expectedRange`. Perp rows also include
`positioning` (`fundingRate`, `openInterestUsd`, `premiumVsIndexPct`,
`basisVsSpotPct`). The response also includes the model's calibration table for
that market and horizon.

## Model: `ultrax-momentum-v1`

A transparent momentum model computed from OKX daily candles (UTC):

```
score = 100 * clip( 0.5  * clip(z, -3, 3)/3                      // volatility-adjusted return, z = r / (σ·√h)
                  + 0.25 * trend                                // price vs SMA20 vs SMA50: +1 / 0 / -1
                  + 0.15 * clip(log2(volRatio), -1, 1) * sign(r) // volume confirmation
                  + rsiAdj,                                     // -0.10 if RSI14 > 75, +0.10 if < 25
                  -1, 1)
```

`h` is the horizon (1, 7 or 30 days). `σ` is the stdev of the last 30 daily log
returns. `bullish` means score ≥ 25 and `bearish` means score ≤ −25.

**Calibration.** The service runs a walk-forward backtest over the OKX candle
history of every instrument in the market. It scores each bar using only data up
to that bar, measures the realized forward return over `h` days, and steps in
non-overlapping windows. It groups scores into five buckets. `pUp` is the
Laplace-smoothed share of up moves in the live score's bucket. `confidence`
depends on the bucket's sample count: `low` < 30, `medium` < 150, `high`
otherwise. `hitRate` and `baseUpRate` are published so agents can judge whether
the signal beats the base rate. Calibration recomputes after every candle refresh
(every 15 minutes).

## Pre-IPO contracts

OKX pre-IPO perpetuals are **cash-settled derivatives** that track a private
company's valuation. They do not grant shares, voting rights or an IPO
allocation. The contract price is set so that price × estimated share count ≈
company valuation. `/preipo` reports `impliedValuationUsd` from the share count
in the OKX listing announcement. When the company discloses its actual share
count, OKX rebases the contract (value-neutral). After the IPO, the contract
converts to a standard stock perpetual. Pre-IPO contracts are detected
dynamically (`ruleType = pre_market` in OKX's instrument list).

## Data sources (all OKX)

| Source                                                                 | Use                                     |
| ---------------------------------------------------------------------- | --------------------------------------- |
| `/api/v5/public/instruments` (SWAP, SPOT; `instCategory=3`)            | Stock universe, pre-IPO flag, leverage  |
| `/api/v5/market/tickers`, `/market/index-tickers`                      | Last, bid/ask, 24h stats, index price   |
| `/api/v5/market/candles` (`1Dutc`)                                     | Returns, volatility, technicals, model  |
| `/api/v5/public/funding-rate`, `/public/open-interest`                 | Funding and OI                          |
| `/api/v5/rubik/stat/...` (OI history, long/short ratio, taker volume)  | Positioning for `/signal`               |
| `/api/v5/market/books`                                                 | Pre-IPO spread and ±2% depth            |
| OKX Payment SDK (x402) + X Layer RPC                                   | Billing and payment feed                |

## Run the service

```bash
cp .env.example .env    # set PAY_TO; the OKX_* keys enable real x402 settlement
npm ci
npm run dev             # or: npm run build && npm start
```

The first universe load pulls candles for about 290 instruments and takes about
a minute. Until it finishes, `/health` shows `universe.ready: false` and the data
routes return `503`.

```bash
npm test                # unit + API tests (recorded real OKX responses)
LIVE=1 npm test         # also runs the live test against OKX
npm run smoke           # full live refresh; prints runners, signals, pre-IPO table
```

Check the endpoint before you register:

```bash
curl -i -X POST https://<your-domain>/runners -H 'content-type: application/json' \
  -d '{"period":"daily"}'
# expected: HTTP 402 + PAYMENT-REQUIRED
```

### Deploy on Hugging Face

The repo is a Docker Space. The front-matter at the top of this README and the
`Dockerfile` are all Hugging Face needs. The server listens on port 7860 and
trusts the Space's TLS proxy, so the x402 challenge advertises the `https://`
resource URL that the OKX.AI marketplace validates.

```bash
hf auth login                                   # write-scoped token
hf repos create <user>/ultrax --type space --space-sdk docker --public
hf spaces secrets add <user>/ultrax -s PAY_TO=0x<your X Layer wallet>
hf spaces variables add <user>/ultrax -e NETWORK=eip155:196 \
  -e PUBLIC_API_BASE_URL=https://<user>-ultrax.hf.space -e WEB_ORIGIN='*'
hf upload <user>/ultrax . . --repo-type space \
  --exclude 'node_modules/**' --exclude 'dist/**' --exclude '.git/**' \
  --exclude 'web/**' --exclude 'apps/**' --exclude '.env*'
hf spaces wait <user>/ultrax
```

Without OKX API credentials the server still issues 402 challenges, but it
cannot verify or settle payments (`/health` reports `paymentsConfigured: false`
and a paying agent gets an error). For a real listing you need a key from the
[OKX Developer Portal](https://web3.okx.com/onchainos/dev-portal):

1. Connect a wallet and **Verify** (signature only, no gas).
2. **Get started**: link email and phone, confirm both codes.
3. **Create API key**: choose a name and a passphrase (the passphrase cannot be
   recovered later).
4. **View details** to read the API key and the generated secret key.

```bash
hf spaces secrets add <user>/ultrax -s OKX_API_KEY=... -s OKX_SECRET_KEY=... \
  -s OKX_PASSPHRASE=...
hf spaces restart <user>/ultrax
curl -s https://<user>-ultrax.hf.space/health   # paymentsConfigured: true
```

### List on OKX.AI (A2MCP)

Listing is done from your agent with Onchain OS, following
[How to Register as an ASP](https://web3.okx.com/onchainos/dev-docs/okxai/registerasp)
and the [A2MCP guide](https://web3.okx.com/onchainos/dev-docs/okxai/howtomcp).

```bash
npx -y @okxweb3/onchainos-installer install
onchainos wallet login            # Agentic Wallet; its X Layer address is PAY_TO
onchainos agent pre-check --role asp
```

Register one ASP identity (name, description, square PNG/JPEG avatar) with one
service per paid endpoint. Endpoints must be public `https://` URLs; fees are
digits only, in USDT:

| Service                          | Fee   | Endpoint                                 |
| -------------------------------- | ----- | ---------------------------------------- |
| OKX Stock Runners Ranking        | 0.01  | `https://pima5-ultrax.hf.space/runners`  |
| OKX Stock Signal Report          | 0.005 | `https://pima5-ultrax.hf.space/signal`   |
| OKX Pre-IPO Contract Intelligence | 0.01 | `https://pima5-ultrax.hf.space/preipo`   |

Then activate the identity (`onchainos agent activate`). Review completes within
24 hours and the result is emailed to the Agentic Wallet address. Once live,
every call is billed and settled by the OKX Payment SDK with no manual steps.
Registration and activation are free; OKX covers network fees.

Before registering, self-check every paid endpoint returns `402` with a
`PAYMENT-REQUIRED` header when given valid input (invalid input is a `400`
before payment, by design) and every free endpoint returns `200`:

```bash
API=https://pima5-ultrax.hf.space
curl -s -o /dev/null -w "runners %{http_code}\n" -X POST $API/runners \
  -H 'content-type: application/json' -d '{"period":"weekly"}'
curl -s -o /dev/null -w "signal  %{http_code}\n" -X POST $API/signal \
  -H 'content-type: application/json' -d '{"symbol":"NVDA"}'
curl -s -o /dev/null -w "preipo  %{http_code}\n" -X POST $API/preipo \
  -H 'content-type: application/json' -d '{"symbol":"OPENAI"}'
# all three: 402
```

## Status page (free)

`web/` is a Svelte site that shows the free preview: top runners per period,
pre-IPO valuations, model hit rates, endpoints and the payment feed. It never
calls a paid endpoint.

```bash
cd web && npm ci
VITE_API_BASE_URL=http://localhost:8080 npm run dev   # http://localhost:5173
```

`render.yaml` deploys it as a Render static site at
https://ultrax-web.onrender.com with `VITE_API_BASE_URL` set to the Space URL.
The variable is baked in at build time, so changing the API URL requires a
Render redeploy.

## Disclaimer

Information only, not investment advice. Scores and probabilities are statistical
estimates from historical OKX data and do not guarantee future results. The
service does not trade, hold custody or recommend any action.
