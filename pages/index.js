import Head from "next/head";
import { useEffect, useRef, useState, useCallback } from "react";

const POLL_MS = 3000;
const REVEAL_GAP_MS = 1200;
const RENDER_CAP = 120;

export default function Home() {
  const [serverLines, setServerLines] = useState([]);
  const [visible, setVisible] = useState([]);
  const [config, setConfig] = useState({ openai: true, kv: true });
  const [status, setStatus] = useState("CONNECTING");
  const [errorMsg, setErrorMsg] = useState(null);
  const [lastLineAt, setLastLineAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [stickToBottom, setStickToBottom] = useState(true);

  const queueRef = useRef([]);
  const revealTimerRef = useRef(null);
  const seenIdsRef = useRef(new Set());
  const scrollRef = useRef(null);
  const endRef = useRef(null);
  const isFirstLoadRef = useRef(true);

  // Poll the shared state endpoint.
  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/state", { method: "GET" });
        const data = await res.json();
        if (cancelled) return;
        if (data.ok) {
          setServerLines(data.lines || []);
          setLastLineAt(data.lastLineAt || 0);
          setConfig(data.configured || { openai: true, kv: true });
          setErrorMsg(null);
          setStatus("LIVE");
        } else {
          setErrorMsg(data.error || "backend error");
          setStatus("ERROR");
        }
      } catch (e) {
        if (!cancelled) {
          setErrorMsg(e.message);
          setStatus("OFFLINE");
        }
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  // Clock tick for "since X ago" display.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Reveal new lines: instant flush on first load, drip-fed thereafter.
  useEffect(() => {
    const pending = serverLines.filter((l) => !seenIdsRef.current.has(l.id));
    if (pending.length === 0) return;

    if (isFirstLoadRef.current) {
      pending.forEach((l) => seenIdsRef.current.add(l.id));
      setVisible((prev) => [...prev, ...pending].slice(-RENDER_CAP));
      isFirstLoadRef.current = false;
      return;
    }

    queueRef.current = [...queueRef.current, ...pending];
    pending.forEach((l) => seenIdsRef.current.add(l.id));

    if (revealTimerRef.current) return;
    const tick = () => {
      const next = queueRef.current.shift();
      if (!next) {
        revealTimerRef.current = null;
        return;
      }
      setVisible((prev) => [...prev, next].slice(-RENDER_CAP));
      revealTimerRef.current = setTimeout(tick, REVEAL_GAP_MS);
    };
    revealTimerRef.current = setTimeout(tick, REVEAL_GAP_MS);
  }, [serverLines]);

  // Auto-scroll if user is stuck near the bottom.
  useEffect(() => {
    if (!stickToBottom) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [visible, stickToBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setStickToBottom(atBottom);
  }, []);

  const queuedCount = queueRef.current.length;
  const sinceLastSec = lastLineAt
    ? Math.max(0, Math.floor((now - lastLineAt) / 1000))
    : null;

  return (
    <>
      <Head>
        <title>Troll Terminal — live</title>
      </Head>

      <div style={styles.container}>
        <div style={styles.bgGlow} />
        <div style={styles.scanlines} />

        <div style={styles.terminalWindow}>
          <div style={styles.titleBar}>
            <span style={styles.title}>
              TROLL TERMINAL — autonomous live broadcast
            </span>
            <div style={styles.statusGroup}>
              <span style={styles.statusDot(status)} />
              <span style={styles.statusText}>{status}</span>
              <span style={styles.muted}>
                {sinceLastSec != null
                  ? ` · last line ${sinceLastSec}s ago`
                  : ""}
              </span>
              <span style={styles.muted}>
                {queuedCount > 0 ? ` · +${queuedCount} queued` : ""}
              </span>
              <div style={styles.trafficLights}>
                <div style={{ ...styles.light, backgroundColor: "#ff5f56" }} />
                <div style={{ ...styles.light, backgroundColor: "#ffbd2e" }} />
                <div style={{ ...styles.light, backgroundColor: "#27c93f" }} />
              </div>
            </div>
          </div>

          {!config.kv && (
            <div style={styles.banner}>
              [WARN] shared state not configured — set UPSTASH_REDIS_REST_URL /
              UPSTASH_REDIS_REST_TOKEN. running in single-process memory mode
              (each Vercel instance will diverge).
            </div>
          )}
          {errorMsg && (
            <div style={{ ...styles.banner, color: "#ff7a7a" }}>
              [ERROR] {errorMsg}
            </div>
          )}

          <div
            style={styles.content}
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {visible.length === 0 && (
              <div style={{ ...styles.line, opacity: 0.55 }}>
                <span style={styles.lineNum}>....</span>
                <span style={styles.lineText}>
                  awaiting first signal<span className="blink">_</span>
                </span>
              </div>
            )}
            {visible.map((l, i) => (
              <div
                key={l.id}
                style={{ ...styles.line, animation: "fadeIn 0.4s ease-out both" }}
              >
                <span style={styles.lineNum}>
                  {String(i + 1).padStart(4, "0")}
                </span>
                <span style={styles.timestamp}>{fmtTime(l.t)}</span>
                <span style={lineColor(l.text)}>{l.text}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {!stickToBottom && (
            <button
              style={styles.jumpBtn}
              onClick={() => {
                setStickToBottom(true);
                endRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              ↓ jump to live
            </button>
          )}
        </div>

        <div style={styles.footer}>
          autonomous broadcast · everyone sees the same feed · not financial
          advice
        </div>

        <style jsx global>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-2px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes scanline {
            0% { transform: translateY(0); }
            100% { transform: translateY(4px); }
          }
          @keyframes flicker {
            0%, 100% { opacity: 1; }
            48% { opacity: 1; }
            50% { opacity: 0.9; }
            52% { opacity: 1; }
          }
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
          .blink { animation: blink 1s steps(2) infinite; }
        `}</style>
      </div>
    </>
  );
}

function fmtTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  const ss = String(d.getUTCSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function lineColor(text) {
  const base = { ...styles.lineText };
  if (/\[ERROR\]|\[RIP\]|\[LIQ\]/i.test(text)) {
    return { ...base, color: "#ff5d5d", textShadow: "0 0 8px rgba(255,93,93,0.5)" };
  }
  if (/\[ALERT\]|\[WATCH\]|\[WHALE\]/i.test(text)) {
    return { ...base, color: "#ffd24d", textShadow: "0 0 8px rgba(255,210,77,0.5)" };
  }
  if (/\[TROLL\]|\[PSA\]/i.test(text)) {
    return { ...base, color: "#ff7af0", textShadow: "0 0 8px rgba(255,122,240,0.5)" };
  }
  if (/\[MACRO\]|\[NEWS\]|\[SENTIMENT\]/i.test(text)) {
    return { ...base, color: "#9fdcff", textShadow: "0 0 8px rgba(159,220,255,0.45)" };
  }
  if (/\[CONVICTION\]|\$TT\b/.test(text)) {
    return {
      ...base,
      color: "#9bff9b",
      fontWeight: 700,
      textShadow: "0 0 10px rgba(0,255,0,0.7)",
    };
  }
  if (/^\s*\$/.test(text)) {
    return { ...base, color: "#a0f5ff", textShadow: "0 0 6px rgba(160,245,255,0.4)" };
  }
  return base;
}

const styles = {
  container: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0a0a0a",
    fontFamily: "'IBM Plex Mono', monospace",
    overflow: "hidden",
    position: "relative",
    padding: "16px",
  },
  bgGlow: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 20% 30%, rgba(0,255,0,0.06) 0%, transparent 55%), radial-gradient(circle at 80% 70%, rgba(0,255,0,0.04) 0%, transparent 50%)",
    pointerEvents: "none",
  },
  scanlines: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(0deg, rgba(0,0,0,0.18) 1px, transparent 1px)",
    backgroundSize: "100% 3px",
    pointerEvents: "none",
    opacity: 0.6,
    animation: "scanline 0.25s linear infinite",
    mixBlendMode: "multiply",
  },
  terminalWindow: {
    width: "100%",
    maxWidth: "1100px",
    height: "85vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#0d0d0d",
    border: "1.5px solid #00ff00",
    borderRadius: "6px",
    boxShadow:
      "0 0 40px rgba(0, 255, 0, 0.35), inset 0 0 60px rgba(0, 0, 0, 0.85)",
    zIndex: 10,
    position: "relative",
    animation: "flicker 6s infinite",
  },
  titleBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 12px",
    backgroundColor: "#111",
    borderBottom: "1px solid #00ff00",
    fontSize: "12px",
    flexShrink: 0,
  },
  title: {
    color: "#00ff00",
    fontWeight: 700,
    letterSpacing: "0.04em",
    textShadow: "0 0 10px rgba(0, 255, 0, 0.6)",
  },
  statusGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontSize: 11,
  },
  statusDot: (status) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor:
      status === "LIVE"
        ? "#00ff00"
        : status === "CONNECTING"
        ? "#ffd24d"
        : "#ff4d4d",
    boxShadow: "0 0 8px currentColor",
  }),
  statusText: {
    color: "#00ff00",
    letterSpacing: "0.08em",
  },
  muted: {
    color: "#3a6e3a",
    letterSpacing: "0.04em",
  },
  banner: {
    padding: "6px 12px",
    backgroundColor: "rgba(255, 210, 77, 0.08)",
    borderBottom: "1px solid rgba(255, 210, 77, 0.25)",
    color: "#ffd24d",
    fontSize: 11,
    letterSpacing: "0.02em",
  },
  trafficLights: {
    display: "flex",
    gap: "6px",
    marginLeft: "10px",
  },
  light: {
    width: "11px",
    height: "11px",
    borderRadius: "50%",
  },
  content: {
    flex: 1,
    overflowY: "auto",
    padding: "14px 18px",
    fontSize: "13px",
    lineHeight: "1.6",
    color: "#00ff00",
    textShadow: "0 0 6px rgba(0, 255, 0, 0.25)",
    backgroundImage:
      "linear-gradient(180deg, rgba(0,255,0,0.02), transparent 30%)",
  },
  line: {
    display: "flex",
    gap: "10px",
    marginBottom: "2px",
  },
  lineNum: {
    color: "#2e5a2e",
    userSelect: "none",
    minWidth: "44px",
    textAlign: "right",
  },
  timestamp: {
    color: "#3a6e3a",
    userSelect: "none",
    minWidth: "70px",
  },
  lineText: {
    flex: 1,
    fontWeight: 400,
    wordBreak: "break-word",
    color: "#00ff00",
  },
  jumpBtn: {
    position: "absolute",
    bottom: 12,
    right: 16,
    padding: "4px 10px",
    backgroundColor: "#00ff00",
    color: "#000",
    border: "none",
    borderRadius: 3,
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    cursor: "pointer",
    boxShadow: "0 0 10px rgba(0,255,0,0.6)",
  },
  footer: {
    marginTop: "10px",
    color: "#00ff00",
    fontSize: "11px",
    opacity: 0.55,
    textAlign: "center",
    zIndex: 5,
  },
};
