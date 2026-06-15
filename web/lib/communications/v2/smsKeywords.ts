/**
 * Communications V2 — SMS compliance keywords (PKG-08). Pure parsing only.
 * STOP/START/HELP handling per carrier requirements; maps to per-person preference changes.
 */
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

export type SmsKeyword = "stop" | "start" | "help";

const STOP = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"]);
const START = new Set(["start", "yes", "unstop", "optin", "opt-in"]);
const HELP = new Set(["help", "info"]);

/** First-token keyword classification, or null. */
export function parseSmsKeyword(body: string): SmsKeyword | null {
    const token = body.trim().toLowerCase().split(/\s+/)[0] ?? "";
    if (STOP.has(token)) return "stop";
    if (START.has(token)) return "start";
    if (HELP.has(token)) return "help";
    return null;
}

/** SMS categories a STOP/START affects (both transactional + marketing, per carrier opt-out semantics). */
export const SMS_KEYWORD_CATEGORIES: readonly PreferenceCategory[] = ["sms_transactional", "sms_marketing"];

/** Preference target state for a keyword; HELP changes nothing. */
export function keywordTargetState(keyword: SmsKeyword): PreferenceState | null {
    if (keyword === "stop") return "opted_out";
    if (keyword === "start") return "opted_in";
    return null; // help
}
