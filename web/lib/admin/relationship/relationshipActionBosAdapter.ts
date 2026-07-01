/**
 * BOS → Relationship Action proposal adapter.
 *
 * BOS produces proposals only; human confirmation opens the shared wizard prefilled.
 */

import {
    proposalToExecutionRequest,
    type RelationshipActionProposal,
    type RelationshipActionExecutionRequest,
} from "@/lib/admin/relationship/relationshipActionContract";
import { relationshipActionRegistryEntry } from "@/lib/admin/relationship/relationshipActionRegistry";

export type BosRelationshipActionParseResult =
    | { ok: true; proposal: RelationshipActionProposal }
    | { ok: false; error: string };

/** Map a structured BOS proposal to an execution request (still requires confirmation). */
export function bosProposalToExecutionRequest(
    proposal: RelationshipActionProposal,
): RelationshipActionExecutionRequest {
    if (!proposal.confirmationRequired) {
        throw new Error("BOS relationship proposals must require confirmation.");
    }
    const entry = relationshipActionRegistryEntry(proposal.actionKey);
    if (!entry) throw new Error(`Unknown relationship action: ${proposal.actionKey}`);
    return proposalToExecutionRequest(proposal);
}

/** Lightweight example parser for MVP — production BOS uses LLM structured output. */
export function parseBosRelationshipActionPrompt(prompt: string): BosRelationshipActionParseResult {
    const text = prompt.trim().toLowerCase();
    if (!text) return { ok: false, error: "Empty prompt." };

    if (text.includes("emergency contact")) {
        const allSiblings = text.includes("sibling") || text.includes("both");
        return {
            ok: true,
            proposal: {
                actionKey: "add_emergency_contact",
                sourceSurface: "bos_rail",
                sourceRecordId: "",
                sourceEntityType: "child",
                roleKey: "emergency_contact",
                scope: allSiblings ? "all_children_in_household" : "this_child",
                confirmationRequired: true,
                bosPrompt: prompt,
                personDisplayName: extractPersonNameFromPrompt(prompt),
            },
        };
    }

    if (text.includes("authorized pickup") || text.includes("pickup")) {
        return {
            ok: true,
            proposal: {
                actionKey: "add_authorized_pickup",
                sourceSurface: "bos_rail",
                sourceRecordId: "",
                sourceEntityType: "child",
                roleKey: "authorized_pickup",
                scope: text.includes("sibling") ? "selected_children" : "this_child",
                confirmationRequired: true,
                bosPrompt: prompt,
                personDisplayName: extractPersonNameFromPrompt(prompt),
            },
        };
    }

    return { ok: false, error: "Could not map prompt to a supported relationship action." };
}

function extractPersonNameFromPrompt(prompt: string): string | undefined {
    const match = prompt.match(/\b(?:add|link)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+as\b/i);
    return match?.[1]?.trim();
}

export function bosProposalRequiresConfirmation(proposal: RelationshipActionProposal): boolean {
    return proposal.confirmationRequired === true;
}
