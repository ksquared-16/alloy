/**
 * Pure helpers — map communication_preferences rows to operator-facing household consent.
 *
 * Source table: communication_preferences (person-scoped, org-scoped).
 * Categories:
 *   email  → email_transactional
 *   sms    → sms_transactional
 *   marketing → email_marketing + sms_marketing (strictest wins)
 */
import type { PreferenceCategory } from "@/lib/communications/v2/preferences";
import type { ConsentState, PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import { emptyPreferenceProfile } from "@/lib/communications/v2/communicationPreferenceLabels";

export type PersonConsentTriplet = { email: ConsentState; sms: ConsentState; marketing: ConsentState };

export type RawPreferenceRow = { person_id: string; category: string; state: string };

const EMAIL_TX: PreferenceCategory = "email_transactional";
const SMS_TX: PreferenceCategory = "sms_transactional";
const EMAIL_OPS: PreferenceCategory = "email_operational";
const SMS_OPS: PreferenceCategory = "sms_operational";
const EMAIL_MKT: PreferenceCategory = "email_marketing";
const SMS_MKT: PreferenceCategory = "sms_marketing";

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

export function personPreferenceProfileFromRows(rows: RawPreferenceRow[], personId: string): PersonPreferenceProfile {
    const forPerson = rows.filter((r) => r.person_id === personId);
    const stateFor = (cat: PreferenceCategory): ConsentState => {
        const row = forPerson.find((r) => r.category === cat);
        return toConsentState(row?.state);
    };
    return {
        email_transactional: stateFor(EMAIL_TX),
        email_operational: stateFor(EMAIL_OPS),
        email_marketing: stateFor(EMAIL_MKT),
        sms_transactional: stateFor(SMS_TX),
        sms_operational: stateFor(SMS_OPS),
        sms_marketing: stateFor(SMS_MKT),
    };
}

export function personConsentFromPreferenceRows(rows: RawPreferenceRow[], personId: string): PersonConsentTriplet {
    const profile = personPreferenceProfileFromRows(rows, personId);
    return {
        email: profile.email_transactional,
        sms: profile.sms_transactional,
        marketing: combineMarketingStates(profile.email_marketing, profile.sms_marketing),
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

export function buildPreferenceProfilesByContact(
    personIds: string[],
    rows: RawPreferenceRow[]
): Record<string, PersonPreferenceProfile> {
    const out: Record<string, PersonPreferenceProfile> = {};
    for (const id of personIds) {
        out[id] = personIds.length && rows.length ? personPreferenceProfileFromRows(rows, id) : emptyPreferenceProfile();
    }
    return out;
}

/** Household-level display uses the primary contact; falls back to first person in roster. */
export function resolveHouseholdPreferenceProfile(
    byProfile: Record<string, PersonPreferenceProfile>,
    primaryPersonId: string | null | undefined,
    fallbackPersonIds: string[] = []
): PersonPreferenceProfile {
    const pid = (primaryPersonId ?? "").trim() || fallbackPersonIds.find((id) => byProfile[id]) || null;
    if (!pid) return emptyPreferenceProfile();
    return byProfile[pid] ?? emptyPreferenceProfile();
}

/** @deprecated Use resolveHouseholdPreferenceProfile for granular fields. */
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
