/**
 * Idempotent placement_candidates backfill from waitlisted opportunities (Phase 2 — Card 2).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseEnrollmentOperationalFromMetadata } from "@/lib/opportunities/enrollmentOperationalMetadata";
import {
    WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS,
    type PlacementCandidateStatus,
} from "@/lib/orchestration/placement/placementCandidateTypes";
import { resolveProgramRoomCohort } from "@/lib/orchestration/placement/resolveProgramRoomCohort";
import { resolvePlacementCandidateCohortFromMember } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";
import { normalizeCustomerMemberNested } from "@/lib/orchestration/placement/normalizeSupabaseNestedRelation";

export type PlacementCandidateBackfillOptions = {
    orgId: string;
    limit?: number;
    dryRun?: boolean;
    opportunityIds?: string[];
    waitSinceFallbackCreatedAt?: boolean;
};

export type PlacementCandidateBackfillCounts = {
    opportunities_scanned: number;
    real_candidates_proposed: number;
    synthetic_candidates_proposed: number;
    real_candidates_created: number;
    synthetic_candidates_created: number;
    skipped_existing: number;
    skipped_not_waitlist: number;
    errors: number;
};

export type PlacementCandidateBackfillRow = {
    org_id: string;
    opportunity_id: string;
    customer_id: string | null;
    opportunity_customer_member_id: string | null;
    customer_member_id: string | null;
    person_id: string | null;
    site_id: string | null;
    is_synthetic_fallback: boolean;
    program_room_cohort_key: string;
    program_room_group_label: string | null;
    wait_since: string | null;
    desired_start_date: string | null;
    status: PlacementCandidateStatus;
    seed_key: string;
    metadata: Record<string, unknown>;
};

type OcmRow = {
    id: string;
    customer_member_id: string;
    desired_start_date: string | null;
    desired_program_type: string | null;
    metadata: Record<string, unknown> | null;
    customer_members: {
        person_id: string | null;
        display_name: string | null;
        metadata?: Record<string, unknown> | null;
        persons?: { date_of_birth?: string | null } | null;
    } | null;
};

type OppRow = {
    id: string;
    customer_id: string | null;
    location_id: string | null;
    status_key: string | null;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
};

function safeMeta(raw: unknown): Record<string, unknown> {
    if (raw != null && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
    return {};
}

function parseDateOnly(raw: unknown): string | null {
    if (raw == null || typeof raw !== "string") return null;
    const t = raw.trim();
    if (!t) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
    const ms = Date.parse(t);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms).toISOString().slice(0, 10);
}

function readNested(root: Record<string, unknown>, path: string[]): unknown {
    let cur: unknown = root;
    for (const p of path) {
        if (cur == null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
        cur = (cur as Record<string, unknown>)[p];
    }
    return cur;
}

function resolveWaitSince(opp: OppRow, fallbackCreatedAt: boolean): string | null {
    const md = safeMeta(opp.metadata);
    const eo = parseEnrollmentOperationalFromMetadata(md);
    if (eo.wait_since) return eo.wait_since;
    const root = typeof md.wait_since === "string" ? md.wait_since.trim() : "";
    if (root && Number.isFinite(Date.parse(root))) return root;
    if (fallbackCreatedAt && opp.created_at && Number.isFinite(Date.parse(opp.created_at))) {
        return opp.created_at;
    }
    return null;
}

function resolveOppDesiredStart(md: Record<string, unknown>): string | null {
    return (
        parseDateOnly(md.desired_start_date) ??
        parseDateOnly(readNested(md, ["placement_fact_inputs_v1", "desired_start_date"]))
    );
}

export function buildPlacementCandidateSeedKey(params: {
    opportunityId: string;
    opportunityCustomerMemberId?: string | null;
    programRoomCohortKey: string;
    isSyntheticFallback: boolean;
}): string {
    const cohort = params.programRoomCohortKey.trim() || "unknown_program_room";
    if (params.isSyntheticFallback) {
        return `pc_v1_synthetic:${params.opportunityId}:${cohort}`;
    }
    const ocm = params.opportunityCustomerMemberId?.trim() || "missing_ocm";
    return `pc_v1:${params.opportunityId}:${ocm}:${cohort}`;
}

function normalizeOcmRow(raw: unknown): OcmRow {
    const row = raw as Omit<OcmRow, "customer_members"> & {
        customer_members?: OcmRow["customer_members"] | NonNullable<OcmRow["customer_members"]>[] | null;
    };
    const customerMembers = normalizeCustomerMemberNested(row.customer_members);
    return {
        id: String(row.id),
        customer_member_id: String(row.customer_member_id),
        desired_start_date: row.desired_start_date ?? null,
        desired_program_type: row.desired_program_type ?? null,
        metadata: row.metadata ?? null,
        customer_members: customerMembers,
    };
}

function buildCandidateRowsForOpportunity(
    opp: OppRow,
    ocmRows: OcmRow[],
    orgId: string,
    waitSinceFallbackCreatedAt: boolean
): PlacementCandidateBackfillRow[] {
    const md = safeMeta(opp.metadata);
    const waitSince = resolveWaitSince(opp, waitSinceFallbackCreatedAt);
    const oppDesiredStart = resolveOppDesiredStart(md);

    const cohortFromOpp = resolveProgramRoomCohort({
        metadata: md,
        program_label: typeof md.program_label === "string" ? md.program_label : null,
    });

    if (!ocmRows.length) {
        return [
            {
                org_id: orgId,
                opportunity_id: opp.id,
                customer_id: opp.customer_id,
                opportunity_customer_member_id: null,
                customer_member_id: null,
                person_id: null,
                site_id: opp.location_id,
                is_synthetic_fallback: true,
                program_room_cohort_key: cohortFromOpp.program_room_cohort_key,
                program_room_group_label: cohortFromOpp.program_room_group_label,
                wait_since: waitSince,
                desired_start_date: oppDesiredStart,
                status: "active",
                seed_key: buildPlacementCandidateSeedKey({
                    opportunityId: opp.id,
                    isSyntheticFallback: true,
                    programRoomCohortKey: cohortFromOpp.program_room_cohort_key,
                }),
                metadata: {
                    backfill_v1: true,
                    reason: "no_child_member_found",
                    cohort_resolution: cohortFromOpp,
                },
            },
        ];
    }

    const out: PlacementCandidateBackfillRow[] = [];
    for (const ocm of ocmRows) {
        const ocmMd = safeMeta(ocm.metadata);
        const cohort = resolvePlacementCandidateCohortFromMember({
            ocmMetadata: ocmMd,
            desiredProgramType: ocm.desired_program_type,
            dateOfBirth:
                ocm.customer_members?.persons?.date_of_birth ??
                (typeof safeMeta(ocm.customer_members?.metadata).dob === "string"
                    ? String(safeMeta(ocm.customer_members?.metadata).dob)
                    : null),
        });

        const desiredStart = parseDateOnly(ocm.desired_start_date) ?? oppDesiredStart;

        out.push({
            org_id: orgId,
            opportunity_id: opp.id,
            customer_id: opp.customer_id,
            opportunity_customer_member_id: ocm.id,
            customer_member_id: ocm.customer_member_id,
            person_id: ocm.customer_members?.person_id ?? null,
            site_id: opp.location_id,
            is_synthetic_fallback: false,
            program_room_cohort_key: cohort.program_room_cohort_key,
            program_room_group_label: cohort.program_room_group_label,
            wait_since: waitSince,
            desired_start_date: desiredStart,
            status: "active",
            seed_key: buildPlacementCandidateSeedKey({
                opportunityId: opp.id,
                opportunityCustomerMemberId: ocm.id,
                isSyntheticFallback: false,
                programRoomCohortKey: cohort.program_room_cohort_key,
            }),
            metadata: {
                backfill_v1: true,
                cohort_resolution: cohort,
            },
        });
    }
    return out;
}

export async function runPlacementCandidateBackfill(
    supabase: SupabaseClient,
    options: PlacementCandidateBackfillOptions
): Promise<{ counts: PlacementCandidateBackfillCounts; error_messages: string[] }> {
    const orgId = options.orgId.trim();
    const dryRun = options.dryRun === true;
    const limit = Math.max(1, Math.min(options.limit ?? 5000, 10000));
    const waitSinceFallbackCreatedAt = options.waitSinceFallbackCreatedAt === true;

    const counts: PlacementCandidateBackfillCounts = {
        opportunities_scanned: 0,
        real_candidates_proposed: 0,
        synthetic_candidates_proposed: 0,
        real_candidates_created: 0,
        synthetic_candidates_created: 0,
        skipped_existing: 0,
        skipped_not_waitlist: 0,
        errors: 0,
    };
    const error_messages: string[] = [];

    let oppQuery = supabase
        .from("opportunities")
        .select("id, customer_id, location_id, status_key, created_at, metadata")
        .eq("org_id", orgId);

    if (options.opportunityIds?.length) {
        oppQuery = oppQuery.in("id", options.opportunityIds);
    } else {
        oppQuery = oppQuery.in("status_key", [...WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS]);
    }

    const { data: opps, error: oppErr } = await oppQuery.limit(limit);
    if (oppErr) {
        throw new Error(`opportunities load failed: ${oppErr.message}`);
    }

    const oppRows = (opps ?? []) as OppRow[];
    counts.opportunities_scanned = oppRows.length;

    for (const opp of oppRows) {
        const status = (opp.status_key ?? "").trim();
        if (
            !WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS.includes(
                status as (typeof WAITLIST_RELEVANT_OPPORTUNITY_STATUS_KEYS)[number]
            )
        ) {
            counts.skipped_not_waitlist += 1;
            continue;
        }

        const { data: ocmData, error: ocmErr } = await supabase
            .from("opportunity_customer_members")
            .select(
                "id, customer_member_id, desired_start_date, desired_program_type, metadata, customer_members(person_id, display_name, metadata, persons(date_of_birth))"
            )
            .eq("org_id", orgId)
            .eq("opportunity_id", opp.id);

        if (ocmErr) {
            counts.errors += 1;
            error_messages.push(`opportunity ${opp.id}: ocm load — ${ocmErr.message}`);
            continue;
        }

        const ocmRows = (ocmData ?? []).map(normalizeOcmRow);
        const planned = buildCandidateRowsForOpportunity(opp, ocmRows, orgId, waitSinceFallbackCreatedAt);

        for (const row of planned) {
            if (row.is_synthetic_fallback) counts.synthetic_candidates_proposed += 1;
            else counts.real_candidates_proposed += 1;

            const { data: existing, error: existErr } = await supabase
                .from("placement_candidates")
                .select("id")
                .eq("org_id", orgId)
                .eq("seed_key", row.seed_key)
                .maybeSingle();

            if (existErr) {
                counts.errors += 1;
                error_messages.push(`seed ${row.seed_key}: lookup — ${existErr.message}`);
                continue;
            }
            if ((existing as { id?: string } | null)?.id) {
                counts.skipped_existing += 1;
                continue;
            }

            if (dryRun) continue;

            const { error: insErr } = await supabase.from("placement_candidates").insert(row);
            if (insErr) {
                counts.errors += 1;
                error_messages.push(`seed ${row.seed_key}: insert — ${insErr.message}`);
                continue;
            }
            if (row.is_synthetic_fallback) counts.synthetic_candidates_created += 1;
            else counts.real_candidates_created += 1;
        }
    }

    return { counts, error_messages };
}
