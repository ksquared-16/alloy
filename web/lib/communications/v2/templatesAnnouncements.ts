/**
 * Communications V2 — templates + announcements constants (PKG-05).
 *
 * Table names + bounded vocabularies for migration
 * 20260611150000_comms_v2_templates_announcements.sql.
 *
 * Pure taxonomy only — NO UI, NO rendering engine, NO send behavior, NO provider.
 * Builder/render land in PKG-13 (templates) and PKG-15 (announcements).
 */

export const COMMS_V2_TEMPLATE_TABLES = {
    templates: "communication_templates",
    templateVersions: "communication_template_versions",
    snippets: "communication_snippets",
} as const;

export const COMMS_V2_ANNOUNCEMENT_TABLES = {
    announcements: "announcements",
    announcementTargets: "announcement_targets",
    announcementDeliveries: "announcement_deliveries",
} as const;

/** Templates are authored per channel. */
export const TEMPLATE_CHANNELS = ["email", "sms"] as const;
export type TemplateChannel = (typeof TEMPLATE_CHANNELS)[number];

/** Template approval workflow (bounded by DB check). */
export const TEMPLATE_APPROVAL_STATUSES = ["draft", "pending", "approved"] as const;
export type TemplateApprovalStatus = (typeof TEMPLATE_APPROVAL_STATUSES)[number];

/** Announcement compliance classification (vocab in TS to stay additive). */
export const ANNOUNCEMENT_CLASSIFICATIONS = ["emergency", "marketing"] as const;
export type AnnouncementClassification = (typeof ANNOUNCEMENT_CLASSIFICATIONS)[number];

/** Announcement lifecycle status (vocab in TS to stay additive). */
export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "sending", "sent", "canceled"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];
