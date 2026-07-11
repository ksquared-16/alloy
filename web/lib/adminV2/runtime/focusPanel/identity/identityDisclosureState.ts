/**
 * Canonical identity disclosure navigation state for Focus Panel identity cards.
 *
 * Runtime flow: Summary → Context → Details → Evidence
 */

import type { IdentityDisclosureDepth } from "@/lib/adminV2/runtime/focusPanel/identity/identitySurfaceTypes";

export type IdentityDisclosureState = {
    depth: IdentityDisclosureDepth;
    selectedIdentityId?: string;
    selectedSectionKey?: string;
};

export const INITIAL_IDENTITY_DISCLOSURE_STATE: IdentityDisclosureState = {
    depth: "summary",
};

export function canEnterIdentityDetails(state: IdentityDisclosureState): boolean {
    return Boolean(state.selectedIdentityId);
}

export function canEnterIdentityEvidence(state: IdentityDisclosureState): boolean {
    return Boolean(state.selectedIdentityId);
}

export function transitionIdentityDisclosure(
    state: IdentityDisclosureState,
    action:
        | { type: "enter_context" }
        | { type: "select_identity"; identityId: string; sectionKey?: string }
        | { type: "enter_details"; identityId: string; sectionKey?: string }
        | { type: "enter_evidence"; identityId: string; sectionKey?: string }
        | { type: "back" },
): IdentityDisclosureState {
    switch (action.type) {
        case "enter_context":
            return { depth: "context", selectedIdentityId: undefined, selectedSectionKey: undefined };
        case "select_identity":
            if (!action.identityId) return state;
            return {
                depth: "details",
                selectedIdentityId: action.identityId,
                selectedSectionKey: action.sectionKey,
            };
        case "enter_details":
            if (!action.identityId) return state;
            return {
                depth: "details",
                selectedIdentityId: action.identityId,
                selectedSectionKey: action.sectionKey,
            };
        case "enter_evidence":
            if (!action.identityId) return state;
            return {
                depth: "evidence",
                selectedIdentityId: action.identityId,
                selectedSectionKey: action.sectionKey,
            };
        case "back":
            return backIdentityDisclosure(state);
    }
}

export function backIdentityDisclosure(state: IdentityDisclosureState): IdentityDisclosureState {
    switch (state.depth) {
        case "evidence":
            return { ...state, depth: "details" };
        case "details":
            return {
                depth: "context",
                selectedIdentityId: undefined,
                selectedSectionKey: undefined,
            };
        case "context":
            return { depth: "summary", selectedIdentityId: undefined, selectedSectionKey: undefined };
        case "summary":
            return state;
    }
}

export function identityDisclosureDepthLabel(depth: IdentityDisclosureDepth): string {
    switch (depth) {
        case "summary":
            return "Summary";
        case "context":
            return "Context";
        case "details":
            return "Details";
        case "evidence":
            return "Evidence";
    }
}
