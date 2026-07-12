import type { SupabaseClient } from "@supabase/supabase-js";
import type { IntakeHouseholdCandidate } from "@/lib/intake/types";
import { generateHouseholdGraphCandidates } from "@/lib/identity";
import { resolveIntakeRecordResolution } from "@/lib/intake/resolve/resolveIntakeRecordResolution";
import { defaultActionForConfidence } from "@/lib/intake/resolve/buildProposals";
import type { IntakeRecordMatchConfidence } from "@/lib/intake/resolve/types";
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
    listProcessingResolutionsByCase,
    markResolutionSuperseded,
    resolutionRowFromSubject,
    type ProcessingResolutionRow,
} from "./processingResolutionsDb";
import { isProcessingPersistFactsEnabled, isProcessingRealResolverEnabled } from "./featureFlags";
import type { IntakeFact } from "@/lib/intake/types";

function bandToLegacyConfidence(band: string): IntakeRecordMatchConfidence {
    switch (band) {
        case "confirmed":
            return "exact_match";
        case "strong":
            return "probable_match";
        case "possible":
        case "weak":
            return "possible_match";
        case "conflicted":
            return "conflict";
        default:
            return "no_match";
    }
}

export type CanonicalResolutionRunResult = {
    generationId: string;
    inputFactsHash: string;
    intakeResult: Awaited<ReturnType<typeof resolveIntakeRecordResolution>>;
    graph: Awaited<ReturnType<typeof generateHouseholdGraphCandidates>>;
    resolutionRows: ProcessingResolutionRow[];
    factsPersisted: boolean;
    resolutionsPersisted: boolean;
};

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
    forcePersistFacts?: boolean;
    forcePersistResolutions?: boolean;
}): Promise<CanonicalResolutionRunResult> {
    const generationId = input.generationId ?? newGenerationId();
    const persistFacts = input.forcePersistFacts ?? isProcessingPersistFactsEnabled(input.orgId);
    const persistResolutions = input.forcePersistResolutions ?? isProcessingRealResolverEnabled(input.orgId);

    let facts: ProcessingFactRow[] = [];

    if (input.facts?.length && persistFacts) {
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
    } else if (persistFacts) {
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

    const subjects: Array<{ ref: string; role: string; candidates: typeof graph.parents }> = [
        ...graph.parents.map((c) => ({ ref: c.subjectRef, role: "parent", candidates: [c] })),
        ...graph.children.map((c) => ({ ref: c.subjectRef, role: "child", candidates: [c] })),
    ];

    if (graph.household[0]) {
        subjects.push({
            ref: graph.household[0].subjectRef,
            role: "household",
            candidates: graph.household,
        });
    }
    for (const lead of graph.leads) {
        subjects.push({ ref: lead.subjectRef, role: "lead", candidates: [lead] });
    }

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
            candidates: subject.candidates,
            decisionAction: defaultActionForConfidence(legacyConfidence),
            selectedCandidateId: top?.recordId ?? null,
        });

        if (persistResolutions) {
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
    }

    if (persistResolutions) {
        await input.supabase
            .from("processing_cases")
            .update({ status: "needs_resolution", status_changed_at: new Date().toISOString() })
            .eq("org_id", input.orgId)
            .eq("id", input.caseId);
    }

    return {
        generationId,
        inputFactsHash,
        intakeResult,
        graph,
        resolutionRows:
            persistResolutions ?
                resolutionRows
            :   await listProcessingResolutionsByCase(input.supabase, input.orgId, input.caseId),
        factsPersisted: Boolean(input.facts?.length && persistFacts),
        resolutionsPersisted: persistResolutions,
    };
}
