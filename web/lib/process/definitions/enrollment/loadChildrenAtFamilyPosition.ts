/**
 * E2E-12 — A CHILD WITH NO TRACK IS STILL A PARTICIPANT, AT THE FAMILY'S POSITION.
 *
 * A child's Enrollment track (`process_instances`) begins at its first child-grain move (doctrine
 * 2846e7ee9, kept in Slice 2). Until then the child is linked to the lead (`opportunity_customer_members`)
 * and sits at the family's stage — but Effective Process Position is built from open tracks only, so
 * such a child is invisible to it.
 *
 * That was harmless while every child moved together. With Alpha waitlisted and Bravo still a New
 * Lead, the family's Mission read only Alpha's track: Mission = Waitlist, the family's own stage was
 * discarded, and the family Focus Panel offered Waitlist work with nothing left for Bravo.
 *
 * This counts the linked children that have no open Enrollment track, so the Mission rule can see
 * them. Callers ask only in the one ambiguous case — tracked participants have all left the family's
 * stage — so every other family pays nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";
import { ENROLLMENT_SUBJECT_TYPE } from "@/lib/process/processInstances";

export async function loadChildrenAtFamilyPosition(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<number> {
    const opportunityId = params.opportunityId.trim();
    if (!opportunityId) return 0;

    const { data: links, error: linkError } = await params.supabase
        .from("opportunity_customer_members")
        .select("id, customer_member_id, customer_members!inner(is_active, relationship)")
        .eq("org_id", params.orgId)
        .eq("opportunity_id", opportunityId)
        .eq("customer_members.relationship", "child")
        .eq("customer_members.is_active", true);
    if (linkError) throw new Error(`children at family position: links failed: ${linkError.message}`);

    const rows = ((links ?? []) as Array<{ id: string; customer_member_id: string | null }>).filter(
        (r) => typeof r.customer_member_id === "string" && r.customer_member_id.trim(),
    );
    if (rows.length === 0) return 0;

    // A track names the child (`subject_id` = customer member) and anchors to its participation
    // (`context_id` = the link) — or, for older journeys, to the opportunity itself.
    const memberIds = rows.map((r) => r.customer_member_id!.trim());
    const anchors = [opportunityId, ...rows.map((r) => r.id)];
    const { data: tracks, error: trackError } = await params.supabase
        .from("process_instances")
        .select("subject_id, context_id")
        .eq("org_id", params.orgId)
        .eq("process_key", ENROLLMENT_PROCESS_KEY)
        .eq("subject_type", ENROLLMENT_SUBJECT_TYPE)
        .in("subject_id", memberIds)
        .in("context_id", anchors)
        .is("close_reason_key", null);
    if (trackError) throw new Error(`children at family position: tracks failed: ${trackError.message}`);

    const tracked = new Set(
        ((tracks ?? []) as Array<{ subject_id: string | null }>)
            .map((t) => (typeof t.subject_id === "string" ? t.subject_id.trim() : ""))
            .filter(Boolean),
    );
    return memberIds.filter((id) => !tracked.has(id)).length;
}

/**
 * The one question both Mission callers (settled drawer, commit-critical provisioning) ask, so they
 * cannot disagree: only when tracked participants exist and none of them is at the family's stage is
 * an untracked child's presence undecidable from the tracks — that is the only case that reads.
 * A failed read falls back to the tracked participants alone (the behaviour before E2E-12).
 */
export async function childrenAtFamilyPositionForMission(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
    contextStageKey: string | null | undefined;
    trackedParticipantStageKeys: readonly string[];
}): Promise<number> {
    const context = (params.contextStageKey ?? "").trim();
    const tracked = params.trackedParticipantStageKeys.map((k) => k.trim()).filter(Boolean);
    if (!context || tracked.length === 0 || tracked.includes(context)) return 0;
    try {
        return await loadChildrenAtFamilyPosition(params);
    } catch (err) {
        console.warn("[mission] children at family position unavailable; using tracked participants only", err);
        return 0;
    }
}
