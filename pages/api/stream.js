import {
  isKvConfigured,
  readState,
  writeState,
  tryAcquireLock,
  releaseLock,
} from "../../lib/kv";
import { getMarketSnapshot } from "../../lib/market";
import { generateLines } from "../../lib/generator";

// Node.js serverless runtime. Streams via res.write(); Vercel Hobby allows
// up to 60s with maxDuration set in vercel.json — we cap at ~25s ourselves
// and the client reconnects on 'bye'.

const TICK_MS = 3000;
const MAX_CONNECTION_MS = 25_000;
const COOLDOWN_BASE_MS = 8_000;
const COOLDOWN_JITTER_MS = 4_000;
const MAX_LINES = 200;
const LOCK_TTL_SEC = 30;
const RECENT_CONTEXT_LINES = 20;
const STATE_CACHE_TTL_MS = 2500;
const GENERATE_ATTEMPT_PROB = 0.35;

// Per-Lambda instance cache. Vercel keeps a warm Lambda for a while between
// invocations, so concurrent clients on the same instance share these reads
// instead of each hitting Upstash on every tick.
let cachedState = null;
let cachedAt = 0;

async function readStateCached() {
  const now = Date.now();
  if (cachedState && now - cachedAt < STATE_CACHE_TTL_MS) return cachedState;
  cachedState = await readState();
  cachedAt = now;
  return cachedState;
}

function invalidateStateCache() {
  cachedAt = 0;
}

export default async function handler(req, res) {
  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({ ok: false, error: "OPENAI_API_KEY not configured" });
    return;
  }

  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  // Flush headers immediately so the client's EventSource opens.
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  let aborted = false;
  const cleanup = () => {
    aborted = true;
  };
  req.on("close", cleanup);
  req.on("error", cleanup);

  const send = (event, data) => {
    if (aborted) return false;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      return true;
    } catch (_) {
      aborted = true;
      return false;
    }
  };

  const startTime = Date.now();
  let lastSeenT = 0;

  // Initial snapshot + opportunistic generation.
  try {
    if (Math.random() < 0.5) {
      await maybeGenerate();
    }
    const state = await readStateCached();
    if (state.lines?.length) {
      lastSeenT = state.lines[state.lines.length - 1].t || 0;
    }
    send("snapshot", {
      lines: state.lines || [],
      lastLineAt: state.lastLineAt || 0,
      configured: { openai: true, kv: isKvConfigured },
      serverTime: Date.now(),
    });
  } catch (e) {
    send("error", { message: String(e?.message ?? e) });
  }

  while (!aborted && Date.now() - startTime < MAX_CONNECTION_MS) {
    await sleep(TICK_MS);
    if (aborted) break;

    try {
      if (Math.random() < GENERATE_ATTEMPT_PROB) {
        await maybeGenerate();
      }
      const fresh = await readStateCached();
      const newLines = (fresh.lines || []).filter(
        (l) => (l.t || 0) > lastSeenT
      );
      if (newLines.length > 0) {
        send("append", {
          lines: newLines,
          lastLineAt: fresh.lastLineAt || 0,
          serverTime: Date.now(),
        });
        lastSeenT = newLines[newLines.length - 1].t || lastSeenT;
      } else {
        send("ping", {
          serverTime: Date.now(),
          lastLineAt: fresh.lastLineAt || 0,
        });
      }
    } catch (e) {
      send("error", { message: String(e?.message ?? e) });
    }
  }

  send("bye", { reconnect: true });
  try {
    res.end();
  } catch (_) {}
}

async function maybeGenerate() {
  const state = await readStateCached();
  const now = Date.now();
  const cooldown =
    COOLDOWN_BASE_MS + Math.floor(Math.random() * COOLDOWN_JITTER_MS);
  if (now - (state.lastLineAt || 0) < cooldown) return;

  const locked = await tryAcquireLock(LOCK_TTL_SEC);
  if (!locked) return;

  try {
    invalidateStateCache();
    const fresh = await readState();
    if (Date.now() - (fresh.lastLineAt || 0) < cooldown) return;

    const market = await getMarketSnapshot().catch(() => emptyMarket());
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
    invalidateStateCache();
  } catch (e) {
    console.error("[stream] generate failed:", String(e?.message ?? e));
  } finally {
    await releaseLock();
  }
}

function emptyMarket() {
  return {
    btc: null,
    eth: null,
    sol: null,
    global: null,
    fearGreed: null,
    trending: [],
    news: [],
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
