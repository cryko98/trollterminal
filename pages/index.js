import Head from "next/head";
import React, { useState, useEffect, useRef, useCallback } from "react";

const BOOT_LINES = [
  "[BOOT_SEQUENCE] troll-terminal v6.9.420 | MEMECOIN WARFARE PROTOCOL ACTIVE",
  "[SYSTEM] Loading memecoin warfare protocols...",
  "[SYSTEM] Connecting to dexscreener feed...",
  "[SYSTEM] Calibrating troll energy levels: MAXIMUM",
  "[SYSTEM] $TT UNLIMITED POTENTIAL mode: ACTIVE",
  "[SYSTEM] Ignoring financial advisors... done.",
  "$ _",
];

const MAX_LINES = 80;

export default function Home() {
  const [lines, setLines] = useState(BOOT_LINES);
  const [isLoading, setIsLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(true);
  const [status, setStatus] = useState("READY");
  const endRef = useRef(null);
  const contentRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  const appendLinesStaggered = useCallback((newLines) => {
    newLines.forEach((line, idx) => {
      setTimeout(() => {
        if (!isMountedRef.current) return;
        setLines((prev) => {
          const next = [...prev, line];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      }, idx * 80);
    });
  }, []);

  const fetchLines = useCallback(async () => {
    if (isLoading) return;
    setIsLoading(true);
    setStatus("FETCHING");
    try {
      const res = await fetch("/api/terminal", {
        method: "POST",
        headers: { "content-type": "application/json" },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.lines) && data.lines.length > 0) {
        appendLinesStaggered(data.lines);
        setStatus("STREAMING");
      } else {
        appendLinesStaggered([
          "[ERROR] backend returned empty payload",
          "[TROLL] retail traders would panic. $TT holders? unfazed.",
          "$ _",
        ]);
        setStatus("ERROR");
      }
    } catch (e) {
      appendLinesStaggered([
        "[ERROR] connection lost to mothership",
        "[TROLL] reality glitched, $TT conviction intact",
        "$ _",
      ]);
      setStatus("OFFLINE");
    } finally {
      // small delay so the "processing" state is perceivable
      setTimeout(() => {
        if (isMountedRef.current) setIsLoading(false);
      }, 250);
    }
  }, [appendLinesStaggered, isLoading]);

  // initial fetch on mount
  useEffect(() => {
    const t = setTimeout(() => fetchLines(), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // auto-refresh every 20s
  useEffect(() => {
    if (!autoMode) return;
    const interval = setInterval(() => fetchLines(), 20000);
    return () => clearInterval(interval);
  }, [autoMode, fetchLines]);

  return (
    <>
      <Head>
        <title>Troll Terminal — $TT UNLIMITED POTENTIAL</title>
      </Head>

      <div style={styles.container}>
        <div style={styles.bgGlow} />
        <div style={styles.scanlines} />

        <div style={styles.terminalWindow}>
          <div style={styles.titleBar}>
            <span style={styles.title}>
              TROLL TERMINAL [$TT] — MEMECOIN WARFARE
            </span>
            <div style={styles.statusGroup}>
              <span style={styles.statusDot(status)} />
              <span style={styles.statusText}>{status}</span>
              <div style={styles.trafficLights}>
                <div style={{ ...styles.light, backgroundColor: "#ff5f56" }} />
                <div style={{ ...styles.light, backgroundColor: "#ffbd2e" }} />
                <div style={{ ...styles.light, backgroundColor: "#27c93f" }} />
              </div>
            </div>
          </div>

          <div style={styles.content} ref={contentRef}>
            {lines.map((line, i) => (
              <div
                key={`${i}-${line.slice(0, 12)}`}
                style={{
                  ...styles.line,
                  animation: `fadeIn 0.35s ease-out both`,
                }}
              >
                <span style={styles.lineNum}>
                  {String(i + 1).padStart(4, "0")}
                </span>
                <span style={lineColor(line)}>{line}</span>
              </div>
            ))}
            {isLoading && (
              <div style={{ ...styles.line, opacity: 0.7 }}>
                <span style={styles.lineNum}>{">>>"}</span>
                <span style={styles.lineText}>
                  processing market warfare<span className="blink">...</span>
                </span>
              </div>
            )}
            <div ref={endRef} />
          </div>

          <div style={styles.controls}>
            <button
              onClick={fetchLines}
              disabled={isLoading}
              style={{
                ...styles.btn,
                opacity: isLoading ? 0.5 : 1,
                cursor: isLoading ? "default" : "pointer",
              }}
            >
              {isLoading ? "PROCESSING..." : "GENERATE"}
            </button>
            <button
              onClick={() => setAutoMode((v) => !v)}
              style={{
                ...styles.btn,
                backgroundColor: autoMode ? "#00ff00" : "#1a1a1a",
                color: autoMode ? "#000" : "#00ff00",
              }}
            >
              {autoMode ? "AUTO: ON" : "AUTO: OFF"}
            </button>
            <button
              onClick={() => {
                setLines(["[SYSTEM] terminal flushed", "$ _"]);
                setStatus("READY");
              }}
              style={{
                ...styles.btn,
                backgroundColor: "#1a1a1a",
                color: "#00ff00",
              }}
            >
              CLEAR
            </button>
            <div style={styles.spacer} />
            <span style={styles.tickerLabel}>$TT // UNLIMITED POTENTIAL</span>
          </div>
        </div>

        <div style={styles.footer}>
          <p style={{ margin: 0 }}>
            $TT UNLIMITED POTENTIAL • TROLL TERMINAL v6.9.420 • WAGMI SER • NOT
            FINANCIAL ADVICE (but like... read between the lines)
          </p>
        </div>

        <style jsx global>{`
          @keyframes fadeIn {
            from {
              opacity: 0;
              transform: translateY(-2px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes scanline {
            0% {
              transform: translateY(0);
            }
            100% {
              transform: translateY(4px);
            }
          }
          @keyframes flicker {
            0%,
            100% {
              opacity: 1;
            }
            48% {
              opacity: 1;
            }
            50% {
              opacity: 0.85;
            }
            52% {
              opacity: 1;
            }
          }
          @keyframes blink {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0;
            }
          }
          .blink {
            animation: blink 1s steps(2) infinite;
          }
        `}</style>
      </div>
    </>
  );
}

function lineColor(line) {
  const base = { ...styles.lineText };
  if (/\[ERROR\]|\[RIP\]/i.test(line)) {
    return { ...base, color: "#ff4d4d", textShadow: "0 0 8px rgba(255,77,77,0.5)" };
  }
  if (/\[ALERT\]|\[WATCH\]/i.test(line)) {
    return { ...base, color: "#ffd24d", textShadow: "0 0 8px rgba(255,210,77,0.5)" };
  }
  if (/\[TROLL\]|LMAO|lmao/i.test(line)) {
    return { ...base, color: "#ff66ff", textShadow: "0 0 8px rgba(255,102,255,0.5)" };
  }
  if (/\[CONVICTION\]|\$TT/.test(line)) {
    return { ...base, color: "#7CFF7C", fontWeight: 700, textShadow: "0 0 10px rgba(0,255,0,0.7)" };
  }
  if (/^\s*\$/.test(line)) {
    return { ...base, color: "#9affff", textShadow: "0 0 6px rgba(154,255,255,0.4)" };
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
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background:
      "radial-gradient(circle at 20% 30%, rgba(0,255,0,0.06) 0%, transparent 55%), radial-gradient(circle at 80% 70%, rgba(0,255,0,0.04) 0%, transparent 50%)",
    pointerEvents: "none",
  },
  scanlines: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundImage:
      "linear-gradient(0deg, rgba(0, 0, 0, 0.18) 1px, transparent 1px)",
    backgroundSize: "100% 3px",
    pointerEvents: "none",
    opacity: 0.6,
    animation: "scanline 0.25s linear infinite",
    mixBlendMode: "multiply",
  },
  terminalWindow: {
    width: "100%",
    maxWidth: "1200px",
    height: "82vh",
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
    gap: "10px",
  },
  statusDot: (status) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    backgroundColor:
      status === "STREAMING"
        ? "#00ff00"
        : status === "FETCHING"
        ? "#ffd24d"
        : status === "ERROR" || status === "OFFLINE"
        ? "#ff4d4d"
        : "#7CFF7C",
    boxShadow: "0 0 8px currentColor",
  }),
  statusText: {
    color: "#00ff00",
    fontSize: 11,
    letterSpacing: "0.08em",
  },
  trafficLights: {
    display: "flex",
    gap: "6px",
    marginLeft: "8px",
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
    lineHeight: "1.55",
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
    color: "#3a6e3a",
    userSelect: "none",
    minWidth: "44px",
    textAlign: "right",
  },
  lineText: {
    flex: 1,
    fontWeight: 400,
    wordBreak: "break-word",
    color: "#00ff00",
  },
  controls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "10px 12px",
    backgroundColor: "#111",
    borderTop: "1px solid #00ff00",
  },
  btn: {
    padding: "6px 12px",
    backgroundColor: "#00ff00",
    color: "#000",
    border: "1px solid #00ff00",
    borderRadius: "2px",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: "11px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  spacer: {
    flex: 1,
  },
  tickerLabel: {
    color: "#00ff00",
    fontSize: 11,
    letterSpacing: "0.08em",
    opacity: 0.85,
  },
  footer: {
    marginTop: "12px",
    color: "#00ff00",
    fontSize: "11px",
    opacity: 0.6,
    textAlign: "center",
    zIndex: 5,
  },
};
