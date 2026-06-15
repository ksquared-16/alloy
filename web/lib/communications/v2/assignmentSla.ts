/**
 * Communications V2 — assignment + SLA logic (PKG-10). PURE, no I/O.
 *
 * Assignment state transitions (claim/assign/reassign/unassign/route) paired with an audit-event
 * shape, and SLA state computation (first response / overdue / stale). Consumed by the dark,
 * flag-gated assign route and (later) the Command Center queue.
 */

import type { ConversationAssignmentAction } from "@/lib/communications/v2/conversationCore";

export type AssignmentFields = {
    assignment_state: "unassigned" | "assigned";
    assigned_user_id: string | null;
    assigned_team_id: string | null;
};

export type AssignmentActionParams = {
    actorUserId?: string | null;
    toUserId?: string | null;
    toTeamId?: string | null;
};

export type AssignmentResult = {
    next: AssignmentFields;
    event: {
        action: ConversationAssignmentAction;
        from_user_id: string | null;
        to_user_id: string | null;
        to_team_id: string | null;
        actor_user_id: string | null;
    };
};

export function applyAssignmentAction(
    current: AssignmentFields,
    action: ConversationAssignmentAction,
    params: AssignmentActionParams
): AssignmentResult {
    const fromUser = current.assigned_user_id ?? null;
    let next: AssignmentFields;
    switch (action) {
        case "claim":
            next = { assignment_state: "assigned", assigned_user_id: params.actorUserId ?? null, assigned_team_id: null };
            break;
        case "assign":
        case "reassign":
            next = {
                assignment_state: "assigned",
                assigned_user_id: params.toUserId ?? null,
                assigned_team_id: params.toTeamId ?? null,
            };
            break;
        case "route":
            next = {
                assignment_state: params.toUserId || params.toTeamId ? "assigned" : "unassigned",
                assigned_user_id: params.toUserId ?? null,
                assigned_team_id: params.toTeamId ?? null,
            };
            break;
        case "unassign":
            next = { assignment_state: "unassigned", assigned_user_id: null, assigned_team_id: null };
            break;
        default:
            next = current;
    }
    return {
        next,
        event: {
            action,
            from_user_id: fromUser,
            to_user_id: next.assigned_user_id,
            to_team_id: next.assigned_team_id,
            actor_user_id: params.actorUserId ?? null,
        },
    };
}

export type SlaInput = {
    firstResponseAt?: string | null;
    lastInboundAt?: string | null;
    lastOutboundAt?: string | null;
    lastMessageAt?: string | null;
};
export type SlaThresholds = { firstResponseMinutes: number; staleHours: number };
export type SlaState = "none" | "first_response_due" | "overdue" | "stale";
export type SlaResult = { slaState: SlaState; slaDueAt: string | null };

const ms = (iso?: string | null): number | null => (iso ? Date.parse(iso) : null);

export function computeSlaState(input: SlaInput, nowMs: number, thresholds: SlaThresholds): SlaResult {
    const lastInbound = ms(input.lastInboundAt);
    const lastOutbound = ms(input.lastOutboundAt);
    const awaitingResponse = lastInbound !== null && (lastOutbound === null || lastInbound > lastOutbound);

    if (awaitingResponse) {
        const dueMs = (lastInbound as number) + thresholds.firstResponseMinutes * 60_000;
        return {
            slaState: nowMs > dueMs ? "overdue" : "first_response_due",
            slaDueAt: new Date(dueMs).toISOString(),
        };
    }
    const lastMsg = ms(input.lastMessageAt);
    if (lastMsg !== null && nowMs - lastMsg > thresholds.staleHours * 3_600_000) {
        return { slaState: "stale", slaDueAt: null };
    }
    return { slaState: "none", slaDueAt: null };
}
