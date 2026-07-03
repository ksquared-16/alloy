/**
 * Resolve durable operational facts (program / room / schedule / start) for a set of children from the
 * operational enrollment read model — child_enrollment_agreements + child_placements + schedule_assignments.
 *
 * This is the childcare-domain read that lets a display surface (e.g. the Focus Panel child section) show
 * durable facts AFTER materialization instead of OCM. The caller applies the returned facts onto its own
 * row shape; childcare table names stay here (see the naming/boundary doctrine). OCM is the caller's
 * fallback when a child has no operational agreement yet.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildOperationalEnrollmentReadModelForAgreement } from "@/lib/childcareOperational/operationalEnrollmentReadModel";

/** Non-terminal agreement statuses — a materialized, currently-operational enrollment. */
const OPERATIONAL_AGREEMENT_STATUSES = ["pending_start", "active", "ending"];

export type DurableChildFacts = {
    programLabel: string | null;
    roomLabel: string | null;
    scheduleLabel: string | null;
    startDate: string | null;
    programCategoryId: string | null;
    roomLocationId: string | null;
    siteLocationId: string | null;
    agreementStatus: string | null;
};

/**
 * Returns a map (customer_member_id → durable facts) for children that have an operational agreement.
 * Children without one are simply absent from the map (caller falls back to OCM). One batched agreement
 * query up front; the full read model is built only for children that actually have an agreement.
 */
export async function resolveDurableFactsForChildren(
    supabase: SupabaseClient,
    orgId: string,
    children: Array<{ customerMemberId: string; siteLocationId?: string | null }>,
): Promise<Map<string, DurableChildFacts>> {
    const out = new Map<string, DurableChildFacts>();
    const memberIds = [...new Set(children.map((c) => c.customerMemberId).filter(Boolean))];
    if (!memberIds.length) return out;

    const { data: agreements, error } = await supabase
        .from("child_enrollment_agreements")
        .select("id, customer_member_id, site_location_id, status")
        .eq("org_id", orgId)
        .in("customer_member_id", memberIds)
        .in("status", OPERATIONAL_AGREEMENT_STATUSES);
    if (error || !agreements?.length) return out;

    const byMember = new Map<string, Array<{ id: string; site_location_id: string | null; status: string }>>();
    for (const raw of agreements as Array<Record<string, unknown>>) {
        const memberId = String(raw.customer_member_id ?? "");
        if (!memberId) continue;
        const arr = byMember.get(memberId) ?? [];
        arr.push({
            id: String(raw.id),
            site_location_id: (raw.site_location_id as string | null) ?? null,
            status: String(raw.status ?? ""),
        });
        byMember.set(memberId, arr);
    }

    for (const child of children) {
        const list = byMember.get(child.customerMemberId);
        if (!list?.length) continue;
        // Prefer the agreement at the child's site; else the first operational agreement.
        const site = child.siteLocationId ?? null;
        const agr = (site ? list.find((a) => a.site_location_id === site) : null) ?? list[0];
        const rm = await buildOperationalEnrollmentReadModelForAgreement(supabase, orgId, agr.id);
        if (!rm.agreement) continue;
        out.set(child.customerMemberId, {
            programLabel: rm.labels.program,
            roomLabel: rm.labels.room,
            scheduleLabel: rm.labels.schedule,
            startDate: rm.placement?.start_date ?? rm.agreement.start_date ?? null,
            programCategoryId: rm.placement?.program_category_id ?? null,
            roomLocationId: rm.placement?.room_location_id ?? null,
            siteLocationId: rm.agreement.site_location_id ?? null,
            agreementStatus: rm.agreement.status ?? null,
        });
    }
    return out;
}
