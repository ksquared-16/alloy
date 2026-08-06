/**
 * Which governed judgments a Commit Plan actually executed.
 *
 * ## The lineage already exists; nothing needs to be added to the plan
 *
 * ```text
 * PlanOperation.resolutionRefs[]        (= processing_resolutions.id)
 *   → the resolution row
 *   → adoptionIdForResolutionRow()      (org + case + subject + class
 *                                        + input facts hash + projection version
 *                                        + resolver version)
 *   → the deterministic contract id
 *   → trust_decision_packages.contract_id (UNIQUE) → package id
 * ```
 *
 * `resolutionRefs` is populated by `recommendationBuilder` from `row.id` for
 * every subject, and synthesized participation operations inherit their child's
 * ref. So every operation traces to a real resolution row, and the plan needs
 * **no new field, no Decision Package column and no migration**. That matters
 * beyond convenience: the Commit Plan content hash covers `{orgId, caseId,
 * operations}` with an eleven-key whitelist per operation, and adding nothing
 * means no historical hash can move and no approval can be invalidated.
 *
 * ## Grain
 *
 * A package is per SUBJECT; a plan spans several. One commit attempt therefore
 * binds to several packages, and the operations of one subject decide that
 * subject's outcome — never the attempt-wide verdict. That is what lets a
 * partial commit be reported honestly instead of flattened.
 *
 * ## What is deliberately excluded
 *
 * - **A subject whose engine judgment was superseded.** Phase 1.6 records that
 *   an operator decision replaced the engine's judgment. Marking that package
 *   `executed` would claim the engine's judgment was carried out when an
 *   operator had already replaced it. What executed was the operator's decision,
 *   and an operator decision is a Processing act with no Decision Package.
 * - **A subject with no governed package.** No package is ever invented for one.
 *
 * Nothing here uses "the latest package for the case". The join is the exact
 * adoption identity or nothing.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovernedIdentityLookup } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import { createSupabaseGovernedIdentityLookup } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import type { SupersessionObservationLookup } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import { createSupabaseSupersessionObservationLookup } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import type { CommitPlan, PlanOperation } from "../plan/planTypes";
import {
    listProcessingResolutionsByCase,
    type ProcessingResolutionRow,
} from "../processingResolutionsDb";
import { adoptionIdForResolutionRow } from "./identityLineageService";

/** One governed judgment a plan contributes to, with the operations that carry it. */
export type ContributingPackage = {
    readonly packageId: string;
    readonly adoptionId: string;
    readonly resolutionId: string;
    readonly subjectRef: string;
    /** Every INCLUDED operation whose `resolutionRefs` names this resolution. */
    readonly opIds: readonly string[];
};

/** A subject that contributed operations but produced no execution evidence. */
export type ExcludedContributor = {
    readonly resolutionId: string;
    readonly subjectRef: string;
    readonly reason:
        /** The judgment was never governed, or its capture gap is still open. */
        | "no_governed_package"
        /** An operator decision replaced the engine judgment (Phase 1.6). */
        | "package_superseded"
        /** The operation names a resolution that is not in this case. */
        | "resolution_not_found";
};

export type PlanPackageLineage = {
    readonly contributing: readonly ContributingPackage[];
    readonly excluded: readonly ExcludedContributor[];
    /** Operations carrying no resolution reference at all. Should be none. */
    readonly unattributedOpIds: readonly string[];
};

export type PlanLineageDeps = {
    readonly lookup?: GovernedIdentityLookup;
    readonly supersessionLookup?: SupersessionObservationLookup;
};

type Client = Pick<SupabaseClient, "from">;

/**
 * Resolve the exact governed judgments an approved plan's INCLUDED operations
 * derive from.
 *
 * Deterministic and deduplicated: a resolution referenced by several operations
 * (a child and its synthesized participation operation share one) yields ONE
 * contributing package carrying both opIds. Ordering is by resolution id so the
 * result does not depend on operation order.
 *
 * Throws only if Processing state cannot be read. A Trust lookup failure is
 * reported as an exclusion the caller can defer on, never as a silent success.
 */
export async function resolvePlanPackageLineage(
    supabase: Client,
    input: { orgId: string; plan: CommitPlan; deps?: PlanLineageDeps },
): Promise<PlanPackageLineage> {
    const deps = input.deps ?? {};
    const lookup = deps.lookup ?? createSupabaseGovernedIdentityLookup();
    const supersessionLookup = deps.supersessionLookup ?? createSupabaseSupersessionObservationLookup();

    const included = input.plan.operations.filter((o) => o.included);
    const opsByResolution = groupOpsByResolution(included);

    const rows = await listProcessingResolutionsByCase(supabase, input.orgId, input.plan.caseId);
    const rowById = new Map(rows.map((r) => [r.id, r]));

    const contributing: ContributingPackage[] = [];
    const excluded: ExcludedContributor[] = [];

    // Sorted so the result is stable regardless of operation order in the plan.
    for (const resolutionId of [...opsByResolution.keys()].sort()) {
        const opIds = [...opsByResolution.get(resolutionId)!].sort();
        const row = rowById.get(resolutionId);
        if (!row) {
            excluded.push({ resolutionId, subjectRef: "", reason: "resolution_not_found" });
            continue;
        }

        const adoptionId = adoptionIdForResolutionRow(row);
        const governed = await lookup({ org_id: input.orgId, contract_id: adoptionId });
        if (!governed) {
            excluded.push({ resolutionId, subjectRef: row.subject_ref, reason: "no_governed_package" });
            continue;
        }

        // Phase 1.6 lineage: an operator decision replaced this judgment, so the
        // engine's package must not be credited with what the operator's
        // decision executed.
        const supersessions = await supersessionLookup({
            org_id: input.orgId,
            package_id: governed.package_id,
        });
        if (supersessions.length > 0) {
            excluded.push({ resolutionId, subjectRef: row.subject_ref, reason: "package_superseded" });
            continue;
        }

        contributing.push({
            packageId: governed.package_id,
            adoptionId,
            resolutionId,
            subjectRef: row.subject_ref,
            opIds,
        });
    }

    return {
        contributing,
        excluded,
        unattributedOpIds: included.filter((o) => (o.resolutionRefs ?? []).length === 0).map((o) => o.opId).sort(),
    };
}

/**
 * opIds grouped by the resolution they derive from.
 *
 * An operation may name several resolutions; each gets the operation. A
 * resolution named by several operations appears once, with all of them — which
 * is the deduplication the lineage needs.
 */
function groupOpsByResolution(operations: readonly PlanOperation[]): Map<string, Set<string>> {
    const byResolution = new Map<string, Set<string>>();
    for (const op of operations) {
        for (const ref of op.resolutionRefs ?? []) {
            if (!ref) continue;
            const bucket = byResolution.get(ref);
            if (bucket) bucket.add(op.opId);
            else byResolution.set(ref, new Set([op.opId]));
        }
    }
    return byResolution;
}

/** Test/inspection helper: the adoption identity a resolution row would carry. */
export function adoptionIdForRow(row: ProcessingResolutionRow): string {
    return adoptionIdForResolutionRow(row);
}
