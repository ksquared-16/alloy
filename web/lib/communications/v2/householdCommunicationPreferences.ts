/**
 * Pure helpers — map communication_preferences rows to operator-facing household consent.
 *
 * Source table: communication_preferences (person-scoped, org-scoped).
 * Categories:
 *   email  → email_transactional
 *   sms    → sms_transactional
 *   marketing → email_marketing + sms_marketing (strictest wins)
 */
import type { ConsentState } from "@/lib/communications/v2/familyWorkspace/types";
import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";

export type PersonConsentTriplet = { email: ConsentState; sms: ConsentState; marketing: ConsentState };

export type RawPreferenceRow = { person_id: string; category: string; state: string };

const EMAIL_CATEGORY: PreferenceCategory = "email_transactional";
const SMS_CATEGORY: PreferenceCategory = "sms_transactional";
const MARKETING_CATEGORIES: PreferenceCategory[] = ["email_marketing", "sms_marketing"];

function toConsentState(state: string | null | undefined): ConsentState {
    if (state === "opted_in" || state === "opted_out" || state === "unset") return state;
    return "unset";
}

/** Combine two marketing category states — any opt-out blocks; both opt-in required for allowed. */
export function combineMarketingStates(a: ConsentState, b: ConsentState): ConsentState {
    if (a === "opted_out" || b === "opted_out") return "opted_out";
    if (a === "opted_in" && b === "opted_in") return "opted_in";
    return "unset";
}

export function personConsentFromPreferenceRows(rows: RawPreferenceRow[], personId: string): PersonConsentTriplet {
    const forPerson = rows.filter((r) => r.person_id === personId);
    const stateFor = (cat: PreferenceCategory): ConsentState => {
        const row = forPerson.find((r) => r.category === cat);
        return toConsentState(row?.state);
    };
    const emailMarketing = stateFor("email_marketing");
    const smsMarketing = stateFor("sms_marketing");
    return {
        email: stateFor(EMAIL_CATEGORY),
        sms: stateFor(SMS_CATEGORY),
        marketing: combineMarketingStates(emailMarketing, smsMarketing),
    };
}

export function buildConsentByContact(
    personIds: string[],
    rows: RawPreferenceRow[]
): Record<string, PersonConsentTriplet> {
    const out: Record<string, PersonConsentTriplet> = {};
    for (const id of personIds) {
        out[id] = personConsentFromPreferenceRows(rows, id);
    }
    return out;
}

/** Household-level display uses the primary contact; falls back to first person in roster. */
export function resolveHouseholdConsentDisplay(
    byContact: Record<string, PersonConsentTriplet>,
    primaryPersonId: string | null | undefined,
    fallbackPersonIds: string[] = []
): PersonConsentTriplet {
    const unset: PersonConsentTriplet = { email: "unset", sms: "unset", marketing: "unset" };
    const pid = (primaryPersonId ?? "").trim() || fallbackPersonIds.find((id) => byContact[id]) || null;
    if (!pid) return unset;
    return byContact[pid] ?? unset;
}

export function consentOperatorStatus(state: ConsentState | boolean | undefined): "Allowed" | "Blocked" | "Unknown" {
    const s = state ?? "unset";
    if (s === true || s === "opted_in") return "Allowed";
    if (s === false || s === "opted_out") return "Blocked";
    return "Unknown";
}
