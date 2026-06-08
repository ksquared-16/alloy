/**
 * Resolve explicit grain for status mutation routing (Card 10).
 */

export type StatusMutationGrain = "case" | "child" | "candidate";

export type ResolvedStatusMutationGrain = {
    grain: StatusMutationGrain;
    opportunityId: string | null;
    opportunityCustomerMemberId: string | null;
    placementCandidateId: string | null;
};

function readString(raw: unknown): string | null {
    return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function resolveStatusMutationGrain(
    payload: Record<string, unknown> | null | undefined,
    entityId?: string | null
): ResolvedStatusMutationGrain {
    const p = payload && typeof payload === "object" ? payload : {};
    const grainRaw = readString(p.row_grain);
    const grain: StatusMutationGrain =
        grainRaw === "child" || grainRaw === "candidate" ? grainRaw : "case";

    return {
        grain,
        opportunityId: readString(p.opportunity_id) ?? readString(entityId),
        opportunityCustomerMemberId: readString(p.opportunity_customer_member_id),
        placementCandidateId: readString(p.placement_candidate_id),
    };
}

export function assertChildLifecycleMutationTarget(
    resolved: ResolvedStatusMutationGrain
): { ok: true; opportunityId: string; opportunityCustomerMemberId: string } | { ok: false; error: string } {
    if (resolved.grain === "case") {
        return { ok: false, error: "child lifecycle mutation requires row_grain child or candidate" };
    }
    const opportunityId = resolved.opportunityId?.trim() ?? "";
    const ocmId = resolved.opportunityCustomerMemberId?.trim() ?? "";
    if (!opportunityId) {
        return { ok: false, error: "child lifecycle mutation requires opportunity_id" };
    }
    if (!ocmId) {
        return {
            ok: false,
            error: "child lifecycle mutation requires opportunity_customer_member_id (do not infer from case alone)",
        };
    }
    return { ok: true, opportunityId, opportunityCustomerMemberId: ocmId };
}

/** Reject workflow updates that mix case entity with child lifecycle patch semantics. */
export function assertWorkflowStatusMutationGrain(params: {
    entityType: string;
    patch: Record<string, unknown>;
    payload: Record<string, unknown>;
}): { ok: true } | { ok: false; error: string } {
    const entity = params.entityType.trim().toLowerCase();
    const patch = params.patch;
    const grain = readString(params.payload.row_grain);

    if (
        (entity === "opportunity" || entity === "opportunities") &&
        Object.prototype.hasOwnProperty.call(patch, "outcome_status_key")
    ) {
        return {
            ok: false,
            error: "update_entity: outcome_status_key on opportunities is ambiguous — target opportunity_customer_members with explicit entity_id",
        };
    }

    if (
        (entity === "opportunity" || entity === "opportunities") &&
        Object.prototype.hasOwnProperty.call(patch, "status_key") &&
        (grain === "child" || grain === "candidate")
    ) {
        return {
            ok: false,
            error: "update_entity: row_grain child/candidate requires opportunity_customer_members target for lifecycle status",
        };
    }

    if (
        (entity === "opportunity_customer_member" || entity === "opportunity_customer_members") &&
        Object.prototype.hasOwnProperty.call(patch, "status_key") &&
        !Object.prototype.hasOwnProperty.call(patch, "outcome_status_key")
    ) {
        return {
            ok: false,
            error: "update_entity: opportunity_customer_members lifecycle updates must patch outcome_status_key",
        };
    }

    return { ok: true };
}
