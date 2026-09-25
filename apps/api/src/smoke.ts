import {
  getMultiplier,
  getOkxTicker,
  getStockPrice,
  isNyseOpen,
  makeXLayerClient,
  readTokenMeta,
  XSTOCKS,
} from "@kwyh/core";

const rpcUrls = [
  process.env.XLAYER_RPC_URL ?? "https://rpc.xlayer.tech",
  process.env.XLAYER_RPC_URL_BACKUP ?? "https://xlayerrpc.okx.com",
];

async function main() {
  const chain = makeXLayerClient(rpcUrls);
  const market = isNyseOpen(new Date());
  console.log(
    `market: open=${market.open} reason=${market.reason} nextChange=${market.nextChange}`,
  );
  console.log(
    "ticker  redstone            as-of                    okx-last    symbol  dec  multiplier",
  );
  for (const t of XSTOCKS) {
    let stock = "err";
    let asOf = "-";
    try {
      const s = await getStockPrice(t.redstoneId);
      stock = s.price.toFixed(4);
      asOf = new Date(s.asOf).toISOString();
    } catch (e) {
      stock = `ERR ${(e as Error).message.slice(0, 40)}`;
    }
    let okx = "err";
    try {
      const k = await getOkxTicker(t.okxInstId);
      okx = k.last.toFixed(4);
    } catch (e) {
      okx = `ERR ${(e as Error).message.slice(0, 40)}`;
    }
    let symbol = "?";
    let dec = "?";
    let mult = "err";
    try {
      const meta = await readTokenMeta(chain, t.wrapper);
      symbol = meta.symbol;
      dec = String(meta.decimals);
      const m = await getMultiplier(chain, t.wrapper);
      mult = m.toFixed(6);
    } catch (e) {
      mult = `ERR ${(e as Error).message.slice(0, 60)}`;
    }
    console.log(
      `${t.ticker.padEnd(8)}${stock.padEnd(20)}${asOf.padEnd(25)}${okx.padEnd(12)}${symbol.padEnd(8)}${dec.padEnd(5)}${mult}`,
    );
  }
}

main().catch((e) => {
  console.error("smoke failed:", e);
  process.exit(1);
});
