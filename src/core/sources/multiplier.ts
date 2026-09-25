import {
  createPublicClient,
  fallback,
  http,
  type Address,
  type PublicClient,
} from "viem";

const ERC20_ABI = [
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

const ERC4626_ABI = [
  {
    name: "convertToAssets",
    type: "function",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface XLayerClient {
  readContract(args: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
  }): Promise<unknown>;
}

export function makeXLayerClient(rpcUrls: string[]): XLayerClient {
  const client = createPublicClient({
    transport: fallback(rpcUrls.map((u) => http(u, { timeout: 8_000 }))),
  }) as PublicClient;
  return {
    readContract: (args) =>
      client.readContract(
        args as Parameters<PublicClient["readContract"]>[0],
      ) as Promise<unknown>,
  };
}

export async function readTokenMeta(
  client: XLayerClient,
  wrapper: Address,
): Promise<{ symbol: string; decimals: number }> {
  const [symbol, decimals] = await Promise.all([
    client.readContract({
      address: wrapper,
      abi: ERC20_ABI,
      functionName: "symbol",
    }),
    client.readContract({
      address: wrapper,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  ]);
  return { symbol: String(symbol), decimals: Number(decimals) };
}

const MULTIPLIER_CACHE_MS = 5 * 60_000;
const multiplierCache = new Map<string, { at: number; value: number }>();

/** ERC-4626 convertToAssets(1e18) / 1e18 — the wrapper's shares-to-asset ratio. */
export async function getMultiplier(
  client: XLayerClient,
  wrapper: Address,
): Promise<number> {
  const hit = multiplierCache.get(wrapper.toLowerCase());
  if (hit && Date.now() - hit.at < MULTIPLIER_CACHE_MS) return hit.value;
  const assets = await client.readContract({
    address: wrapper,
    abi: ERC4626_ABI,
    functionName: "convertToAssets",
    args: [10n ** 18n],
  });
  const value = Number(assets as bigint) / 1e18;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`convertToAssets returned invalid value for ${wrapper}`);
  }
  multiplierCache.set(wrapper.toLowerCase(), { at: Date.now(), value });
  return value;
}
