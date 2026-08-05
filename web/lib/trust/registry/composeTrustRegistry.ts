/**
 * Trust Registry composition.
 *
 * ONE deterministic composition model for every Trust runtime registry.
 *
 * `composeTrustRegistry` is a pure function of an explicitly ordered manifest.
 * Nothing here reads module state, and no module registers itself by being
 * imported — which is what removes import-order side effects. Production
 * composes exactly once, in `trustRegistry.ts`; certification composes
 * synthetic manifests through this same function, so the tests exercise the
 * production loop rather than a copy of it.
 *
 * Composition fails loudly, at composition time, on:
 *
 *   - a duplicate contribution id;
 *   - a duplicate key within any registry;
 *   - a capability contributing a platform-owned entry;
 *   - a reference to something that was never registered.
 *
 * A malformed registry is a programming defect, not an operational condition,
 * so it throws rather than producing a refusal. Refusal-as-Decision-Package
 * remains the contract for OPERATIONAL uncertainty — an unregistered Decision
 * Class at request time still becomes `refused_unsupported_class`.
 *
 * @see docs/platform/trust/trust-runtime.md — Extension Points
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.2
 */

import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import { REASONING_STRATEGY_KINDS } from "@/lib/trust/reasoning/reasoningStrategy";
import type {
    TrustContribution,
    TrustRegistry,
    TrustRegistryKind,
    TrustRegistryProvenance,
} from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

/** A manifest that cannot be composed. Thrown at composition, never at request time. */
export class TrustRegistryCompositionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TrustRegistryCompositionError";
    }
}

/** A required lookup that resolved to nothing. Absence here is a programming error. */
export class TrustRegistryLookupError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TrustRegistryLookupError";
    }
}

type Entry<T> = { readonly value: T; readonly provenance: TrustRegistryProvenance };

/**
 * Inserts one keyed entry, refusing a duplicate by naming BOTH contributors.
 * A collision message that does not name both sides is not actionable.
 */
function insert<T>(
    into: Map<string, Entry<T>>,
    kind: TrustRegistryKind,
    key: string,
    value: T,
    provenance: TrustRegistryProvenance,
): void {
    if (!key || !key.trim()) {
        throw new TrustRegistryCompositionError(
            `Contribution "${provenance.contribution_id}" declared a ${kind} with an empty key.`,
        );
    }
    const existing = into.get(key);
    if (existing) {
        throw new TrustRegistryCompositionError(
            `Duplicate ${kind} key "${key}": contributed by "${existing.provenance.contribution_id}" ` +
                `(position ${existing.provenance.order}) and again by "${provenance.contribution_id}" ` +
                `(position ${provenance.order}). A key may be registered exactly once; to share, reference it.`,
        );
    }
    into.set(key, { value, provenance });
}

const STRATEGY_KINDS: ReadonlySet<string> = new Set(REASONING_STRATEGY_KINDS);

/**
 * Composes an ordered manifest into one frozen registry.
 *
 * Registration order is the manifest's order, and within a contribution the
 * declared array order. Map preserves insertion order, so every `list*Keys()`
 * is a deterministic witness of that ordering.
 */
export function composeTrustRegistry(contributions: readonly TrustContribution[]): TrustRegistry {
    const decisionClasses = new Map<string, Entry<DecisionClassDefinitionV1>>();
    const strategies = new Map<string, Entry<ReasoningStrategyV1>>();
    const privacyPolicies = new Map<string, Entry<PrivacyPolicyV1>>();
    const validationPolicies = new Map<string, Entry<ValidationPolicyV1>>();
    const seenContributionIds = new Set<string>();
    const order: string[] = [];

    // ---- 1. registration, in manifest order --------------------------------
    contributions.forEach((contribution, index) => {
        if (!contribution.id || !contribution.id.trim()) {
            throw new TrustRegistryCompositionError(`Contribution at position ${index} declared no id.`);
        }
        if (seenContributionIds.has(contribution.id)) {
            throw new TrustRegistryCompositionError(
                `Duplicate contribution id "${contribution.id}" at position ${index}. ` +
                    `Each contributor appears in the manifest exactly once.`,
            );
        }
        seenContributionIds.add(contribution.id);
        order.push(contribution.id);

        const provenance: TrustRegistryProvenance = {
            contribution_id: contribution.id,
            owner: contribution.owner,
            order: index,
        };

        // Doctrine: privacy policies are platform-owned. A capability that
        // declared one would be implementing privacy rather than referencing
        // it, which `privacy-runtime.md` forbids.
        if (contribution.privacyPolicies?.length && contribution.owner !== "platform") {
            throw new TrustRegistryCompositionError(
                `Contribution "${contribution.id}" is capability-owned and declared ${contribution.privacyPolicies.length} ` +
                    `privacy policy(ies). Privacy policies are platform-owned; capabilities reference them by key.`,
            );
        }

        for (const policy of contribution.privacyPolicies ?? []) {
            insert(privacyPolicies, "privacy_policy", policy.key, policy, provenance);
        }
        for (const definition of contribution.decisionClasses ?? []) {
            insert(decisionClasses, "decision_class", definition.key, definition, provenance);
        }
        for (const policy of contribution.validationPolicies ?? []) {
            insert(validationPolicies, "validation_policy", policy.key, policy, provenance);
        }
        for (const strategy of contribution.reasoningStrategies ?? []) {
            insert(strategies, "reasoning_strategy", strategy.key, strategy, provenance);
        }
    });

    // ---- 2. referential integrity, once everything is registered -----------
    // Deferred deliberately: a manifest may legitimately declare a strategy
    // before the class it satisfies. What may NOT survive composition is a
    // reference that resolves to nothing.
    const strategiesByClass = new Map<string, ReasoningStrategyV1[]>();
    for (const [strategyKey, entry] of strategies) {
        const classKey = entry.value.decision_class_key;
        if (!decisionClasses.has(classKey)) {
            throw new TrustRegistryCompositionError(
                `Reasoning strategy "${strategyKey}" (from "${entry.provenance.contribution_id}") satisfies ` +
                    `Decision Class "${classKey}", which is not registered.`,
            );
        }
        if (!STRATEGY_KINDS.has(entry.value.kind)) {
            throw new TrustRegistryCompositionError(
                `Reasoning strategy "${strategyKey}" declares kind "${entry.value.kind}", which is not on the ` +
                    `escalation ladder. Known kinds: ${[...STRATEGY_KINDS].join(", ")}.`,
            );
        }
        const bucket = strategiesByClass.get(classKey);
        if (bucket) bucket.push(entry.value);
        else strategiesByClass.set(classKey, [entry.value]);
    }

    for (const [classKey, entry] of decisionClasses) {
        const definition = entry.value;
        if (!privacyPolicies.has(definition.privacy_policy_key)) {
            throw new TrustRegistryCompositionError(
                `Decision Class "${classKey}" (from "${entry.provenance.contribution_id}") references privacy policy ` +
                    `"${definition.privacy_policy_key}", which is not registered.`,
            );
        }
        if (!validationPolicies.has(definition.validation_policy_key)) {
            throw new TrustRegistryCompositionError(
                `Decision Class "${classKey}" (from "${entry.provenance.contribution_id}") references validation policy ` +
                    `"${definition.validation_policy_key}", which is not registered.`,
            );
        }
        if (!strategiesByClass.has(classKey)) {
            throw new TrustRegistryCompositionError(
                `Decision Class "${classKey}" (from "${entry.provenance.contribution_id}") has no registered reasoning ` +
                    `strategy. A class with no strategy can only ever refuse.`,
            );
        }
        for (const preferred of definition.strategy_preference) {
            if (!STRATEGY_KINDS.has(preferred)) {
                throw new TrustRegistryCompositionError(
                    `Decision Class "${classKey}" prefers strategy kind "${preferred}", which is not on the escalation ` +
                        `ladder. Known kinds: ${[...STRATEGY_KINDS].join(", ")}.`,
                );
            }
        }
    }

    // ---- 3. freeze ---------------------------------------------------------
    const compositionOrder = Object.freeze([...order]);
    const decisionClassKeys = Object.freeze([...decisionClasses.keys()]);
    const privacyPolicyKeys = Object.freeze([...privacyPolicies.keys()]);
    const validationPolicyKeys = Object.freeze([...validationPolicies.keys()]);
    const strategyKeys = Object.freeze([...strategies.keys()]);

    const frozenStrategiesByClass = new Map<string, readonly ReasoningStrategyV1[]>();
    for (const [classKey, list] of strategiesByClass) {
        frozenStrategiesByClass.set(classKey, Object.freeze([...list]));
    }
    const NO_STRATEGIES: readonly ReasoningStrategyV1[] = Object.freeze([]);

    function required<T>(value: T | null, kind: TrustRegistryKind, key: string): T {
        if (value === null) {
            throw new TrustRegistryLookupError(`No ${kind} is registered for key "${key}".`);
        }
        return value;
    }

    const registry: TrustRegistry = {
        composition_order: compositionOrder,

        getDecisionClass: (key) => decisionClasses.get(key)?.value ?? null,
        requireDecisionClass(key) {
            return required(this.getDecisionClass(key), "decision_class", key);
        },
        listDecisionClassKeys: () => decisionClassKeys,

        getPrivacyPolicy: (key) => privacyPolicies.get(key)?.value ?? null,
        requirePrivacyPolicy(key) {
            return required(this.getPrivacyPolicy(key), "privacy_policy", key);
        },
        listPrivacyPolicyKeys: () => privacyPolicyKeys,

        getValidationPolicy: (key) => validationPolicies.get(key)?.value ?? null,
        requireValidationPolicy(key) {
            return required(this.getValidationPolicy(key), "validation_policy", key);
        },
        listValidationPolicyKeys: () => validationPolicyKeys,

        listStrategiesForDecisionClass: (decisionClassKey) =>
            frozenStrategiesByClass.get(decisionClassKey) ?? NO_STRATEGIES,
        listStrategyKeys: () => strategyKeys,

        provenanceOf(kind, key) {
            switch (kind) {
                case "decision_class":
                    return decisionClasses.get(key)?.provenance ?? null;
                case "reasoning_strategy":
                    return strategies.get(key)?.provenance ?? null;
                case "privacy_policy":
                    return privacyPolicies.get(key)?.provenance ?? null;
                case "validation_policy":
                    return validationPolicies.get(key)?.provenance ?? null;
                default:
                    return null;
            }
        },
    };

    return Object.freeze(registry);
}
