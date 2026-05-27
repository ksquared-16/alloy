/**
 * Load placement_candidates + link groups + active overrides for drawer/API (Card 2).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    OpportunityPlacementCandidateVm,
    OpportunityPlacementCandidatesResponse,
    PlacementCandidateActiveOverrideSummary,
    PlacementCandidateLinkGroupSummary,
    PlacementCandidateRow,
    PlacementCandidateStatus,
    PlacementLinkMode,
    PlacementOverrideKind,
} from "@/lib/orchestration/placement/placementCandidateTypes";

function safeMeta(raw: unknown): Record<string, unknown> | null {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return null;
}

function asStatus(raw: unknown): PlacementCandidateStatus {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s === "active" || s === "paused" || s === "withdrawn" || s === "placed") return s;
    return "active";
}

function asLinkMode(raw: unknown): PlacementLinkMode {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s === "preferred_together" || s === "strictly_together" || s === "independent") return s;
    return "independent";
}

function asOverrideKind(raw: unknown): PlacementOverrideKind {
    const s = typeof raw === "string" ? raw.trim() : "";
    if (s === "pin" || s === "tier_boost" || s === "temporary") return s;
    return "temporary";
}

type MemberRow = {
    placement_candidate_id: string;
    placement_link_group_id: string;
    placement_link_groups: {
        id: string;
        link_mode: string;
        placement_link_group_members: Array<{ id: string }> | null;
    } | null;
};

type OverrideRow = {
    id: string;
    placement_candidate_id: string;
    override_kind: string;
    reason: string;
    expires_at: string | null;
    payload: Record<string, unknown> | null;
};

type CandidateQueryRow = PlacementCandidateRow & {
    customer_members: { display_name: string | null; person_id: string | null } | null;
};

export async function loadOpportunityPlacementCandidates(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityId: string;
}): Promise<OpportunityPlacementCandidatesResponse> {
    const { supabase, orgId, opportunityId } = params;

    const { data: rawCandidates, error: candErr } = await supabase
        .from("placement_candidates")
        .select(
            "id, org_id, opportunity_id, customer_id, opportunity_customer_member_id, customer_member_id, person_id, site_id, is_synthetic_fallback, program_room_cohort_key, program_room_group_label, wait_since, desired_start_date, status, seed_key, metadata, customer_members(display_name, person_id)"
        )
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId)
        .order("program_room_cohort_key", { ascending: true })
        .order("created_at", { ascending: true });

    if (candErr) {
        throw new Error(`placement_candidates load failed: ${candErr.message}`);
    }

    const candidates = (rawCandidates ?? []) as CandidateQueryRow[];
    const candidateIds = candidates.map((c) => c.id);

    const linkByCandidate = new Map<string, PlacementCandidateLinkGroupSummary>();
    if (candidateIds.length) {
        const { data: memberRows, error: memErr } = await supabase
            .from("placement_link_group_members")
            .select(
                "placement_candidate_id, placement_link_group_id, placement_link_groups(id, link_mode, placement_link_group_members(id))"
            )
            .eq("org_id", orgId)
            .in("placement_candidate_id", candidateIds);

        if (memErr) {
            throw new Error(`placement_link_group_members load failed: ${memErr.message}`);
        }

        for (const row of (memberRows ?? []) as MemberRow[]) {
            const grp = row.placement_link_groups;
            if (!grp) continue;
            linkByCandidate.set(row.placement_candidate_id, {
                id: grp.id,
                link_mode: asLinkMode(grp.link_mode),
                member_count: grp.placement_link_group_members?.length ?? 0,
            });
        }
    }

    const overridesByCandidate = new Map<string, PlacementCandidateActiveOverrideSummary[]>();
    if (candidateIds.length) {
        const { data: overrideRows, error: ovErr } = await supabase
            .from("placement_overrides")
            .select("id, placement_candidate_id, override_kind, reason, expires_at, payload")
            .eq("org_id", orgId)
            .eq("is_active", true)
            .in("placement_candidate_id", candidateIds);

        if (ovErr) {
            throw new Error(`placement_overrides load failed: ${ovErr.message}`);
        }

        for (const row of (overrideRows ?? []) as OverrideRow[]) {
            const list = overridesByCandidate.get(row.placement_candidate_id) ?? [];
            list.push({
                id: row.id,
                override_kind: asOverrideKind(row.override_kind),
                reason: row.reason,
                expires_at: row.expires_at,
                payload: row.payload,
            });
            overridesByCandidate.set(row.placement_candidate_id, list);
        }
    }

    const vms: OpportunityPlacementCandidateVm[] = candidates.map((c) => {
        const meta = safeMeta(c.metadata);
        const displayName =
            c.customer_members?.display_name?.trim() ||
            (meta && typeof meta.display_name === "string" ? meta.display_name.trim() : "") ||
            null;

        return {
            id: c.id,
            status: asStatus(c.status),
            is_synthetic_fallback: c.is_synthetic_fallback === true,
            program_room_cohort_key: c.program_room_cohort_key,
            program_room_group_label: c.program_room_group_label,
            wait_since: c.wait_since,
            desired_start_date: c.desired_start_date,
            child: {
                opportunity_customer_member_id: c.opportunity_customer_member_id,
                customer_member_id: c.customer_member_id,
                person_id: c.person_id ?? c.customer_members?.person_id ?? null,
                display_name: displayName,
            },
            link_group: linkByCandidate.get(c.id) ?? null,
            active_overrides: overridesByCandidate.get(c.id) ?? [],
            ...(meta ? { metadata: meta } : {}),
        };
    });

    return {
        opportunity_id: opportunityId,
        projection_mode: "family_row",
        candidates: vms,
    };
}
