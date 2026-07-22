/**
 * Reconcile Location Program Category keys into canonical Organization Programs.
 *
 * Source of truth for identity candidates: distinct (org_id, btrim(key)) from
 * public.location_program_categories — Location-owned availability rows, not
 * Organization ownership. Never auto-publishes. Never flips LPC is_active.
 *
 * Mirrors migration 20260722020000 seed semantics; safe to re-run (idempotent).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ProgramReconciliationSourceClass =
    | "canonical_organization_program"
    | "location_owned_availability"
    | "delivery_option"
    | "pricing_relationship"
    | "legacy_vocabulary"
    | "operational_enrollment_projection"
    | "obsolete_duplicate";

export type ProgramReconciliationCandidate = {
    orgId: string;
    programKey: string;
    displayName: string;
    sourceClass: "location_owned_availability";
    sourceTable: "location_program_categories";
    locationRowCount: number;
    earliestCreatedAt: string | null;
};

export type ProgramReconciliationMapping = {
    orgId: string;
    programKey: string;
    displayName: string;
    action: "insert" | "link_only" | "unchanged";
    existingProgramId: string | null;
    canonicalProgramId: string | null;
};

export type ProgramReconciliationReport = {
    dryRun: boolean;
    orgId: string | null;
    candidates: ProgramReconciliationCandidate[];
    mappings: ProgramReconciliationMapping[];
    counts: {
        candidateKeys: number;
        existingPrograms: number;
        programsInserted: number;
        draftsInserted: number;
        lpcRowsLinked: number;
        collisions: number;
        unresolved: number;
        orphanOfferingKeys: number;
    };
    collisions: Array<{ orgId: string; programKey: string; reason: string }>;
    unresolved: Array<{ orgId: string; programKey: string; reason: string }>;
    orphanOfferingKeys: Array<{ orgId: string; programKey: string }>;
    sourceClassification: Array<{
        source: string;
        classification: ProgramReconciliationSourceClass;
        note: string;
    }>;
};

type LpcRow = {
    org_id: string;
    key: string;
    label: string | null;
    created_at: string | null;
    program_id: string | null;
};

type ProgramRow = {
    id: string;
    org_id: string;
    program_key: string;
};

function normalizeKey(value: string): string | null {
    const key = value.trim();
    if (key.length < 2 || key.length > 64) return null;
    return key;
}

export function classifyProgramAuthoritySources(): ProgramReconciliationReport["sourceClassification"] {
    return [
        {
            source: "public.programs + program_drafts + program_revisions",
            classification: "canonical_organization_program",
            note: "Accepted Organization Program identity and publication payloads.",
        },
        {
            source: "public.location_program_categories",
            classification: "location_owned_availability",
            note: "Primary reconciliation candidate via distinct (org_id, key). Remains Location-owned.",
        },
        {
            source: "public.program_offerings / program_offering_variants",
            classification: "delivery_option",
            note: "Soft-linked by program_key; report orphans; do not invent Org Programs from offerings alone in this checkpoint.",
        },
        {
            source: "commercial_tuition_rates / commercial_products / policies",
            classification: "pricing_relationship",
            note: "Pricing scope by key or variant; not Organization Program identity.",
        },
        {
            source: "childcare_program_type / classroom_age_group option sets",
            classification: "legacy_vocabulary",
            note: "Compat vocabulary only; do not seed Org Programs from option-set items.",
        },
        {
            source: "opportunity_customer_members.program_category_id / placements",
            classification: "operational_enrollment_projection",
            note: "Points at LPC availability rows, not Org Programs.",
        },
        {
            source: "public.discount_programs",
            classification: "obsolete_duplicate",
            note: "Name collision only — promo entity, unrelated.",
        },
    ];
}

function buildCandidates(rows: LpcRow[]): ProgramReconciliationCandidate[] {
    const byKey = new Map<string, ProgramReconciliationCandidate>();
    for (const row of rows) {
        const programKey = normalizeKey(row.key);
        if (!programKey) continue;
        const mapKey = `${row.org_id}::${programKey}`;
        const existing = byKey.get(mapKey);
        const createdAt = row.created_at;
        if (!existing) {
            byKey.set(mapKey, {
                orgId: row.org_id,
                programKey,
                displayName: (row.label ?? "").trim() || programKey,
                sourceClass: "location_owned_availability",
                sourceTable: "location_program_categories",
                locationRowCount: 1,
                earliestCreatedAt: createdAt,
            });
            continue;
        }
        existing.locationRowCount += 1;
        if (
            createdAt
            && (!existing.earliestCreatedAt || createdAt < existing.earliestCreatedAt)
        ) {
            existing.earliestCreatedAt = createdAt;
            const label = (row.label ?? "").trim();
            if (label) existing.displayName = label;
        }
    }
    return [...byKey.values()].sort((a, b) =>
        a.orgId === b.orgId ? a.programKey.localeCompare(b.programKey) : a.orgId.localeCompare(b.orgId),
    );
}

export async function reconcileOrganizationProgramsFromLpc(
    supabase: SupabaseClient,
    options: {
        orgId?: string | null;
        dryRun?: boolean;
    } = {},
): Promise<ProgramReconciliationReport> {
    const dryRun = options.dryRun === true;
    const orgFilter = options.orgId?.trim() || null;
    const sourceClassification = classifyProgramAuthoritySources();

    let lpcQuery = supabase
        .from("location_program_categories")
        .select("org_id, key, label, created_at, program_id");
    if (orgFilter) lpcQuery = lpcQuery.eq("org_id", orgFilter);
    const { data: lpcData, error: lpcError } = await lpcQuery;
    if (lpcError) throw new Error(`Load location_program_categories: ${lpcError.message}`);

    let programsQuery = supabase.from("programs").select("id, org_id, program_key");
    if (orgFilter) programsQuery = programsQuery.eq("org_id", orgFilter);
    const { data: programData, error: programError } = await programsQuery;
    if (programError) throw new Error(`Load programs: ${programError.message}`);

    let offeringsQuery = supabase.from("program_offerings").select("org_id, program_key");
    if (orgFilter) offeringsQuery = offeringsQuery.eq("org_id", orgFilter);
    const { data: offeringData, error: offeringError } = await offeringsQuery;
    if (offeringError) throw new Error(`Load program_offerings: ${offeringError.message}`);

    const lpcRows = (lpcData ?? []) as LpcRow[];
    const programs = (programData ?? []) as ProgramRow[];
    const programByOrgKey = new Map<string, ProgramRow>(
        programs.map((row) => [`${row.org_id}::${row.program_key}`, row]),
    );

    const candidates = buildCandidates(lpcRows);
    const mappings: ProgramReconciliationMapping[] = [];
    const collisions: ProgramReconciliationReport["collisions"] = [];
    const unresolved: ProgramReconciliationReport["unresolved"] = [];

    let programsInserted = 0;
    let draftsInserted = 0;
    let lpcRowsLinked = 0;

    for (const candidate of candidates) {
        const mapKey = `${candidate.orgId}::${candidate.programKey}`;
        const existing = programByOrgKey.get(mapKey) ?? null;
        if (existing) {
            mappings.push({
                orgId: candidate.orgId,
                programKey: candidate.programKey,
                displayName: candidate.displayName,
                action: "link_only",
                existingProgramId: existing.id,
                canonicalProgramId: existing.id,
            });
            continue;
        }
        mappings.push({
            orgId: candidate.orgId,
            programKey: candidate.programKey,
            displayName: candidate.displayName,
            action: dryRun ? "insert" : "insert",
            existingProgramId: null,
            canonicalProgramId: null,
        });
    }

    if (!dryRun) {
        for (const mapping of mappings) {
            if (mapping.action !== "insert" || mapping.existingProgramId) continue;
            const candidate = candidates.find(
                (row) => row.orgId === mapping.orgId && row.programKey === mapping.programKey,
            );
            if (!candidate) {
                unresolved.push({
                    orgId: mapping.orgId,
                    programKey: mapping.programKey,
                    reason: "candidate_missing_during_apply",
                });
                continue;
            }

            const { data: inserted, error: insertError } = await supabase
                .from("programs")
                .insert({
                    org_id: candidate.orgId,
                    program_key: candidate.programKey,
                    created_at: candidate.earliestCreatedAt ?? undefined,
                })
                .select("id, org_id, program_key")
                .maybeSingle();

            if (insertError) {
                if (/duplicate|unique/i.test(insertError.message)) {
                    collisions.push({
                        orgId: candidate.orgId,
                        programKey: candidate.programKey,
                        reason: insertError.message,
                    });
                    const { data: raced } = await supabase
                        .from("programs")
                        .select("id, org_id, program_key")
                        .eq("org_id", candidate.orgId)
                        .eq("program_key", candidate.programKey)
                        .maybeSingle();
                    if (raced) {
                        mapping.action = "unchanged";
                        mapping.existingProgramId = raced.id;
                        mapping.canonicalProgramId = raced.id;
                        programByOrgKey.set(`${raced.org_id}::${raced.program_key}`, raced as ProgramRow);
                    }
                    continue;
                }
                unresolved.push({
                    orgId: candidate.orgId,
                    programKey: candidate.programKey,
                    reason: insertError.message,
                });
                continue;
            }

            if (!inserted?.id) {
                unresolved.push({
                    orgId: candidate.orgId,
                    programKey: candidate.programKey,
                    reason: "insert_returned_no_row",
                });
                continue;
            }

            programsInserted += 1;
            mapping.canonicalProgramId = inserted.id;
            programByOrgKey.set(`${inserted.org_id}::${inserted.program_key}`, inserted as ProgramRow);

            const { error: draftError } = await supabase.from("program_drafts").insert({
                org_id: candidate.orgId,
                program_id: inserted.id,
                label: candidate.displayName,
                created_at: candidate.earliestCreatedAt ?? undefined,
                updated_at: new Date().toISOString(),
            });
            if (draftError) {
                if (!/duplicate|unique/i.test(draftError.message)) {
                    unresolved.push({
                        orgId: candidate.orgId,
                        programKey: candidate.programKey,
                        reason: `draft: ${draftError.message}`,
                    });
                }
            } else {
                draftsInserted += 1;
            }
        }

        // Link LPC rows that still lack program_id when a matching Org Program exists.
        const linkTargets = new Map<string, { orgId: string; key: string; programId: string }>();
        for (const row of lpcRows) {
            if (row.program_id) continue;
            const programKey = normalizeKey(row.key);
            if (!programKey) continue;
            const program = programByOrgKey.get(`${row.org_id}::${programKey}`);
            if (!program) continue;
            linkTargets.set(`${row.org_id}::${programKey}`, {
                orgId: row.org_id,
                key: row.key,
                programId: program.id,
            });
        }
        for (const target of linkTargets.values()) {
            const { data: linkedRows, error: linkError } = await supabase
                .from("location_program_categories")
                .update({ program_id: target.programId })
                .eq("org_id", target.orgId)
                .eq("key", target.key)
                .is("program_id", null)
                .select("id");
            if (linkError) {
                unresolved.push({
                    orgId: target.orgId,
                    programKey: normalizeKey(target.key) ?? target.key,
                    reason: `lpc_link: ${linkError.message}`,
                });
            } else {
                lpcRowsLinked += (linkedRows ?? []).length;
            }
        }
    } else {
        // Dry-run: estimate insert + link volume
        for (const row of lpcRows) {
            if (row.program_id) continue;
            const programKey = normalizeKey(row.key);
            if (!programKey) continue;
            const exists =
                programByOrgKey.has(`${row.org_id}::${programKey}`)
                || mappings.some(
                    (m) =>
                        m.orgId === row.org_id
                        && m.programKey === programKey
                        && m.action === "insert",
                );
            if (exists) lpcRowsLinked += 1;
        }
        programsInserted = mappings.filter((m) => m.action === "insert").length;
        draftsInserted = programsInserted;
    }

    const programKeySet = new Set(
        [...programByOrgKey.keys()].concat(
            mappings
                .filter((m) => m.action === "insert")
                .map((m) => `${m.orgId}::${m.programKey}`),
        ),
    );
    const orphanOfferingKeys: ProgramReconciliationReport["orphanOfferingKeys"] = [];
    const seenOrphan = new Set<string>();
    for (const row of (offeringData ?? []) as Array<{ org_id: string; program_key: string }>) {
        const programKey = normalizeKey(row.program_key);
        if (!programKey) continue;
        const key = `${row.org_id}::${programKey}`;
        if (programKeySet.has(key) || seenOrphan.has(key)) continue;
        // After planned inserts, offering keys that match candidates are not orphans
        if (candidates.some((c) => c.orgId === row.org_id && c.programKey === programKey)) {
            continue;
        }
        seenOrphan.add(key);
        orphanOfferingKeys.push({ orgId: row.org_id, programKey });
    }

    return {
        dryRun,
        orgId: orgFilter,
        candidates,
        mappings,
        counts: {
            candidateKeys: candidates.length,
            existingPrograms: programs.length,
            programsInserted,
            draftsInserted,
            lpcRowsLinked,
            collisions: collisions.length,
            unresolved: unresolved.length,
            orphanOfferingKeys: orphanOfferingKeys.length,
        },
        collisions,
        unresolved,
        orphanOfferingKeys,
        sourceClassification,
    };
}
