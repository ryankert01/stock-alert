import { useState, useEffect, useCallback, useRef } from "react";

const DEFAULT_TICKERS = ["VOO", "VT", "QQQ"];
const AUTO_REFRESH_MS = 5 * 60 * 1000;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDrawdown(quote) {
  if (!quote?.week52High || !quote?.price) return null;
  return ((quote.week52High - quote.price) / quote.week52High) * 100;
}

function getAlert(drawdown) {
  if (drawdown === null) return null;
  if (drawdown >= 20) return { label: "BEAR", color: "#ef4444", bg: "rgba(239,68,68,0.09)", border: "#ef444440" };
  if (drawdown >= 10) return { label: "WARN", color: "#f59e0b", bg: "rgba(245,158,11,0.09)", border: "#f59e0b40" };
  return null;
}

async function fetchQuotes(tickers) {
  const res = await fetch(`/api/quote?symbols=${tickers.join(",")}`);

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON from /api/quote but received ${contentType || "unknown content type"} — the API endpoint may be down`
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.quotes;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Shimmer({ w = 80 }) {
  return (
    <span style={{
      display: "inline-block", height: 9, width: w, borderRadius: 3,
      background: "linear-gradient(90deg,#1e293b 25%,#253247 50%,#1e293b 75%)",
      backgroundSize: "200% 100%", animation: "shimmer 1.4s infinite",
      verticalAlign: "middle",
    }} />
  );
}

function DrawdownBar({ drawdown }) {
  if (drawdown === null) return <span style={{ color: "#263248", fontFamily: "monospace" }}>—</span>;
  const fill = drawdown >= 20 ? "#ef4444" : drawdown >= 10 ? "#f59e0b" : "#22c55e";
  const pct  = Math.min((drawdown / 40) * 100, 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "flex-end" }}>
      <div style={{ width: 68, height: 5, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden", flexShrink: 0 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: fill, borderRadius: 3, transition: "width .6s ease" }} />
      </div>
      <span style={{ fontFamily: "monospace", fontSize: 11, color: fill, width: 48, textAlign: "right" }}>
        −{drawdown.toFixed(1)}%
      </span>
    </div>
  );
}

function StockRow({ stock, onRemove }) {
  const { ticker, quote, loading, error } = stock;
  const drawdown = getDrawdown(quote);
  const alert    = getAlert(drawdown);
  const change   = quote?.change1d ?? 0;

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "70px 1fr 86px 76px 90px 136px 32px",
      alignItems: "center", gap: "0 10px",
      padding: "13px 18px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      borderLeft: `3px solid ${alert ? alert.color : "transparent"}`,
      background: alert ? alert.bg : "transparent",
      transition: "background .4s, border-color .4s",
    }}>
      <div>
        <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#e2e8f0", letterSpacing: 1 }}>
          {ticker}
        </div>
        {alert && (
          <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 2, color: alert.color, marginTop: 2 }}>
            {alert.label}
          </div>
        )}
      </div>

      <div style={{ fontSize: 12, color: "#4b6280", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {loading ? <Shimmer w={130} /> : error
          ? <span style={{ color: "#ef4444", fontSize: 11 }}>{error}</span>
          : quote?.name}
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 14, color: "#f1f5f9", textAlign: "right" }}>
        {loading ? <Shimmer w={58} /> : quote ? `$${quote.price.toFixed(2)}` : "—"}
      </div>

      <div style={{
        fontFamily: "monospace", fontSize: 12, textAlign: "right",
        color: change > 0 ? "#22c55e" : change < 0 ? "#ef4444" : "#475569",
      }}>
        {loading ? <Shimmer w={44} /> : quote ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
      </div>

      <div style={{ fontFamily: "monospace", fontSize: 11, color: "#3d5270", textAlign: "right" }}>
        {loading ? <Shimmer w={54} /> : quote ? `$${quote.week52High.toFixed(2)}` : "—"}
      </div>

      <div>
        {loading
          ? <div style={{ display: "flex", justifyContent: "flex-end" }}><Shimmer w={106} /></div>
          : <DrawdownBar drawdown={drawdown} />}
      </div>

      <button
        onClick={() => onRemove(ticker)}
        style={{ background: "none", border: "none", color: "#2a3a50", cursor: "pointer", fontSize: 18, padding: "2px 4px", borderRadius: 4, lineHeight: 1, transition: "color .15s" }}
        onMouseEnter={e => e.currentTarget.style.color = "#ef4444"}
        onMouseLeave={e => e.currentTarget.style.color = "#2a3a50"}
      >×</button>
    </div>
  );
}

function AlertBanner({ stocks }) {
  const hits = stocks.filter(s => { const d = getDrawdown(s.quote); return d !== null && d >= 10; });
  if (!hits.length) return null;
  return (
    <div style={{
      marginBottom: 18, padding: "11px 16px", borderRadius: 8,
      border: "1px solid rgba(239,68,68,0.22)", background: "rgba(239,68,68,0.06)",
      display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
    }}>
      <span style={{ fontSize: 10, fontFamily: "monospace", color: "#f87171", fontWeight: 800, letterSpacing: 2 }}>
        ⚠ ALERTS
      </span>
      {hits.map(s => {
        const d = getDrawdown(s.quote);
        const lvl = getAlert(d);
        return (
          <span key={s.ticker} style={{
            padding: "2px 9px", borderRadius: 4, fontSize: 11,
            fontFamily: "monospace", color: lvl.color,
            background: lvl.bg, border: `1px solid ${lvl.border}`,
          }}>
            {s.ticker} −{d.toFixed(1)}%
          </span>
        );
      })}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [stocks, setStocks]           = useState([]);
  const [input, setInput]             = useState("");
  const [lastRefresh, setLastRefresh] = useState(null);
  const [refreshing, setRefreshing]   = useState(false);
  const timerRef = useRef(null);

  const markLoading = (tickers) =>
    setStocks(prev => prev.map(s =>
      tickers.includes(s.ticker) ? { ...s, loading: true, error: null } : s
    ));

  const loadQuotes = useCallback(async (tickers) => {
    if (!tickers.length) return;
    markLoading(tickers);
    try {
      const quotes   = await fetchQuotes(tickers);
      const byTicker = Object.fromEntries(quotes.map(q => [q.ticker, q]));
      setStocks(prev => prev.map(s => {
        if (!tickers.includes(s.ticker)) return s;
        const q = byTicker[s.ticker];
        return q
          ? { ...s, loading: false, quote: q, error: null }
          : { ...s, loading: false, error: "Not found" };
      }));
    } catch (e) {
      setStocks(prev => prev.map(s =>
        tickers.includes(s.ticker) ? { ...s, loading: false, error: e.message } : s
      ));
    }
  }, []);

  const addTicker = useCallback((raw) => {
    const t = raw.toUpperCase().trim().replace(/[^A-Z0-9.^-]/g, "");
    if (!t) return;
    setStocks(prev => {
      if (prev.find(s => s.ticker === t)) return prev;
      return [...prev, { ticker: t, quote: null, loading: false, error: null }];
    });
    setTimeout(() => loadQuotes([t]), 0);
  }, [loadQuotes]);

  const removeTicker = useCallback((ticker) => {
    setStocks(prev => {
      const next = prev.filter(s => s.ticker !== ticker);
      localStorage.setItem("watchlist", JSON.stringify(next.map(s => s.ticker)));
      return next;
    });
  }, []);

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    const tickers = stocks.map(s => s.ticker);
    await loadQuotes(tickers);
    setLastRefresh(new Date());
    setRefreshing(false);
  }, [stocks, loadQuotes]);

  useEffect(() => {
    const saved   = localStorage.getItem("watchlist");
    const initial = saved ? JSON.parse(saved) : DEFAULT_TICKERS;
    setStocks(initial.map(t => ({ ticker: t, quote: null, loading: true, error: null })));
    loadQuotes(initial).then(() => setLastRefresh(new Date()));
  }, []);

  useEffect(() => {
    if (stocks.length) localStorage.setItem("watchlist", JSON.stringify(stocks.map(s => s.ticker)));
  }, [stocks]);

  useEffect(() => {
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const tickers = stocks.map(s => s.ticker);
      if (tickers.length) loadQuotes(tickers).then(() => setLastRefresh(new Date()));
    }, AUTO_REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [stocks, loadQuotes]);

  const alertCount = stocks.filter(s => { const d = getDrawdown(s.quote); return d !== null && d >= 10; }).length;

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0f1a",
      fontFamily: "'IBM Plex Mono', 'Courier New', monospace",
      color: "#e2e8f0", padding: "36px 24px",
      maxWidth: 840, margin: "0 auto",
    }}>
      <style>{`
        @keyframes pulse   { 0%,100%{opacity:1} 50%{opacity:.35} }
        @keyframes spin    { to{transform:rotate(360deg)} }
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        input::placeholder { color:#1e3a5f; font-size:11px; letter-spacing:1.5px; }
        *{ box-sizing:border-box; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 5 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: alertCount > 0 ? "#ef4444" : "#22c55e",
            boxShadow: `0 0 8px ${alertCount > 0 ? "#ef4444" : "#22c55e"}`,
            animation: "pulse 2s infinite",
          }} />
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: 3, color: "#f1f5f9", textTransform: "uppercase" }}>
            Stock Drawdown Monitor
          </h1>
          {alertCount > 0 && (
            <span style={{
              padding: "2px 9px", borderRadius: 4, fontSize: 10, fontWeight: 800,
              letterSpacing: 1.5, color: "#f87171",
              background: "rgba(239,68,68,0.12)", border: "1px solid #ef444444",
            }}>
              {alertCount} ALERT{alertCount > 1 ? "S" : ""}
            </span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 10, color: "#263248" }}>
            Yahoo Finance · auto-refresh 5 min · $0/month · Cloudflare Pages
          </span>
          {lastRefresh && (
            <span style={{ fontSize: 10, color: "#1e3248", marginLeft: "auto" }}>
              Updated {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      <AlertBanner stocks={stocks} />

      {/* Input */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <div style={{ position: "relative", flex: 1 }}>
          <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "#1e3a5f", fontSize: 13, pointerEvents: "none" }}>$</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === "Enter") { addTicker(input); setInput(""); } }}
            placeholder="TICKER SYMBOL  (e.g. GOOGL)"
            style={{
              width: "100%", padding: "10px 12px 10px 26px",
              background: "#0c1320", border: "1px solid #18273a",
              borderRadius: 6, color: "#e2e8f0",
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 12, letterSpacing: 2, outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = "#2563eb"}
            onBlur={e => e.target.style.borderColor = "#18273a"}
          />
        </div>
        <button
          onClick={() => { addTicker(input); setInput(""); }}
          style={{
            padding: "10px 16px", background: "#1d4ed8", border: "none",
            borderRadius: 6, color: "#fff", fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 11, fontWeight: 700, letterSpacing: 1.5, cursor: "pointer",
          }}
          onMouseEnter={e => e.currentTarget.style.background = "#2563eb"}
          onMouseLeave={e => e.currentTarget.style.background = "#1d4ed8"}
        >+ ADD</button>
        <button
          onClick={refreshAll}
          disabled={refreshing || !stocks.length}
          style={{
            padding: "10px 14px", background: "#0c1320", border: "1px solid #18273a",
            borderRadius: 6, color: refreshing ? "#263248" : "#3d5270",
            fontFamily: "'IBM Plex Mono', monospace", fontSize: 11,
            cursor: refreshing ? "default" : "pointer",
            display: "flex", alignItems: "center", gap: 6,
          }}
        >
          <span style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none", display: "inline-block" }}>↻</span>
          {refreshing ? "..." : "REFRESH"}
        </button>
      </div>

      {/* Table */}
      <div style={{ background: "#0b1121", borderRadius: 10, border: "1px solid #131e2e", overflow: "hidden" }}>
        <div style={{
          display: "grid",
          gridTemplateColumns: "70px 1fr 86px 76px 90px 136px 32px",
          gap: "0 10px", padding: "9px 18px",
          background: "#0e1826", borderBottom: "1px solid #131e2e",
          fontSize: 9, color: "#263248", letterSpacing: 2, fontWeight: 700, textTransform: "uppercase",
        }}>
          <div>Ticker</div><div>Company</div>
          <div style={{ textAlign: "right" }}>Price</div>
          <div style={{ textAlign: "right" }}>Day%</div>
          <div style={{ textAlign: "right" }}>52W High</div>
          <div style={{ textAlign: "right" }}>Drawdown</div>
          <div />
        </div>

        {!stocks.length ? (
          <div style={{ padding: "44px 20px", textAlign: "center", color: "#1e2d42", fontSize: 12 }}>
            No stocks tracked · add a ticker above
          </div>
        ) : stocks.map(s => (
          <StockRow key={s.ticker} stock={s} onRemove={removeTicker} />
        ))}
      </div>

      {/* Legend */}
      <div style={{ marginTop: 16, display: "flex", gap: 18, flexWrap: "wrap" }}>
        {[
          { c: "#22c55e", t: "Healthy  (<10%)" },
          { c: "#f59e0b", t: "WARN  (−10% from 52W high)" },
          { c: "#ef4444", t: "BEAR  (−20% from 52W high)" },
        ].map(l => (
          <div key={l.c} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: l.c, opacity: .7 }} />
            <span style={{ fontSize: 10, color: "#263248" }}>{l.t}</span>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 18, fontSize: 9, color: "#141e2e", textAlign: "center" }}>
        Data via Yahoo Finance (15-min delay) · Not financial advice
      </p>
    </div>
  );
}
