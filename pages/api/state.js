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
const RECENT_CONTEXT_LINES = 14;

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
      sol: null,
      trending: [],
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
  out.push(`SERVER TIME: ${new Date().toISOString()}`);
  out.push("");
  out.push("LIVE MARKET SNAPSHOT:");
  if (market.btc?.price != null) {
    out.push(
      `- BTC: $${fmt(market.btc.price, 0)} (24h ${pct(market.btc.change24h)})`
    );
  }
  if (market.sol?.price != null) {
    out.push(
      `- SOL: $${fmt(market.sol.price, 2)} (24h ${pct(market.sol.change24h)})`
    );
  }
  if (Array.isArray(market.trending) && market.trending.length > 0) {
    out.push("");
    out.push("TRENDING SOLANA PAIRS (by 24h volume):");
    market.trending.forEach((t) => {
      const priceStr = t.price != null ? `$${fmt(t.price, 6)}` : "n/a";
      const volStr = t.volume24h != null ? `$${fmt(t.volume24h, 0)}` : "n/a";
      out.push(
        `- $${t.symbol} — ${priceStr} (24h ${pct(t.change24h)}, 1h ${pct(
          t.change1h
        )}, vol ${volStr})`
      );
    });
  }

  if (recent && recent.length > 0) {
    out.push("");
    out.push("RECENT LINES (do NOT repeat these angles or phrasing):");
    recent.forEach((l) => out.push(`  ${l.text}`));
  }

  out.push("");
  out.push(
    "Write 1 new terminal line now (or 2 if they are clearly different angles). " +
      "Ground the take in the live numbers above. Vary the style/tag from the recent context. " +
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

function pct(n) {
  if (n == null) return "n/a";
  const v = Number(n);
  if (!Number.isFinite(v)) return "n/a";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}
