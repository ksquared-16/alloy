/**
 * D4 — Manual Create Lead canonical source adapter.
 *
 * Creates Processing inputs ONLY: case, source ref, facts, evidence snapshot, resolution.
 * Never creates Person/Customer/Child/Opportunity/participation directly.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { CreateLeadCommitSelection } from "@/lib/admin/actions/createLead/commit/createLeadCommitSelection";
import { readCreateLeadCommitSelectionFromPayload } from "@/lib/admin/actions/mapCreateLeadCommitSelectionToPayload";
import type { IntakeFact, IntakeHouseholdCandidate } from "@/lib/intake/types";
import { makeProcessingCaseDbDeps, dbFindPrimaryCaseSourceRowId } from "@/lib/pos/processingCase/processingCaseDb";
import { openProcessingCaseFromSource } from "@/lib/pos/processingCase/openProcessingCaseFromSource";
import { runCanonicalIdentityResolution } from "../canonicalResolutionEngine";
import { createLeadPhaseTimer } from "@/lib/platform/commands/createLead/createLeadPhaseTiming";
import type { CreateLeadPerfSpans } from "@/lib/platform/commands/createLead/createLeadPhaseTiming";
import { loadCaseReview, type CaseReviewState } from "../operator/operatorReviewService";
import type { IdentityReviewReadiness } from "../operator/caseStateModel";
import { createExecutorPorts } from "../executor/executorPorts";
import { applyCommitSelectionToResolutions } from "./applyCommitSelectionToResolutions";
import { extractFactsFromCreateLeadHousehold } from "./createLeadFacts";
import { validateCreateLeadProcessingMinimum } from "./createLeadMinimumValidation";
import { householdFromCommitSelection, householdFromFlatCreateLeadMerged } from "./householdFromCommitSelection";
import { stableSourceIdFromKey } from "./stableSourceId";

export const CREATE_LEAD_INTAKE_HOUSEHOLD_KEY = "processing_intake_household_v1";

export type IngestCreateLeadInput = {
    orgId: string;
    actorId: string;
    merged: Record<string, unknown>;
    context?: {
        department_id?: string | null;
        work_unit_id?: string | null;
        surface?: string;
    };
    /** Pre-resolved config from executeCreateLeadAction validation. */
    workUnitId: string;
    statusKey: string;
    locationId?: string | null;
    verticalId?: string | null;
};

export type IngestCreateLeadResult =
    | {
          ok: true;
          processingCaseId: string;
          sourceId: string;
          idempotencyKey: string;
          created: boolean;
          readiness: IdentityReviewReadiness;
          /** First review load — reuse in executeCreateLeadAction to avoid a duplicate load. */
          caseReview?: CaseReviewState;
          perf_spans?: CreateLeadPerfSpans;
      }
    | { ok: false; error: string; status: number };

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function idempotencyKeyForCreateLead(input: IngestCreateLeadInput): string {
    const selection = readCreateLeadCommitSelectionFromPayload(input.merged);
    const payload = JSON.stringify({
        orgId: input.orgId,
        actorId: input.actorId,
        selection,
        first_name: trim(input.merged.first_name),
        last_name: trim(input.merged.last_name),
        email: trim(input.merged.email),
        phone: trim(input.merged.phone),
        work_unit_id: input.workUnitId,
    });
    return createHash("sha256").update(payload).digest("hex");
}

function parseHouseholdFromPayload(merged: Record<string, unknown>): IntakeHouseholdCandidate | null {
    const raw = merged[CREATE_LEAD_INTAKE_HOUSEHOLD_KEY];
    if (raw == null) return null;
    if (typeof raw === "string") {
        try {
            return JSON.parse(raw) as IntakeHouseholdCandidate;
        } catch {
            return null;
        }
    }
    if (typeof raw === "object") return raw as IntakeHouseholdCandidate;
    return null;
}

function valuesFromMerged(merged: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(merged)) {
        if (typeof v === "string") out[k] = v;
    }
    return out;
}

/** Canonical Manual Create Lead intake — opens/reuses one Processing Case per idempotency key. */
export async function ingestCreateLeadThroughProcessing(
    supabase: SupabaseClient,
    input: IngestCreateLeadInput,
): Promise<IngestCreateLeadResult> {
    const timer = createLeadPhaseTimer({ mode: "ingest" });
    const selection = readCreateLeadCommitSelectionFromPayload(input.merged);
    const household =
        parseHouseholdFromPayload(input.merged) ??
        (selection ? householdFromCommitSelection(selection, { locationId: input.locationId ?? null }) : null) ??
        householdFromFlatCreateLeadMerged(input.merged, { locationId: input.locationId ?? null });

    if (!household) {
        return { ok: false, error: "Create Lead requires household intake data.", status: 400 };
    }

    const values = valuesFromMerged(input.merged);
    const minimum = validateCreateLeadProcessingMinimum({
        values,
        selection,
        household,
        orgId: input.orgId,
        workUnitId: input.workUnitId,
        statusKey: input.statusKey,
        hasParticipationIntent: Boolean(trim(input.merged.child_first_name) || selection?.children.some((c) => c.include_in_commit)),
    });
    if (!minimum.ok) {
        return { ok: false, error: minimum.issues.join(" "), status: 400 };
    }

    const idempotencyKey = idempotencyKeyForCreateLead(input);
    const sourceId = stableSourceIdFromKey(`create_lead:${input.orgId}:${idempotencyKey}`);

    timer.mark("case_open_start");
    const deps = makeProcessingCaseDbDeps(supabase);
    const opened = await openProcessingCaseFromSource(deps, {
        orgId: input.orgId,
        sourceKind: "create_lead",
        sourceId,
        caseType: "create_lead",
    });
    timer.measure("case_open", "case_open_start");

    const submissionSnapshot = {
        merged: input.merged,
        context: input.context ?? {},
        work_unit_id: input.workUnitId,
        status_key: input.statusKey,
        location_id: input.locationId ?? null,
        vertical_id: input.verticalId ?? null,
        idempotency_key: idempotencyKey,
        ingested_at: new Date().toISOString(),
    };

    await supabase
        .from("processing_cases")
        .update({
            metadata: {
                create_lead_intake: submissionSnapshot,
                source_adapter: "create_lead_v1",
            },
            status: "processing",
            status_changed_at: new Date().toISOString(),
        })
        .eq("org_id", input.orgId)
        .eq("id", opened.processingCaseId);

    timer.mark("facts_start");
    const facts: IntakeFact[] = extractFactsFromCreateLeadHousehold(household, idempotencyKey.slice(0, 16));
    timer.measure("facts_extract", "facts_start");

    const caseSourceRowId = await dbFindPrimaryCaseSourceRowId(supabase, {
        orgId: input.orgId,
        sourceKind: "create_lead",
        sourceId,
    });
    if (!caseSourceRowId) {
        return { ok: false, error: "Create Lead processing source row missing.", status: 500 };
    }

    timer.mark("resolution_start");
    await runCanonicalIdentityResolution({
        supabase,
        orgId: input.orgId,
        caseId: opened.processingCaseId,
        sourceId: caseSourceRowId,
        sourceKind: "create_lead",
        sourceRefId: idempotencyKey,
        household,
        locationId: input.locationId ?? null,
        facts,
    });
    timer.measure("identity_resolution", "resolution_start");

    if (selection) {
        await applyCommitSelectionToResolutions(supabase, {
            orgId: input.orgId,
            caseId: opened.processingCaseId,
            selection,
            operatorId: input.actorId,
        });
    }

    timer.mark("review_start");
    const review = await loadCaseReview(
        {
            supabase,
            orgId: input.orgId,
            actorId: input.actorId,
            actorAuthorized: true,
            executorPorts: createExecutorPorts(supabase),
        },
        opened.processingCaseId,
    );
    timer.measure("review_load", "review_start");
    timer.measure("ingest_total");
    const perf_spans = timer.logSummary({
        processing_case_id: opened.processingCaseId,
        created: opened.created,
    });

    return {
        ok: true,
        processingCaseId: opened.processingCaseId,
        sourceId,
        idempotencyKey,
        created: opened.created,
        readiness: review.readiness,
        caseReview: review,
        perf_spans,
    };
}

/** Extract opportunity_id from a committed attempt's operation results. */
export function opportunityIdFromAttempt(operations: { commandKey: string; recordId: string | null; status: string }[]): string | null {
    const lead = operations.find((o) => o.commandKey === "create_lead" && o.status === "committed");
    return lead?.recordId ?? null;
}
