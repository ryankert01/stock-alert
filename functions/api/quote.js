// functions/api/quote.js
// Cloudflare Pages Function — proxies Yahoo Finance to avoid browser CORS blocks.
// Uses the v8 chart API which does not require crumb/cookie authentication.

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });

  const contentType = res.headers.get("content-type") || "";

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Yahoo returned ${res.status} for ${symbol}: ${text.slice(0, 120)}`);
  }

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    const snippet = text.slice(0, 120).replace(/\n/g, " ");
    throw new Error(
      `Yahoo returned non-JSON for ${symbol} (content-type: ${contentType || "none"}): ${snippet}`
    );
  }

  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No chart data for ${symbol}`);

  const price = meta.regularMarketPrice;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose;
  const change1d =
    prevClose && prevClose > 0
      ? ((price - prevClose) / prevClose) * 100
      : 0;

  return {
    ticker: meta.symbol,
    name: meta.shortName || meta.longName || meta.symbol,
    price,
    week52High: meta.fiftyTwoWeekHigh,
    week52Low: meta.fiftyTwoWeekLow,
    change1d,
  };
}

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const symbols = searchParams.get("symbols");

  if (!symbols) {
    return new Response(JSON.stringify({ error: "symbols param required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const tickers = symbols.split(",").map((s) => s.trim()).filter(Boolean);
    const quotes = await Promise.all(tickers.map(fetchChart));

    return new Response(JSON.stringify({ quotes }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
