const WSOL_MINT = "So11111111111111111111111111111111111111112";

const STABLES = new Set([
  "USDC",
  "USDT",
  "DAI",
  "FDUSD",
  "USDS",
  "PYUSD",
  "USD1",
  "USDE",
  "SUSDE",
]);

export async function getMarketSnapshot() {
  const [solBtc, trending] = await Promise.allSettled([
    fetchSolBtc(),
    fetchSolanaTrending(),
  ]);
  return {
    btc: solBtc.status === "fulfilled" ? solBtc.value.btc : null,
    sol: solBtc.status === "fulfilled" ? solBtc.value.sol : null,
    trending: trending.status === "fulfilled" ? trending.value : [],
    fetchedAt: Date.now(),
  };
}

async function fetchSolBtc() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=solana,bitcoin" +
    "&vs_currencies=usd" +
    "&include_24hr_change=true" +
    "&include_24hr_vol=true";
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    // CoinGecko free tier is rate-limited; don't hammer.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const data = await res.json();
  return {
    sol: {
      price: numOrNull(data.solana?.usd),
      change24h: numOrNull(data.solana?.usd_24h_change),
      vol24h: numOrNull(data.solana?.usd_24h_vol),
    },
    btc: {
      price: numOrNull(data.bitcoin?.usd),
      change24h: numOrNull(data.bitcoin?.usd_24h_change),
      vol24h: numOrNull(data.bitcoin?.usd_24h_vol),
    },
  };
}

async function fetchSolanaTrending() {
  // Top pairs that include wrapped-SOL, sorted by 24h volume. Filter out
  // stables and SOL itself — what remains is roughly "what memecoins on
  // Solana are getting volume right now".
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${WSOL_MINT}`,
    { headers: { accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`dexscreener ${res.status}`);
  const data = await res.json();
  const pairs = (data.pairs || [])
    .filter((p) => p.chainId === "solana" && p.baseToken && p.quoteToken)
    .map((p) => {
      // The "interesting" token is whichever side ISN'T SOL.
      const sol = p.baseToken.symbol === "SOL" ? p.baseToken : p.quoteToken;
      const other = sol === p.baseToken ? p.quoteToken : p.baseToken;
      if (!other || other.symbol === "SOL") return null;
      if (STABLES.has(other.symbol)) return null;
      return {
        symbol: other.symbol,
        name: other.name,
        price: numOrNull(p.priceUsd),
        change24h: numOrNull(p.priceChange?.h24),
        change1h: numOrNull(p.priceChange?.h1),
        volume24h: numOrNull(p.volume?.h24),
        liquidity: numOrNull(p.liquidity?.usd),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, 6);
  return pairs;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
