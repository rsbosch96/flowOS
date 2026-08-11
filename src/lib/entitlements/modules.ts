export const moduleKeys = ["core", "planning"] as const;

export type ModuleKey = (typeof moduleKeys)[number];

export const planningModule: ModuleKey = "planning";
