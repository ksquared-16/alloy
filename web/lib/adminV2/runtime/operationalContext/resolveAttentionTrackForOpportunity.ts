import type { SupabaseClient } from "@supabase/supabase-js";
/**
 * E2E-12 — THE STAGE A CHILD SUBJECT'S WORK BELONGS TO.
 *
 * A Focus Panel opened on a child (a Waitlist row: `attention_subject_id` = the child's track) must
 * show that child's stage work. The settled view model keyed its stage-work slice to the FAMILY's
 * Mission alone, so a child view was right only while the family Mission happened to equal the
 * child's stage. Once a sibling still at the family position keeps the family Mission at Lead, a
 * waitlisted child opened from the Waitlist view showed Lead work.
 *
 * Accepts both anchors a track may carry — the opportunity (older journeys) or the child's
 * participation in it (`opportunity_customer_members`, the grain-crossing doctrine). The resolver
 * above accepts only the first; it is left unchanged here.
 */
export async function resolveAttentionTrackForOpportunity(args: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    participationId: string | null;
}): Promise<{ processInstanceId: string; customerMemberId: string; ocmId: string | null; stageKey: string } | null> {
    const participationId = args.participationId?.trim() ?? "";
    const opportunityId = args.opportunityId?.trim() ?? "";
    const orgId = args.orgId?.trim() ?? "";
    if (!participationId || !opportunityId || !orgId || participationId === opportunityId) return null;

    const { data, error } = await args.supabase
        .from("process_instances")
        .select("id, subject_type, subject_id, context_id, stage_key, close_reason_key")
        .eq("id", participationId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (error || !data) return null;
    const row = data as Record<string, unknown>;
    if (row.close_reason_key) return null;
    const subjectType = String(row.subject_type ?? "").trim();
    if (subjectType && subjectType !== "child") return null;
    const customerMemberId = String(row.subject_id ?? "").trim();
    const stageKey = String(row.stage_key ?? "").trim();
    const contextId = String(row.context_id ?? "").trim();
    if (!customerMemberId || !stageKey || !contextId) return null;

    // Authorization: the track must belong to THIS opportunity, through either anchor.
    let ocmId: string | null = null;
    if (contextId !== opportunityId) {
        const { data: link, error: linkError } = await args.supabase
            .from("opportunity_customer_members")
            .select("id")
            .eq("id", contextId)
            .eq("org_id", orgId)
            .eq("opportunity_id", opportunityId)
            .maybeSingle();
        if (linkError || !link) return null;
        ocmId = contextId;
    }
    return { processInstanceId: participationId, customerMemberId, ocmId, stageKey };
}
