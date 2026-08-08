import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getRuntimeConfig } from "@/lib/config/server";

const HEALTH_TIMEOUT_MS = 2_000;

export async function checkDatabaseHealth() {
  const { supabaseUrl, supabaseAnonKey } = getRuntimeConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: ((input, init) => fetch(input, { ...init, signal: controller.signal })) as typeof fetch,
    },
  });

  try {
    const { error } = await supabase.from("companies").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw new Error("DATABASE_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}
