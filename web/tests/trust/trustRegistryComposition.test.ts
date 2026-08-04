/**
 * Phase 0 Slice 0.2 — Trust Registry composition and collision safety.
 *
 * One deterministic composition model for every Trust runtime registry. This
 * suite drives the SAME `composeTrustRegistry` the composition root uses, over
 * synthetic manifests, so it proves the production loop rather than a copy of
 * it — and it never mutates the production registry, which has no mutation API
 * to begin with.
 *
 * The distinction this suite is most careful about: a malformed MANIFEST is a
 * programming defect and throws at composition, while an unregistered key at
 * REQUEST time stays an operational condition that becomes a refusal Decision
 * Package. Collapsing those two would break the refusal matrix.
 *
 * @see docs/platform/planning/trust-adoption/TRUST-PLATFORM-ADOPTION-ASSESSMENT.md — Slice 0.2
 */

import { describe, expect, it } from "vitest";

import { ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/contribution";
import { ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY } from "@/lib/trust/capabilities/attentionSuggestionEnrichment/keys";
import type { DecisionClassDefinitionV1 } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { listDecisionClassKeys, resolveDecisionClass } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { PLATFORM_PRIVACY_POLICY_CONTRIBUTION } from "@/lib/trust/platform/platformPrivacyPolicies";
import { resolvePrivacyPolicy } from "@/lib/trust/privacy/privacyEngine";
import type { PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import type { ReasoningOutcome, ReasoningStrategyV1 } from "@/lib/trust/reasoning/reasoningStrategy";
import {
    TrustRegistryCompositionError,
    TrustRegistryLookupError,
    composeTrustRegistry,
} from "@/lib/trust/registry/composeTrustRegistry";
import { TRUST_CONTRIBUTION_MANIFEST, TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";
import type { TrustContribution } from "@/lib/trust/registry/trustRegistryTypes";
import type { ValidationPolicyV1 } from "@/lib/trust/validation/validationOrchestrator";

// ---------------------------------------------------------------------------
// Synthetic building blocks. None of these is registered in production.
// ---------------------------------------------------------------------------

const SHARED_POLICY_KEY = "synthetic_shared_minimization_v1";

function privacyPolicy(key = SHARED_POLICY_KEY): PrivacyPolicyV1 {
    return { key, pii_mode: "strict", prohibited_classes: ["financial"] };
}

function validationPolicy(key: string): ValidationPolicyV1 {
    return {
        key,
        version: "1.0.0",
        callOuts: [
            {
                owner: "certification/synthetic",
                validator_key: `${key}_validator`,
                invoke: () => ({ passed: true, detail: "synthetic ok" }),
            },
        ],
    };
}

function decisionClass(key: string, overrides: Partial<DecisionClassDefinitionV1> = {}): DecisionClassDefinitionV1 {
    return {
        key,
        risk_tier: "convenience",
        required_information: [],
        knowledge_categories: [],
        privacy_policy_key: SHARED_POLICY_KEY,
        validation_policy_key: `${key}_validation_v1`,
        strategy_preference: ["deterministic"],
        trust_threshold: 0.5,
        review_requirement: "operator_review",
        learning_policy_key: "none_v1",
        economic_policy: { max_latency_ms: 1_000, max_escalation_level: 0 },
        requires_allowed_feature: null,
        ...overrides,
    };
}

function strategy(key: string, decisionClassKey: string): ReasoningStrategyV1 {
    return {
        key,
        kind: "deterministic",
        version: "1.0.0",
        decision_class_key: decisionClassKey,
        reason: (): ReasoningOutcome => ({
            ok: true,
            proposal: {
                recommendation: {},
                confidence: 1,
                evidence: [],
                explanation: "synthetic",
                remaining_uncertainty: [],
            },
        }),
    };
}

/** A complete, well-formed capability that references the shared platform policy. */
function capability(name: string): TrustContribution {
    return {
        id: `capability.${name}`,
        owner: "capability",
        decisionClasses: [decisionClass(name)],
        validationPolicies: [validationPolicy(`${name}_validation_v1`)],
        reasoningStrategies: [strategy(`${name}_deterministic`, name)],
    };
}

const PLATFORM: TrustContribution = {
    id: "platform.synthetic",
    owner: "platform",
    privacyPolicies: [privacyPolicy()],
};

// ---------------------------------------------------------------------------
// Duplicate registration — one proof per registry
// ---------------------------------------------------------------------------

describe("duplicate registration fails loudly, per registry", () => {
    it("duplicate decision class key", () => {
        const a = capability("alpha");
        const clash: TrustContribution = {
            id: "capability.clashing_class",
            owner: "capability",
            decisionClasses: [decisionClass("alpha", { validation_policy_key: "alpha_validation_v1" })],
        };

        expect(() => composeTrustRegistry([PLATFORM, a, clash])).toThrow(TrustRegistryCompositionError);
        expect(() => composeTrustRegistry([PLATFORM, a, clash])).toThrow(
            /Duplicate decision_class key "alpha".*capability\.alpha.*capability\.clashing_class/s,
        );
    });

    it("duplicate reasoning strategy key", () => {
        const a = capability("alpha");
        const clash: TrustContribution = {
            id: "capability.clashing_strategy",
            owner: "capability",
            reasoningStrategies: [strategy("alpha_deterministic", "alpha")],
        };

        expect(() => composeTrustRegistry([PLATFORM, a, clash])).toThrow(
            /Duplicate reasoning_strategy key "alpha_deterministic"/,
        );
    });

    it("duplicate privacy policy key", () => {
        const second: TrustContribution = {
            id: "platform.synthetic_again",
            owner: "platform",
            privacyPolicies: [privacyPolicy()],
        };

        expect(() => composeTrustRegistry([PLATFORM, second, capability("alpha")])).toThrow(
            /Duplicate privacy_policy key "synthetic_shared_minimization_v1"/,
        );
    });

    it("duplicate validation policy key", () => {
        const a = capability("alpha");
        const clash: TrustContribution = {
            id: "capability.clashing_validation",
            owner: "capability",
            validationPolicies: [validationPolicy("alpha_validation_v1")],
        };

        expect(() => composeTrustRegistry([PLATFORM, a, clash])).toThrow(
            /Duplicate validation_policy key "alpha_validation_v1"/,
        );
    });

    it("duplicate contribution id", () => {
        expect(() => composeTrustRegistry([PLATFORM, capability("alpha"), capability("alpha")])).toThrow(
            /Duplicate contribution id "capability\.alpha"/,
        );
    });

    it("a collision names both contributors and both positions", () => {
        let message = "";
        try {
            composeTrustRegistry([PLATFORM, capability("alpha"), { ...capability("alpha"), id: "capability.other" }]);
        } catch (e) {
            message = (e as Error).message;
        }
        // An unactionable collision message is worse than none.
        expect(message).toContain("capability.alpha");
        expect(message).toContain("capability.other");
        expect(message).toContain("position 1");
        expect(message).toContain("position 2");
    });
});

// ---------------------------------------------------------------------------
// Unknown references — dangling manifest wiring
// ---------------------------------------------------------------------------

describe("unknown references fail loudly at composition", () => {
    it("a decision class referencing an unregistered privacy policy", () => {
        const broken: TrustContribution = {
            id: "capability.broken_privacy",
            owner: "capability",
            decisionClasses: [decisionClass("beta", { privacy_policy_key: "no_such_policy" })],
            validationPolicies: [validationPolicy("beta_validation_v1")],
            reasoningStrategies: [strategy("beta_deterministic", "beta")],
        };

        expect(() => composeTrustRegistry([PLATFORM, broken])).toThrow(
            /references privacy policy "no_such_policy", which is not registered/,
        );
    });

    it("a decision class referencing an unregistered validation policy", () => {
        const broken: TrustContribution = {
            id: "capability.broken_validation",
            owner: "capability",
            decisionClasses: [decisionClass("beta", { validation_policy_key: "no_such_policy" })],
            reasoningStrategies: [strategy("beta_deterministic", "beta")],
        };

        expect(() => composeTrustRegistry([PLATFORM, broken])).toThrow(
            /references validation policy "no_such_policy", which is not registered/,
        );
    });

    it("a strategy satisfying an unregistered decision class", () => {
        const broken: TrustContribution = {
            id: "capability.orphan_strategy",
            owner: "capability",
            reasoningStrategies: [strategy("orphan_deterministic", "no_such_class")],
        };

        expect(() => composeTrustRegistry([PLATFORM, broken])).toThrow(
            /satisfies Decision Class "no_such_class", which is not registered/,
        );
    });

    it("a decision class with no strategy at all", () => {
        const broken: TrustContribution = {
            id: "capability.strategyless",
            owner: "capability",
            decisionClasses: [decisionClass("beta")],
            validationPolicies: [validationPolicy("beta_validation_v1")],
        };

        expect(() => composeTrustRegistry([PLATFORM, broken])).toThrow(
            /has no registered reasoning strategy\. A class with no strategy can only ever refuse/,
        );
    });

    it("a decision class preferring a strategy kind that is not on the ladder", () => {
        const broken: TrustContribution = {
            id: "capability.bad_preference",
            owner: "capability",
            decisionClasses: [decisionClass("beta", { strategy_preference: ["detrministic"] })],
            validationPolicies: [validationPolicy("beta_validation_v1")],
            reasoningStrategies: [strategy("beta_deterministic", "beta")],
        };

        expect(() => composeTrustRegistry([PLATFORM, broken])).toThrow(
            /prefers strategy kind "detrministic", which is not on the escalation ladder/,
        );
    });

    it("a capability contributing a platform-owned privacy policy", () => {
        const overreaching: TrustContribution = {
            ...capability("alpha"),
            privacyPolicies: [privacyPolicy("capability_owned_policy_v1")],
        };

        expect(() => composeTrustRegistry([PLATFORM, overreaching])).toThrow(
            /is capability-owned and declared 1 privacy policy\(ies\)\. Privacy policies are platform-owned/,
        );
    });
});

// ---------------------------------------------------------------------------
// Lookup semantics — loud where absence is a defect, quiet where it is operational
// ---------------------------------------------------------------------------

describe("lookup semantics", () => {
    const registry = composeTrustRegistry([PLATFORM, capability("alpha")]);

    it("require* throws on an unknown key", () => {
        expect(() => registry.requireDecisionClass("nope")).toThrow(TrustRegistryLookupError);
        expect(() => registry.requirePrivacyPolicy("nope")).toThrow(/No privacy_policy is registered for key "nope"/);
        expect(() => registry.requireValidationPolicy("nope")).toThrow(
            /No validation_policy is registered for key "nope"/,
        );
    });

    it("get* returns null on an unknown key, because the runtime must refuse rather than throw", () => {
        expect(registry.getDecisionClass("nope")).toBeNull();
        expect(registry.getPrivacyPolicy("nope")).toBeNull();
        expect(registry.getValidationPolicy("nope")).toBeNull();
        expect(registry.listStrategiesForDecisionClass("nope")).toEqual([]);
    });

    it("the runtime's own resolvers keep the operational contract", () => {
        // If these ever threw, `refused_unsupported_class` and `refused_policy`
        // would become exceptions and the refusal matrix would break.
        expect(resolveDecisionClass("definitely_not_registered")).toBeNull();
        expect(resolvePrivacyPolicy("definitely_not_registered")).toBeNull();
    });

    it("records provenance for every registered entry", () => {
        expect(registry.provenanceOf("privacy_policy", SHARED_POLICY_KEY)).toEqual({
            contribution_id: "platform.synthetic",
            owner: "platform",
            order: 0,
        });
        expect(registry.provenanceOf("decision_class", "alpha")).toEqual({
            contribution_id: "capability.alpha",
            owner: "capability",
            order: 1,
        });
        expect(registry.provenanceOf("decision_class", "nope")).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Immutability
// ---------------------------------------------------------------------------

describe("the registry is immutable after composition", () => {
    const registry = composeTrustRegistry([PLATFORM, capability("alpha")]);

    it("the registry object is frozen", () => {
        expect(Object.isFrozen(registry)).toBe(true);
        expect(Object.isFrozen(TRUST_REGISTRY)).toBe(true);
    });

    it("exposes no registration or mutation API", () => {
        for (const forbidden of ["register", "set", "add", "put", "delete", "clear", "remove"]) {
            expect(Object.keys(registry)).not.toContain(forbidden);
        }
    });

    it("assigning to the registry throws", () => {
        expect(() => {
            (registry as unknown as Record<string, unknown>).getDecisionClass = () => null;
        }).toThrow(TypeError);
        expect(() => {
            (registry as unknown as Record<string, unknown>).somethingNew = 1;
        }).toThrow(TypeError);
    });

    it("returned collections are frozen, so a caller cannot mutate the registry through them", () => {
        const keys = registry.listDecisionClassKeys();
        expect(Object.isFrozen(keys)).toBe(true);
        expect(() => (keys as string[]).push("injected")).toThrow(TypeError);

        const strategies = registry.listStrategiesForDecisionClass("alpha");
        expect(Object.isFrozen(strategies)).toBe(true);
        expect(() => (strategies as ReasoningStrategyV1[]).push(strategy("injected", "alpha"))).toThrow(TypeError);

        expect(Object.isFrozen(registry.composition_order)).toBe(true);
        expect(Object.isFrozen(TRUST_REGISTRY.listDecisionClassKeys())).toBe(true);
    });

    it("the production manifest is frozen too", () => {
        expect(Object.isFrozen(TRUST_CONTRIBUTION_MANIFEST)).toBe(true);
        expect(() => (TRUST_CONTRIBUTION_MANIFEST as TrustContribution[]).push(capability("late"))).toThrow(TypeError);
    });
});

// ---------------------------------------------------------------------------
// Determinism and the absence of import-order side effects
// ---------------------------------------------------------------------------

describe("composition order is deterministic", () => {
    it("composition_order is the manifest order", () => {
        const registry = composeTrustRegistry([PLATFORM, capability("alpha"), capability("gamma")]);
        expect(registry.composition_order).toEqual(["platform.synthetic", "capability.alpha", "capability.gamma"]);
    });

    it("key listings follow registration order, not hash order", () => {
        const registry = composeTrustRegistry([
            PLATFORM,
            capability("zulu"),
            capability("alpha"),
            capability("mike"),
        ]);
        // Alphabetical ordering here would prove the opposite of what we want.
        expect(registry.listDecisionClassKeys()).toEqual(["zulu", "alpha", "mike"]);
        expect(registry.listStrategyKeys()).toEqual(["zulu_deterministic", "alpha_deterministic", "mike_deterministic"]);
    });

    it("the same manifest composes identically every time", () => {
        const manifest = [PLATFORM, capability("alpha"), capability("gamma")];
        const a = composeTrustRegistry(manifest);
        const b = composeTrustRegistry(manifest);

        expect(a.composition_order).toEqual(b.composition_order);
        expect(a.listDecisionClassKeys()).toEqual(b.listDecisionClassKeys());
        expect(a.listStrategyKeys()).toEqual(b.listStrategyKeys());
        expect(a.listPrivacyPolicyKeys()).toEqual(b.listPrivacyPolicyKeys());
        expect(a.listValidationPolicyKeys()).toEqual(b.listValidationPolicyKeys());
    });

    it("a permuted manifest composes in the permuted order — order comes from the manifest, nothing else", () => {
        const forward = composeTrustRegistry([PLATFORM, capability("alpha"), capability("gamma")]);
        const reversed = composeTrustRegistry([PLATFORM, capability("gamma"), capability("alpha")]);

        expect(forward.listDecisionClassKeys()).toEqual(["alpha", "gamma"]);
        expect(reversed.listDecisionClassKeys()).toEqual(["gamma", "alpha"]);
    });

    it("no import-order side effect: the production registry is a pure function of its manifest", () => {
        // Re-composing the SAME manifest reproduces the singleton exactly. If any
        // module registered itself as a side effect of being imported, the
        // singleton would carry entries this recomposition does not.
        const recomposed = composeTrustRegistry(TRUST_CONTRIBUTION_MANIFEST);

        expect(recomposed.composition_order).toEqual(TRUST_REGISTRY.composition_order);
        expect(recomposed.listDecisionClassKeys()).toEqual(TRUST_REGISTRY.listDecisionClassKeys());
        expect(recomposed.listStrategyKeys()).toEqual(TRUST_REGISTRY.listStrategyKeys());
        expect(recomposed.listPrivacyPolicyKeys()).toEqual(TRUST_REGISTRY.listPrivacyPolicyKeys());
        expect(recomposed.listValidationPolicyKeys()).toEqual(TRUST_REGISTRY.listValidationPolicyKeys());
    });
});

// ---------------------------------------------------------------------------
// Independent capabilities and shared platform components
// ---------------------------------------------------------------------------

describe("capabilities compose independently", () => {
    it("two synthetic capabilities register without touching one another", () => {
        const registry = composeTrustRegistry([PLATFORM, capability("alpha"), capability("gamma")]);

        expect(registry.listDecisionClassKeys()).toEqual(["alpha", "gamma"]);
        expect(registry.getDecisionClass("alpha")?.validation_policy_key).toBe("alpha_validation_v1");
        expect(registry.getDecisionClass("gamma")?.validation_policy_key).toBe("gamma_validation_v1");
        expect(registry.listStrategiesForDecisionClass("alpha").map((s) => s.key)).toEqual(["alpha_deterministic"]);
        expect(registry.listStrategiesForDecisionClass("gamma").map((s) => s.key)).toEqual(["gamma_deterministic"]);
        expect(registry.provenanceOf("decision_class", "alpha")?.contribution_id).toBe("capability.alpha");
        expect(registry.provenanceOf("decision_class", "gamma")?.contribution_id).toBe("capability.gamma");
    });

    it("either capability composes on its own — neither depends on the other", () => {
        const alphaOnly = composeTrustRegistry([PLATFORM, capability("alpha")]);
        const gammaOnly = composeTrustRegistry([PLATFORM, capability("gamma")]);

        expect(alphaOnly.listDecisionClassKeys()).toEqual(["alpha"]);
        expect(gammaOnly.listDecisionClassKeys()).toEqual(["gamma"]);
    });

    it("one shared platform component is reused by both, registered once", () => {
        const registry = composeTrustRegistry([PLATFORM, capability("alpha"), capability("gamma")]);

        // Registered exactly once…
        expect(registry.listPrivacyPolicyKeys()).toEqual([SHARED_POLICY_KEY]);
        expect(registry.provenanceOf("privacy_policy", SHARED_POLICY_KEY)?.owner).toBe("platform");

        // …and referenced by both capabilities, which resolve to the SAME object.
        const fromAlpha = registry.getPrivacyPolicy(registry.getDecisionClass("alpha")!.privacy_policy_key);
        const fromGamma = registry.getPrivacyPolicy(registry.getDecisionClass("gamma")!.privacy_policy_key);
        expect(fromAlpha).not.toBeNull();
        expect(fromAlpha).toBe(fromGamma);
    });

    it("sharing is by reference — a second registration of the same key is still a collision", () => {
        const redeclaring: TrustContribution = {
            id: "platform.duplicate_shared",
            owner: "platform",
            privacyPolicies: [privacyPolicy()],
        };
        expect(() => composeTrustRegistry([PLATFORM, capability("alpha"), redeclaring])).toThrow(
            TrustRegistryCompositionError,
        );
    });
});

// ---------------------------------------------------------------------------
// The production manifest itself
// ---------------------------------------------------------------------------

describe("the production composition root", () => {
    it("composes the declared manifest, platform before capabilities", () => {
        expect(TRUST_REGISTRY.composition_order).toEqual([
            "platform.privacy_policies",
            "capability.attention_suggestion_enrichment",
        ]);
        expect(TRUST_CONTRIBUTION_MANIFEST.map((c) => c.id)).toEqual([...TRUST_REGISTRY.composition_order]);
        expect(TRUST_CONTRIBUTION_MANIFEST.map((c) => c.owner)).toEqual(["platform", "capability"]);
    });

    it("still registers exactly one Decision Class, unchanged from V1", () => {
        expect(TRUST_REGISTRY.listDecisionClassKeys()).toEqual([ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY]);
        expect(listDecisionClassKeys()).toEqual([ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY]);
    });

    it("ownership follows doctrine: the privacy policy is platform-owned, the rest capability-owned", () => {
        expect(PLATFORM_PRIVACY_POLICY_CONTRIBUTION.owner).toBe("platform");
        expect(PLATFORM_PRIVACY_POLICY_CONTRIBUTION.decisionClasses).toBeUndefined();
        expect(ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION.owner).toBe("capability");
        expect(ATTENTION_SUGGESTION_ENRICHMENT_CONTRIBUTION.privacyPolicies).toBeUndefined();

        expect(TRUST_REGISTRY.provenanceOf("privacy_policy", "attention_suggestion_minimization_v1")?.owner).toBe(
            "platform",
        );
        expect(TRUST_REGISTRY.provenanceOf("decision_class", ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY)?.owner).toBe(
            "capability",
        );
    });

    it("the registered class resolves every reference it declares", () => {
        const cls = TRUST_REGISTRY.requireDecisionClass(ATTENTION_SUGGESTION_ENRICHMENT_CLASS_KEY);
        expect(TRUST_REGISTRY.requirePrivacyPolicy(cls.privacy_policy_key).key).toBe(cls.privacy_policy_key);
        expect(TRUST_REGISTRY.requireValidationPolicy(cls.validation_policy_key).key).toBe(cls.validation_policy_key);
        expect(TRUST_REGISTRY.listStrategiesForDecisionClass(cls.key).length).toBeGreaterThan(0);
    });
});
