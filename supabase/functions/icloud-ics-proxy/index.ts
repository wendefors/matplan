// Enkel, publik proxy för iCloud ICS-feed.
// Används för att undvika CORS-problem i browsern.
// Feed-URL sätts som secret: ICS_FEED_URL.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

function normalizeFeedUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  return trimmed;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  const rawFeedUrl = Deno.env.get("ICS_FEED_URL")?.trim();
  const feedUrl = rawFeedUrl ? normalizeFeedUrl(rawFeedUrl) : "";
  if (!feedUrl) {
    return new Response("Missing ICS_FEED_URL", {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const upstream = await fetch(feedUrl, { cache: "no-store" });
    if (!upstream.ok) {
      const upstreamText = await upstream.text().catch(() => "");
      const details = upstreamText ? `: ${upstreamText.slice(0, 200)}` : "";
      return new Response(`Upstream failed (${upstream.status})${details}`, {
        status: 502,
        headers: corsHeaders,
      });
    }

    const calendarText = await upstream.text();
    return new Response(calendarText, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("icloud-ics-proxy error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(`Proxy failed: ${message}`, {
      status: 500,
      headers: corsHeaders,
    });
  }
});
