# Know What You Hold

A paid pre-trade safety check for tokenized stocks (xStocks) on X Layer, sold to
AI agents over x402.

Send a stock token and a trade size (`sell $500 of NVDAx`); get back one verdict
— OK, CAUTION or STOP — plus four facts:

1. The price gap between the token on X Layer and both the real stock and OKX's
   exchange price.
2. Whether the US market is open.
3. What you would actually get back for that size, from a live DEX quote.
4. What the token does and does not give you (voting, dividends, redemption,
   restricted regions).

Each check costs **0.005 USDT**, paid in USDT0 on X Layer via the x402 payment
protocol. Every paid call is a visible on-chain transaction.

Available on OKX AI as an A2MCP service.

## Why

xStocks trade 24/7 on X Layer, but there is no on-chain stock oracle, pool depth
is thin, and off-hours prices are estimates. An agent that trades on the token
price alone can buy at a large premium or sell into a pool that returns a
fraction of the expected value. This service is the pre-trade check any agent
can call and pay for, combining price, market status, exit value and rights in
one answer.

## How it works

```
agent -> POST /check {ticker, side, sizeUSD}
      -> 402 Payment Required (x402, USDT0 on X Layer)
      -> pays 0.005 USDT, retries with payment signature
      -> server runs 5 data sources in parallel, applies verdict rules
      -> {verdict, reasons, price, exit, rights, sources, disclaimer}
```

Payment settles after the handler responds, so the settlement transaction hash
is returned in the `PAYMENT-RESPONSE` header (base64 JSON, field `transaction`),
not in the response body.

### Verdict rules

| Verdict  | When                                                                            |
| -------- | ------------------------------------------------------------------------------- |
| STOP     | A required price source is missing or stale, gap > 3%, or exit returns < 90%    |
| CAUTION  | US market closed, gap 1-3% vs stock or OKX, or exit returns 90-98% of size      |
| OK       | Market open, gap below 1%, and exit returns at least 98%                        |

The verdict uses the larger of the two price gaps (vs the real stock and vs
OKX's exchange price). The multiplier `m = wrapper.convertToAssets(1e18) / 1e18`
adjusts xStock prices for dividends and splits.

## API

Free endpoints:

| Endpoint               | Description                                                            |
| ---------------------- | ---------------------------------------------------------------------- |
| `GET /health`          | Liveness: network, payTo, market open flag, uptime                     |
| `GET /catalog`         | Machine-readable service catalog (input schema, tokens, verdict rules) |
| `GET /status`          | Current stock/OKX prices, multipliers and market state per token       |
| `GET /payments/recent` | Recent USDT0 transfers to the service wallet, read from X Layer RPC    |

Paid endpoint:

### `POST /check` — 0.005 USDT per call

Request:

```json
{ "ticker": "NVDAx", "side": "sell", "sizeUSD": 500 }
```

- `ticker` — `NVDAx`, `TSLAx` or `AAPLx`
- `side` — `buy` or `sell`
- `sizeUSD` — trade size in USD, `0 < sizeUSD <= 1,000,000`

An empty body returns `400` with the input schema (`status: "input_required"`)
so x402 clients can discover the parameters. A valid unpaid call returns `402`.

Response (illustrative numbers):

```json
{
  "verdict": "STOP",
  "reasons": ["US market closed", "You'd get back 86% of $500"],
  "price": {
    "realStock": 228.86,
    "okxExchange": 233.1,
    "multiplier": 1.0004,
    "xlayerToken": 235.27,
    "gapVsStockPct": 2.8,
    "gapVsOkxPct": 0.9,
    "marketOpen": false,
    "stockPriceAsOf": "2026-09-25T20:00:00Z"
  },
  "exit": { "sizeUSD": 500, "expectedUSD": 431.2, "priceImpactPct": 13.8 },
  "rights": {
    "type": "Tracker certificate, 1:1 backed",
    "voting": false,
    "dividends": "Reinvested through the token multiplier",
    "redemption": "Eligible holders only, US business days",
    "restricted": ["US", "EU", "CA", "UK", "AU"]
  },
  "payment": { "network": "eip155:196", "asset": "USDT0", "priceUsd": 0.005 },
  "disclaimer": "Information only, not investment advice."
}
```

## Covered tokens

Pools trade the ERC-4626 wrapper; every price and quote uses the wrapper.

| Token | Wrapper                                    | Raw rebasing token                         | OKX ticker  | RedStone id |
| ----- | ------------------------------------------ | ------------------------------------------ | ----------- | ----------- |
| NVDAx | `0xa8ddb5cd96b5222afe198316e9a57caa642850d5` | `0xc845b2894dbddd03858fd2d643b4ef725fe0849d` | XNVDA-USDT  | NVDA        |
| TSLAx | `0xc3fdbe3a68ee5de461d30415a8165cf9aefe1171` | `0x8ad3c73f833d3f9a523ab01476625f269aeb7cf0` | XTSLA-USDT  | TSLA        |
| AAPLx | `0x943bf64d566c32a2bcd41ac92fb63c111cc9de8f` | `0x9d275685dc284c8eb1c79f6aba7a63dc75ec890a` | XAAPL-USDT  | AAPL        |

Payment asset: USDT0 `0x779ded0c9e1022225f8e0630b35a9b54be713736` (6 decimals)
on X Layer (`eip155:196`; testnet `eip155:1952`).

## Data sources

| # | Source                      | Use                                   |
| - | --------------------------- | ------------------------------------- |
| 1 | OKX Payment SDK (x402)      | Charge 0.005 USDT per call            |
| 2 | Onchain OS Market API       | Token price on X Layer                |
| 3 | OKX DEX aggregator quote    | Expected exit value for the size      |
| 4 | OKX exchange ticker         | OKX price (XNVDA/XTSLA/XAAPL-USDT)    |
| 5 | RedStone `redstone-primary-prod` | Real stock price (median of 3 signers) |
| 6 | X Layer RPC                 | Wrapper `convertToAssets` multiplier  |

## OKX AI listing

An A2MCP agent service on OKX AI: **xStock Pre-Trade Check**, 0.005 USDT per
call, endpoint `POST /check`. Billing goes through the OKX Payment SDK
(`@okxweb3/x402-express`). Unpaid calls get `402` with a `PAYMENT-REQUIRED`
header, and paid calls settle in USDT0 on X Layer.

## Run the service

```bash
cp .env.example .env    # set PAY_TO and the OKX_* keys
npm ci
npm run dev             # or: npm run build && npm start
```

Check the endpoint before you register:

```bash
curl -i -X POST https://<your-domain>/check -H 'content-type: application/json' \
  -d '{"ticker":"NVDAx","side":"sell","sizeUSD":500}'
# expected: HTTP 402 + PAYMENT-REQUIRED
```

Then register and list it as an A2MCP ASP with Onchain OS, following
[How to Register as an ASP](https://web3.okx.com/onchainos/dev-docs/okxai/registerasp).
You provide the name, description, price (0.005) and the public HTTPS endpoint.

## Restricted regions

This service is not offered to users in the **US, EU, Canada, UK or
Australia**. Tokenized stocks do not confer voting rights or a claim on the
underlying company; dividends are reinvested through the token multiplier and
redemption is available to eligible holders only.

## Disclaimer

Information only, not investment advice. The service returns facts and a
rule-based verdict; it does not trade, hold custody, or recommend any action.
