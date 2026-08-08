import { validateRuntimeConfig } from "@/lib/config/server";
import { logServerEvent } from "@/lib/observability/server";

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const validation = validateRuntimeConfig();
  if (!validation.ok) {
    logServerEvent({ level: "error", event: "runtime.configuration_invalid", route: "startup", errorCode: validation.errorCode });
  }
}
