/**
 * Trust Registry — contribution and registry contracts.
 *
 * One composition model for every Trust runtime registry. A contribution is a
 * DECLARATION of what a contributor adds; it executes nothing and registers
 * nothing by itself. Composition is performed once, by the composition root,
 * over an explicitly ordered manifest.
 *
 * Ownership follows doctrine, not convenience:
 *
 *   - Privacy policies are **platform-owned**
 *     (`privacy-runtime.md` §Privacy Policies — "Policies are platform-owned.
 *     Decision Contracts reference policies rather than implementation.").
 *   - Decision Classes, Reasoning Strategies and Validation Policies are
 *     **capability-contributed**
 *     (`trust-runtime.md` §Extension Points).
 *
 * Every import here is type-only, so this module adds no runtime edge and
 * cannot participate in an import cycle.
 *
 * @see docs/platform/trust/trust-runtime.md — Extension Points
 * @see docs/platform/trust/privacy-runtime.md — Privacy Policies
 */

import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

/**
 * Who owns a contribution.
 *
 * `platform` — owned by the Trust Platform itself and shared by reference.
 * `capability` — owned by the capability that submits the Decision Contract.
 *
 * Ownership is declared, never inferred, and the composition root records it so
 * a later reader can tell shared infrastructure from capability specifics
 * without reading every entry.
 */
export const TRUST_CONTRIBUTION_OWNERS = ["platform", "capability"] as const;
export type TrustContributionOwner = (typeof TRUST_CONTRIBUTION_OWNERS)[number];

/**
 * One contributor's declared entries.
 *
 * A contribution never mutates a registry. It is inert data handed to
 * {@link composeTrustRegistry}, which is what makes composition order a
 * property of the manifest rather than of whichever module imported first.
 */
export type TrustContribution = {
    /** Unique contributor identity. Duplicates fail composition. */
    readonly id: string;
    readonly owner: TrustContributionOwner;
    readonly decisionClasses?: readonly DecisionClassDefinitionV1[];
    readonly reasoningStrategies?: readonly ReasoningStrategyV1[];
    /** Platform-owned by doctrine; a capability contribution declaring one fails composition. */
    readonly privacyPolicies?: readonly PrivacyPolicyV1[];
    readonly validationPolicies?: readonly ValidationPolicyV1[];
};

/** Where an entry came from. Recorded so a collision can name both sides. */
export type TrustRegistryProvenance = {
    readonly contribution_id: string;
    readonly owner: TrustContributionOwner;
    /** Position in the composed manifest, 0-based. Deterministic. */
    readonly order: number;
};

/**
 * The composed registry.
 *
 * Read-only by construction: there is no `register`, `set` or `add`, the object
 * is frozen, and every returned collection is frozen. The only way to change
 * what the runtime resolves is to change the manifest and re-compose.
 *
 * Two lookup shapes, deliberately:
 *
 *   - `get*` returns `null` for an absent key. The runtime uses these, because
 *     an unregistered Decision Class is an OPERATIONAL condition that must
 *     become a refusal Decision Package, never an exception (Decision 020 and
 *     the refusal matrix).
 *   - `require*` throws {@link TrustRegistryLookupError}. Used where absence is
 *     a PROGRAMMING error rather than an operational one.
 */
export type TrustRegistry = {
    /** Contribution ids in composed order. The determinism witness. */
    readonly composition_order: readonly string[];

    getDecisionClass(key: string): DecisionClassDefinitionV1 | null;
    requireDecisionClass(key: string): DecisionClassDefinitionV1;
    listDecisionClassKeys(): readonly string[];

    getPrivacyPolicy(key: string): PrivacyPolicyV1 | null;
    requirePrivacyPolicy(key: string): PrivacyPolicyV1;
    listPrivacyPolicyKeys(): readonly string[];

    getValidationPolicy(key: string): ValidationPolicyV1 | null;
    requireValidationPolicy(key: string): ValidationPolicyV1;
    listValidationPolicyKeys(): readonly string[];

    /** Strategies registered for a Decision Class, in composed order. */
    listStrategiesForDecisionClass(decisionClassKey: string): readonly ReasoningStrategyV1[];
    listStrategyKeys(): readonly string[];

    /** Where an entry came from, by registry kind and key. */
    provenanceOf(kind: TrustRegistryKind, key: string): TrustRegistryProvenance | null;
};

export const TRUST_REGISTRY_KINDS = [
    "decision_class",
    "reasoning_strategy",
    "privacy_policy",
    "validation_policy",
] as const;

export type TrustRegistryKind = (typeof TRUST_REGISTRY_KINDS)[number];
