/**
 * Communications V2 — SMS compliance keywords (PKG-08). Pure parsing only.
 * STOP/START/HELP handling per carrier requirements; maps to per-person preference changes.
 */
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

export type SmsKeyword = "stop" | "start" | "help";

/**
 * Vocabulary mirrors contracts/communications/sms-keywords.json, which the
 * Python inbound handler loads. A parity test fails the build if they drift.
 *
 * "yes" was REMOVED from the START set. It is not a carrier-standard resubscribe
 * keyword and it collides with ordinary conversation: a parent answering "Yes"
 * to "Can you make Tuesday?" would have been silently resubscribed. Nothing
 * depended on it — this module had no production callers before Phase 0.
 */
const STOP = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"]);
const START = new Set(["start", "unstop", "optin", "opt-in"]);
const HELP = new Set(["help", "info"]);

/** First-token keyword classification, or null. */
export function parseSmsKeyword(body: string): SmsKeyword | null {
    const token = body.trim().toLowerCase().split(/\s+/)[0] ?? "";
    if (STOP.has(token)) return "stop";
    if (START.has(token)) return "start";
    if (HELP.has(token)) return "help";
    return null;
}

/**
 * SMS categories a STOP affects (carrier: suppress ALL SMS).
 *
 * `sms_operational` was added in Phase 0 alongside the operational message
 * category — omitting it would have left STOP unable to block operational
 * sends, which is the bulk of what the platform actually sends.
 */
export const SMS_STOP_CATEGORIES: readonly PreferenceCategory[] = [
    "sms_transactional",
    "sms_operational",
    "sms_marketing",
];

/**
 * SMS categories a START restores. Deliberately excludes `sms_marketing` —
 * resubscribing to service texts must not silently re-enroll marketing.
 */
export const SMS_START_CATEGORIES: readonly PreferenceCategory[] = [
    "sms_transactional",
    "sms_operational",
];

/** @deprecated Use SMS_STOP_CATEGORIES — kept as the STOP set for parity tests. */
export const SMS_KEYWORD_CATEGORIES: readonly PreferenceCategory[] = SMS_STOP_CATEGORIES;

/** Categories a keyword mutates. */
export function categoriesForSmsKeyword(keyword: SmsKeyword): readonly PreferenceCategory[] {
    if (keyword === "stop") return SMS_STOP_CATEGORIES;
    if (keyword === "start") return SMS_START_CATEGORIES;
    return [];
}

/** Preference target state for a keyword; HELP changes nothing. */
export function keywordTargetState(keyword: SmsKeyword): PreferenceState | null {
    if (keyword === "stop") return "opted_out";
    if (keyword === "start") return "opted_in";
    return null; // help
}
