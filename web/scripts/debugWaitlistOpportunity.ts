#!/usr/bin/env npx tsx
/**
 * Direct waitlist trace for one opportunity (Williams default).
 *
 * Run from `web/`:
 *   ORG_ID=93667019-bd28-49b5-a688-acc9bb1e0a19 \
 *   OPPORTUNITY_NAME="Williams Family" \
 *   npm run debug:waitlist:opportunity
 *
 * Env:
 *   ORG_ID — required org
 *   OPPORTUNITY_NAME — substring match on opportunity.name (default: Williams)
 *   OPPORTUNITY_ID — optional explicit id (skips name search)
 *
 * Read-only — no database writes.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { createAdminClient } from "@/lib/supabaseAdmin";
import { bulkLoadPlacementCandidatesByOpportunity } from "@/lib/orchestration/placement/bulkLoadPlacementCandidatesByOpportunity";
import {
    detectPlacementCandidateProjectionMismatch,
    isPlaceholderChildDisplayName,
    resolvePlacementCandidateChildDisplayName,
} from "@/lib/orchestration/placement/resolvePlacementCandidateChildDisplayName";
import { resolvePlacementQueueConfig } from "@/lib/orchestration/placement/resolvePlacementQueueConfig";
import { filterPlacementCandidateBundlesForQueueDisplay } from "@/lib/orchestration/placement/filterPlacementCandidateBundlesForQueueDisplay";
import { buildWaitlistQueueBlockSectionPlan } from "@/lib/orchestration/placement/waitlistQueueBlockSectionPlan";
import { bulkLoadHouseholdPlacementFactContext } from "@/lib/orchestration/placement/bulkLoadHouseholdPlacementFactContext";
import { resolveHouseholdPlacementFactsForCandidate } from "@/lib/orchestration/placement/householdPlacementFacts";
import { evaluatePlacementCandidate } from "@/lib/orchestration/placement/adapters/placementCandidateFacts";
import { formatPlacementBucketLabel } from "@/lib/ui-v2/queuePlacementPriorityV2Presentation";
import { TIER_EMPLOYEE_FAMILY_BUCKET } from "@/lib/orchestration/placement/placementBucketLabels";
import { isPersonEmployeePlacementOnlyPatch } from "@/lib/admin/personEmployeePlacementFields";
import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";
import {
    countWaitlistCandidateGrainItems,
    loadWaitlistCandidateGrainQueueItems,
    resolveWaitlistCandidateGrainContext,
} from "@/lib/queues/candidateGrainWaitlistQueue";
import { normalizeQueueDefinitionDocument } from "@/lib/config/queueDefinitionV2Runtime";
import { parsePlacementWaitlistCandidateRowVm } from "@/lib/ui-v2/queuePlacementWaitlistCandidatePresentation";
import { resolveWaitlistQueueSection } from "@/lib/orchestration/placement/waitlistQueueSectionPresentation";
import { sortPlacementCandidateQueueRows } from "@/lib/orchestration/placement/sortPlacementCandidateQueueRows";
import {
    assignWaitlistCandidateRuntimePositions,
    readWaitlistCandidateSectionKey,
} from "@/lib/orchestration/placement/waitlistCandidateRuntimePosition";

loadEnv({ path: resolve(process.cwd(), ".env.local") });
loadEnv({ path: resolve(process.cwd(), ".env") });

const ORG_ID = process.env.ORG_ID?.trim();
if (!ORG_ID) {
    console.error("ORG_ID is required");
    process.exit(1);
}

const OPPORTUNITY_NAME = (process.env.OPPORTUNITY_NAME ?? "Williams").trim().toLowerCase();
const OPPORTUNITY_ID = process.env.OPPORTUNITY_ID?.trim() || null;
const WORK_UNIT_KEY = "enrollment_pipeline";

type OcmTraceRow = {
    ocm_id: string;
    person_id: string | null;
    customer_member_id: string | null;
    first_name: string | null;
    last_name: string | null;
    display_name: string | null;
    location_id: string | null;
    location_label: string | null;
    program_room_cohort_key: string | null;
    desired_program_type: string | null;
    outcome_status_key: string | null;
};

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

function matchOcmToCandidate(
    candidate: {
        id: string;
        opportunity_customer_member_id: string | null;
        customer_member_id: string | null;
        person_id: string | null;
        child_display_name: string | null;
        program_room_cohort_key: string;
    },
    ocms: OcmTraceRow[]
): {
    matched_ocm_id: string | null;
    match_method: string | null;
    mismatch_fields: string[];
} {
    const mismatches: string[] = [];
    const ocmId = trimOrNull(candidate.opportunity_customer_member_id);
    if (ocmId) {
        const byOcm = ocms.find((o) => o.ocm_id === ocmId);
        if (byOcm) {
            if (
                candidate.child_display_name &&
                byOcm.display_name &&
                candidate.child_display_name.toLowerCase() !== byOcm.display_name.toLowerCase()
            ) {
                mismatches.push("child_display_name");
            }
            return { matched_ocm_id: byOcm.ocm_id, match_method: "opportunity_customer_member_id", mismatch_fields: mismatches };
        }
        mismatches.push("missing_ocm_link");
    }

    const cmId = trimOrNull(candidate.customer_member_id);
    if (cmId) {
        const byCm = ocms.find((o) => o.customer_member_id === cmId);
        if (byCm) {
            return { matched_ocm_id: byCm.ocm_id, match_method: "customer_member_id", mismatch_fields: mismatches };
        }
    }

    const personId = trimOrNull(candidate.person_id);
    if (personId) {
        const byPerson = ocms.find((o) => o.person_id === personId);
        if (byPerson) {
            return { matched_ocm_id: byPerson.ocm_id, match_method: "person_id", mismatch_fields: mismatches };
        }
    }

    const candName = trimOrNull(candidate.child_display_name);
    if (candName && !isPlaceholderChildDisplayName(candName)) {
        const byName = ocms.find((o) => o.display_name?.toLowerCase() === candName.toLowerCase());
        if (byName) {
            return { matched_ocm_id: byName.ocm_id, match_method: "display_name", mismatch_fields: mismatches };
        }
    }

    return { matched_ocm_id: null, match_method: null, mismatch_fields: [...mismatches, "no_match"] };
}

async function main() {
    const supabase = createAdminClient();

    const { data: wu, error: wuErr } = await supabase
        .from("work_units")
        .select("id, metadata, department_id, queue_definition")
        .eq("org_id", ORG_ID)
        .eq("key", WORK_UNIT_KEY)
        .maybeSingle();
    if (wuErr || !wu?.id) throw new Error(wuErr?.message ?? "work unit not found");

    const { data: dept } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", (wu as { department_id: string }).department_id)
        .maybeSingle();

    let oppQuery = supabase
        .from("opportunities")
        .select("id, name, status_key, location_id, metadata, created_at, customer_id")
        .eq("org_id", ORG_ID)
        .eq("work_unit_id", wu.id);

    if (OPPORTUNITY_ID) {
        oppQuery = oppQuery.eq("id", OPPORTUNITY_ID);
    }

    const { data: opps } = await oppQuery;
    const opp =
        OPPORTUNITY_ID ?
            (opps ?? [])[0] ?? null
        :   (opps ?? []).find((o) => String(o.name ?? "").toLowerCase().includes(OPPORTUNITY_NAME)) ?? null;

    if (!opp) {
        console.log(
            JSON.stringify(
                {
                    verdict: "FAIL",
                    reason: "opportunity_not_found",
                    opportunity_name_match: OPPORTUNITY_NAME,
                    opportunity_id: OPPORTUNITY_ID,
                },
                null,
                2
            )
        );
        process.exit(1);
    }

    const customerId = String((opp as { customer_id?: string }).customer_id ?? "").trim();

    const { data: cpRows } = await supabase
        .from("customer_persons")
        .select(
            "person_id, customer_id, role_type, is_primary, persons(id, first_name, last_name, is_employee, employee_id, email, phone)"
        )
        .eq("org_id", ORG_ID)
        .eq("customer_id", customerId);

    const householdPeople = (cpRows ?? []).map((r) => {
        const p = Array.isArray(r.persons) ? r.persons[0] : r.persons;
        return {
            person_id: r.person_id,
            first_name: p?.first_name ?? null,
            last_name: p?.last_name ?? null,
            display_name: [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || null,
            role_type: r.role_type,
            is_primary: r.is_primary,
            is_household_primary_contact: customerPersonRowIsHouseholdPrimaryContact(r),
            is_employee: p?.is_employee === true,
            employee_id: p?.employee_id ?? null,
        };
    });

    const placementConfig = resolvePlacementQueueConfig({
        departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
        workUnitMetadata: (wu as { metadata?: unknown }).metadata ?? null,
        queue_key: "waitlisted",
    });

    const householdSlice = customerId
        ? (await bulkLoadHouseholdPlacementFactContext({ supabase, orgId: ORG_ID, customerIds: [customerId] })).get(
              customerId
          )
        : null;

    const employeeCompletionProbe = {
        employee_only_patch_recognized: isPersonEmployeePlacementOnlyPatch({ is_employee: true }),
        household_has_primary_contact_strict: householdPeople.some((p) => p.is_household_primary_contact),
        household_has_guardian_with_is_primary: householdPeople.some(
            (p) => p.is_primary && String(p.role_type ?? "").trim().toLowerCase() === "guardian"
        ),
        would_block_employee_save_with_household_rule:
            householdPeople.length > 0 &&
            !householdPeople.some((p) => p.is_household_primary_contact) &&
            !isPersonEmployeePlacementOnlyPatch({ is_employee: true }),
    };

    const { data: sites } = await supabase.from("locations").select("id, label, name").eq("org_id", ORG_ID);
    const siteLabel = (id: string | null | undefined) => {
        const key = trimOrNull(id);
        if (!key) return null;
        const row = (sites ?? []).find((s) => s.id === key);
        return trimOrNull(row?.label) ?? trimOrNull(row?.name) ?? key;
    };

    const { data: ocmRows } = await supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, location_id, program_room_cohort_key, desired_program_type, outcome_status_key, customer_members(display_name, person_id, first_name, last_name, persons(first_name, last_name, person_id))"
        )
        .eq("org_id", ORG_ID)
        .eq("opportunity_id", opp.id);

    const inquiryChildren: OcmTraceRow[] = (ocmRows ?? []).map((r) => {
        const cm = r.customer_members as
            | {
                  display_name?: string | null;
                  person_id?: string | null;
                  first_name?: string | null;
                  last_name?: string | null;
                  persons?: { first_name?: string | null; last_name?: string | null; person_id?: string | null } | null;
              }
            | null
            | undefined;
        const person = cm?.persons ?? null;
        const first = trimOrNull(person?.first_name) ?? trimOrNull(cm?.first_name);
        const last = trimOrNull(person?.last_name) ?? trimOrNull(cm?.last_name);
        const display =
            resolvePlacementCandidateChildDisplayName({ ocmMember: cm ?? null }) ??
            trimOrNull(cm?.display_name);
        return {
            ocm_id: String(r.id),
            person_id: trimOrNull(cm?.person_id) ?? trimOrNull(person?.person_id),
            customer_member_id: trimOrNull(r.customer_member_id),
            first_name: first,
            last_name: last,
            display_name: display,
            location_id: trimOrNull(r.location_id),
            location_label: siteLabel(r.location_id),
            program_room_cohort_key: trimOrNull(r.program_room_cohort_key),
            desired_program_type: trimOrNull(r.desired_program_type),
            outcome_status_key: trimOrNull(r.outcome_status_key),
        };
    });

    const { data: pcRows } = await supabase
        .from("placement_candidates")
        .select(
            "id, opportunity_customer_member_id, customer_member_id, person_id, site_id, program_room_cohort_key, program_room_group_label, is_synthetic_fallback, metadata, status, customer_members(display_name, first_name, last_name, persons(first_name, last_name))"
        )
        .eq("org_id", ORG_ID)
        .eq("opportunity_id", opp.id);

    const bundlesByOpp = await bulkLoadPlacementCandidatesByOpportunity({
        supabase,
        orgId: ORG_ID,
        opportunityIds: [String(opp.id)],
        activeOnly: false,
    });
    const bundles = filterPlacementCandidateBundlesForQueueDisplay(bundlesByOpp.get(String(opp.id)) ?? []);

    const placementCandidates = bundles.map((b) => ({
        id: b.candidate.id,
        placement_candidate_id: b.candidate.id,
        opportunity_customer_member_id: b.candidate.opportunity_customer_member_id,
        customer_member_id: b.candidate.customer_member_id,
        person_id: b.candidate.person_id,
        child_display_name: b.child_display_name,
        program_room_cohort_key: b.candidate.program_room_cohort_key,
        program_room_group_label: b.candidate.program_room_group_label,
        site_id: b.candidate.site_id,
        site_label: siteLabel(b.candidate.site_id),
        is_synthetic_fallback: b.candidate.is_synthetic_fallback,
        metadata: b.candidate.metadata,
        status: b.candidate.status,
    }));

    const candidateMatching = placementCandidates.map((c) => {
        const match = matchOcmToCandidate(
            {
                id: c.id,
                opportunity_customer_member_id: c.opportunity_customer_member_id,
                customer_member_id: c.customer_member_id,
                person_id: c.person_id,
                child_display_name: c.child_display_name,
                program_room_cohort_key: c.program_room_cohort_key,
            },
            inquiryChildren
        );
        const matchedOcm = inquiryChildren.find((o) => o.ocm_id === match.matched_ocm_id);
        const mismatchFields = [...match.mismatch_fields];
        if (matchedOcm) {
            const m = detectPlacementCandidateProjectionMismatch({
                candidateStoredCohortKey: c.program_room_cohort_key,
                ocmCohortKey: matchedOcm.program_room_cohort_key,
                resolvedCohortKey: c.program_room_cohort_key,
                candidateSiteId: c.site_id,
                ocmLocationId: matchedOcm.location_id,
                ocmMember: { display_name: matchedOcm.display_name },
                candidateMember: { display_name: c.child_display_name },
            });
            if (m.cohort_mismatch) mismatchFields.push("cohort");
            if (m.site_mismatch) mismatchFields.push("site");
            if (m.child_name_mismatch) mismatchFields.push("child_name");
            if (
                matchedOcm.desired_program_type &&
                c.program_room_cohort_key &&
                matchedOcm.desired_program_type !== matchedOcm.program_room_cohort_key
            ) {
                mismatchFields.push("desired_program_type_vs_ocm_cohort_key");
            }
        }
        return {
            candidate_id: c.id,
            matched_ocm_id: match.matched_ocm_id,
            match_method: match.match_method,
            mismatch_fields: [...new Set(mismatchFields)],
        };
    });

    const normalized = normalizeQueueDefinitionDocument((wu as { queue_definition?: unknown }).queue_definition);
    const grainCtx = resolveWaitlistCandidateGrainContext({
        normalized,
        executableQueueKey: "waitlist",
    });

    const enrichedOpp = {
        id: opp.id,
        name: opp.name,
        status_key: opp.status_key,
        metadata: opp.metadata,
        created_at: opp.created_at,
        _customer_name: opp.name,
    };

    const [revealLoad, listLoad, pillCount] = await Promise.all([
        grainCtx ?
            loadWaitlistCandidateGrainQueueItems({
                supabase,
                orgId: ORG_ID,
                workUnitId: wu.id,
                ctx: grainCtx,
                recordScopeConstraints: null,
                limit: 200,
                offset: 0,
                departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
                workUnitMetadata: (wu as { metadata?: unknown }).metadata ?? null,
                nowMs: Date.now(),
                skipPlacementProjection: true,
                enrichOpportunityRows: async (rows) => ({ rows: rows as Array<Record<string, unknown>> }),
            })
        :   Promise.resolve(null),
        grainCtx ?
            loadWaitlistCandidateGrainQueueItems({
                supabase,
                orgId: ORG_ID,
                workUnitId: wu.id,
                ctx: grainCtx,
                recordScopeConstraints: null,
                limit: 200,
                offset: 0,
                departmentMetadata: (dept as { metadata?: unknown } | null)?.metadata ?? null,
                workUnitMetadata: (wu as { metadata?: unknown }).metadata ?? null,
                nowMs: Date.now(),
                skipPlacementProjection: false,
                enrichOpportunityRows: async (rows) => ({ rows: rows as Array<Record<string, unknown>> }),
            })
        :   Promise.resolve(null),
        grainCtx ?
            countWaitlistCandidateGrainItems({
                supabase,
                orgId: ORG_ID,
                workUnitId: wu.id,
                ctx: grainCtx,
                recordScopeConstraints: null,
            })
        :   Promise.resolve(null),
    ]);

    function projectRows(rows: Array<Record<string, unknown>> | undefined) {
        return (rows ?? [])
            .filter((r) => readOpportunityIdFromRow(r) === String(opp.id))
            .map((r) => {
                const wr = r._placement_waitlist_row as Record<string, unknown> | undefined;
                const vm = parsePlacementWaitlistCandidateRowVm(wr);
                const section = vm ?
                    resolveWaitlistQueueSection({ cohortKey: vm.cohortKey, cohortLabel: vm.cohortLabel })
                :   null;
                return {
                    row_id: r.id,
                    rendered_child: vm?.childDisplayName ?? wr?.child_display_name ?? null,
                    rendered_program: vm?.cohortLabel ?? wr?.program_room_group_label ?? null,
                    rendered_section: section?.sectionTitle ?? null,
                    rendered_site: siteLabel(
                        typeof r.location_id === "string" ? r.location_id : null
                    ),
                    placement_candidate_id: wr?.placement_candidate_id ?? null,
                    is_placeholder_child: isPlaceholderChildDisplayName(
                        String(vm?.childDisplayName ?? wr?.child_display_name ?? "")
                    ),
                };
            });
    }

    function readOpportunityIdFromRow(row: Record<string, unknown>): string {
        const explicit = typeof row.opportunity_id === "string" ? row.opportunity_id.trim() : "";
        if (explicit) return explicit;
        const id = typeof row.id === "string" ? row.id.trim() : "";
        if (id.startsWith("pcrow:")) {
            const parts = id.split(":");
            if (parts.length >= 3) return parts[1]!;
        }
        return id;
    }

    const revealProjection = projectRows(revealLoad?.items as Array<Record<string, unknown>> | undefined);
    const listProjection = projectRows(listLoad?.items as Array<Record<string, unknown>> | undefined);

    function traceSectionRankingRows(
        rows: Array<Record<string, unknown>> | undefined,
        shadowMode: boolean
    ): Record<string, unknown> {
        const source = (rows ?? []) as Array<Record<string, unknown>>;
        const sorted = sortPlacementCandidateQueueRows(source, shadowMode);
        assignWaitlistCandidateRuntimePositions(sorted, shadowMode);

        function rowDetail(row: Record<string, unknown>, visibleIndex: number) {
            const wr = row._placement_waitlist_row as Record<string, unknown> | undefined;
            const pv2 = wr?.placement_priority_v2 as Record<string, unknown> | undefined;
            const sortTuple = (row.__placement_v2_sort_tuple ??
                pv2?.sort_tuple) as Array<string | number | null> | undefined;
            return {
                child_name: wr?.child_display_name ?? null,
                family_name: wr?.family_display_name ?? row.name ?? null,
                placement_candidate_id: wr?.placement_candidate_id ?? null,
                bucket: pv2?.bucket ?? wr?.bucket ?? null,
                policy_bucket: pv2?.policy_bucket ?? null,
                bucket_label: formatPlacementBucketLabel(String(pv2?.bucket ?? wr?.bucket ?? "")),
                active_override_kinds: pv2?.active_override_kinds ?? [],
                active_overrides: pv2?.active_overrides ?? [],
                wait_since: pv2?.wait_since ?? wr?.wait_since ?? null,
                desired_start_date: null as string | null,
                sort_tuple: sortTuple ?? null,
                runtime_position: wr?.runtime_position ?? null,
                runtime_position_total: wr?.runtime_position_total ?? null,
                runtime_position_label: wr?.runtime_position_label ?? null,
                visible_index: visibleIndex,
                section_key: readWaitlistCandidateSectionKey(row),
            };
        }

        const bySection = new Map<string, Array<Record<string, unknown>>>();
        sorted.forEach((row) => {
            const sk = readWaitlistCandidateSectionKey(row);
            if (!sk) return;
            const list = bySection.get(sk) ?? [];
            list.push(row);
            bySection.set(sk, list);
        });

        const sections: Record<string, unknown> = {};
        for (const [sk, sectionRows] of bySection) {
            const visibleById = new Map(sectionRows.map((r, i) => [String(r.id), i]));
            const ranked = [...sectionRows].sort((a, b) => {
                const pa = (a._placement_waitlist_row as { runtime_position?: number })?.runtime_position ?? 999;
                const pb = (b._placement_waitlist_row as { runtime_position?: number })?.runtime_position ?? 999;
                return pa - pb;
            });
            sections[sk] = {
                row_count: sectionRows.length,
                preview_position_uses: shadowMode ? "priority_sort_tuple" : "visible_order_after_sort",
                rows: sectionRows.map((r) =>
                    rowDetail(r, visibleById.get(String(r.id)) ?? -1)
                ),
                priority_rank_order: ranked.map((r) => {
                    const d = rowDetail(r, visibleById.get(String(r.id)) ?? -1);
                    return {
                        runtime_position_label: d.runtime_position_label,
                        child_name: d.child_name,
                        family_name: d.family_name,
                        bucket_label: d.bucket_label,
                        sort_tuple: d.sort_tuple,
                        active_override_kinds: d.active_override_kinds,
                    };
                }),
            };
        }

        const williamsRows = sorted
            .filter((r) => {
                const wr = r._placement_waitlist_row as { family_display_name?: string } | undefined;
                const fam = String(wr?.family_display_name ?? r.name ?? "").toLowerCase();
                return fam.includes("williams");
            })
            .map((r) => rowDetail(r, sorted.indexOf(r)));

        return {
            shadow_mode: shadowMode,
            source_config:
                placementConfig.status === "enabled" ?
                    {
                        priority_rule_order: placementConfig.merged.priority_rule_order,
                        priority_rule_enabled_keys: placementConfig.merged.priority_rule_enabled_keys,
                        shadow_mode: placementConfig.options.shadow_mode,
                        profile_id: placementConfig.merged.profile_id,
                        engine_version: placementConfig.engine_version,
                        bucket_priority_orders: placementConfig.profile.buckets.map((b) => ({
                            bucket_key: b.bucket_key,
                            priority_order: b.priority_order,
                        })),
                    }
                :   placementConfig,
            sections,
            williams_rows: williamsRows,
        };
    }

    const previewPositionTrace = traceSectionRankingRows(
        listLoad?.items as Array<Record<string, unknown>> | undefined,
        listLoad?.shadow_mode !== false
    );
    const previewPositionTraceReveal = traceSectionRankingRows(
        revealLoad?.items as Array<Record<string, unknown>> | undefined,
        revealLoad?.shadow_mode !== false
    );

    const candidateEvaluations =
        placementConfig.status === "enabled" && householdSlice ?
            bundles.map((b) => {
                const facts = resolveHouseholdPlacementFactsForCandidate(householdSlice, {
                    placement_candidate_id: b.candidate.id,
                    opportunity_customer_member_id: b.candidate.opportunity_customer_member_id,
                    customer_member_id: b.candidate.customer_member_id,
                    person_id: b.candidate.person_id,
                    site_id: b.candidate.site_id,
                });
                const ev = evaluatePlacementCandidate({
                    candidate: b.candidate,
                    opportunity: {
                        id: String(opp.id),
                        created_at: opp.created_at,
                        metadata: opp.metadata as Record<string, unknown> | null,
                    },
                    cohort: { work_unit_id: wu.id, queue_key: "waitlisted" },
                    profile: placementConfig.profile,
                    now_ms: Date.now(),
                    link_mode: b.link_mode,
                    active_overrides: b.active_overrides,
                    household: householdSlice,
                });
                const revealRow = revealProjection.find(
                    (r) => r.placement_candidate_id === b.candidate.id
                );
                const listRow = listProjection.find((r) => r.placement_candidate_id === b.candidate.id);
                return {
                    candidate_id: b.candidate.id,
                    child_display_name: b.child_display_name,
                    flag_employee_household: facts.flag_employee_household,
                    evaluated_bucket: ev.ok ? ev.value.snapshot.bucket_key : null,
                    evaluated_bucket_label: ev.ok
                        ? formatPlacementBucketLabel(ev.value.snapshot.bucket_key)
                        : null,
                    reveal_bucket_label: revealRow?.rendered_program ? null : null,
                    queue_reveal_priority_chip:
                        revealRow ?
                            parsePlacementWaitlistCandidateRowVm(
                                (revealLoad?.items as Array<Record<string, unknown>> | undefined)?.find(
                                    (row) =>
                                        (row._placement_waitlist_row as { placement_candidate_id?: string })
                                            ?.placement_candidate_id === b.candidate.id
                                )?._placement_waitlist_row
                            )?.bucketLabel ?? null
                        :   null,
                    queue_list_priority_chip:
                        listRow ?
                            parsePlacementWaitlistCandidateRowVm(
                                (listLoad?.items as Array<Record<string, unknown>> | undefined)?.find(
                                    (row) =>
                                        (row._placement_waitlist_row as { placement_candidate_id?: string })
                                            ?.placement_candidate_id === b.candidate.id
                                )?._placement_waitlist_row
                            )?.bucketLabel ?? null
                        :   null,
                };
            })
        :   [];

    const employeePass =
        candidateEvaluations.length > 0 &&
        candidateEvaluations.every(
            (c) =>
                c.flag_employee_household?.presence === "present" &&
                c.flag_employee_household?.value === true &&
                c.evaluated_bucket === TIER_EMPLOYEE_FAMILY_BUCKET &&
                c.queue_list_priority_chip === formatPlacementBucketLabel(TIER_EMPLOYEE_FAMILY_BUCKET) &&
                c.queue_reveal_priority_chip === formatPlacementBucketLabel(TIER_EMPLOYEE_FAMILY_BUCKET)
        );

    const allListItems = (listLoad?.items ?? []) as Array<Record<string, unknown>>;
    const vmItems = allListItems
        .map((r) => {
            const vm = parsePlacementWaitlistCandidateRowVm(r._placement_waitlist_row);
            if (!vm) return null;
            return {
                id: String(r.id ?? ""),
                childDisplayName: vm.childDisplayName,
                cohortKey: vm.cohortKey,
                cohortLabel: vm.cohortLabel,
                placementWaitlistCandidate: {
                    cohortKey: vm.cohortKey,
                    cohortLabel: vm.cohortLabel,
                },
            };
        })
        .filter(Boolean) as Array<{
        id: string;
        childDisplayName: string;
        cohortKey: string;
        cohortLabel: string;
        placementWaitlistCandidate: { cohortKey: string; cohortLabel: string };
    }>;

    const sectionPlan = buildWaitlistQueueBlockSectionPlan(vmItems);
    const sectionCounts = Object.fromEntries(sectionPlan.headers.map((h) => [h.sectionKey, h.rowCount]));
    const visibleSectionSum = sectionPlan.headers.reduce((n, h) => n + h.rowCount, 0);

    const diagnosticsRows = listProjection.filter(
        (r) =>
            r.is_placeholder_child ||
            !r.placement_candidate_id ||
            candidateMatching.some(
                (m) => m.candidate_id === r.placement_candidate_id && m.mismatch_fields.length > 0
            )
    );

    const expectedRows = [
        { child: "Riley Williams", program: "Toddler" },
        { child: "Quinn Williams", program: "Infant" },
    ];

    const pass =
        listProjection.length >= 2 &&
        expectedRows.every((exp) =>
            listProjection.some(
                (r) =>
                    String(r.rendered_child ?? "").toLowerCase().includes(exp.child.split(" ")[0]!.toLowerCase()) &&
                    String(r.rendered_program ?? "").toLowerCase().includes(exp.program.toLowerCase())
            )
        ) &&
        !listProjection.some((r) => r.is_placeholder_child) &&
        employeePass;

    const countMismatch =
        typeof pillCount === "number" ?
            {
                pill_count: pillCount,
                loaded_list_rows: allListItems.length,
                visible_section_sum: visibleSectionSum,
                section_counts: sectionCounts,
                missing_from_sections:
                    typeof pillCount === "number" ? Math.max(0, pillCount - visibleSectionSum) : null,
                explanation:
                    visibleSectionSum < (pillCount ?? 0) ?
                        "Section headers only count rows with parsed placementWaitlistCandidate VM keys; collapsed sections still count. Check unspecified category, unparsed rows, or pagination limit."
                    :   null,
            }
        :   null;

    console.log(
        JSON.stringify(
            {
                "1_opportunity": {
                    id: opp.id,
                    name: opp.name,
                    status_key: opp.status_key,
                    location_id: opp.location_id,
                    location_label: siteLabel(opp.location_id),
                    customer_id: customerId,
                    primary_person_id: (opp as { primary_person_id?: string | null }).primary_person_id ?? null,
                    primary_contact_id: (opp as { primary_contact_id?: string | null }).primary_contact_id ?? null,
                },
                "2_inquiry_children_ocm": inquiryChildren,
                "3_placement_candidates": placementCandidates,
                "4_candidate_ocm_matching": candidateMatching,
                employee_priority_trace: {
                    household_people: householdPeople,
                    household_fact_loader: {
                        person_ids_checked: householdSlice?.household_persons.map((p) => p.person_id) ?? [],
                        flag_employee_household: householdSlice
                            ? resolveHouseholdPlacementFactsForCandidate(householdSlice, {
                                  placement_candidate_id: bundles[0]?.candidate.id ?? "",
                                  site_id: bundles[0]?.candidate.site_id ?? null,
                              }).flag_employee_household
                            : null,
                    },
                    employee_save_path: {
                        employee_only_patch_skips_household_primary_contact_rule: true,
                        completion_probe: employeeCompletionProbe,
                        missing_primary_contact_explanation:
                            employeeCompletionProbe.household_has_primary_contact_strict ?
                                null
                            :   "Household completion requires role_type primary_contact + is_primary; guardian+is_primary does not satisfy strict helper (employee-only PATCH now bypasses this rule).",
                    },
                    candidate_evaluation: candidateEvaluations,
                },
                "5_queue_projection_rows": {
                    queue_reveal_path: revealProjection,
                    queue_list_path: listProjection,
                },
                "6_verdict": {
                    pass: pass ? "PASS" : "FAIL",
                    child_row_pass:
                        listProjection.length >= 2 &&
                        expectedRows.every((exp) =>
                            listProjection.some(
                                (r) =>
                                    String(r.rendered_child ?? "")
                                        .toLowerCase()
                                        .includes(exp.child.split(" ")[0]!.toLowerCase()) &&
                                    String(r.rendered_program ?? "")
                                        .toLowerCase()
                                        .includes(exp.program.toLowerCase())
                            )
                        ) &&
                        !listProjection.some((r) => r.is_placeholder_child),
                    employee_priority_pass: employeePass,
                    expected: expectedRows,
                    expected_priority: formatPlacementBucketLabel(TIER_EMPLOYEE_FAMILY_BUCKET),
                    actual: listProjection.map((r) => ({
                        child: r.rendered_child,
                        program: r.rendered_program,
                    })),
                    mismatch:
                        pass ?
                            null
                        :   `Expected Riley/Toddler + Quinn/Infant with ${formatPlacementBucketLabel(TIER_EMPLOYEE_FAMILY_BUCKET)} priority`,
                },
                preview_position_trace: {
                    queue_list: previewPositionTrace,
                    queue_reveal: previewPositionTraceReveal,
                },
                count_mismatch_analysis: countMismatch,
                org_waitlist_diagnostics: {
                    rows_with_placeholder_child: listProjection.filter((r) => r.is_placeholder_child),
                    rows_missing_ocm_link: candidateMatching.filter((m) =>
                        m.mismatch_fields.includes("missing_ocm_link")
                    ),
                    cohort_mismatches: candidateMatching.filter((m) => m.mismatch_fields.includes("cohort")),
                    site_mismatches: candidateMatching.filter((m) => m.mismatch_fields.includes("site")),
                },
                placement_config: placementConfig,
            },
            null,
            2
        )
    );

    process.exit(pass ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
