import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";
import type { ConsentState, PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import { consentOperatorStatus } from "@/lib/communications/v2/householdCommunicationPreferences";

export type PreferenceFieldKey =
    | "email_transactional"
    | "sms_transactional"
    | "email_marketing"
    | "sms_marketing";

export const PREFERENCE_FIELD_DEFS: Array<{ key: PreferenceFieldKey; label: string; category: PreferenceCategory }> = [
    { key: "email_transactional", label: "Email messages", category: "email_transactional" },
    { key: "sms_transactional", label: "Text messages", category: "sms_transactional" },
    { key: "email_marketing", label: "Email marketing", category: "email_marketing" },
    { key: "sms_marketing", label: "Text marketing", category: "sms_marketing" },
];

export function emptyPreferenceProfile(): PersonPreferenceProfile {
    return {
        email_transactional: "unset",
        sms_transactional: "unset",
        email_marketing: "unset",
        sms_marketing: "unset",
    };
}

export function operatorStatusLabel(state: ConsentState | undefined): "Allowed" | "Blocked" | "Unknown" {
    return consentOperatorStatus(state);
}

export function operatorStatusToPreferenceState(status: "Allowed" | "Blocked"): PreferenceState {
    return status === "Allowed" ? "opted_in" : "opted_out";
}
