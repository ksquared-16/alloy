/**
 * Communications V2 — template schema constants (Phase 1 / B1).
 *
 * Single source of truth for the template table names and the bounded
 * channel / status vocabularies. Category is free-text (org-defined), not
 * platform-enumerated. Channel/status mirror DB CHECK constraints; the
 * schema-parity test (commsV2TemplatesSchema.test.ts) asserts they stay in sync.
 *
 * Pure constants/types ONLY — no schema execution, no API, no UI, no provider code.
 */

export const COMMS_V2_TEMPLATE_TABLES = {
    templates: "communication_templates",
    templateVersions: "communication_template_versions",
} as const;

/** Org-defined grouping label (free text; not a platform enum). */
export type TemplateCategory = string;

export const TEMPLATE_CATEGORY_PLACEHOLDER = "e.g. enrollment, billing";

/** Normalize a category string; returns null when empty after trim. */
export function normalizeTemplateCategory(value: unknown): string | null {
    const s = typeof value === "string" ? value.trim() : "";
    return s.length > 0 ? s : null;
}

export function isTemplateCategory(value: string): value is TemplateCategory {
    return normalizeTemplateCategory(value) != null;
}

/** Delivery channel a template targets (DB-CHECK constrained). */
export const TEMPLATE_CHANNELS = ["email", "sms", "in_app"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

/** Operator-facing labels for template channels (values stay snake_case for API/DB). */
export const TEMPLATE_CHANNEL_LABELS: Record<TemplateChannel, string> = {
    email: "Email",
    sms: "SMS",
    in_app: "In App",
};

export function templateChannelLabel(channel: string | null | undefined): string {
    const key = typeof channel === "string" ? channel.trim().toLowerCase() : "";
    if (isTemplateChannel(key)) return TEMPLATE_CHANNEL_LABELS[key];
    return typeof channel === "string" && channel.trim() ? channel.trim() : "—";
}

/** Lifecycle status of a template (DB-CHECK constrained). */
export const TEMPLATE_STATUSES = ["draft", "active", "archived"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

/** Operator-facing labels for template statuses (values stay lowercase for API/DB). */
export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
    draft: "Draft",
    active: "Active",
    archived: "Archived",
};

export function templateStatusLabel(status: string | null | undefined): string {
    const key = typeof status === "string" ? status.trim().toLowerCase() : "";
    if (isTemplateStatus(key)) return TEMPLATE_STATUS_LABELS[key];
    return typeof status === "string" && status.trim() ? status.trim() : "—";
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
