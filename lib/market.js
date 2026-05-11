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
  "USDD",
  "TUSD",
]);

// Module-level cache. On Vercel a warm Lambda reuses this between
// invocations, so CoinGecko / CryptoCompare / etc. don't get hammered.
// Different Lambda instances each keep their own copy — fine for the
// volumes involved here.
const cache = new Map();

async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.expires > now) return hit.value;
  try {
    const value = await fn();
    cache.set(key, { value, expires: now + ttlMs });
    return value;
  } catch (e) {
    if (hit) return hit.value; // serve stale on error
    throw e;
  }
}

export async function getMarketSnapshot() {
  const [prices, global, fng, dex, news] = await Promise.allSettled([
    cached("prices", 30_000, fetchPrices),
    cached("global", 180_000, fetchGlobal),
    cached("fng", 300_000, fetchFng),
    cached("dex", 30_000, fetchSolanaTrending),
    cached("news", 300_000, fetchNews),
  ]);

  return {
    btc: ok(prices)?.btc ?? null,
    eth: ok(prices)?.eth ?? null,
    sol: ok(prices)?.sol ?? null,
    global: ok(global) ?? null,
    fearGreed: ok(fng) ?? null,
    trending: ok(dex) ?? [],
    news: ok(news) ?? [],
    fetchedAt: Date.now(),
  };
}

function ok(p) {
  return p.status === "fulfilled" ? p.value : null;
}

async function fetchPrices() {
  const url =
    "https://api.coingecko.com/api/v3/simple/price" +
    "?ids=solana,bitcoin,ethereum" +
    "&vs_currencies=usd" +
    "&include_24hr_change=true" +
    "&include_24hr_vol=true";
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`coingecko prices ${res.status}`);
  const data = await res.json();
  return {
    sol: pickPrice(data.solana),
    btc: pickPrice(data.bitcoin),
    eth: pickPrice(data.ethereum),
  };
}

function pickPrice(p) {
  if (!p) return null;
  return {
    price: numOrNull(p.usd),
    change24h: numOrNull(p.usd_24h_change),
    vol24h: numOrNull(p.usd_24h_vol),
  };
}

async function fetchGlobal() {
  const res = await fetch("https://api.coingecko.com/api/v3/global", {
    headers: { accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`coingecko global ${res.status}`);
  const data = await res.json();
  const d = data?.data ?? {};
  return {
    totalMcapUsd: numOrNull(d.total_market_cap?.usd),
    totalVolUsd: numOrNull(d.total_volume?.usd),
    btcDominance: numOrNull(d.market_cap_percentage?.btc),
    ethDominance: numOrNull(d.market_cap_percentage?.eth),
    mcapChange24h: numOrNull(d.market_cap_change_percentage_24h_usd),
  };
}

async function fetchFng() {
  const res = await fetch(
    "https://api.alternative.me/fng/?limit=1&format=json",
    { headers: { accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`fng ${res.status}`);
  const data = await res.json();
  const d = data?.data?.[0];
  if (!d) return null;
  return {
    value: Number(d.value),
    classification: d.value_classification,
  };
}

async function fetchNews() {
  const res = await fetch(
    "https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest",
    { headers: { accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`cryptocompare news ${res.status}`);
  const data = await res.json();
  const items = (data?.Data ?? []).slice(0, 8).map((n) => ({
    title: (n.title ?? "").slice(0, 160),
    source: n.source_info?.name ?? n.source ?? "unknown",
  }));
  return items;
}

async function fetchSolanaTrending() {
  const res = await fetch(
    `https://api.dexscreener.com/latest/dex/tokens/${WSOL_MINT}`,
    { headers: { accept: "application/json" }, cache: "no-store" }
  );
  if (!res.ok) throw new Error(`dexscreener ${res.status}`);
  const data = await res.json();
  const pairs = (data.pairs || [])
    .filter((p) => p.chainId === "solana" && p.baseToken && p.quoteToken)
    .map((p) => {
      const sol = p.baseToken.symbol === "SOL" ? p.baseToken : p.quoteToken;
      const other = sol === p.baseToken ? p.quoteToken : p.baseToken;
      if (!other || other.symbol === "SOL") return null;
      const sym = (other.symbol || "").toUpperCase();
      if (!sym || STABLES.has(sym)) return null;
      return {
        symbol: other.symbol,
        name: other.name,
        price: numOrNull(p.priceUsd),
        change24h: numOrNull(p.priceChange?.h24),
        change6h: numOrNull(p.priceChange?.h6),
        change1h: numOrNull(p.priceChange?.h1),
        volume24h: numOrNull(p.volume?.h24),
        liquidity: numOrNull(p.liquidity?.usd),
      };
    })
    .filter(Boolean)
    .filter(
      (p) => (p.liquidity ?? 0) >= 20_000 && (p.volume24h ?? 0) >= 50_000
    )
    .sort((a, b) => (b.volume24h ?? 0) - (a.volume24h ?? 0))
    .slice(0, 10);
  return pairs;
}

function numOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
