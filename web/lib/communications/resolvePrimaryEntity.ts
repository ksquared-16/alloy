import type { WorkflowEventPayload } from "@/lib/workflowRun";

/** Pick primary_entity for CARD 1.5 threading from enriched workflow payload. */
export function resolvePrimaryEntityFromWorkflowPayload(
    payload: Record<string, unknown>
): { entityType: string; entityId: string } | null {
    const opp =
        typeof payload.opportunity === "object" &&
        payload.opportunity &&
        typeof (payload.opportunity as Record<string, unknown>).id === "string"
            ? ((payload.opportunity as Record<string, unknown>).id as string)
            : null;
    if (opp) return { entityType: "opportunities", entityId: opp };

    const job =
        typeof payload.job === "object" &&
        payload.job &&
        typeof (payload.job as Record<string, unknown>).id === "string"
            ? ((payload.job as Record<string, unknown>).id as string)
            : null;
    if (job) return { entityType: "jobs", entityId: job };

    const cust =
        typeof payload.customer === "object" &&
        payload.customer &&
        typeof (payload.customer as Record<string, unknown>).id === "string"
            ? ((payload.customer as Record<string, unknown>).id as string)
            : null;
    if (cust) return { entityType: "customers", entityId: cust };

    const contact =
        typeof payload.contact === "object" &&
        payload.contact &&
        typeof (payload.contact as Record<string, unknown>).id === "string"
            ? ((payload.contact as Record<string, unknown>).id as string)
            : null;
    if (contact) return { entityType: "contacts", entityId: contact };

    const et = payload.entity_type != null ? String(payload.entity_type).trim() : "";
    const ei = payload.entity_id != null ? String(payload.entity_id).trim() : "";
    if (ei && /^[0-9a-f-]{36}$/i.test(ei)) {
        if (et) return { entityType: et, entityId: ei };
    }
    return null;
}

export function resolveContextLocationId(payload: WorkflowEventPayload | Record<string, unknown>): string | null {
    const job = payload.job as Record<string, unknown> | null | undefined;
    if (job?.location_id) return String(job.location_id);
    const loc = typeof payload.location === "object" && payload.location ? (payload.location as Record<string, unknown>) : null;
    if (loc?.id) return String(loc.id);
    return null;
}
