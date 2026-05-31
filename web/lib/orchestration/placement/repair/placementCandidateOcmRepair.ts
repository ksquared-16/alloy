/**
 * Idempotent repair: align placement_candidates.site_id / program_room_cohort_key with OCM child scope (Card 3).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePlacementCandidateCohortFromMember } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";

export type PlacementCandidateOcmRepairOptions = {
    orgId: string;
    dryRun?: boolean;
    limit?: number;
    candidateIds?: string[];
};

export type PlacementCandidateOcmRepairCounts = {
    scanned: number;
    repaired_site: number;
    repaired_cohort: number;
    unchanged: number;
    missing_ocm: number;
    missing_ocm_site: number;
    missing_ocm_cohort: number;
    skipped_synthetic: number;
    errors: number;
};

type CandidateRow = {
    id: string;
    org_id: string;
    opportunity_customer_member_id: string | null;
    site_id: string | null;
    program_room_cohort_key: string | null;
    program_room_group_label: string | null;
    is_synthetic_fallback: boolean | null;
    metadata: Record<string, unknown> | null;
    status: string;
};

type OcmRow = {
    id: string;
    location_id: string | null;
    program_room_cohort_key: string | null;
    desired_program_type?: string | null;
    metadata?: Record<string, unknown> | null;
};

function safeMeta(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

function trimId(raw: string | null | undefined): string {
    return (raw ?? "").trim();
}

export type PlacementCandidateOcmRepairPlan = {
    candidateId: string;
    repairSite: boolean;
    repairCohort: boolean;
    repairCohortLabel: boolean;
    nextSiteId: string | null;
    nextCohortKey: string | null;
    nextCohortLabel: string | null;
    previousSiteId: string | null;
    previousCohortKey: string | null;
    previousCohortLabel: string | null;
    diagnosticsOnly: boolean;
    missingOcmSite: boolean;
    missingOcmCohort: boolean;
};

export function planPlacementCandidateOcmRepair(params: {
    candidate: Pick<
        CandidateRow,
        | "id"
        | "opportunity_customer_member_id"
        | "site_id"
        | "program_room_cohort_key"
        | "program_room_group_label"
        | "is_synthetic_fallback"
    >;
    ocm: OcmRow | null;
}): PlacementCandidateOcmRepairPlan | "skipped_synthetic" | "missing_ocm" {
    const ocmId = trimId(params.candidate.opportunity_customer_member_id);
    if (params.candidate.is_synthetic_fallback === true) {
        return "skipped_synthetic";
    }
    if (!ocmId) {
        return "missing_ocm";
    }
    if (!params.ocm) {
        return "missing_ocm";
    }

    const ocmSite = trimId(params.ocm.location_id);
    const ocmCohort = trimId(params.ocm.program_room_cohort_key);
    const prevSite = trimId(params.candidate.site_id) || null;
    const prevCohort = trimId(params.candidate.program_room_cohort_key) || null;
    const prevLabel = trimId(params.candidate.program_room_group_label) || null;

    const resolvedCohort = ocmCohort
        ? resolvePlacementCandidateCohortFromMember({
              ocmMetadata: safeMeta(params.ocm.metadata),
              desiredProgramType: params.ocm.desired_program_type ?? null,
              programRoomCohortKey: ocmCohort,
          })
        : null;
    const nextLabel = resolvedCohort?.program_room_group_label?.trim() || null;

    const repairSite = Boolean(ocmSite) && prevSite !== ocmSite;
    const repairCohort = Boolean(ocmCohort) && prevCohort !== ocmCohort;
    const repairCohortLabel = Boolean(nextLabel) && prevLabel !== nextLabel;
    const missingOcmSite = !ocmSite;
    const missingOcmCohort = !ocmCohort;

    if (!repairSite && !repairCohort && !repairCohortLabel) {
        return {
            candidateId: params.candidate.id,
            repairSite: false,
            repairCohort: false,
            repairCohortLabel: false,
            nextSiteId: prevSite,
            nextCohortKey: prevCohort,
            nextCohortLabel: prevLabel,
            previousSiteId: prevSite,
            previousCohortKey: prevCohort,
            previousCohortLabel: prevLabel,
            diagnosticsOnly: missingOcmSite || missingOcmCohort,
            missingOcmSite,
            missingOcmCohort,
        };
    }

    return {
        candidateId: params.candidate.id,
        repairSite,
        repairCohort,
        repairCohortLabel,
        nextSiteId: repairSite ? ocmSite : prevSite,
        nextCohortKey: repairCohort ? ocmCohort : prevCohort,
        nextCohortLabel: repairCohortLabel ? nextLabel : prevLabel,
        previousSiteId: prevSite,
        previousCohortKey: prevCohort,
        previousCohortLabel: prevLabel,
        diagnosticsOnly: false,
        missingOcmSite,
        missingOcmCohort,
    };
}

function buildRepairMetadata(
    plan: PlacementCandidateOcmRepairPlan,
    existing: Record<string, unknown>
): Record<string, unknown> {
    const now = new Date().toISOString();
    const prevRepair = safeMeta(existing.placement_ocm_repair);
    const placement_ocm_repair = {
        ...prevRepair,
        repair_source: "ocm_child_scope",
        repaired_from_ocm_at: now,
        ...(plan.repairSite
            ? {
                  previous_site_id: plan.previousSiteId,
                  repaired_site: true,
              }
            : {}),
        ...(plan.repairCohort
            ? {
                  previous_program_room_cohort_key: plan.previousCohortKey,
                  repaired_cohort: true,
              }
            : {}),
        ...(plan.repairCohortLabel
            ? {
                  previous_program_room_group_label: plan.previousCohortLabel,
                  repaired_cohort_label: true,
              }
            : {}),
    };

    const scopeDiagnostics = {
        ...(plan.missingOcmSite ? { missing_ocm_site_at: now } : {}),
        ...(plan.missingOcmCohort ? { missing_ocm_cohort_at: now } : {}),
    };

    return {
        ...existing,
        placement_ocm_repair,
        ...(Object.keys(scopeDiagnostics).length
            ? {
                  placement_scope_diagnostics: {
                      ...safeMeta(existing.placement_scope_diagnostics),
                      ...scopeDiagnostics,
                  },
              }
            : {}),
    };
}

export async function runPlacementCandidateOcmRepair(
    supabase: SupabaseClient,
    options: PlacementCandidateOcmRepairOptions
): Promise<{ counts: PlacementCandidateOcmRepairCounts; error_messages: string[] }> {
    const orgId = options.orgId.trim();
    const dryRun = options.dryRun === true;
    const limit = Math.max(1, Math.min(options.limit ?? 5000, 20000));

    const counts: PlacementCandidateOcmRepairCounts = {
        scanned: 0,
        repaired_site: 0,
        repaired_cohort: 0,
        unchanged: 0,
        missing_ocm: 0,
        missing_ocm_site: 0,
        missing_ocm_cohort: 0,
        skipped_synthetic: 0,
        errors: 0,
    };
    const error_messages: string[] = [];

    let q = supabase
        .from("placement_candidates")
        .select(
            "id, org_id, opportunity_customer_member_id, site_id, program_room_cohort_key, program_room_group_label, is_synthetic_fallback, metadata, status"
        )
        .eq("org_id", orgId)
        .order("created_at", { ascending: true })
        .limit(limit);

    if (options.candidateIds?.length) {
        q = q.in("id", options.candidateIds);
    }

    const { data: candidates, error: candErr } = await q;
    if (candErr) {
        throw new Error(`placement_candidates load failed: ${candErr.message}`);
    }

    const rows = (candidates ?? []) as CandidateRow[];
    counts.scanned = rows.length;

    const ocmIds = [
        ...new Set(
            rows
                .map((r) => trimId(r.opportunity_customer_member_id))
                .filter(Boolean)
        ),
    ];

    const ocmById = new Map<string, OcmRow>();
    if (ocmIds.length) {
        const { data: ocmRows, error: ocmErr } = await supabase
            .from("opportunity_customer_members")
            .select("id, location_id, program_room_cohort_key, desired_program_type, metadata")
            .eq("org_id", orgId)
            .in("id", ocmIds);
        if (ocmErr) {
            throw new Error(`opportunity_customer_members load failed: ${ocmErr.message}`);
        }
        for (const row of (ocmRows ?? []) as OcmRow[]) {
            ocmById.set(row.id, row);
        }
    }

    for (const candidate of rows) {
        const ocmId = trimId(candidate.opportunity_customer_member_id);
        const ocm = ocmId ? (ocmById.get(ocmId) ?? null) : null;
        const planResult = planPlacementCandidateOcmRepair({ candidate, ocm });

        if (planResult === "skipped_synthetic") {
            counts.skipped_synthetic += 1;
            continue;
        }
        if (planResult === "missing_ocm") {
            counts.missing_ocm += 1;
            continue;
        }

        if (planResult.missingOcmSite) counts.missing_ocm_site += 1;
        if (planResult.missingOcmCohort) counts.missing_ocm_cohort += 1;

        if (!planResult.repairSite && !planResult.repairCohort && !planResult.repairCohortLabel) {
            counts.unchanged += 1;
            if (planResult.diagnosticsOnly && !dryRun) {
                const patchMeta = buildRepairMetadata(planResult, safeMeta(candidate.metadata));
                const { error } = await supabase
                    .from("placement_candidates")
                    .update({ metadata: patchMeta })
                    .eq("id", candidate.id)
                    .eq("org_id", orgId);
                if (error) {
                    counts.errors += 1;
                    error_messages.push(`${candidate.id}: diagnostics patch failed: ${error.message}`);
                }
            }
            continue;
        }

        if (dryRun) {
            if (planResult.repairSite) counts.repaired_site += 1;
            if (planResult.repairCohort) counts.repaired_cohort += 1;
            if (planResult.repairCohortLabel) counts.repaired_cohort += 1;
            continue;
        }

        const patchMeta = buildRepairMetadata(planResult, safeMeta(candidate.metadata));
        const update: Record<string, unknown> = { metadata: patchMeta };
        if (planResult.repairSite) update.site_id = planResult.nextSiteId;
        if (planResult.repairCohort) update.program_room_cohort_key = planResult.nextCohortKey;
        if (planResult.repairCohortLabel) update.program_room_group_label = planResult.nextCohortLabel;

        const { error } = await supabase
            .from("placement_candidates")
            .update(update)
            .eq("id", candidate.id)
            .eq("org_id", orgId);

        if (error) {
            counts.errors += 1;
            error_messages.push(`${candidate.id}: update failed: ${error.message}`);
            continue;
        }
        if (planResult.repairSite) counts.repaired_site += 1;
        if (planResult.repairCohort || planResult.repairCohortLabel) counts.repaired_cohort += 1;
    }

    return { counts, error_messages };
}

export const __testing = {
    planPlacementCandidateOcmRepair,
    buildRepairMetadata,
};
