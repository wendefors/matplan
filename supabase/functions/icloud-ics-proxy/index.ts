// Publik endpoint (JWT-verifiering i gateway kan vara av).
// Funktionen validerar alltid bearer-token själv, hämtar alla aktiva kalenderlänkar
// för aktuell användare och returnerar sammanslagen ICS.

import { createClient } from "npm:@supabase/supabase-js@2";

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

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!authHeader) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return match?.[1] ?? null;
}

// Plockar ut alla VEVENT-block för att kunna slå ihop flera kalendrar till en.
function extractVeventBlocks(icsText: string): string[] {
  const unfolded = icsText.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);
  const blocks: string[] = [];
  let inEvent = false;
  let current: string[] = [];

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      inEvent = true;
      current = [line];
      continue;
    }

    if (line === "END:VEVENT" && inEvent) {
      current.push(line);
      blocks.push(current.join("\n"));
      inEvent = false;
      current = [];
      continue;
    }

    if (inEvent) {
      current.push(line);
    }
  }

  return blocks;
}

async function resolveCalendarUrlsForUser(
  adminClient: ReturnType<typeof createClient>,
  userId: string
): Promise<string[]> {
  // Ny tabell med flera kalendrar per användare.
  const { data: calendars, error: calendarsError } = await adminClient
    .from("user_calendars")
    .select("calendar_ics_url,is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  if (calendarsError) {
    throw new Error(`Failed to load user_calendars: ${calendarsError.message}`);
  }

  const urls = (calendars ?? [])
    .map((row: any) => row?.calendar_ics_url?.trim?.() ?? "")
    .filter(Boolean);
  return urls;
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response("Missing Supabase env", {
      status: 500,
      headers: corsHeaders,
    });
  }

  const token = extractBearerToken(req);
  if (!token) {
    return new Response("Missing bearer token", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await adminClient.auth.getUser(token);
  if (userError || !userData?.user) {
    return new Response("Invalid token", {
      status: 401,
      headers: corsHeaders,
    });
  }

  const userId = userData.user.id;

  let rawFeedUrls: string[] = [];
  try {
    rawFeedUrls = await resolveCalendarUrlsForUser(adminClient, userId);
  } catch (error) {
    console.error("calendar settings lookup failed:", error);
    return new Response("Failed to load calendar settings", {
      status: 500,
      headers: corsHeaders,
    });
  }

  if (rawFeedUrls.length === 0) {
    return new Response("No active calendar_ics_url for user", {
      status: 404,
      headers: corsHeaders,
    });
  }

  const feedUrls = Array.from(
    new Set(rawFeedUrls.map((url) => normalizeFeedUrl(url)).filter(Boolean))
  );

  try {
    const fetchResults = await Promise.all(
      feedUrls.map(async (url) => {
        const upstream = await fetch(url, { cache: "no-store" });
        if (!upstream.ok) {
          const upstreamText = await upstream.text().catch(() => "");
          return {
            ok: false as const,
            url,
            status: upstream.status,
            text: upstreamText.slice(0, 200),
          };
        }
        const text = await upstream.text();
        return {
          ok: true as const,
          url,
          text,
        };
      })
    );

    const successful = fetchResults.filter((r) => r.ok);
    if (successful.length === 0) {
      const details = fetchResults
        .map((r) =>
          r.ok
            ? `${r.url}: ok`
            : `${r.url}: failed (${r.status})${r.text ? ` ${r.text}` : ""}`
        )
        .join(" | ");
      return new Response(`All calendar upstreams failed: ${details}`, {
        status: 502,
        headers: corsHeaders,
      });
    }

    const mergedEvents = successful.flatMap((r) => extractVeventBlocks(r.text));
    const mergedIcs = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Matplaneraren//MergedUserCalendars//SE",
      "CALSCALE:GREGORIAN",
      ...mergedEvents,
      "END:VCALENDAR",
    ].join("\n");

    return new Response(mergedIcs, {
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
