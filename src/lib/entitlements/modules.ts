export const moduleKeys = ["core", "planning", "field_service"] as const;

export type ModuleKey = (typeof moduleKeys)[number];

export const planningModule: ModuleKey = "planning";

export const fieldServiceModule: ModuleKey = "field_service";
