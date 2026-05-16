/**
 * Configuration / Layout Assist proposal lifecycle states (Card 6).
 */

export const CONFIG_LAYOUT_ASSIST_PROPOSAL_STATES = [
    "draft",
    "reviewed",
    "approved",
    "rejected",
    "applied",
    "failed",
    "rolled_back",
] as const;

export type ConfigLayoutAssistProposalState = (typeof CONFIG_LAYOUT_ASSIST_PROPOSAL_STATES)[number];

export const CONFIG_LAYOUT_ASSIST_INITIAL_STATE: ConfigLayoutAssistProposalState = "draft";

/** Allowed directed transitions (from → to). */
const ALLOWED_TRANSITIONS: ReadonlyArray<readonly [ConfigLayoutAssistProposalState, ConfigLayoutAssistProposalState]> = [
    ["draft", "reviewed"],
    ["draft", "rejected"],
    ["reviewed", "approved"],
    ["reviewed", "rejected"],
    ["approved", "applied"],
    ["approved", "failed"],
    ["applied", "rolled_back"],
    ["failed", "reviewed"],
    ["failed", "rejected"],
];

const TRANSITION_SET = new Set(ALLOWED_TRANSITIONS.map(([a, b]) => `${a}->${b}`));

export function isConfigLayoutAssistProposalState(s: string): s is ConfigLayoutAssistProposalState {
    return (CONFIG_LAYOUT_ASSIST_PROPOSAL_STATES as readonly string[]).includes(s);
}

export type ValidateProposalTransitionResult =
    | { ok: true; from: ConfigLayoutAssistProposalState; to: ConfigLayoutAssistProposalState }
    | { ok: false; code: string; message: string };

export function validateConfigurationProposalTransition(
    from: string,
    to: string
): ValidateProposalTransitionResult {
    if (!isConfigLayoutAssistProposalState(from)) {
        return { ok: false, code: "INVALID_FROM_STATE", message: `Invalid current state: ${from}` };
    }
    if (!isConfigLayoutAssistProposalState(to)) {
        return { ok: false, code: "INVALID_TO_STATE", message: `Invalid target state: ${to}` };
    }
    if (from === to) {
        return { ok: false, code: "NO_OP_TRANSITION", message: "Target state matches current state." };
    }
    const key = `${from}->${to}`;
    if (!TRANSITION_SET.has(key)) {
        return {
            ok: false,
            code: "TRANSITION_NOT_ALLOWED",
            message: `Transition ${from} → ${to} is not allowed.`,
        };
    }
    return { ok: true, from, to };
}

/** Permission key required for transition (Card 7 seeds keys; fallback in access helper). */
export function permissionKeyForProposalTransition(
    to: ConfigLayoutAssistProposalState
): "config_assist.review" | "config_assist.apply" {
    switch (to) {
        case "approved":
        case "applied":
        case "failed":
        case "rolled_back":
            return "config_assist.apply";
        case "reviewed":
        case "rejected":
        default:
            return "config_assist.review";
    }
}

export function transitionRequiresRejectionReason(to: ConfigLayoutAssistProposalState): boolean {
    return to === "rejected";
}

export function transitionRequiresFailedReason(to: ConfigLayoutAssistProposalState): boolean {
    return to === "failed";
}
