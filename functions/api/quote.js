// functions/api/quote.js
// Cloudflare Pages Function — proxies Yahoo Finance to avoid browser CORS blocks.
// Lives in your repo. Deploys automatically with `git push`. No separate Worker needed.

export async function onRequest(context) {
  const { searchParams } = new URL(context.request.url);
  const symbols = searchParams.get("symbols");

  if (!symbols) {
    return new Response(JSON.stringify({ error: "symbols param required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const fields = [
    "regularMarketPrice",
    "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow",
    "regularMarketChangePercent",
    "shortName",
    "longName",
    "regularMarketPreviousClose",
  ].join(",");

  const yfUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=${fields}`;

  try {
    const response = await fetch(yfUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status}`);
    }

    const data = await response.json();
    const results = data?.quoteResponse?.result;

    if (!results?.length) {
      return new Response(JSON.stringify({ error: `No data for ${symbols}` }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const quotes = results.map((q) => ({
      ticker:     q.symbol,
      name:       q.shortName || q.longName || q.symbol,
      price:      q.regularMarketPrice,
      week52High: q.fiftyTwoWeekHigh,
      week52Low:  q.fiftyTwoWeekLow,
      change1d:   q.regularMarketChangePercent,
    }));

    return new Response(JSON.stringify({ quotes }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        // Cache at edge for 5 minutes — faster repeat loads, less Yahoo rate-limiting
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
