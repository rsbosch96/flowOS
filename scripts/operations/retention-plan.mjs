export const RETENTION_TARGET = Object.freeze({ daily: 14, weekly: 8, monthly: 6 });
export function buildRetentionPlan(artifacts) { if (!Array.isArray(artifacts)) throw new Error("Artifacts must be an array."); return { target: RETENTION_TARGET, candidates: artifacts.filter((a) => typeof a?.key === "string").map((a) => ({ key: a.key, class: a.class })).slice(0) }; }
