export const planningEventTypes = ["appointment", "work", "delivery", "internal"] as const;

export type PlanningEventType = (typeof planningEventTypes)[number];
export type PlanningEventStatus = "scheduled" | "cancelled";

const typeLabels: Record<PlanningEventType, string> = {
  appointment: "Afspraak",
  work: "Werkzaamheden",
  delivery: "Levering",
  internal: "Intern moment",
};

const statusLabels: Record<PlanningEventStatus, string> = {
  scheduled: "Gepland",
  cancelled: "Geannuleerd",
};

export function planningEventTypeLabel(value: string) {
  return typeLabels[value as PlanningEventType] ?? "Onbekend type";
}

export function planningEventStatusLabel(value: string) {
  return statusLabels[value as PlanningEventStatus] ?? "Onbekende status";
}

export function toIsoFromLocalInput(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
