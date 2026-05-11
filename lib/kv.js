import { Redis } from "@upstash/redis";

const STATE_KEY = "tt:state:v1";
const LOCK_KEY = "tt:lock:v1";

let client = null;
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN
) {
  client = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
}

export const isKvConfigured = !!client;

// In-memory fallback. Works only inside a single Node process — useful for
// `next dev`, useless on serverless production (each invocation gets fresh
// memory). Production must use Upstash.
const memory = {
  state: { lines: [], lastLineAt: 0 },
  locked: false,
  lockedUntil: 0,
};

function emptyState() {
  return { lines: [], lastLineAt: 0 };
}

export async function readState() {
  if (client) {
    try {
      const v = await client.get(STATE_KEY);
      return v ?? emptyState();
    } catch (e) {
      console.error("[kv] readState failed:", e?.message ?? e);
      return emptyState();
    }
  }
  return memory.state;
}

export async function writeState(state) {
  if (client) {
    try {
      await client.set(STATE_KEY, state);
    } catch (e) {
      console.error("[kv] writeState failed:", e?.message ?? e);
    }
  } else {
    memory.state = state;
  }
}

export async function tryAcquireLock(ttlSec) {
  if (client) {
    try {
      const r = await client.set(LOCK_KEY, "1", { nx: true, ex: ttlSec });
      return r === "OK";
    } catch (e) {
      console.error("[kv] lock failed:", e?.message ?? e);
      return false;
    }
  }
  const now = Date.now();
  if (memory.locked && memory.lockedUntil > now) return false;
  memory.locked = true;
  memory.lockedUntil = now + ttlSec * 1000;
  return true;
}

export async function releaseLock() {
  if (client) {
    try {
      await client.del(LOCK_KEY);
    } catch (e) {
      /* swallow */
    }
  } else {
    memory.locked = false;
  }
}
