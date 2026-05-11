import { SYSTEM_PROMPT } from "./system-prompt";

// Direct fetch instead of the openai SDK — the SDK pulls in Node-only APIs
// (process.platform, process.arch, process.version) that break Vercel Edge.
// One POST to chat/completions is all we need here.
export async function generateLines(market, recent) {
  const userMsg = buildUserMessage(market, recent);
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 220,
      temperature: 0.95,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`openai ${res.status}: ${errText.slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content ?? "";
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 220)
    .slice(0, 2);
}

export function buildUserMessage(market, recent) {
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
      out.push(`- BTC dominance: ${market.global.btcDominance.toFixed(2)}%`);
    }
    if (market.global.ethDominance != null) {
      out.push(`- ETH dominance: ${market.global.ethDominance.toFixed(2)}%`);
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

function pct(n) {
  if (n == null) return "n/a";
  const v = Number(n);
  if (!Number.isFinite(v)) return "n/a";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
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
