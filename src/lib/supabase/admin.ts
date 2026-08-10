import "server-only";
import { createClient } from "@supabase/supabase-js";
import { AiConfigurationError } from "@/ai/errors";
import { getAdminSupabaseConfig } from "@/lib/config/server";

export function createAdminClient() {
  try {
    const { supabaseUrl, serviceRoleKey } = getAdminSupabaseConfig();
    return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  } catch {
    throw new AiConfigurationError("SUPABASE_SERVICE_ROLE_KEY is niet geconfigureerd.");
  }
}
