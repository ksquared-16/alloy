/**
 * Communications V2 — announcement schema constants (Phase 1 / B4 skeleton).
 *
 * Single source of truth for announcement table names and bounded vocabularies.
 * Mirrors the DB CHECK constraints in 20260622123000_comms_v2_announcements.sql;
 * the schema-parity test (commsV2AnnouncementsSchema.test.ts) keeps them in sync.
 *
 * Pure constants/types ONLY — no schema execution, no API, no UI, no send, no provider.
 */

export const COMMS_V2_ANNOUNCEMENT_TABLES = {
    announcements: "announcements",
    targets: "announcement_targets",
    recipients: "announcement_recipients",
} as const;

/** Announcement lifecycle (DB-CHECK constrained). */
export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "sent", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

/** Channels an announcement may target — reuses the message channel vocabulary. */
export const ANNOUNCEMENT_CHANNELS = ["email", "sms", "in_app"] as const;
export type AnnouncementChannel = (typeof ANNOUNCEMENT_CHANNELS)[number];

/** Composable audience target types (DB-CHECK constrained). */
export const ANNOUNCEMENT_TARGET_TYPES = [
    "all_families",
    "active_families",
    "waitlist",
    "program",
    "room",
    "location",
    "custom",
] as const;
export type AnnouncementTargetType = (typeof ANNOUNCEMENT_TARGET_TYPES)[number];

/**
 * Per-recipient CAMPAIGN OUTCOME ROLLUP (DB-CHECK constrained, B7).
 * This is NOT an execution queue — it mirrors the execution row's outcome:
 *  - pending: snapshot written, not yet scheduled
 *  - scheduled: an execution row exists (email/sms with a binding)
 *  - skipped: not delivered (provider_unavailable | no_address | opted_out | in_app_operator_only)
 *  - sent / failed: terminal outcomes mirrored from the execution row
 */
export const ANNOUNCEMENT_RECIPIENT_STATUSES = ["pending", "scheduled", "skipped", "sent", "failed"] as const;
export type AnnouncementRecipientStatus = (typeof ANNOUNCEMENT_RECIPIENT_STATUSES)[number];

/** The `source` value tagging announcement rows in the shared communication_scheduled_sends spine. */
export const ANNOUNCEMENT_SCHEDULED_SEND_SOURCE = "announcement" as const;
/** entity_type for announcement rows in communication_scheduled_sends (entity_id stays null). */
export const ANNOUNCEMENT_SCHEDULED_SEND_ENTITY_TYPE = "announcements" as const;

/** Reasons a recipient is skipped (not delivered). */
export const ANNOUNCEMENT_SUPPRESSED_REASONS = [
    "provider_unavailable",
    "no_address",
    "opted_out",
    "in_app_operator_only",
] as const;
export type AnnouncementSuppressedReason = (typeof ANNOUNCEMENT_SUPPRESSED_REASONS)[number];

export function isAnnouncementStatus(value: string): value is AnnouncementStatus {
    return (ANNOUNCEMENT_STATUSES as readonly string[]).includes(value);
}

export function isAnnouncementChannel(value: string): value is AnnouncementChannel {
    return (ANNOUNCEMENT_CHANNELS as readonly string[]).includes(value);
}

export function isAnnouncementTargetType(value: string): value is AnnouncementTargetType {
    return (ANNOUNCEMENT_TARGET_TYPES as readonly string[]).includes(value);
}
