// Enkel, publik proxy för iCloud ICS-feed.
// Används för att undvika CORS-problem i browsern.
// Feed-URL sätts som secret: ICS_FEED_URL.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey, x-client-info",
};

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

  const feedUrl = Deno.env.get("ICS_FEED_URL")?.trim();
  if (!feedUrl) {
    return new Response("Missing ICS_FEED_URL", {
      status: 500,
      headers: corsHeaders,
    });
  }

  try {
    const upstream = await fetch(feedUrl, { cache: "no-store" });
    if (!upstream.ok) {
      return new Response(`Upstream failed (${upstream.status})`, {
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
    return new Response("Proxy failed", {
      status: 500,
      headers: corsHeaders,
    });
  }
});
