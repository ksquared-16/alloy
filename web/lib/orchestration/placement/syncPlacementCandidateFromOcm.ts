/**
 * Sync active placement_candidates row from linked OCM child scope (site + cohort + labels).
 * Idempotent — used after inquiry child PATCH and repair/backfill paths.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeCustomerMemberNested } from "@/lib/orchestration/placement/normalizeSupabaseNestedRelation";
import { resolvePlacementCandidateCohortFromMember } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";
import { resolvePlacementCandidateSiteId } from "@/lib/orchestration/placement/resolvePlacementCandidateSiteId";

function safeMeta(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

function readMemberDob(
    member: {
        metadata?: Record<string, unknown> | null;
        persons?: { date_of_birth?: string | null } | null;
    } | null | undefined
): string | null {
    if (!member) return null;
    const fromPerson = member.persons?.date_of_birth;
    if (typeof fromPerson === "string" && fromPerson.trim()) return fromPerson.trim();
    const md = member.metadata;
    if (md != null && typeof md === "object" && !Array.isArray(md)) {
        const dob = (md as Record<string, unknown>).dob ?? (md as Record<string, unknown>).date_of_birth;
        if (typeof dob === "string" && dob.trim()) return dob.trim();
    }
    return null;
}

export type SyncPlacementCandidateFromOcmResult = {
    attempted: boolean;
    updated: boolean;
    candidate_id?: string;
    patched_fields?: string[];
    skipped_reason?: string;
};

export async function syncPlacementCandidateFromOcm(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        opportunityCustomerMemberId: string;
        opportunityId?: string;
    }
): Promise<SyncPlacementCandidateFromOcmResult> {
    const orgId = params.orgId.trim();
    const ocmId = params.opportunityCustomerMemberId.trim();
    if (!orgId || !ocmId) {
        return { attempted: false, updated: false, skipped_reason: "missing_ids" };
    }

    let ocmQuery = supabase
        .from("opportunity_customer_members")
        .select(
            "id, org_id, opportunity_id, location_id, program_room_cohort_key, desired_program_type, metadata, customer_members(first_name, last_name, display_name, metadata, persons(date_of_birth))"
        )
        .eq("id", ocmId)
        .eq("org_id", orgId);
    if (params.opportunityId?.trim()) {
        ocmQuery = ocmQuery.eq("opportunity_id", params.opportunityId.trim());
    }
    const { data: ocmRaw, error: ocmErr } = await ocmQuery.maybeSingle();
    if (ocmErr || !ocmRaw) {
        return { attempted: true, updated: false, skipped_reason: "ocm_not_found" };
    }

    const ocmRow = ocmRaw as {
        id: string;
        opportunity_id: string;
        location_id?: string | null;
        program_room_cohort_key?: string | null;
        desired_program_type?: string | null;
        metadata?: Record<string, unknown> | null;
        customer_members?: unknown;
    };
    const ocm = {
        ...ocmRow,
        customer_members: normalizeCustomerMemberNested(ocmRow.customer_members),
    };

    const { data: opp } = await supabase
        .from("opportunities")
        .select("location_id")
        .eq("id", ocm.opportunity_id)
        .eq("org_id", orgId)
        .maybeSingle();

    const { data: candidateRaw, error: candErr } = await supabase
        .from("placement_candidates")
        .select(
            "id, site_id, program_room_cohort_key, program_room_group_label, is_synthetic_fallback, metadata, status"
        )
        .eq("org_id", orgId)
        .eq("opportunity_customer_member_id", ocmId)
        .eq("status", "active")
        .maybeSingle();

    if (candErr) {
        return { attempted: true, updated: false, skipped_reason: candErr.message };
    }
    if (!candidateRaw) {
        return { attempted: true, updated: false, skipped_reason: "no_active_candidate" };
    }

    const candidate = candidateRaw as {
        id: string;
        site_id: string | null;
        program_room_cohort_key: string | null;
        program_room_group_label: string | null;
        is_synthetic_fallback: boolean | null;
        metadata: Record<string, unknown> | null;
    };

    if (candidate.is_synthetic_fallback === true) {
        return { attempted: true, updated: false, skipped_reason: "synthetic_candidate" };
    }

    const siteResolution = resolvePlacementCandidateSiteId({
        ocmLocationId: ocm.location_id,
        opportunityLocationId: (opp as { location_id?: string | null } | null)?.location_id ?? null,
    });

    const cohort = resolvePlacementCandidateCohortFromMember({
        ocmMetadata: safeMeta(ocm.metadata),
        candidateMetadata: safeMeta(candidate.metadata),
        desiredProgramType: ocm.desired_program_type ?? null,
        programRoomCohortKey: ocm.program_room_cohort_key ?? null,
        dateOfBirth: readMemberDob(ocm.customer_members),
    });

    const patch: Record<string, unknown> = {};
    const patched_fields: string[] = [];

    const nextSite = siteResolution.site_id;
    const prevSite = (candidate.site_id ?? "").trim() || null;
    if (nextSite && prevSite !== nextSite) {
        patch.site_id = nextSite;
        patched_fields.push("site_id");
    }

    const nextKey = cohort.program_room_cohort_key.trim();
    const prevKey = (candidate.program_room_cohort_key ?? "").trim();
    if (nextKey && prevKey !== nextKey) {
        patch.program_room_cohort_key = nextKey;
        patched_fields.push("program_room_cohort_key");
    }

    const nextLabel = cohort.program_room_group_label.trim();
    const prevLabel = (candidate.program_room_group_label ?? "").trim();
    if (nextLabel && prevLabel !== nextLabel) {
        patch.program_room_group_label = nextLabel;
        patched_fields.push("program_room_group_label");
    }

    if (!patched_fields.length) {
        return { attempted: true, updated: false, candidate_id: candidate.id };
    }

    const now = new Date().toISOString();
    patch.metadata = {
        ...safeMeta(candidate.metadata),
        placement_ocm_sync: {
            synced_from_ocm_at: now,
            patched_fields,
            ocm_id: ocmId,
        },
    };

    const { error: upErr } = await supabase
        .from("placement_candidates")
        .update(patch)
        .eq("id", candidate.id)
        .eq("org_id", orgId);

    if (upErr) {
        return { attempted: true, updated: false, skipped_reason: upErr.message };
    }

    return {
        attempted: true,
        updated: true,
        candidate_id: candidate.id,
        patched_fields,
    };
}
