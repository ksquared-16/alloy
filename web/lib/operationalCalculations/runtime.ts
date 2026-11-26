/**
 * Operational Calculation Runtime — the resolution layer.
 *
 * Third layer of the frozen platform pattern (Definition → Handler → Runtime →
 * Result). The Runtime turns "a Definition" into "a Result": it invokes the
 * Definition's pure Handler and stamps the governed envelope around the
 * computation — identity, the three versions, the config coordinate, and the
 * `evaluatedAt` instant from an INJECTED clock.
 *
 * The clock is injected (never read from wall time) so every result is
 * deterministic and reproducible. The Runtime owns the envelope; the Handler
 * owns the computation. Neither is the other.
 *
 * Governing architecture (frozen):
 *   docs/sprints/07_2026/operational-calculations-architecture/06-naming-and-layer-freeze.md §3.3
 *   docs/sprints/07_2026/operational-calculations-architecture/04-realization-plan.md §Part 2
 *
 * Pure: given the same Definition, request, clock, and config coordinate, the
 * result is byte-identical. No IO, no Supabase client, no UI dependency.
 */

import type { OperationalCalculationDefinition } from "@/lib/operationalCalculations/definition";
import {
    defaultConfigVersion,
    type CalculationConfigVersion,
    type OperationalCalculationResult,
    type OperationalCalculationValue,
} from "@/lib/operationalCalculations/resultContract";

/** An injected clock. Never wall-time — determinism requires the caller supply it. */
export type CalculationClock = () => Date;

export type ResolveCalculationOptions = {
    /** Injected clock producing `evaluatedAt`. */
    clock: CalculationClock;
    /**
     * The config coordinate the result read. Defaults to a coordinate derived
     * from the resolved `effective.asOf` when the caller does not supply one
     * (config carries no independent revision in V1).
     */
    configVersion?: CalculationConfigVersion;
};

/**
 * Resolve a Definition against a request, producing a governed V1 Result.
 *
 * The Runtime does not compute values — it delegates to the Definition's pure
 * handler and wraps the outcome. Only `pure` handlers are resolvable through the
 * V1 runtime; `oip` handlers remain served by the existing metric registry and
 * throw here (convergence is a later roadmap phase).
 */
export function resolveCalculation<Req, V extends OperationalCalculationValue>(
    definition: OperationalCalculationDefinition<Req, V>,
    request: Req,
    options: ResolveCalculationOptions,
): OperationalCalculationResult<V> {
    const { handler } = definition;
    if (handler.kind !== "pure") {
        throw new Error(
            `Operational Calculation "${definition.key}" uses an "${handler.kind}" handler, ` +
                `which is not resolvable through the V1 runtime.`,
        );
    }

    const computation = handler.evaluate(request);
    const configVersion = options.configVersion ?? defaultConfigVersion(computation.effective.asOf);

    return {
        calculationKey: definition.key,
        family: definition.family,
        status: computation.status,
        value: computation.value,
        scope: computation.scope,
        effective: computation.effective,
        appliedRules: computation.appliedRules,
        warnings: computation.warnings,
        contractVersion: definition.contractVersion,
        engineVersion: handler.engineVersion,
        configVersion,
        evaluatedAt: options.clock().toISOString(),
    };
}
