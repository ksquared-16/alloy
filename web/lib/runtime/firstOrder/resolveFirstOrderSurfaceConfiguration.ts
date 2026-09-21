import { configFields, type FocusPanelCardConfig } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardConfigModel";
import { cardDefinition } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardRegistry";
import type { FocusPanelCardKey } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    CompiledCardRequirement, FirstOrderSurfaceConfiguration,
} from "@/lib/runtime/firstOrder/compileFirstOrderPlan";

/**
 * PUBLISHED SURFACE CONFIGURATION → the compiler's input.
 *
 * This is the only place that reads the Focus Panel's persisted card configuration for
 * first-order purposes, and it makes exactly two decisions:
 *
 *   WHICH CARDS   — the caller's ordered card keys, already resolved from the published doc.
 *   WHICH FIELDS  — a card's configured fields whose `placement` is `"collapsed"`, in configured
 *                   order; falling back to the card's own registry declaration when the card
 *                   configures none.
 *
 * ── `placement: "collapsed"` IS THE FIRST-ORDER CLASSIFICATION, AND IT ALREADY EXISTED ──
 *
 * `FocusPanelCardField.placement` is persisted configuration authored in the Surface Composer:
 * `"collapsed"` is what the card shows before expansion — the 2–5 second answer — and
 * `"expanded"` is the same question at more depth. That is precisely the Stage-1 / Stage-2 line,
 * decided by the configured surface and by the operator who authored it.
 *
 * The A′ composer therefore does NOT decide product importance, and must not: a composer that
 * picks which facts matter has quietly taken a product decision away from configuration, and
 * every tenant gets one opinion. `binding` note: a gate asserts the composer contains no
 * `"collapsed"` literal and no semantic key, so this decision cannot drift back into it.
 *
 * `refKey` is preferred over `concept` because `refKey` is the canonical persisted binding and
 * `concept` is read-compat for pre-V2 docs — the same precedence `configFields`' own contract
 * states.
 */

export type FirstOrderCardConfigurationInput = {
    /** Configured card keys IN ORDER, from the published Focus Panel doc. */
    readonly cardKeys: readonly string[];
    /** Persisted per-card configuration, keyed by card key. Absent = the card configures nothing. */
    readonly cardConfigs?: Readonly<Record<string, FocusPanelCardConfig | null | undefined>>;
    readonly kpiKeys: readonly string[];
    readonly workViewIds: readonly string[];
    readonly siteScopeId: string | null;
};

/** Configured collapsed-placement semantic keys for one card, in configured order. */
export function configuredFirstOrderSemanticKeys(
    config: FocusPanelCardConfig | null | undefined,
): string[] {
    return configFields(config)
        .filter((f) => f.placement === "collapsed")
        .map((f) => (f.refKey ?? f.concept ?? "").trim())
        .filter(Boolean);
}

export function resolveFirstOrderSurfaceConfiguration(
    input: FirstOrderCardConfigurationInput,
): FirstOrderSurfaceConfiguration {
    const cards: CompiledCardRequirement[] = input.cardKeys.map((cardKey) => {
        const configured = configuredFirstOrderSemanticKeys(input.cardConfigs?.[cardKey]);
        if (configured.length > 0) return { cardKey, semanticKeys: configured };
        // No configured first-order fields: fall back to what the CARD declares it answers.
        const declared = cardDefinition(cardKey as FocusPanelCardKey)?.firstOrderFields ?? [];
        return { cardKey, semanticKeys: declared };
    });

    return {
        cards,
        kpiKeys: input.kpiKeys,
        workViewIds: input.workViewIds,
        siteScopeId: input.siteScopeId,
    };
}
