import OpenAI from "openai";
import {
  isKvConfigured,
  readState,
  writeState,
  tryAcquireLock,
  releaseLock,
} from "../../lib/kv";
import { getMarketSnapshot } from "../../lib/market";
import { SYSTEM_PROMPT } from "../../lib/system-prompt";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const COOLDOWN_BASE_MS = 8_000;
const COOLDOWN_JITTER_MS = 4_000;
const MAX_LINES = 200;
const LOCK_TTL_SEC = 30;
const RECENT_CONTEXT_LINES = 20;

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "OPENAI_API_KEY not configured",
      configured: { openai: false, kv: isKvConfigured },
      lines: [],
      lastLineAt: 0,
    });
  }

  await maybeGenerate();

  const final = await readState();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    ok: true,
    lines: final.lines || [],
    lastLineAt: final.lastLineAt || 0,
    configured: { openai: true, kv: isKvConfigured },
    serverTime: Date.now(),
  });
}

async function maybeGenerate() {
  const state = await readState();
  const now = Date.now();
  const cooldown =
    COOLDOWN_BASE_MS + Math.floor(Math.random() * COOLDOWN_JITTER_MS);
  if (now - (state.lastLineAt || 0) < cooldown) return;

  const locked = await tryAcquireLock(LOCK_TTL_SEC);
  if (!locked) return;

  try {
    // Re-read under the lock so we don't double-generate when two pollers
    // race and one wins the lock right after the other already generated.
    const fresh = await readState();
    if (Date.now() - (fresh.lastLineAt || 0) < cooldown) return;

    const market = await getMarketSnapshot().catch(() => ({
      btc: null,
      eth: null,
      sol: null,
      global: null,
      fearGreed: null,
      trending: [],
      news: [],
    }));

    const newTexts = await generateLines(
      market,
      (fresh.lines || []).slice(-RECENT_CONTEXT_LINES)
    );
    if (newTexts.length === 0) return;

    const t0 = Date.now();
    const newLines = newTexts.map((text, i) => ({
      id: `${t0}-${i}`,
      t: t0 + i * 1200,
      text,
    }));
    const merged = [...(fresh.lines || []), ...newLines].slice(-MAX_LINES);
    await writeState({ lines: merged, lastLineAt: Date.now() });
  } catch (e) {
    console.error("[state] generation error:", e?.message ?? e);
  } finally {
    await releaseLock();
  }
}

async function generateLines(market, recent) {
  const userMsg = buildUserMessage(market, recent);
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_tokens: 220,
    temperature: 0.95,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userMsg },
    ],
  });
  const raw = completion.choices?.[0]?.message?.content ?? "";
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 220)
    .slice(0, 2);
}

function buildUserMessage(market, recent) {
  const out = [];
  out.push(`SERVER TIME (UTC): ${new Date().toISOString()}`);
  out.push("");

  out.push("PRICES:");
  if (market.btc?.price != null) {
    out.push(
      `- BTC: $${fmt(market.btc.price, 0)} (24h ${pct(market.btc.change24h)})`
    );
  }
  if (market.eth?.price != null) {
    out.push(
      `- ETH: $${fmt(market.eth.price, 0)} (24h ${pct(market.eth.change24h)})`
    );
  }
  if (market.sol?.price != null) {
    out.push(
      `- SOL: $${fmt(market.sol.price, 2)} (24h ${pct(market.sol.change24h)})`
    );
  }

  if (market.global) {
    out.push("");
    out.push("GLOBAL MACRO:");
    if (market.global.totalMcapUsd != null) {
      out.push(
        `- Total crypto mcap: $${fmtBig(market.global.totalMcapUsd)} (24h ${pct(
          market.global.mcapChange24h
        )})`
      );
    }
    if (market.global.btcDominance != null) {
      out.push(
        `- BTC dominance: ${market.global.btcDominance.toFixed(2)}%`
      );
    }
    if (market.global.ethDominance != null) {
      out.push(
        `- ETH dominance: ${market.global.ethDominance.toFixed(2)}%`
      );
    }
  }

  if (market.fearGreed) {
    out.push("");
    out.push(
      `FEAR & GREED INDEX: ${market.fearGreed.value} (${market.fearGreed.classification})`
    );
  }

  if (Array.isArray(market.trending) && market.trending.length > 0) {
    out.push("");
    out.push("TRENDING SOLANA PAIRS (paired with SOL, by 24h vol):");
    market.trending.forEach((t) => {
      const priceStr = t.price != null ? `$${fmt(t.price, 6)}` : "n/a";
      const volStr = t.volume24h != null ? `$${fmt(t.volume24h, 0)}` : "n/a";
      const liqStr = t.liquidity != null ? `$${fmt(t.liquidity, 0)}` : "n/a";
      out.push(
        `- $${t.symbol} ${priceStr} | 24h ${pct(t.change24h)} | 6h ${pct(
          t.change6h
        )} | 1h ${pct(t.change1h)} | vol ${volStr} | liq ${liqStr}`
      );
    });
  }

  if (Array.isArray(market.news) && market.news.length > 0) {
    out.push("");
    out.push("LATEST CRYPTO HEADLINES (recent, from CryptoCompare):");
    market.news.forEach((n) => {
      out.push(`- [${n.source}] ${n.title}`);
    });
  }

  if (recent && recent.length > 0) {
    out.push("");
    out.push(
      "RECENT LINES YOU JUST WROTE (do NOT repeat these angles or phrasing — pick a different angle from the list):"
    );
    recent.forEach((l) => out.push(`  ${l.text}`));
  }

  out.push("");
  out.push(
    "Write 1 new terminal line (or 2 if clearly different angles). " +
      "Pick the FRESHEST angle: news, coin spotlight, macro, sentiment, $TT lore, trader advice, pseudo-system command, OR price action. " +
      "Do NOT default to BTC/SOL price — rotate. Ground takes in the live data above. " +
      "Output ONLY the new line(s)."
  );
  return out.join("\n");
}

function fmt(n, digits) {
  if (n == null) return "n/a";
  const v = Number(n);
  if (!Number.isFinite(v)) return "n/a";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtBig(n) {
  if (n == null) return "n/a";
  const v = Number(n);
  if (!Number.isFinite(v)) return "n/a";
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  return fmt(v, 0);
}

function pct(n) {
  if (n == null) return "n/a";
  const v = Number(n);
  if (!Number.isFinite(v)) return "n/a";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
