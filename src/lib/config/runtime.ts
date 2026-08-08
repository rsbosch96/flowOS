export type AiMode = "mock" | "live" | "test";

export class RuntimeConfigError extends Error {
  readonly code = "CONFIGURATION_INVALID";

  constructor() {
    super("De serverconfiguratie is onvolledig of ongeldig.");
    this.name = "RuntimeConfigError";
  }
}

export type RuntimeConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  aiMode: AiMode;
};

type RuntimeEnvironment = Record<string, string | undefined>;

const aiModes = new Set<AiMode>(["mock", "live", "test"]);

function requiredValue(environment: RuntimeEnvironment, name: string) {
  const value = environment[name]?.trim();
  if (!value) throw new RuntimeConfigError();
  return value;
}

export function readRuntimeConfig(environment: RuntimeEnvironment): RuntimeConfig {
  const aiMode = environment.AI_MODE?.trim() || "mock";
  if (!aiModes.has(aiMode as AiMode)) throw new RuntimeConfigError();

  const config = {
    supabaseUrl: requiredValue(environment, "NEXT_PUBLIC_SUPABASE_URL"),
    supabaseAnonKey: requiredValue(environment, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    aiMode: aiMode as AiMode,
  };

  if (config.aiMode === "live") requiredValue(environment, "OPENAI_API_KEY");
  return config;
}

export function readAdminSupabaseConfig(environment: RuntimeEnvironment) {
  const config = readRuntimeConfig(environment);
  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim() || environment.SUPABASE_SECRET_KEY?.trim();
  if (!serviceRoleKey) throw new RuntimeConfigError();
  return { ...config, serviceRoleKey };
}
