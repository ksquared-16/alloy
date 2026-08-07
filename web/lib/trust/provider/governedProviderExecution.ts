/**
 * Governed provider execution — the seam.
 *
 * Trust decides WHETHER provider-backed reasoning may happen and WHAT may be
 * sent; an adapter decides HOW to reach a model. This module is the boundary
 * between those two, and it is deliberately transport-free: `lib/trust` is
 * asserted by control to contain no network call, no provider SDK and no
 * credential, so the adapter is a PORT — a type Trust declares and someone else
 * implements. Dependency inversion, not a provider client hiding in Trust.
 *
 * The canonical path this makes real:
 *
 *   Eligible Reasoning Input        (Phase 2.3 — governed, minimized, provenanced)
 *     → governed execution request  (this module)
 *     → provider adapter            (transport, outside lib/trust)
 *     → normalized result           (this module)
 *     → Trust validation            (the decision class's existing policy)
 *     → immutable Decision Package  (the runtime, unchanged)
 *
 * **Four dimensions, kept apart.** Provider execution is not one "mode":
 *
 *   - *reasoning kind* — deterministic vs model, already owned by the strategy
 *     ladder and `executionCapability.ts`;
 *   - *execution location* — local, remote or unknown;
 *   - *provider identity* — which provider;
 *   - *model identity* — which model, and which version if it says.
 *
 * A local model is still model reasoning (D-6), so location never implies kind
 * and neither implies trust. Collapsing them is how "we run it locally" becomes
 * an accidental authority claim.
 *
 * **Nothing provider-controlled reaches a Decision Package.** A failure is a
 * closed code, never the provider's error text; usage is numbers; identity is
 * keys the platform asked for. D-18 holds: every field here is either platform
 * vocabulary or a bounded value, because all of it is durable evidence.
 *
 * @see lib/trust/information/informationPackage.ts — the only admissible input
 * @see lib/trust/reasoning/executionCapability.ts — who must come through here
 */

import type { EligibleReasoningInputV1 } from "@/lib/trust/information/informationPackage";
import { parseProviderCostUnits } from "@/lib/trust/economics/providerCostUnits";
import type { ReasoningStrategyKind } from "@/lib/trust/reasoning/reasoningStrategy";

/**
 * Where inference ran, when the adapter can say.
 *
 * `unknown` is a first-class answer and the correct default. An adapter that
 * cannot prove locality must not claim it — a base URL pointing at localhost is
 * a configuration fact, not evidence about where weights live.
 */
export const PROVIDER_EXECUTION_LOCATIONS = ["local", "remote", "unknown"] as const;

export type ProviderExecutionLocation = (typeof PROVIDER_EXECUTION_LOCATIONS)[number];

/**
 * Who answered, and with what.
 *
 * Present on success AND failure: a provider that timed out still identifies
 * the provider that timed out, and losing that is how "something failed" stops
 * being actionable. `model_key` is optional because a transport failure can
 * happen before any model is selected — absent means unknown, never "none".
 */
export type ProviderIdentityV1 = {
    readonly provider_key: string;
    readonly model_key?: string;
    readonly model_version?: string;
    readonly execution_location: ProviderExecutionLocation;
};

/**
 * What the provider reported spending.
 *
 * Every field optional, and omission means **not reported** — never zero. A
 * provider that returns no usage block has told us nothing, and recording 0
 * would turn silence into a measurement. `provider_cost_units` is validated by
 * the same `parseProviderCostUnits` the runtime already uses, so an unusable
 * value is refused rather than clamped.
 */
export type ProviderUsageFactsV1 = {
    readonly input_units?: number;
    readonly output_units?: number;
    readonly provider_cost_units?: number;
};

/** Closed failure vocabulary. Aligned with `lib/ai`'s existing outcomes, extended only where the seam genuinely needs it. */
export const PROVIDER_EXECUTION_FAILURES = [
    "timeout",
    "transport_failure",
    "provider_unavailable",
    "malformed_response",
    "provider_refused",
    "adapter_contract_violation",
] as const;

export type ProviderExecutionFailureCode = (typeof PROVIDER_EXECUTION_FAILURES)[number];

/**
 * Failures worth trying again, as a property of the FAILURE rather than a
 * policy. This slice implements no retry and no provider re-routing — it only records
 * which failures could be retried, so a later routing slice does not have to
 * re-derive it from error strings.
 */
const RETRYABLE: ReadonlySet<ProviderExecutionFailureCode> = new Set<ProviderExecutionFailureCode>([
    "timeout",
    "transport_failure",
    "provider_unavailable",
]);

export function isRetryableProviderFailure(code: ProviderExecutionFailureCode): boolean {
    return RETRYABLE.has(code);
}

/**
 * What Trust asks a provider to do.
 *
 * `input` is typed as the governed artifact, so passing raw
 * `resolvedInformation` is a COMPILE error rather than a review question. The
 * runtime guard below covers the untyped caller.
 */
export type GovernedProviderExecutionRequestV1 = {
    readonly schema_version: 1;
    readonly decision_class_key: string;
    /** Ties the execution to its contract for audit. An identifier, never content. */
    readonly correlation_id: string;
    /** The ONLY admissible input. Minimized, classified and provenanced upstream. */
    readonly input: EligibleReasoningInputV1;
    /** What kind of reasoning is being asked for — from the ladder, not invented here. */
    readonly requested_strategy_kind: ReasoningStrategyKind;
    /** Routing request, not a routing decision. The adapter may answer with a different model and must say so. */
    readonly requested_provider_key: string;
    readonly requested_model_key?: string;
    /** Wall-clock budget. The adapter owns the mechanics; Trust owns the number. */
    readonly deadline_ms: number;
};

/** What an adapter returns. Normalized by {@link executeGovernedProviderReasoning} before Trust uses it. */
export type ProviderAdapterResponseV1 =
    | {
          readonly ok: true;
          /** Structured output only. Validated later by the decision class's own policy. */
          readonly output: Record<string, unknown>;
          readonly provider_identity: ProviderIdentityV1;
          readonly usage?: ProviderUsageFactsV1;
      }
    | {
          readonly ok: false;
          readonly failure_code: ProviderExecutionFailureCode;
          readonly provider_identity: ProviderIdentityV1;
          readonly usage?: ProviderUsageFactsV1;
      };

/**
 * The port. Implemented OUTSIDE `lib/trust` — by a real transport later, and by
 * a fake in tests today.
 *
 * Deliberately narrow: an adapter receives a governed request and returns a
 * normalized response. It is handed no repository, no policy, no privacy engine
 * and no capability. It cannot read a canonical record because it is never
 * given anything that could reach one.
 */
export type ProviderAdapterV1 = {
    readonly adapter_key: string;
    execute(request: GovernedProviderExecutionRequestV1): Promise<ProviderAdapterResponseV1>;
};

export type GovernedProviderExecutionResultV1 =
    | {
          readonly ok: true;
          readonly output: Record<string, unknown>;
          readonly provider_identity: ProviderIdentityV1;
          /** Absent when the provider reported nothing. Never fabricated. */
          readonly usage?: ProviderUsageFactsV1;
          readonly latency_ms: number;
      }
    | {
          readonly ok: false;
          readonly failure_code: ProviderExecutionFailureCode;
          readonly retryable: boolean;
          /** As much as the adapter could say. Never absent entirely. */
          readonly provider_identity: ProviderIdentityV1;
          readonly usage?: ProviderUsageFactsV1;
          readonly latency_ms: number;
      };

/** An input is governed only if it carries the shape `buildEligibleReasoningInput` produces. */
function isEligibleReasoningInput(value: unknown): value is EligibleReasoningInputV1 {
    if (value == null || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    return (
        v.schema_version === 1 &&
        typeof v.spec_key === "string" &&
        typeof v.decision_class_key === "string" &&
        typeof v.privacy_policy_key === "string" &&
        typeof v.content_hash === "string" &&
        Array.isArray(v.transformations) &&
        v.elements != null &&
        typeof v.elements === "object"
    );
}

const UNKNOWN_IDENTITY = (provider_key: string): ProviderIdentityV1 => ({
    provider_key,
    execution_location: "unknown",
});

/**
 * Validates usage without inventing it.
 *
 * A present-but-unusable number is refused rather than dropped, because a
 * silently discarded cost reports a paid execution as free — the same
 * misstatement `parseProviderCostUnits` exists to prevent.
 */
function normalizeUsage(raw: ProviderUsageFactsV1 | undefined): { ok: true; usage?: ProviderUsageFactsV1 } | { ok: false } {
    if (raw === undefined) return { ok: true };

    const out: { input_units?: number; output_units?: number; provider_cost_units?: number } = {};
    for (const key of ["input_units", "output_units"] as const) {
        const value = raw[key];
        if (value === undefined) continue;
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return { ok: false };
        out[key] = value;
    }
    if (raw.provider_cost_units !== undefined) {
        const parsed = parseProviderCostUnits(raw.provider_cost_units);
        if (!parsed.ok) return { ok: false };
        out.provider_cost_units = parsed.value;
    }
    // All fields absent is the same as no usage block: nothing was reported.
    return { ok: true, usage: Object.keys(out).length > 0 ? out : undefined };
}

function isValidIdentity(value: unknown): value is ProviderIdentityV1 {
    if (value == null || typeof value !== "object") return false;
    const v = value as Record<string, unknown>;
    if (typeof v.provider_key !== "string" || !v.provider_key.trim()) return false;
    if (!(PROVIDER_EXECUTION_LOCATIONS as readonly string[]).includes(v.execution_location as string)) return false;
    for (const key of ["model_key", "model_version"] as const) {
        if (v[key] !== undefined && typeof v[key] !== "string") return false;
    }
    return true;
}

/**
 * Runs one governed provider execution.
 *
 * Every exit is a normalized result — an adapter that throws, returns a shape
 * nobody declared, or reports an unknown failure code becomes
 * `adapter_contract_violation`, not an exception escaping into the runtime.
 * Trust's own doctrine is that a refusal is a package, never a thrown error,
 * and that has to hold for the seam too.
 *
 * Nothing here re-runs privacy, reads a record or consults a policy: the input
 * arrived already minimized, and validating its business content is the
 * decision class's job downstream.
 */
export async function executeGovernedProviderReasoning(input: {
    readonly request: GovernedProviderExecutionRequestV1;
    readonly adapter: ProviderAdapterV1;
    /** Injected so latency is measurable without this module owning a clock. */
    readonly clock?: () => number;
}): Promise<GovernedProviderExecutionResultV1> {
    const clock = input.clock ?? Date.now;
    const startedAt = clock();
    const requestedProvider = input.request?.requested_provider_key ?? "unknown";

    const fail = (
        failure_code: ProviderExecutionFailureCode,
        provider_identity: ProviderIdentityV1,
        usage?: ProviderUsageFactsV1,
    ): GovernedProviderExecutionResultV1 => ({
        ok: false,
        failure_code,
        retryable: isRetryableProviderFailure(failure_code),
        provider_identity,
        ...(usage ? { usage } : {}),
        latency_ms: clock() - startedAt,
    });

    // Invariant: only a governed Information Package product may be executed.
    // Typed as such, and checked again here for the caller who casts.
    if (!isEligibleReasoningInput(input.request?.input)) {
        return fail("adapter_contract_violation", UNKNOWN_IDENTITY(requestedProvider));
    }

    let response: ProviderAdapterResponseV1;
    try {
        response = await input.adapter.execute(input.request);
    } catch {
        // The thrown value is deliberately not read. It is provider- or
        // adapter-controlled, it would end up in durable evidence, and a closed
        // code says everything Trust is entitled to assert about it.
        return fail("transport_failure", UNKNOWN_IDENTITY(requestedProvider));
    }

    if (response == null || typeof response !== "object" || typeof response.ok !== "boolean") {
        return fail("adapter_contract_violation", UNKNOWN_IDENTITY(requestedProvider));
    }
    if (!isValidIdentity(response.provider_identity)) {
        return fail("adapter_contract_violation", UNKNOWN_IDENTITY(requestedProvider));
    }

    const usage = normalizeUsage(response.usage);
    if (!usage.ok) {
        return fail("adapter_contract_violation", response.provider_identity);
    }

    if (!response.ok) {
        if (!(PROVIDER_EXECUTION_FAILURES as readonly string[]).includes(response.failure_code)) {
            return fail("adapter_contract_violation", response.provider_identity, usage.usage);
        }
        return fail(response.failure_code, response.provider_identity, usage.usage);
    }

    if (response.output == null || typeof response.output !== "object" || Array.isArray(response.output)) {
        return fail("malformed_response", response.provider_identity, usage.usage);
    }

    return {
        ok: true,
        output: response.output,
        provider_identity: response.provider_identity,
        ...(usage.usage ? { usage: usage.usage } : {}),
        latency_ms: clock() - startedAt,
    };
}
