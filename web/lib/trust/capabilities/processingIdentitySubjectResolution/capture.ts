/**
 * The ONE canonical lookup-or-capture seam for governed identity judgments.
 *
 * Direct capture (after a generation persists) and gap reconciliation both call
 * this, so the adoption identity is derived once and interpreted the same way
 * everywhere.
 *
 * ## Exactly-once, using constraints the schema already declares
 *
 * The deterministic Decision Contract id **is** the adoption identity, so:
 *
 * ```text
 * one adoption identity → one contract id → at most one contract row (PRIMARY KEY)
 *                                        → at most one package row  (contract_id UNIQUE)
 * ```
 *
 * That makes the database the exactly-once authority. No second idempotency
 * table, no new column, no migration. The lookup is a query on the UNIQUE
 * `contract_id` — a stronger and cheaper check than the jsonb-context scan the
 * classification seam needs, because that capability's identity is not its
 * contract id.
 *
 * Three layers, cheapest first:
 *  1. **Pre-check** by contract id — avoids the exception path in the common case.
 *  2. **Primary-key collision** — the database serializes a concurrent create.
 *  3. **Post-conflict resolve** — the loser re-reads and returns the winner.
 *
 * A loser that arrives while the winner's contract exists but its package does
 * not yet cannot return the winner; it reports `gap_required`, and
 * reconciliation converges it later. Exactly-once always holds; convergence is
 * eventual and durable.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import { createDecisionContract } from "@/lib/trust/contract/createDecisionContract";
import type { TrustChannel, TrustInitiatingActor } from "@/lib/trust/contract/decisionContractTypes";
import {
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import { PROCESSING_IDENTITY_SEMANTIC_MAP } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/semanticMap";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { createSupabaseTrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { executeDecisionContract } from "@/lib/trust/runtime/trustRuntime";

/** Looks up a governed result by its deterministic contract id. */
export type GovernedIdentityLookup = (input: {
    org_id: string;
    contract_id: string;
}) => Promise<{ contract_id: string; package_id: string } | null>;

/**
 * The production lookup: one query against the UNIQUE `contract_id`.
 *
 * Lives in `lib/trust` because Processing must never query a `trust_` table,
 * and a structural control asserts it does not.
 */
export function createSupabaseGovernedIdentityLookup(): GovernedIdentityLookup {
    return async ({ org_id, contract_id }) => {
        const { data, error } = await createAdminClient()
            .from("trust_decision_packages")
            .select("id, contract_id")
            .eq("org_id", org_id)
            .eq("contract_id", contract_id)
            .limit(1)
            .maybeSingle();
        if (error) throw new Error(`trust.governedIdentityLookup: ${error.message}`);
        const row = data as { id: string; contract_id: string } | null;
        return row ? { contract_id: row.contract_id, package_id: row.id } : null;
    };
}

export type IdentityCaptureResult =
    /** This call created the governed decision. */
    | { readonly status: "governed"; readonly contractId: string; readonly packageId: string; readonly package: DecisionPackageV1 }
    /** A package already existed for this adoption identity. */
    | { readonly status: "already_governed"; readonly contractId: string; readonly packageId: string }
    /** Trust could not record it. The caller must persist a durable gap. */
    | { readonly status: "gap_required"; readonly contractId: string; readonly reason: string };

export type IdentityCaptureDeps = {
    readonly repository?: TrustRepository;
    readonly lookup?: GovernedIdentityLookup;
    readonly initiating_actor?: TrustInitiatingActor;
    readonly channel?: TrustChannel;
    readonly nowIso?: string;
    readonly clock?: () => number;
};

export type IdentityCaptureInput = {
    readonly org_id: string;
    readonly processing_case_id: string;
    /** The deterministic adoption identity, used verbatim as the contract id. */
    readonly adoption_id: string;
    /** The completed, already-safe Phase 1.3 governed recommendation. */
    readonly recommendation: Readonly<Record<string, unknown>>;
};

/**
 * Look up, else capture. Never throws for an expected condition.
 *
 * It never reruns identity matching and never touches a Processing record: the
 * recommendation is the finished judgment, and re-deriving it would defeat the
 * point of having captured it.
 */
export async function captureProcessingIdentitySubjectResolution(
    input: IdentityCaptureInput,
    deps: IdentityCaptureDeps = {},
): Promise<IdentityCaptureResult> {
    const lookup = deps.lookup ?? createSupabaseGovernedIdentityLookup();
    const repository = deps.repository ?? createSupabaseTrustRepository();
    const key = { org_id: input.org_id, contract_id: input.adoption_id };

    try {
        const existing = await lookup(key);
        if (existing) {
            return {
                status: "already_governed",
                contractId: existing.contract_id,
                packageId: existing.package_id,
            };
        }
    } catch (e) {
        // A lookup that fails must NOT fall through to a create: that would risk
        // a duplicate for an identity that may already be governed.
        return {
            status: "gap_required",
            contractId: input.adoption_id,
            reason: `lookup_failed: ${e instanceof Error ? e.message : String(e)}`,
        };
    }

    const built = createDecisionContract({
        org_id: input.org_id,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        intent: "Record the governed judgment of the deterministic Processing identity engine for one identity subject.",
        context: {
            surface: "processing_identity_subject_resolution",
            processing_case_id: input.processing_case_id,
            subject_ref: String(input.recommendation.subject_ref ?? ""),
            input_facts_hash: String(input.recommendation.input_facts_hash ?? ""),
            material_projection_version: String(input.recommendation.material_projection_version ?? ""),
            identity_resolver_version: String(input.recommendation.identity_resolver_version ?? ""),
        },
        correlation_id: input.processing_case_id,
        initiating_actor: deps.initiating_actor ?? { actor_type: "system", actor_id: null },
        channel: deps.channel ?? "system",
        nowIso: deps.nowIso,
        // The adoption identity IS the contract id. This is what makes the
        // contract table's primary key the exactly-once authority.
        id: input.adoption_id,
    });

    try {
        const execution = await executeDecisionContract({
            contract: built.contract,
            resolvedInformation: {
                [PROCESSING_IDENTITY_SUBJECT_RESOLUTION_INFORMATION_KEY]: input.recommendation,
            },
            semanticMap: PROCESSING_IDENTITY_SEMANTIC_MAP,
            repository,
            nowIso: deps.nowIso,
            clock: deps.clock,
        });
        return {
            status: "governed",
            contractId: execution.package.contract_id,
            packageId: execution.package.id,
            package: execution.package,
        };
    } catch (e) {
        // A create that raced another create for the SAME identity lost on the
        // contract primary key. Re-read: if the winner's package has landed,
        // both callers converge immediately.
        const reason = e instanceof Error ? e.message : String(e);
        try {
            const winner = await lookup(key);
            if (winner) {
                return {
                    status: "already_governed",
                    contractId: winner.contract_id,
                    packageId: winner.package_id,
                };
            }
        } catch {
            // Fall through: a failed re-read is still a gap, never a duplicate.
        }
        // Otherwise the winner is mid-flight, or this is a genuine failure.
        // Either way a durable gap is the SAFE outcome — reconciliation's own
        // pre-check finds the winner later without duplicating.
        return { status: "gap_required", contractId: input.adoption_id, reason };
    }
}
