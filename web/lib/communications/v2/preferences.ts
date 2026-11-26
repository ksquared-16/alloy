/**
 * Communications V2 — preference + recipient constants (PKG-04).
 *
 * Per-PERSON consent taxonomy + recipient roles for migration
 * 20260611140000_comms_v2_preferences_recipients.sql.
 *
 * Pure taxonomy/classifiers only — NO send-time enforcement (PKG-08), no UI, no provider.
 */

export const COMMS_V2_PREFERENCE_TABLES = {
    recipients: "communication_message_recipients",
    preferences: "communication_preferences",
    preferenceEvents: "communication_preference_events",
} as const;

/**
 * Per-person preference categories (freeze §3.4).
 *
 * Phase 0 added the `*_operational` pair. The message-classification model
 * distinguishes `operational` from `transactional`, and the decided semantics
 * are explicit that operational sends honor an operational opt-out while
 * transactional sends are not suppressible by a broad opt-out. Without these
 * two entries an operational opt-out would have had nowhere to live and would
 * have mapped onto the transactional preference — which is exempt — silently
 * defeating it.
 */
export const PREFERENCE_CATEGORIES = [
    "email_transactional",
    "email_operational",
    "email_marketing",
    "sms_transactional",
    "sms_operational",
    "sms_marketing",
    "announcements",
    "emergency",
] as const;
export type PreferenceCategory = (typeof PREFERENCE_CATEGORIES)[number];

export const PREFERENCE_STATES = ["opted_in", "opted_out", "unset"] as const;
export type PreferenceState = (typeof PREFERENCE_STATES)[number];

export const RECIPIENT_ROLES = ["to", "cc", "bcc"] as const;
export type RecipientRole = (typeof RECIPIENT_ROLES)[number];

/** Marketing categories are consent-gated for Leads (enforcement defined later in PKG-08). */
const MARKETING_CATEGORIES: ReadonlySet<PreferenceCategory> = new Set([
    "email_marketing",
    "sms_marketing",
]);

/** Pure classifier — does NOT enforce anything; PKG-08 owns the consent gate. */
export function isMarketingCategory(category: PreferenceCategory): boolean {
    return MARKETING_CATEGORIES.has(category);
}

/** Channel a category rides on (email | sms | announcement). Pure taxonomy. */
export function preferenceCategoryChannel(category: PreferenceCategory): "email" | "sms" | "announcement" {
    if (category.startsWith("email_")) return "email";
    if (category.startsWith("sms_")) return "sms";
    return "announcement"; // announcements, emergency
}
