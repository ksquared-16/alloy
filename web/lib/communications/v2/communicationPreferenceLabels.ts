import type { PreferenceCategory, PreferenceState } from "@/lib/communications/v2/preferences";
import type { ConsentState, PersonPreferenceProfile } from "@/lib/communications/v2/familyWorkspace/types";
import { consentOperatorStatus } from "@/lib/communications/v2/householdCommunicationPreferences";

export type PreferenceFieldKey =
    | "email_transactional"
    | "email_operational"
    | "email_marketing"
    | "sms_transactional"
    | "sms_operational"
    | "sms_marketing";

/**
 * How a preference BEHAVES, so the control can say so instead of implying otherwise.
 *
 *   always_allowed — the evaluator exempts this category from opt-out. Showing a switch
 *                    here would be a lie: turning it off changes nothing.
 *   opt_out        — allowed until the recipient or an operator opts out.
 *   opt_in         — blocked until someone explicitly opts in.
 */
export type PreferenceControlKind = "always_allowed" | "opt_out" | "opt_in";

export type PreferenceFieldDef = {
    key: PreferenceFieldKey;
    /** What the operator reads. */
    label: string;
    /** What it actually governs, in one line. */
    description: string;
    category: PreferenceCategory;
    channel: "email" | "sms";
    control: PreferenceControlKind;
};

/**
 * The operator-facing preference model.
 *
 * THE DEFECT THIS REPLACES: there used to be one Email control labelled "Email messages",
 * bound to `email_transactional`. `isOptOutExempt` exempts transactional from opt-out, so
 * switching it off suppressed nothing — not transactional (exempt), not routine (a
 * different category, still `unset`), not marketing (needs opt-in anyway). An operator
 * could turn off "Email messages", watch email keep sending, and have no way to find out
 * why. Meanwhile `email_operational` — the one category whose opt-out actually stops
 * day-to-day Email — was evaluated on every send and reachable from nowhere.
 *
 * So the three categories that already existed are now all three exposed, each labelled
 * with what it really does. The underlying semantics are unchanged: this is the same
 * category × channel authority, told truthfully.
 */
export const PREFERENCE_FIELD_DEFS: PreferenceFieldDef[] = [
    {
        key: "email_transactional",
        label: "Essential email",
        description: "Required service and process communications. Always allowed.",
        category: "email_transactional",
        channel: "email",
        control: "always_allowed",
    },
    {
        key: "email_operational",
        label: "Routine email",
        description: "Day-to-day operational communication.",
        category: "email_operational",
        channel: "email",
        control: "opt_out",
    },
    {
        key: "email_marketing",
        label: "Marketing & promotional email",
        description: "Requires explicit opt-in.",
        category: "email_marketing",
        channel: "email",
        control: "opt_in",
    },
    {
        key: "sms_transactional",
        label: "Essential text messages",
        description: "Required service and process communications. Always allowed unless the recipient texts STOP.",
        category: "sms_transactional",
        channel: "sms",
        control: "always_allowed",
    },
    {
        key: "sms_operational",
        label: "Routine text messages",
        description: "Day-to-day operational communication.",
        category: "sms_operational",
        channel: "sms",
        control: "opt_out",
    },
    {
        key: "sms_marketing",
        label: "Marketing & promotional texts",
        description: "Requires explicit opt-in.",
        category: "sms_marketing",
        channel: "sms",
        control: "opt_in",
    },
];

/**
 * Categories an operator may actually change.
 *
 * `always_allowed` is deliberately excluded from editing rather than shown disabled with a
 * tooltip: the platform exempts it, so an edit could never take effect, and a control that
 * cannot take effect should not be a control.
 *
 * SMS `always_allowed` is still honest — a recipient's STOP does suppress it, because
 * carrier semantics override category semantics. That path is the keyword handler, not an
 * operator switch, which is why it is not editable here either.
 */
export const EDITABLE_PREFERENCE_FIELDS: PreferenceFieldDef[] = PREFERENCE_FIELD_DEFS.filter(
    (d) => d.control !== "always_allowed",
);

export function emptyPreferenceProfile(): PersonPreferenceProfile {
    return {
        email_transactional: "unset",
        email_operational: "unset",
        email_marketing: "unset",
        sms_transactional: "unset",
        sms_operational: "unset",
        sms_marketing: "unset",
    };
}

export function operatorStatusLabel(state: ConsentState | undefined): "Allowed" | "Blocked" | "Unknown" {
    return consentOperatorStatus(state);
}

export function operatorStatusToPreferenceState(status: "Allowed" | "Blocked"): PreferenceState {
    return status === "Allowed" ? "opted_in" : "opted_out";
}
