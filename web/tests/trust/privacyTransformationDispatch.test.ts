/**
 * Phase 2.1 — Privacy Transformation Execution Foundation.
 *
 * Proves the transformation contract is truthful: every declared transformation
 * routes through explicit dispatch, and each one is implemented,
 * compatibility-preserved with a stated reason, or refused fail-closed.
 *
 * Also proves the slice changed nothing it was not meant to change — the three
 * registered decision classes keep exactly the permitted information they had
 * before dispatch existed.
 */

import { readFileSync } from "fs";
import { join } from "path";

import { describe, expect, it } from "vitest";

import {
    INFORMATION_CLASSES,
    INFORMATION_CLASS_TRANSFORMATIONS,
    classifyElements,
    type InformationClass,
    type TransformationPolicy,
} from "@/lib/trust/classification/informationClasses";
import { ATTENTION_SUGGESTION_SEMANTIC_MAP } from "@/lib/trust/consumers/attentionSuggestionEnrichment";
import { PROCESSING_SOURCE_CLASSIFICATION_SEMANTIC_MAP } from "@/lib/trust/consumers/processingSourceClassification";
import { PROCESSING_IDENTITY_SEMANTIC_MAP } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/semanticMap";
import {
    ATTENTION_SUGGESTION_MINIMIZATION_V1,
    PROCESSING_IDENTITY_MINIMIZATION_V1,
    PROCESSING_SOURCE_MINIMIZATION_V1,
} from "@/lib/trust/platform/platformPrivacyPolicies";
import { transformForReasoning, type PrivacyPolicyV1 } from "@/lib/trust/privacy/privacyEngine";
import {
    PRIVACY_TRANSFORM_UNSUPPORTED,
    TRANSFORMATION_RULES,
    applyTransformation,
    isUnsupportedTransformation,
} from "@/lib/trust/privacy/transformationDispatch";

const WEB_ROOT = process.cwd();

function policyFor(prohibited: readonly InformationClass[] = []): PrivacyPolicyV1 {
    return { key: "test_policy_v1", pii_mode: "strict", prohibited_classes: prohibited };
}

/** Classify one element AS a given class, bypassing the semantic-map default. */
function transformOneAs(cls: InformationClass, value: unknown, prohibited: readonly InformationClass[] = []) {
    return transformForReasoning({
        classification: classifyElements({ subject: value }, { subject: cls }),
        policy: policyFor(prohibited),
        knowledge: [],
    });
}

// ---------------------------------------------------------------------------
// 1. Every transformation routes through explicit dispatch
// ---------------------------------------------------------------------------

describe("P2.1-1 — explicit dispatch, no silent pass-through", () => {
    it("the rule table covers every declared transformation, with no default branch", () => {
        const declared = new Set<TransformationPolicy>(Object.values(INFORMATION_CLASS_TRANSFORMATIONS));
        declared.add("withhold"); // declared in the vocabulary; no class maps to it today

        for (const t of declared) {
            expect(TRANSFORMATION_RULES[t], `transformation ${t} has no dispatch rule`).toBeDefined();
        }

        // Total the other way too: no rule exists for a transformation that is
        // not in the vocabulary.
        const vocabulary = new Set<string>([...declared]);
        for (const key of Object.keys(TRANSFORMATION_RULES)) {
            expect(vocabulary.has(key), `dispatch rule ${key} is not a declared transformation`).toBe(true);
        }
    });

    it("every transformation resolves to exactly one of three dispositions", () => {
        for (const [name, rule] of Object.entries(TRANSFORMATION_RULES)) {
            expect(["admitted", "withheld", "refused"], name).toContain(rule.disposition);
            expect(["implemented", "compatibility_preserved", "unsupported"], name).toContain(rule.support);
            // Every rule states WHY. A disposition without a reason is how a
            // no-op survived review the first time.
            expect(rule.rationale.length, name).toBeGreaterThan(20);
        }
    });

    it("a refused disposition is always `unsupported`, and never carries a value", () => {
        for (const [name, rule] of Object.entries(TRANSFORMATION_RULES)) {
            if (rule.disposition !== "refused") continue;
            expect(rule.support, name).toBe("unsupported");
            const outcome = applyTransformation({ transformation: name as TransformationPolicy, value: "SECRET" });
            expect(outcome.disposition).toBe("refused");
            expect(JSON.stringify(outcome)).not.toContain("SECRET");
        }
    });

    it("every information class's declared transformation has a dispatch decision", () => {
        for (const cls of INFORMATION_CLASSES) {
            const t = INFORMATION_CLASS_TRANSFORMATIONS[cls];
            expect(TRANSFORMATION_RULES[t], `class ${cls} → ${t}`).toBeDefined();
        }
    });
});

// ---------------------------------------------------------------------------
// 2. withhold still withholds
// ---------------------------------------------------------------------------

describe("P2.1-2 — withhold removes the element", () => {
    it("a withheld element never reaches the transformed context", () => {
        const classification = {
            elements: [
                { key: "kept", information_class: "operational" as const, transformation: "pass_through" as const, value: "keep-me" },
                { key: "dropped", information_class: "operational" as const, transformation: "withhold" as const, value: "DROP-ME" },
            ],
            classes_present: ["operational" as const],
        };
        const result = transformForReasoning({ classification, policy: policyFor(), knowledge: [] });

        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.context.transformed).toHaveProperty("kept");
        expect(result.context.transformed).not.toHaveProperty("dropped");
        expect(JSON.stringify(result.context.transformed)).not.toContain("DROP-ME");
    });

    it("a withheld element is still RECORDED — withholding is auditable, not invisible", () => {
        const classification = {
            elements: [
                { key: "dropped", information_class: "operational" as const, transformation: "withhold" as const, value: "DROP-ME" },
            ],
            classes_present: ["operational" as const],
        };
        const result = transformForReasoning({ classification, policy: policyFor(), knowledge: [] });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const record = result.context.transformations.find((t) => t.key === "dropped");
        expect(record?.disposition).toBe("withheld");
        expect(record?.support).toBe("implemented");
        // The record names the element; it must never carry the value.
        expect(JSON.stringify(result.context.transformations)).not.toContain("DROP-ME");
    });
});

// ---------------------------------------------------------------------------
// 3. tokenize cannot pass through (D-3)
// ---------------------------------------------------------------------------

describe("P2.1-3 — tokenize fails closed and never leaks", () => {
    it("tokenize is unsupported while no token vault exists", () => {
        expect(isUnsupportedTransformation("tokenize")).toBe(true);
        expect(TRANSFORMATION_RULES.tokenize.disposition).toBe("refused");
    });

    it("`identity` is declared tokenize, so an identity element is REFUSED, not admitted", () => {
        expect(INFORMATION_CLASS_TRANSFORMATIONS.identity).toBe("tokenize");

        const result = transformOneAs("identity", "Sarah Jones");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusal_code).toBe(PRIVACY_TRANSFORM_UNSUPPORTED);
    });

    it("a refused tokenize leaks the value nowhere — not in the context, detail or records", () => {
        const secret = "Sarah-Jones-555-0147-secret";
        const result = transformOneAs("identity", secret);
        expect(result.ok).toBe(false);
        if (result.ok) return;

        expect(JSON.stringify(result)).not.toContain(secret);
        expect(result.detail).not.toContain(secret);
    });

    it("an UNMAPPED element defaults to `identity` and is therefore refused, not silently admitted", () => {
        // classifyElements defaults an unmapped key to `identity`. Before this
        // slice that meant tokenize → no-op → the value was admitted raw. This
        // is the exact silent leak the dispatch closes.
        const classification = classifyElements({ surprise_field: "RAW-VALUE" }, {});
        expect(classification.elements[0]!.information_class).toBe("identity");

        const result = transformForReasoning({ classification, policy: policyFor(), knowledge: [] });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusal_code).toBe(PRIVACY_TRANSFORM_UNSUPPORTED);
        expect(JSON.stringify(result)).not.toContain("RAW-VALUE");
    });

    it("no token vault was introduced by this slice", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/privacy/transformationDispatch.ts"), "utf8");
        for (const forbidden of ["vault", "rehydrat", "detokeniz", "tokenStore", "token_store"]) {
            // The word may appear in prose explaining why there is none; it may
            // not appear as an identifier being called.
            expect(src).not.toMatch(new RegExp(`${forbidden}\\s*\\(`, "i"));
        }
    });
});

// ---------------------------------------------------------------------------
// 4. Unsupported transformations fail closed with a stable reason
// ---------------------------------------------------------------------------

describe("P2.1-4 — unsupported fails closed with a stable code", () => {
    it("the refusal code is a single stable constant", () => {
        expect(PRIVACY_TRANSFORM_UNSUPPORTED).toBe("PRIVACY_TRANSFORM_UNSUPPORTED");
    });

    it.each(["tokenize", "abstract", "aggregate"] as const)(
        "%s refuses the WHOLE transform rather than dropping the element",
        (transformation) => {
            const outcome = applyTransformation({ transformation, value: "x" });
            expect(outcome.disposition).toBe("refused");
            if (outcome.disposition !== "refused") return;
            expect(outcome.refusal_code).toBe(PRIVACY_TRANSFORM_UNSUPPORTED);
        },
    );

    it("one unsupported element refuses the whole transform, admitting nothing", () => {
        const classification = {
            elements: [
                { key: "safe", information_class: "operational" as const, transformation: "pass_through" as const, value: "ok" },
                { key: "unsafe", information_class: "relationship" as const, transformation: "abstract" as const, value: "SENSITIVE" },
            ],
            classes_present: ["operational" as const, "relationship" as const],
        };
        const result = transformForReasoning({ classification, policy: policyFor(), knowledge: [] });

        expect(result.ok).toBe(false);
        if (result.ok) return;
        // A partial context is worse than no context: reasoning would proceed on
        // information the contract did not declare.
        expect(JSON.stringify(result)).not.toContain("SENSITIVE");
    });

    it("a refusal still reports the records it produced, so it is diagnosable", () => {
        const result = transformOneAs("identity", "x");
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.transformations.length).toBeGreaterThan(0);
        expect(result.transformations.at(-1)?.disposition).toBe("refused");
        expect(result.transformations.at(-1)?.refusal_code).toBe(PRIVACY_TRANSFORM_UNSUPPORTED);
    });

    it("the prohibited-class refusal is checked FIRST and is unchanged", () => {
        // `financial` is declared `aggregate` (unsupported), but all three real
        // policies prohibit it outright — that refusal must still win, because
        // it is the stronger and older statement.
        const result = transformOneAs("financial", 1234, ["financial"]);
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.refusal_code).toBe("PRIVACY_PROHIBITED_CLASS");
    });
});

// ---------------------------------------------------------------------------
// 5. summarize is compatibility-preserved, and says so (D-4)
// ---------------------------------------------------------------------------

describe("P2.1-5 — summarize preserves sanctioned behaviour without claiming to summarize", () => {
    it("summarize admits its element unchanged", () => {
        const result = transformOneAs("communications", "the original body text");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.context.transformations[0]!.disposition).toBe("admitted");
    });

    it("summarize is recorded as compatibility_preserved, NOT implemented", () => {
        const result = transformOneAs("communications", "body");
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const record = result.context.transformations[0]!;
        expect(record.transformation).toBe("summarize");
        expect(record.support).toBe("compatibility_preserved");
        expect(record.support).not.toBe("implemented");
    });

    it("no provider-backed summarization was introduced", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/privacy/transformationDispatch.ts"), "utf8");
        for (const p of [/\bfetch\s*\(/, /@anthropic-ai/, /\bopenai\b/i, /axios/, /from\s+"node:https?"/]) {
            expect(src).not.toMatch(p);
        }
    });
});

// ---------------------------------------------------------------------------
// 6. Registered classes keep exactly the information they had
// ---------------------------------------------------------------------------

describe("P2.1-6 — registered decision classes retain their permitted information", () => {
    const CASES = [
        {
            name: "attention_suggestion_enrichment",
            map: ATTENTION_SUGGESTION_SEMANTIC_MAP,
            policy: ATTENTION_SUGGESTION_MINIMIZATION_V1,
            elements: {
                primary_reason_code: "no_contact_attempt",
                next_action_key: "send_follow_up",
                template_key: "tpl_1",
                channel: "email",
                reasoning_summary: "No contact attempt recorded.",
                draft_body: "Hello, following up.",
            },
        },
        {
            name: "processing_source_classification",
            map: PROCESSING_SOURCE_CLASSIFICATION_SEMANTIC_MAP,
            policy: PROCESSING_SOURCE_MINIMIZATION_V1,
            elements: {
                classification_key: "enrollment_form",
                label: "Enrollment form",
                confidence: 0.87,
                status: "classified",
                classifier_version: "1.2.0",
                signals: [{ rule: "r1", value: "token" }],
            },
        },
        {
            name: "processing_identity_subject_resolution",
            map: PROCESSING_IDENTITY_SEMANTIC_MAP,
            policy: PROCESSING_IDENTITY_MINIMIZATION_V1,
            elements: {
                subject_ref: "subject-1",
                subject_role: "child",
                disposition: "matched_existing",
                disposition_source: "engine",
                review_requirement: "operator_review",
                confidence_band: "high",
                ambiguity_categories: [],
                conflict_categories: [],
                blocking_reason_codes: [],
                evidence: [],
                safe_explanations: ["A single candidate matched."],
                adoption_id: "adopt-1",
                input_facts_hash: "abc123",
                material_projection_version: "1",
                identity_resolver_version: "1",
            },
        },
    ] as const;

    it.each(CASES)("$name still admits every element it declared", ({ map, policy, elements }) => {
        const result = transformForReasoning({
            classification: classifyElements(elements, map),
            policy,
            knowledge: [],
        });

        expect(result.ok).toBe(true);
        if (!result.ok) return;

        // Every declared key survives. Nothing was refused, nothing withheld.
        for (const key of Object.keys(elements)) {
            expect(Object.keys(result.context.transformed), key).toContain(key);
        }
        for (const record of result.context.transformations) {
            expect(record.disposition, `${record.key} → ${record.transformation}`).toBe("admitted");
        }
    });

    it.each(CASES)("$name maps no element to an unsupported transformation", ({ map }) => {
        for (const [key, cls] of Object.entries(map)) {
            const t = INFORMATION_CLASS_TRANSFORMATIONS[cls as InformationClass];
            expect(isUnsupportedTransformation(t), `${key} (${cls} → ${t})`).toBe(false);
        }
    });

    it("processing identity elements are ALL operational, so all are pass_through/implemented", () => {
        // The strongest Phase 1 regression guard: this class's whole safety
        // argument is that it carries no identity-class element.
        for (const cls of Object.values(PROCESSING_IDENTITY_SEMANTIC_MAP)) {
            expect(cls).toBe("operational");
        }
        const result = transformForReasoning({
            classification: classifyElements({ disposition: "matched_existing" }, PROCESSING_IDENTITY_SEMANTIC_MAP),
            policy: PROCESSING_IDENTITY_MINIMIZATION_V1,
            knowledge: [],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.context.transformations[0]!.support).toBe("implemented");
    });

    it("only attention enrichment relies on compatibility preservation, and only for two elements", () => {
        const result = transformForReasoning({
            classification: classifyElements(CASES[0].elements, ATTENTION_SUGGESTION_SEMANTIC_MAP),
            policy: ATTENTION_SUGGESTION_MINIMIZATION_V1,
            knowledge: [],
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;

        const preserved = result.context.transformations.filter((t) => t.support === "compatibility_preserved");
        expect(preserved.map((t) => t.key).sort()).toEqual(["channel", "draft_body"]);
    });
});

// ---------------------------------------------------------------------------
// 7. No provider, no network, no credential
// ---------------------------------------------------------------------------

describe("P2.1-7 — the privacy layer reaches no provider", () => {
    it("neither the dispatcher nor the engine performs network I/O or reads a credential", () => {
        for (const rel of ["lib/trust/privacy/transformationDispatch.ts", "lib/trust/privacy/privacyEngine.ts"]) {
            const src = readFileSync(join(WEB_ROOT, rel), "utf8");
            for (const p of [/\bfetch\s*\(/, /\bXMLHttpRequest\b/, /@anthropic-ai/, /\bopenai\b/i, /axios/, /from\s+"node:https?"/]) {
                expect(src, `${rel} matched ${p}`).not.toMatch(p);
            }
            expect(src, rel).not.toMatch(/process\.env/);
        }
    });

    it("the dispatcher is pure — no clock, no randomness, no I/O", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/privacy/transformationDispatch.ts"), "utf8");
        for (const p of [/Date\.now/, /new Date\(/, /Math\.random/, /randomUUID/, /readFileSync/]) {
            expect(src).not.toMatch(p);
        }
    });

    it("the same input yields the same output — dispatch is deterministic", () => {
        const once = transformOneAs("communications", "body");
        const twice = transformOneAs("communications", "body");
        expect(JSON.stringify(once)).toBe(JSON.stringify(twice));
    });
});
