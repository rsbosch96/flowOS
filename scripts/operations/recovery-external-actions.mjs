const mechanisms = ["pg_cron", "pg_net", "database-webhooks", "wrappers", "external-integrations", "provider-triggering-functions"];
export const REQUIRED_EXTERNAL_ACTION_MECHANISMS = Object.freeze(mechanisms);
export function assertExternalActionInventory(inventory) {
  if (!inventory || !Array.isArray(inventory.reviewed)) throw new Error("Recovery external-action inventory is required.");
  const missing = mechanisms.filter((item) => !inventory.reviewed.includes(item));
  if (missing.length) throw new Error(`Recovery external-action inventory incomplete: ${missing.join(", ")}.`);
  if (inventory.providerKillSwitches !== true) throw new Error("Recovery provider kill-switch evidence is required.");
  return { status: "complete", reviewed: mechanisms };
}
