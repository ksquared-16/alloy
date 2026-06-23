/**
 * Communications V2 — template schema constants (Phase 1 / B1).
 *
 * Single source of truth for the template table names and the bounded
 * channel / status / category vocabularies. These mirror the DB CHECK
 * constraints in migration 20260622120000_comms_v2_templates.sql; the
 * schema-parity test (commsV2TemplatesSchema.test.ts) asserts they stay in sync.
 *
 * Pure constants/types ONLY — no schema execution, no API, no UI, no provider code.
 */

export const COMMS_V2_TEMPLATE_TABLES = {
    templates: "communication_templates",
    templateVersions: "communication_template_versions",
} as const;

/** Operational area a template belongs to (DB-CHECK constrained). */
export const TEMPLATE_CATEGORIES = [
    "tour",
    "enrollment",
    "billing",
    "attendance",
    "general",
    "workflow",
] as const;
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number];

/** Delivery channel a template targets (DB-CHECK constrained). */
export const TEMPLATE_CHANNELS = ["email", "sms", "in_app"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

/** Lifecycle status of a template (DB-CHECK constrained). */
export const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export function isTemplateCategory(value: string): value is TemplateCategory {
    return (TEMPLATE_CATEGORIES as readonly string[]).includes(value);
}

export function isTemplateChannel(value: string): value is TemplateChannel {
    return (TEMPLATE_CHANNELS as readonly string[]).includes(value);
}

export function isTemplateStatus(value: string): value is TemplateStatus {
    return (TEMPLATE_STATUSES as readonly string[]).includes(value);
}

/** Only email carries a subject; sms/in_app do not. Pure classifier (no enforcement). */
export function templateChannelSupportsSubject(channel: TemplateChannel): boolean {
    return channel === "email";
}
