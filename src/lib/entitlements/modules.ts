export const moduleKeys = ["core", "planning", "field_service", "ai_customer_service"] as const;

export type ModuleKey = (typeof moduleKeys)[number];

export const planningModule: ModuleKey = "planning";

export const fieldServiceModule: ModuleKey = "field_service";

export const aiCustomerServiceModule: ModuleKey = "ai_customer_service";
