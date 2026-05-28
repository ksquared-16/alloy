/**
 * Batch load placement_candidates for QueueService V2 projection (Card 3).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
    PlacementCandidateActiveOverrideSummary,
    PlacementCandidateLinkGroupSummary,
    PlacementCandidateRow,
    PlacementLinkMode,
    PlacementOverrideKind,
} from "@/lib/orchestration/placement/placementCandidateTypes";
import { filterActivePlacementOverrides } from "@/lib/orchestration/placement/filterActivePlacementOverrides";
import {
    normalizeCustomerMemberNested,
    normalizePlacementLinkMemberRow,
    type NormalizedPlacementLinkMemberRow,
} from "@/lib/orchestration/placement/normalizeSupabaseNestedRelation";
import {
    looksLikeCombinedProgramRoomCohort,
    resolvePlacementCandidateCohortForQueue,
} from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";
import {
    placementLoadDiagnosticsEnabled,
    resolvePlacementCandidateLoadDiagnostics,
    type PlacementCandidateLoadDiagnostics,
} from "@/lib/orchestration/placement/placementCandidateLoadDiagnostics";

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

type MemberRow = NormalizedPlacementLinkMemberRow;

type OverrideRow = {
    id: string;
    placement_candidate_id: string;
    override_kind: string;
    reason: string;
    expires_at: string | null;
    payload: Record<string, unknown> | null;
};

export type PlacementCandidateQueueBundle = {
    candidate: PlacementCandidateRow;
    link_group: PlacementCandidateLinkGroupSummary | null;
    link_mode: PlacementLinkMode;
    active_overrides: PlacementCandidateActiveOverrideSummary[];
    child_display_name: string | null;
    /** Dev/test — site/cohort/household fact provenance when diagnostics enabled. */
    load_diagnostics?: PlacementCandidateLoadDiagnostics;
};

export type PlacementCandidatesByOpportunityId = Map<string, PlacementCandidateQueueBundle[]>;

export async function bulkLoadPlacementCandidatesByOpportunity(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityIds: string[];
    /** Active candidates only (default true). */
    activeOnly?: boolean;
}): Promise<PlacementCandidatesByOpportunityId> {
    const out: PlacementCandidatesByOpportunityId = new Map();
    const ids = [...new Set(params.opportunityIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return out;

    let q = params.supabase
        .from("placement_candidates")
        .select(
            "id, org_id, opportunity_id, customer_id, opportunity_customer_member_id, customer_member_id, person_id, site_id, is_synthetic_fallback, program_room_cohort_key, program_room_group_label, wait_since, desired_start_date, status, seed_key, metadata, customer_members(display_name, person_id, metadata, persons(date_of_birth)), opportunity_customer_members(id, location_id, program_room_cohort_key, metadata, desired_program_type, customer_members(display_name, person_id, metadata, persons(date_of_birth)))"
        )
        .eq("org_id", params.orgId)
        .in("opportunity_id", ids);

    if (params.activeOnly !== false) {
        q = q.eq("status", "active");
    }

    const { data: rawCandidates, error: candErr } = await q;
    if (candErr) {
        throw new Error(`placement_candidates bulk load failed: ${candErr.message}`);
    }

    type Row = PlacementCandidateRow & {
        customer_members: ReturnType<typeof normalizeCustomerMemberNested>;
        opportunity_customer_members: {
            id: string;
            location_id?: string | null;
            program_room_cohort_key?: string | null;
            metadata: Record<string, unknown> | null;
            desired_program_type: string | null;
            customer_members: ReturnType<typeof normalizeCustomerMemberNested>;
        } | null;
    };

    function normalizeCandidateRow(raw: unknown): Row {
        const c = raw as Record<string, unknown>;
        const ocmRaw = c.opportunity_customer_members as
            | {
                  id: string;
                  location_id?: string | null;
                  program_room_cohort_key?: string | null;
                  metadata: Record<string, unknown> | null;
                  desired_program_type: string | null;
                  customer_members: unknown;
              }
            | Array<{
                  id: string;
                  location_id?: string | null;
                  program_room_cohort_key?: string | null;
                  metadata: Record<string, unknown> | null;
                  desired_program_type: string | null;
                  customer_members: unknown;
              }>
            | null
            | undefined;
        const ocmSingle = Array.isArray(ocmRaw) ? (ocmRaw[0] ?? null) : (ocmRaw ?? null);
        return {
            ...(c as PlacementCandidateRow),
            customer_members: normalizeCustomerMemberNested(c.customer_members),
            opportunity_customer_members: ocmSingle
                ? {
                      id: String(ocmSingle.id),
                      location_id:
                          typeof ocmSingle.location_id === "string" ? ocmSingle.location_id : null,
                      program_room_cohort_key:
                          typeof ocmSingle.program_room_cohort_key === "string"
                              ? ocmSingle.program_room_cohort_key
                              : null,
                      metadata: ocmSingle.metadata ?? null,
                      desired_program_type: ocmSingle.desired_program_type ?? null,
                      customer_members: normalizeCustomerMemberNested(ocmSingle.customer_members),
                  }
                : null,
        };
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

    const candidates = (rawCandidates ?? []).map(normalizeCandidateRow);
    const candidateIds = candidates.map((c) => c.id);

    const linkByCandidate = new Map<string, PlacementCandidateLinkGroupSummary>();
    if (candidateIds.length) {
        const { data: memberRows, error: memErr } = await params.supabase
            .from("placement_link_group_members")
            .select(
                "placement_candidate_id, placement_link_group_id, placement_link_groups(id, link_mode, placement_link_group_members(id))"
            )
            .eq("org_id", params.orgId)
            .in("placement_candidate_id", candidateIds);

        if (memErr) {
            throw new Error(`placement_link_group_members bulk load failed: ${memErr.message}`);
        }

        for (const row of memberRows ?? []) {
            const normalized = normalizePlacementLinkMemberRow(row);
            const grp = normalized.placement_link_groups;
            if (!grp) continue;
            linkByCandidate.set(normalized.placement_candidate_id, {
                id: grp.id,
                link_mode: asLinkMode(grp.link_mode),
                member_count: grp.placement_link_group_members?.length ?? 0,
            });
        }
    }

    const overridesByCandidate = new Map<string, PlacementCandidateActiveOverrideSummary[]>();
    if (candidateIds.length) {
        const { data: overrideRows, error: ovErr } = await params.supabase
            .from("placement_overrides")
            .select("id, placement_candidate_id, override_kind, reason, expires_at, payload")
            .eq("org_id", params.orgId)
            .eq("is_active", true)
            .in("placement_candidate_id", candidateIds);

        if (ovErr) {
            throw new Error(`placement_overrides bulk load failed: ${ovErr.message}`);
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

    for (const c of candidates) {
        const meta =
            c.metadata != null && typeof c.metadata === "object" && !Array.isArray(c.metadata)
                ? (c.metadata as Record<string, unknown>)
                : null;
        const displayName =
            c.opportunity_customer_members?.customer_members?.display_name?.trim() ||
            c.customer_members?.display_name?.trim() ||
            (meta && typeof meta.display_name === "string" ? meta.display_name.trim() : "") ||
            null;

        const ocm = c.opportunity_customer_members;
        const memberForCohort = ocm?.customer_members ?? c.customer_members;
        const cohort = resolvePlacementCandidateCohortForQueue({
            storedKey: c.program_room_cohort_key ?? "",
            storedLabel: c.program_room_group_label ?? "",
            candidateMetadata: meta,
            ocmMetadata:
                ocm?.metadata != null && typeof ocm.metadata === "object" && !Array.isArray(ocm.metadata)
                    ? ocm.metadata
                    : null,
            desiredProgramType: ocm?.desired_program_type ?? null,
            dateOfBirth: readMemberDob(memberForCohort),
        });

        const linkGroup = linkByCandidate.get(c.id) ?? null;
        const linkMode = linkGroup?.link_mode ?? "independent";

        const cohortRepairedFromMember = looksLikeCombinedProgramRoomCohort(
            c.program_room_cohort_key ?? "",
            c.program_room_group_label ?? ""
        );
        const loadDiagnostics = placementLoadDiagnosticsEnabled()
            ? resolvePlacementCandidateLoadDiagnostics({
                  candidateSiteId: c.site_id,
                  storedCohortKey: cohort.program_room_cohort_key,
                  ocmLocationId: ocm?.location_id ?? null,
                  ocmCohortKey: ocm?.program_room_cohort_key ?? null,
                  candidateMetadata: meta,
                  cohortRepairedFromMember,
              })
            : undefined;

        const bundle: PlacementCandidateQueueBundle = {
            candidate: {
                id: c.id,
                org_id: c.org_id,
                opportunity_id: c.opportunity_id,
                customer_id: c.customer_id,
                opportunity_customer_member_id: c.opportunity_customer_member_id,
                customer_member_id: c.customer_member_id,
                person_id: c.person_id ?? c.customer_members?.person_id ?? null,
                site_id: c.site_id,
                is_synthetic_fallback: c.is_synthetic_fallback === true,
                program_room_cohort_key: cohort.program_room_cohort_key,
                program_room_group_label: cohort.program_room_group_label,
                wait_since: c.wait_since,
                desired_start_date: c.desired_start_date,
                status: c.status,
                seed_key: c.seed_key,
                metadata: meta,
            },
            link_group: linkGroup,
            link_mode: linkMode,
            active_overrides: filterActivePlacementOverrides(overridesByCandidate.get(c.id) ?? [], Date.now()),
            child_display_name: displayName,
            ...(loadDiagnostics ? { load_diagnostics: loadDiagnostics } : {}),
        };

        const list = out.get(c.opportunity_id) ?? [];
        list.push(bundle);
        out.set(c.opportunity_id, list);
    }

    return out;
}
