/**
 * Canonical Communications queue scope resolution — PURE, no I/O.
 * Every queue row must resolve to a loadable customer scope or an explicit review state.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type CommunicationQueueScopeInput = {
    orgId: string;
    customerId?: string | null;
    primaryEntityType?: string | null;
    primaryEntityId?: string | null;
    threadId?: string | null;
    participantIds?: string[];
    /** customer_id stamped on thread metadata when entity anchor is absent. */
    metadataCustomerId?: string | null;
    /** When known, whether the customer row exists for this org. */
    customerExists?: boolean;
    /** Person → customer links discovered during enrichment. */
    personCustomerId?: string | null;
    /** Opportunity → customer links discovered during enrichment. */
    opportunityCustomerId?: string | null;
};

export type CommunicationQueueScopeReason =
    | "direct_customer"
    | "opportunity_customer"
    | "person_customer"
    | "thread_customer"
    | "metadata_customer"
    | "participant_customer";

export type CommunicationQueueScopeResolution =
    | {
          status: "resolved";
          customerId: string;
          threadId?: string | null;
          reason: CommunicationQueueScopeReason;
      }
    | {
          status: "ambiguous";
          candidateCustomerIds: string[];
          reason: string;
      }
    | {
          status: "unresolved";
          reason: string;
      };

export type QueueScopeStatus = CommunicationQueueScopeResolution["status"];

function normalizeEntityType(type: string | null | undefined): string {
    return (type ?? "").trim().toLowerCase();
}

function isUuid(value: string | null | undefined): boolean {
    return Boolean(value && UUID_RE.test(value.trim()));
}

function uniqueCandidates(ids: Array<string | null | undefined>): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of ids) {
        const id = (raw ?? "").trim();
        if (!isUuid(id) || seen.has(id)) continue;
        seen.add(id);
        out.push(id);
    }
    return out;
}

/**
 * Deterministic customer scope resolution for a single queue row.
 * Does not guess when multiple customers are plausible.
 */
export function resolveCommunicationQueueScope(input: CommunicationQueueScopeInput): CommunicationQueueScopeResolution {
    const entityType = normalizeEntityType(input.primaryEntityType);
    const entityId = (input.primaryEntityId ?? "").trim();
    const threadId = input.threadId ?? null;

    const directCustomer = isUuid(input.customerId) ? input.customerId!.trim() : null;
    const metadataCustomer = isUuid(input.metadataCustomerId) ? input.metadataCustomerId!.trim() : null;
    const oppCustomer = isUuid(input.opportunityCustomerId) ? input.opportunityCustomerId!.trim() : null;
    const personCustomer = isUuid(input.personCustomerId) ? input.personCustomerId!.trim() : null;

    if (entityType === "customers" || entityType === "customer") {
        if (!isUuid(entityId)) {
            return { status: "unresolved", reason: "invalid_customer_entity" };
        }
        if (input.customerExists === false) {
            return { status: "unresolved", reason: "inactive_or_missing_customer" };
        }
        return { status: "resolved", customerId: entityId, threadId, reason: "direct_customer" };
    }

    const participantCustomers = uniqueCandidates(input.participantIds ?? []);
    const candidatePool = uniqueCandidates([
        directCustomer,
        oppCustomer,
        personCustomer,
        metadataCustomer,
        ...participantCustomers,
    ]);

    if (candidatePool.length > 1) {
        return {
            status: "ambiguous",
            candidateCustomerIds: candidatePool,
            reason: "multiple_customer_candidates",
        };
    }

    if (candidatePool.length === 1) {
        const customerId = candidatePool[0]!;
        if (input.customerExists === false) {
            return { status: "unresolved", reason: "inactive_or_missing_customer" };
        }
        let reason: CommunicationQueueScopeReason = "thread_customer";
        if (directCustomer && customerId === directCustomer) reason = "direct_customer";
        else if (oppCustomer && customerId === oppCustomer) reason = "opportunity_customer";
        else if (personCustomer && customerId === personCustomer) reason = "person_customer";
        else if (metadataCustomer && customerId === metadataCustomer) reason = "metadata_customer";
        else if (participantCustomers.includes(customerId)) reason = "participant_customer";
        return { status: "resolved", customerId, threadId, reason };
    }

    if (entityType === "opportunities" || entityType === "opportunity") {
        if (!isUuid(entityId)) return { status: "unresolved", reason: "invalid_opportunity_entity" };
        return { status: "unresolved", reason: "opportunity_without_customer" };
    }

    if (entityType === "persons" || entityType === "person") {
        if (!isUuid(entityId)) return { status: "unresolved", reason: "invalid_person_entity" };
        return { status: "unresolved", reason: "person_without_household" };
    }

    if (entityType && entityId) {
        return { status: "unresolved", reason: "unsupported_entity_anchor" };
    }

    if (threadId) {
        return { status: "unresolved", reason: "orphaned_thread_without_entity" };
    }

    return { status: "unresolved", reason: "missing_scope_input" };
}

export function isResolvedQueueScope(
    resolution: CommunicationQueueScopeResolution
): resolution is Extract<CommunicationQueueScopeResolution, { status: "resolved" }> {
    return resolution.status === "resolved";
}
