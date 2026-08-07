/**
 * Trust persistence.
 *
 * Server-authoritative writes only, through the service-role client. The
 * database — not this module — enforces immutability, one-package-per-contract
 * and append-only observations; these functions would fail loudly if they ever
 * tried to violate them.
 *
 * The interface is injectable so runtime logic can be unit-tested without a
 * database. Database invariants are certified separately by the SQL suite.
 */

import { createAdminClient } from "@/lib/supabaseAdmin";
import type { DecisionContractV1, DecisionContractLifecycleState } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";

/**
 * The append-only lifecycle vocabulary. Must stay in step with the
 * `chk_tdo_kind` CHECK constraint — extended additively by
 * `20260804210000_trust_lifecycle_observation_kinds.sql`.
 */
export const TRUST_OBSERVATION_KINDS = [
    "presented",
    "accepted",
    "rejected",
    "overridden",
    "modified",
    "deferred",
    "executed",
    "outcome",
    /** The recommendation's window closed before it was acted on. */
    "expired",
    /** A newer Decision Package replaced this one. The predecessor is never edited. */
    "superseded",
] as const;

export type TrustObservationKind = (typeof TRUST_OBSERVATION_KINDS)[number];

export type TrustObservationInput = {
    /**
     * Optional deterministic primary key.
     *
     * `id` is a `uuid PRIMARY KEY DEFAULT gen_random_uuid()`: omit it and the
     * database generates one, supply it and the primary key becomes the
     * exactly-once authority for observations whose identity is derivable. That
     * is what makes an equivalent append fail loudly rather than duplicate,
     * without a second idempotency table or a new constraint.
     */
    readonly id?: string;
    readonly org_id: string;
    readonly package_id: string;
    readonly observation_kind: TrustObservationKind;
    readonly observed_by_actor_type: "operator" | "system" | "automation";
    readonly observed_by_actor_id: string | null;
    readonly channel: string;
    /**
     * Evidence that an execution authority acted. Never an instruction to
     * execute — the Trust Runtime cannot execute anything.
     */
    readonly execution_reference: string | null;
    readonly detail: Record<string, unknown>;
};

export type ReasoningUsageInput = {
    readonly org_id: string;
    readonly contract_id: string;
    readonly decision_class_key: string;
    readonly strategy_key: string | null;
    readonly strategy_kind: string | null;
    readonly escalation_level: number;
    readonly latency_ms: number;
    readonly cache_utilized: boolean;
    /** Strategy-MEASURED cost. Always present, zero when no provider ran. */
    readonly provider_cost_units: number;
    readonly outcome: string;
    /**
     * Provider execution facts, present only when a provider participated.
     *
     * Every field is optional and omission means **not reported** — never zero
     * and never inferred. A deterministic execution supplies none of this, and
     * that absence is the honest record of an execution in which no provider
     * took part. Reasoning KIND is deliberately not here: `strategy_kind`
     * already records it and `executionCapability.ts` derives the rest, so a
     * second column would be a second truth to keep in sync.
     */
    readonly provider_key?: string | null;
    readonly model_key?: string | null;
    readonly model_version?: string | null;
    /** `local` | `remote` | `unknown` as ASSERTED by the adapter. Never derived from the provider name. */
    readonly execution_location?: string | null;
    readonly input_units?: number | null;
    readonly output_units?: number | null;
    /** What the PROVIDER said it cost. Distinct from the strategy-measured `provider_cost_units`. */
    readonly provider_reported_cost_units?: number | null;
};

export type TrustRepository = {
    insertContract(contract: DecisionContractV1): Promise<void>;
    advanceContractLifecycle(input: {
        org_id: string;
        contract_id: string;
        lifecycle_state: DecisionContractLifecycleState;
    }): Promise<void>;
    insertPackage(pkg: DecisionPackageV1): Promise<void>;
    insertObservation(input: TrustObservationInput): Promise<void>;
    insertReasoningUsage(input: ReasoningUsageInput): Promise<void>;
};

/**
 * The provider telemetry columns, included only when the caller supplied them.
 *
 * The distinction between an OMITTED key and an explicit `null` is the whole
 * point. Omitted means the execution said nothing, so the column stays NULL and
 * a deterministic row asserts no provider. An explicit `null` means the caller
 * knows the value is absent. Zero-filling either would turn silence into a
 * measurement — the same misstatement `parseProviderCostUnits` exists to stop.
 */
const PROVIDER_TELEMETRY_COLUMNS = [
    "provider_key",
    "model_key",
    "model_version",
    "execution_location",
    "input_units",
    "output_units",
    "provider_reported_cost_units",
] as const;

function providerTelemetryColumns(input: ReasoningUsageInput): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of PROVIDER_TELEMETRY_COLUMNS) {
        if (input[key] !== undefined) out[key] = input[key];
    }
    return out;
}

function contractRow(contract: DecisionContractV1): Record<string, unknown> {
    return {
        id: contract.id,
        org_id: contract.org_id,
        decision_class_key: contract.decision_class_key,
        intent: contract.intent,
        context: contract.context,
        information_requirements: contract.information_requirements,
        knowledge_requirements: contract.knowledge_requirements,
        privacy_policy_key: contract.privacy_policy_key,
        validation_policy_key: contract.validation_policy_key,
        economic_constraints: contract.economic_constraints,
        success_criteria: contract.success_criteria,
        correlation_id: contract.correlation_id,
        initiating_actor_type: contract.initiating_actor.actor_type,
        initiating_actor_id: contract.initiating_actor.actor_id,
        channel: contract.channel,
        lifecycle_state: contract.lifecycle_state,
        runtime_version: contract.runtime_version,
        registry_version: contract.registry_version,
        created_at: contract.created_at_iso,
    };
}

function packageRow(pkg: DecisionPackageV1): Record<string, unknown> {
    return {
        id: pkg.id,
        org_id: pkg.org_id,
        contract_id: pkg.contract_id,
        decision_class_key: pkg.decision_class_key,
        outcome: pkg.outcome,
        recommendation: pkg.recommendation,
        explanation: pkg.explanation,
        evidence: pkg.evidence,
        remaining_uncertainty: pkg.remaining_uncertainty,
        confidence: pkg.confidence,
        trust_vector: pkg.trust_vector,
        trust_score: pkg.trust_score,
        trust_semantics_version: pkg.trust_semantics_version,
        review_requirement: pkg.review_requirement,
        validation_results: pkg.validation,
        privacy_report: pkg.privacy_report,
        economics: pkg.economics,
        knowledge_versions: pkg.knowledge_versions,
        learning_metadata: pkg.learning_metadata,
        alternatives: pkg.alternatives,
        supersedes_package_id: pkg.supersedes_package_id,
        strategy_key: pkg.strategy_key,
        strategy_version: pkg.strategy_version,
        validation_version: pkg.validation_version,
        runtime_version: pkg.runtime_version,
        registry_version: pkg.registry_version,
        created_at: pkg.created_at_iso,
    };
}

export function createSupabaseTrustRepository(): TrustRepository {
    return {
        async insertContract(contract) {
            const { error } = await createAdminClient().from("trust_decision_contracts").insert(contractRow(contract));
            if (error) throw new Error(`trust.insertContract: ${error.message}`);
        },
        async advanceContractLifecycle({ org_id, contract_id, lifecycle_state }) {
            const { error } = await createAdminClient()
                .from("trust_decision_contracts")
                .update({ lifecycle_state })
                .eq("id", contract_id)
                .eq("org_id", org_id);
            if (error) throw new Error(`trust.advanceContractLifecycle: ${error.message}`);
        },
        async insertPackage(pkg) {
            const { error } = await createAdminClient().from("trust_decision_packages").insert(packageRow(pkg));
            if (error) throw new Error(`trust.insertPackage: ${error.message}`);
        },
        async insertObservation(input) {
            const { error } = await createAdminClient().from("trust_decision_observations").insert({
                // Omitted entirely when undefined, so the column default applies.
                ...(input.id ? { id: input.id } : {}),
                org_id: input.org_id,
                package_id: input.package_id,
                observation_kind: input.observation_kind,
                observed_by_actor_type: input.observed_by_actor_type,
                observed_by_actor_id: input.observed_by_actor_id,
                channel: input.channel,
                execution_reference: input.execution_reference,
                detail: input.detail,
            });
            if (error) throw new Error(`trust.insertObservation: ${error.message}`);
        },
        async insertReasoningUsage(input) {
            const { error } = await createAdminClient().from("trust_reasoning_usage").insert({
                org_id: input.org_id,
                contract_id: input.contract_id,
                decision_class_key: input.decision_class_key,
                strategy_key: input.strategy_key,
                strategy_kind: input.strategy_kind,
                escalation_level: input.escalation_level,
                latency_ms: input.latency_ms,
                cache_utilized: input.cache_utilized,
                provider_cost_units: input.provider_cost_units,
                outcome: input.outcome,
                // Only when the execution actually supplied them. An omitted
                // key leaves the column NULL, so a deterministic row asserts no
                // provider and an unreported token count never becomes 0.
                ...providerTelemetryColumns(input),
            });
            if (error) throw new Error(`trust.insertReasoningUsage: ${error.message}`);
        },
    };
}

/** No-op repository for callers that must not persist (unit tests, dry runs). */
export function createNullTrustRepository(): TrustRepository {
    return {
        async insertContract() {},
        async advanceContractLifecycle() {},
        async insertPackage() {},
        async insertObservation() {},
        async insertReasoningUsage() {},
    };
}
