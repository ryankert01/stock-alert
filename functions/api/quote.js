// functions/api/quote.js
// Cloudflare Pages Function — proxies Yahoo Finance to avoid browser CORS blocks.
// Lives in your repo. Deploys automatically with `git push`. No separate Worker needed.

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// Fetch a crumb + cookie pair from Yahoo Finance (required since mid-2023).
async function getCrumb() {
  // Step 1: Hit a lightweight Yahoo endpoint to obtain session cookies.
  const cookieRes = await fetch("https://fc.yahoo.com/", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const setCookies = cookieRes.headers.getAll
    ? cookieRes.headers.getAll("set-cookie")
    : [cookieRes.headers.get("set-cookie")].filter(Boolean);

  const cookieString = setCookies
    .map((c) => c.split(";")[0])
    .join("; ");

  // Step 2: Use the cookies to request a crumb token.
  const crumbRes = await fetch("https://query2.finance.yahoo.com/v1/finance/crumb", {
    headers: {
      "User-Agent": UA,
      "Cookie": cookieString,
    },
  });

  if (!crumbRes.ok) {
    throw new Error(`Failed to obtain Yahoo crumb (HTTP ${crumbRes.status})`);
  }

  const crumb = await crumbRes.text();
  return { crumb, cookie: cookieString };
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

  const fields = [
    "regularMarketPrice",
    "fiftyTwoWeekHigh",
    "fiftyTwoWeekLow",
    "regularMarketChangePercent",
    "shortName",
    "longName",
    "regularMarketPreviousClose",
  ].join(",");

  try {
    const { crumb, cookie } = await getCrumb();
    const yfUrl = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}&fields=${fields}&crumb=${encodeURIComponent(crumb)}`;

    const response = await fetch(yfUrl, {
      headers: {
        "User-Agent": UA,
        "Accept": "application/json",
        "Cookie": cookie,
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
