export const workOrderStatuses = ["planned", "dispatched", "in_progress", "completed", "cancelled"] as const;

export type WorkOrderStatus = (typeof workOrderStatuses)[number];

export const workOrderStatusLabels: Record<WorkOrderStatus, string> = {
  planned: "Gepland",
  dispatched: "Onderweg",
  in_progress: "In uitvoering",
  completed: "Afgerond",
  cancelled: "Geannuleerd",
};

export function workOrderStatusLabel(status: string) {
  return workOrderStatusLabels[status as WorkOrderStatus] ?? "Onbekende status";
}

export const evidenceTypeLabels = {
  photo: "Foto",
  document: "Document",
  completion: "Oplevering",
  other: "Overig",
} as const;

export function formatWorkOrderDate(value: string | null, includeTime = true) {
  if (!value) return "Nog niet vastgelegd";
  return new Date(value).toLocaleString("nl-NL", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" as const } : {}),
  });
}
