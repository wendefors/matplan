import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

// Viktigt för iOS: keepalive på requests så de inte avbryts lika lätt vid fil-export/share
const keepAliveFetch: typeof fetch = (input, init) => {
  return fetch(input, {
    ...init,
    // keepalive fungerar bäst för små requests (därför uppdaterar vi bara last_cooked)
    keepalive: true,
    cache: "no-store",
  });
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: keepAliveFetch,
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
