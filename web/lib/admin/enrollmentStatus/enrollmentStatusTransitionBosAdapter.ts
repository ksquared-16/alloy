/**
 * BOS natural-language → enrollment status transition proposal.
 */

import type { EnrollmentStatusTransitionExecutionRequest } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import { UPDATE_ENROLLMENT_STATUS_ACTION_KEY } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";
import {
    destinationKeyFromBosLabel,
    type ExecuteEnrollmentStatusTransitionInput,
} from "@/lib/admin/enrollmentStatus/executeEnrollmentStatusTransition";
import { resolveEnrollmentStatusTargetKey } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionDestinations";
import type { EnrollmentStatusTransitionScope } from "@/lib/admin/enrollmentStatus/enrollmentStatusTransitionContract";

export type BosEnrollmentStatusProposal = {
    childDisplayName: string | null;
    destinationLabel: string;
    destinationKey: NonNullable<ReturnType<typeof destinationKeyFromBosLabel>>;
    bypassReason: string | null;
    reason: string | null;
};

const CHILD_NAME_RE =
    /(?:move|put|place|send)\s+(?:[\w']+\s+){0,3}?(\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b)\s+(?:to|on)/i;

const REASON_RE = /(?:because|since|reason:?)\s+(.+?)(?:\.|$)/i;

export function parseBosEnrollmentStatusPrompt(prompt: string): { ok: true; proposal: BosEnrollmentStatusProposal } | { ok: false; error: string } {
    const text = prompt.trim();
    if (!text) return { ok: false, error: "Empty prompt" };

    const lower = text.toLowerCase();
    const destinationKey = destinationKeyFromBosLabel(lower);
    if (!destinationKey) {
        return { ok: false, error: "Could not infer destination stage (e.g. waitlist, enrolled)." };
    }

    const childMatch = text.match(CHILD_NAME_RE);
    const childDisplayName = childMatch?.[1]?.trim() ?? null;

    const reasonMatch = text.match(REASON_RE);
    const reason = reasonMatch?.[1]?.trim() ?? null;

    let bypassReason: string | null = null;
    if (destinationKey === "waitlist" && lower.includes("no space")) {
        bypassReason = "No space available";
    } else if (destinationKey === "waitlist" && reason) {
        bypassReason = reason;
    }

    return {
        ok: true,
        proposal: {
            childDisplayName,
            destinationLabel: destinationKey.replace(/_/g, " "),
            destinationKey,
            bypassReason,
            reason,
        },
    };
}

export function bosProposalToEnrollmentExecutionRequest(input: {
    proposal: BosEnrollmentStatusProposal;
    scope: EnrollmentStatusTransitionScope;
    sourceSurface?: EnrollmentStatusTransitionExecutionRequest["sourceSurface"];
}): EnrollmentStatusTransitionExecutionRequest {
    const grain = input.scope.grain;
    const destinationKey = input.proposal.destinationKey;
    return {
        actionKey: UPDATE_ENROLLMENT_STATUS_ACTION_KEY,
        scope: input.scope,
        destinationKey,
        targetStatusKey: resolveEnrollmentStatusTargetKey(destinationKey, grain),
        confirmationRequired: true,
        reason: input.proposal.reason,
        bypassReason: input.proposal.bypassReason,
        sourceSurface: input.sourceSurface ?? "bos_rail",
    };
}

export type { ExecuteEnrollmentStatusTransitionInput };
