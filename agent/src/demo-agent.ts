import { privateKeyToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, http } from "viem";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:8080";
const NETWORK = process.env.NETWORK ?? "eip155:196";
const RPC_URL = process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech";

interface Args {
  ticker: string;
  side: "buy" | "sell";
  size: number;
  dry: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { ticker: "NVDAx", side: "sell", size: 500, dry: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry") args.dry = true;
    else if (a === "--ticker") args.ticker = argv[++i];
    else if (a === "--side") args.side = argv[++i] as "buy" | "sell";
    else if (a === "--size") args.size = Number(argv[++i]);
  }
  return args;
}

function decodeB64Json(header: string): unknown {
  return JSON.parse(Buffer.from(header, "base64").toString("utf8"));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = `${API_BASE}/check`;
  const body = JSON.stringify({
    ticker: args.ticker,
    side: args.side,
    sizeUSD: args.size,
  });
  console.log(
    `agent: ${args.side} ${args.ticker} sizeUSD=${args.size} via ${url}${args.dry ? " (dry)" : ""}`,
  );

  if (args.dry) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    console.log(`status: ${res.status}`);
    const required = res.headers.get("payment-required");
    if (required) {
      const decoded = decodeB64Json(required) as {
        accepts?: {
          scheme?: string;
          network?: string;
          amount?: string;
          asset?: string;
          payTo?: string;
          description?: string;
        }[];
        resource?: unknown;
      };
      console.log("PAYMENT-REQUIRED (decoded):");
      console.log(JSON.stringify(decoded, null, 2));
    } else {
      console.log("body:", await res.text());
    }
    return;
  }

  const key = process.env.DEMO_AGENT_PRIVATE_KEY;
  if (!key) {
    console.error(
      "DEMO_AGENT_PRIVATE_KEY not set; run with --dry for the unpaid flow",
    );
    process.exit(1);
  }

  const { wrapFetchWithPaymentFromConfig, decodePaymentResponseHeader } =
    await import("@okxweb3/x402-fetch");
  const { ExactEvmScheme } = await import("@okxweb3/x402-evm/exact/client");
  const { toClientEvmSigner } = await import("@okxweb3/x402-evm");

  const account = privateKeyToAccount(key as `0x${string}`);
  const publicClient = createPublicClient({ transport: http(RPC_URL) });
  const walletClient = createWalletClient({
    account,
    transport: http(RPC_URL),
  });
  const signer = toClientEvmSigner(walletClient, publicClient);
  const fetchWithPayment = wrapFetchWithPaymentFromConfig(fetch, {
    schemes: [{ network: NETWORK as `${string}:${string}`, client: new ExactEvmScheme(signer) }],
  });

  const res = await fetchWithPayment(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  console.log(`status: ${res.status}`);

  const paid = res.headers.get("payment-response");
  if (paid) {
    const pr = decodePaymentResponseHeader(paid) as { transaction?: string };
    if (pr.transaction) {
      console.log(
        `Paid: https://www.okx.com/web3/explorer/xlayer/tx/${pr.transaction}`,
      );
    }
  }

  const data = (await res.json()) as {
    verdict?: "OK" | "CAUTION" | "STOP";
    reasons?: string[];
    price?: Record<string, unknown>;
    exit?: Record<string, unknown>;
    error?: string;
  };

  if (!res.ok) {
    console.log("error:", JSON.stringify(data));
    process.exit(1);
  }

  console.log(`verdict: ${data.verdict}`);
  for (const r of data.reasons ?? []) console.log(`  - ${r}`);
  console.log("facts:", JSON.stringify({ price: data.price, exit: data.exit }, null, 2));

  switch (data.verdict) {
    case "OK":
      console.log("ACTION: proceed with trade (not executed by this demo)");
      break;
    case "CAUTION":
      console.log("ACTION: ask owner");
      break;
    case "STOP":
      console.log("ACTION: cancel");
      break;
    default:
      console.log("ACTION: unknown verdict, do nothing");
  }
}

main().catch((e) => {
  console.error("agent failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
