import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import { generateHouseholdGraphCandidates } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import { resolveIntakeRecordResolution } from "@/lib/intake/resolve/resolveIntakeRecordResolution";
import { defaultActionForConfidence } from "@/lib/intake/resolve/buildProposals";
import { bandToLegacyConfidence } from "./engineJudgment";
import {
    hashFactsForResolution,
    insertProcessingFacts,
    intakeFactToInsertRow,
    listProcessingFactsByCase,
    newGenerationId,
    type ProcessingFactRow,
} from "./processingFactsDb";
import {
    findResolutionByCaseSubjectGeneration,
    insertProcessingResolution,
    markResolutionSuperseded,
    resolutionRowFromSubject,
    type ProcessingResolutionRow,
} from "./processingResolutionsDb";
import type { IntakeFact } from "@/lib/intake/types";
import { buildHouseholdLeadDisplayName } from "@/lib/admin/opportunity/buildHouseholdLeadDisplayName";
import {
    captureIdentityGenerationJudgments,
    type CaptureGenerationDeps,
    type GenerationCaptureResult,
} from "./trustAdapter/captureIdentityGeneration";

// `bandToLegacyConfidence` moved to `./engineJudgment` so the operator-effect
// classifier can reconstruct exactly what this engine decided. Same function,
// ONE definition: a copy would drift, and the drift would silently reclassify
// operator overrides as confirmations.

export type CanonicalResolutionRunResult = {
    generationId: string;
    inputFactsHash: string;
    intakeResult: Awaited<ReturnType<typeof resolveIntakeRecordResolution>>;
    graph: Awaited<ReturnType<typeof generateHouseholdGraphCandidates>>;
    resolutionRows: ProcessingResolutionRow[];
    factsPersisted: boolean;
    resolutionsPersisted: boolean;
    /**
     * Per-subject Trust governance status (Phase 1.5).
     *
     * Purely informational and OPTIONAL: `null` when capture was suppressed,
     * absent entirely for callers that construct a result without running the
     * engine. It never affects whether this generation succeeded, so requiring
     * it would force unrelated constructors to declare a field they cannot know.
     */
    trustCapture?: GenerationCaptureResult | null;
};

function guardiansFromHousehold(household: IntakeHouseholdCandidate) {
    return household.parents_guardians?.length ? household.parents_guardians : household.parents;
}

function noMatchCandidate(input: {
    subjectRef: string;
    entityType: IdentityCandidate["entityType"];
    displayName?: string;
}): IdentityCandidate {
    return {
        subjectRef: input.subjectRef,
        entityType: input.entityType,
        recordId: "none",
        confidenceBand: "excluded",
        signals: [],
        blockingConflicts: [],
        explanation: "No existing record matched intake subject.",
        resolverVersion: IDENTITY_RESOLVER_VERSION,
        displayName: input.displayName ?? input.subjectRef,
    };
}

function provisionalForSubject(
    household: IntakeHouseholdCandidate,
    subjectRef: string,
    role: string,
): Record<string, unknown> {
    const guardians = guardiansFromHousehold(household);
    if (role === "parent") {
        const parent = guardians.find((p) => p.candidate_id === subjectRef);
        if (!parent) return {};
        return {
            first_name: parent.first_name,
            last_name: parent.last_name,
            email: parent.emails?.[0] ?? null,
            phone: parent.phones?.[0] ?? null,
        };
    }
    if (role === "child") {
        const child = household.children.find((c) => c.candidate_id === subjectRef);
        if (!child) return {};
        return {
            display_name: [child.first_name, child.last_name].filter(Boolean).join(" ").trim() || "Child",
            dob: child.dob ?? null,
            first_name: child.first_name,
            last_name: child.last_name,
            ...(child.gender ? { gender: child.gender } : {}),
        };
    }
    if (role === "household") {
        const primary = guardians[0];
        return {
            household_name: buildHouseholdLeadDisplayName({
                firstName: primary?.first_name,
                lastName: primary?.last_name,
                fallback: "Household",
            }),
        };
    }
    if (role === "lead") {
        const primary = guardians[0];
        // Lead / opportunity name is household-oriented (`Lyons Family`), matching Focus Panel titles.
        // Using the primary contact's full name made queue subject slots show "Alex Lyons" when
        // Surfaces are configured for household name.
        return {
            name: buildHouseholdLeadDisplayName({
                firstName: primary?.first_name,
                lastName: primary?.last_name,
                fallback: "Lead",
            }),
        };
    }
    return {};
}

/** Ensure every intake subject gets a resolution row, even when candidate discovery returns no_match. */
function buildResolutionSubjects(
    household: IntakeHouseholdCandidate,
    graph: Awaited<ReturnType<typeof generateHouseholdGraphCandidates>>,
): Array<{ ref: string; role: string; candidates: IdentityCandidate[] }> {
    const subjects: Array<{ ref: string; role: string; candidates: IdentityCandidate[] }> = [];
    const guardians = guardiansFromHousehold(household);

    for (const parent of guardians) {
        const matches = graph.parents.filter((c) => c.subjectRef === parent.candidate_id);
        subjects.push({
            ref: parent.candidate_id,
            role: "parent",
            candidates:
                matches.length > 0 ?
                    matches
                :   [
                        noMatchCandidate({
                            subjectRef: parent.candidate_id,
                            entityType: "person",
                            displayName: [parent.first_name, parent.last_name].filter(Boolean).join(" "),
                        }),
                    ],
        });
    }

    for (const child of household.children) {
        const matches = graph.children.filter((c) => c.subjectRef === child.candidate_id);
        subjects.push({
            ref: child.candidate_id,
            role: "child",
            candidates:
                matches.length > 0 ?
                    matches
                :   [
                        noMatchCandidate({
                            subjectRef: child.candidate_id,
                            entityType: "child",
                            displayName: [child.first_name, child.last_name].filter(Boolean).join(" "),
                        }),
                    ],
        });
    }

    subjects.push({
        ref: household.household_id,
        role: "household",
        candidates:
            graph.household.length > 0 ?
                graph.household
            :   [
                    noMatchCandidate({
                        subjectRef: household.household_id,
                        entityType: "household",
                        displayName: "Household",
                    }),
                ],
    });

    const leadRef = `${household.household_id}:lead`;
    subjects.push({
        ref: leadRef,
        role: "lead",
        candidates:
            graph.leads.length > 0 ?
                graph.leads
            :   [noMatchCandidate({ subjectRef: leadRef, entityType: "lead", displayName: "Lead" })],
    });

    return subjects;
}

export async function runCanonicalIdentityResolution(input: {
    supabase: SupabaseClient;
    orgId: string;
    caseId: string;
    sourceId?: string | null;
    sourceKind: string;
    sourceRefId?: string;
    household: IntakeHouseholdCandidate;
    locationId?: string | null;
    facts?: IntakeFact[];
    generationId?: string;
    /**
     * Trust governance capture (Phase 1.5). Defaults ON in production.
     * `false` suppresses it entirely — the control arm proving Processing
     * behaviour is byte-identical with and without Trust. An object injects
     * certification seams.
     */
    trustCapture?: false | CaptureGenerationDeps;
}): Promise<CanonicalResolutionRunResult> {
    const generationId = input.generationId ?? newGenerationId();

    let facts: ProcessingFactRow[] = [];

    if (input.facts?.length) {
        const rows = input.facts.map((f) =>
            intakeFactToInsertRow({
                orgId: input.orgId,
                caseId: input.caseId,
                sourceId: input.sourceId,
                generationId,
                fact: f,
            }),
        );
        facts = await insertProcessingFacts(input.supabase, rows);
    } else {
        facts = await listProcessingFactsByCase(input.supabase, input.orgId, input.caseId);
    }

    const inputFactsHash = hashFactsForResolution(facts);

    const graph = await generateHouseholdGraphCandidates(input.supabase, {
        orgId: input.orgId,
        household: input.household,
        locationId: input.locationId,
    });

    const intakeResult = await resolveIntakeRecordResolution(input.supabase, {
        orgId: input.orgId,
        source_kind: input.sourceKind,
        source_id: input.sourceRefId,
        household: input.household,
        location_id: input.locationId,
    });

    const resolutionRows: ProcessingResolutionRow[] = [];

    const subjects = buildResolutionSubjects(input.household, graph);

    for (const subject of subjects) {
        const top = subject.candidates[0];
        const legacyConfidence = top ? bandToLegacyConfidence(top.confidenceBand) : "no_match";
        const rowInput = resolutionRowFromSubject({
            orgId: input.orgId,
            caseId: input.caseId,
            generationId,
            inputFactsHash,
            subjectRef: subject.ref,
            subjectRole: subject.role,
            provisional: provisionalForSubject(input.household, subject.ref, subject.role),
            candidates: subject.candidates,
            decisionAction: defaultActionForConfidence(legacyConfidence),
            selectedCandidateId: top?.recordId && top.recordId !== "none" ? top.recordId : null,
        });

        const existing = await findResolutionByCaseSubjectGeneration(input.supabase, {
            caseId: input.caseId,
            subjectRef: subject.ref,
            generationId,
        });
        if (existing && existing.input_facts_hash === inputFactsHash) {
            resolutionRows.push(existing);
            continue;
        }
        if (existing) {
            const inserted = await insertProcessingResolution(input.supabase, rowInput);
            await markResolutionSuperseded(input.supabase, {
                resolutionId: existing.id,
                supersededById: inserted.id,
            });
            resolutionRows.push(inserted);
        } else {
            resolutionRows.push(await insertProcessingResolution(input.supabase, rowInput));
        }
    }

    await input.supabase
        .from("processing_cases")
        .update({ status: "needs_resolution", status_changed_at: new Date().toISOString() })
        .eq("org_id", input.orgId)
        .eq("id", input.caseId);

    // ---- Trust adoption Phase 1.5 -------------------------------------------
    // The generation is now DURABLE: every subject row is persisted and the case
    // status is committed. Only here is the judgment stable enough to govern,
    // and only here is it unambiguously the ENGINE's — no operator has acted.
    //
    // Additive and non-blocking by construction: it never throws, it cannot
    // change a resolution row, and a Trust outage produces durable per-subject
    // gaps rather than failing this generation.
    let trustCapture: GenerationCaptureResult | null = null;
    if (input.trustCapture !== false) {
        trustCapture = await captureIdentityGenerationJudgments(input.supabase, {
            orgId: input.orgId,
            caseId: input.caseId,
            generationId,
            resolutionRows,
            deps: typeof input.trustCapture === "object" ? input.trustCapture : undefined,
        });
    }

    return {
        generationId,
        inputFactsHash,
        intakeResult,
        graph,
        resolutionRows,
        factsPersisted: Boolean(input.facts?.length),
        resolutionsPersisted: true,
        trustCapture,
    };
}
