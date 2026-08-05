/**
 * Phase 1.1 — Processing Source Classification Trust adoption.
 *
 * The first real capability adoption. These assertions prove that governing the
 * classification changed nothing about the classification: same category, same
 * confidence, same persistence, same operator-visible output — plus one
 * immutable Decision Package that did not exist before.
 *
 * No database. The Trust repository is injected, and every Processing write goes
 * through a fake Supabase that throws if anything outside `processing_cases` is
 * touched.
 *
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
    classifyNonFormSource,
    CLASSIFIER_VERSION,
    MAX_CONFIDENCE,
} from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { maybeClassifyProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/classification/maybeClassifyProcessingCaseFromDocumentSafe";
import {
    governSourceClassification,
    TRUST_GOVERNANCE_GAP_MARKER,
} from "@/lib/pos/processingCase/classification/governSourceClassification";
import {
    classificationJudgmentFingerprint,
    classificationMaterialFingerprint,
    CLASSIFICATION_MATERIAL_INPUT_VERSION,
} from "@/lib/pos/processingCase/classification/classificationMaterialInput";
import {
    safeParseGovernedSourceClassificationV1,
    toGovernedSourceClassification,
} from "@/lib/pos/processingCase/classification/governedClassificationSchema";
import type { ClassifyNonFormSourceInput } from "@/lib/pos/processingCase/classification/types";

import { PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import { PROCESSING_SOURCE_CLASSIFICATION_DETERMINISTIC_STRATEGY_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import { PROCESSING_SOURCE_CLASSIFICATION_VALIDATION_POLICY_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import { PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import { resolveDecisionClass, listDecisionClassKeys } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type {
    ReasoningUsageInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";
import { decideProcessingSourceClassification } from "@/lib/trust/consumers/processingSourceClassification";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract(c) {
            contracts.push(c);
        },
        async advanceContractLifecycle() {},
        async insertPackage(p) {
            packages.push(p);
        },
        async insertObservation() {},
        async insertReasoningUsage(u) {
            usage.push(u);
        },
    };
    return { repository, contracts, packages, usage };
}

/** Fake Supabase that permits only `processing_cases` reads/updates. */
function makeFakeSupabase() {
    const updates: Record<string, unknown>[] = [];
    let inserted = false;
    const supabase = {
        from(table: string) {
            if (table !== "processing_cases") {
                throw new Error(`classification touched a forbidden table: ${table}`);
            }
            return {
                select() {
                    return {
                        eq() {
                            return {
                                eq() {
                                    return { maybeSingle: async () => ({ data: { metadata: {} }, error: null }) };
                                },
                            };
                        },
                    };
                },
                insert() {
                    inserted = true;
                    throw new Error("classification must never insert a case");
                },
                update(payload: Record<string, unknown>) {
                    updates.push(payload);
                    return { eq: () => ({ eq: async () => ({ error: null }) }) };
                },
            };
        },
    } as unknown as SupabaseClient;
    return { supabase, updates, get inserted() { return inserted; } };
}

const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const govDeps = (repository: TrustRepository) => ({
    repository,
    nowIso: FIXED_NOW,
    clock: () => 0,
});

/** One representative input per supported non-form source kind. */
const SUPPORTED_SOURCE_CASES: { kind: string; input: ClassifyNonFormSourceInput; expected: string }[] = [
    {
        kind: "document",
        input: { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" },
        expected: "subsidy_contract",
    },
    {
        kind: "upload",
        input: { sourceKind: "upload", fileName: "Jane_Immunization_Record.pdf" },
        expected: "immunization_record",
    },
    {
        kind: "email_attachment",
        input: { sourceKind: "email_attachment", title: "Fall 2026 Enrollment Registration" },
        expected: "enrollment_document",
    },
    {
        kind: "import",
        input: {
            sourceKind: "import",
            fileName: "batch_837.dat",
            metadata: { description: "Monthly remittance / payment advice 835" },
        },
        expected: "remittance",
    },
    {
        kind: "recreated_document",
        input: { sourceKind: "recreated_document", fileName: "scan001.pdf", docType: "application form" },
        expected: "form_like_document",
    },
];

// ---------------------------------------------------------------------------
// 5. Registration
// ---------------------------------------------------------------------------

describe("P1.1-A — capability registration through the Phase 0 composition root", () => {
    it("registers the decision class, with no _v1 suffix on the class key", () => {
        expect(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY).toBe("processing_source_classification");
        expect(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY).not.toMatch(/_v\d+$/);
        expect(listDecisionClassKeys()).toContain(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY);
    });

    it("the registry now holds exactly two decision classes — composition, not replacement", () => {
        expect(listDecisionClassKeys()).toEqual([
            "attention_suggestion_enrichment",
            "processing_source_classification",
        ]);
    });

    it("registers exactly one deterministic strategy bound to the class", () => {
        const strategies = TRUST_REGISTRY.listStrategiesForDecisionClass(
            PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
        );
        expect(strategies.map((s) => s.key)).toEqual([
            PROCESSING_SOURCE_CLASSIFICATION_DETERMINISTIC_STRATEGY_KEY,
        ]);
        expect(strategies[0]!.kind).toBe("deterministic");
    });

    it("references a PLATFORM-owned privacy policy and does not register one", () => {
        const cls = resolveDecisionClass(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY);
        expect(cls?.privacy_policy_key).toBe(PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY);
        expect(TRUST_REGISTRY.getPrivacyPolicy(PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY)).not.toBeNull();
        const provenance = TRUST_REGISTRY.provenanceOf(
            "privacy_policy",
            PROCESSING_SOURCE_MINIMIZATION_POLICY_KEY,
        );
        expect(provenance?.owner).toBe("platform");
        // The capability contributes the class, the strategy and the validation
        // policy — and no privacy policy.
        const classProvenance = TRUST_REGISTRY.provenanceOf(
            "decision_class",
            PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
        );
        expect(classProvenance?.owner).toBe("capability");
    });

    it("declares escalation 0 and no AI feature gate", () => {
        const cls = resolveDecisionClass(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY);
        expect(cls?.economic_policy.max_escalation_level).toBe(0);
        expect(cls?.strategy_preference).toEqual(["deterministic"]);
        expect(cls?.requires_allowed_feature).toBeNull();
        expect(cls?.validation_policy_key).toBe(PROCESSING_SOURCE_CLASSIFICATION_VALIDATION_POLICY_KEY);
    });
});

// ---------------------------------------------------------------------------
// 1, 3, 4, 6, 7. Governed decision per supported source type
// ---------------------------------------------------------------------------

describe("P1.1-B — one contract and one package per supported source type", () => {
    for (const scenario of SUPPORTED_SOURCE_CASES) {
        it(`${scenario.kind}: preserves category and confidence exactly`, async () => {
            const { repository, contracts, packages } = makeRecordingRepository();
            const result = classifyNonFormSource(scenario.input);
            expect(result.classification_key).toBe(scenario.expected);

            const governance = await governSourceClassification(null, {
                orgId: "org-1",
                caseId: "case-1",
                input: scenario.input,
                result,
                deps: govDeps(repository),
            });

            expect(governance.status).toBe("governed");
            expect(contracts).toHaveLength(1);
            expect(packages).toHaveLength(1);

            const pkg = packages[0]!;
            expect(pkg.outcome).toBe("recommended");
            // Exact category and exact confidence — no rescale, no rounding.
            expect(pkg.recommendation?.classification_key).toBe(result.classification_key);
            expect(pkg.recommendation?.confidence).toBe(result.confidence);
            expect(pkg.confidence).toBe(result.confidence);
            expect(pkg.recommendation?.status).toBe(result.status);
            expect(pkg.recommendation?.classifier_version).toBe(CLASSIFIER_VERSION);
        });
    }

    it("creates the contract with the right org, class and correlation id", async () => {
        const { repository, contracts } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[0]!.input;
        await governSourceClassification(null, {
            orgId: "org-42",
            caseId: "case-77",
            input,
            result: classifyNonFormSource(input),
            deps: govDeps(repository),
        });
        const contract = contracts[0]!;
        expect(contract.org_id).toBe("org-42");
        expect(contract.decision_class_key).toBe(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY);
        expect(contract.correlation_id).toBe("case-77");
        const context = contract.context as Record<string, unknown>;
        expect(context.processing_case_id).toBe("case-77");
        expect(context.material_input_version).toBe(CLASSIFICATION_MATERIAL_INPUT_VERSION);
        expect(context.classifier_version).toBe(CLASSIFIER_VERSION);
    });

    it("a valid low-confidence `unknown` is a decision, not a failure", async () => {
        const { repository, packages } = makeRecordingRepository();
        const input: ClassifyNonFormSourceInput = { sourceKind: "document", fileName: "scan_0001.pdf" };
        const result = classifyNonFormSource(input);
        expect(result.status).toBe("unknown");
        expect(result.confidence).toBe(0);

        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result, deps: govDeps(repository),
        });
        const pkg = packages[0]!;
        expect(pkg.outcome).toBe("recommended");
        expect(pkg.confidence).toBe(0);
        expect(pkg.remaining_uncertainty.join(" ")).toContain("no_classification_rule_matched");
    });
});

// ---------------------------------------------------------------------------
// 2. Unsupported source rejected before contract creation
// ---------------------------------------------------------------------------

describe("P1.1-C — an unsupported source never reaches the Trust Runtime", () => {
    it("creates no contract and no package for a form-backed source", async () => {
        const { repository, contracts, packages, usage } = makeRecordingRepository();
        const input: ClassifyNonFormSourceInput = { sourceKind: "form_submission", fileName: "subsidy.pdf" };
        const result = classifyNonFormSource(input);
        expect(result.status).toBe("unsupported");

        const governance = await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result, deps: govDeps(repository),
        });

        expect(governance.status).toBe("skipped_unsupported");
        expect(contracts).toHaveLength(0);
        expect(packages).toHaveLength(0);
        expect(usage).toHaveLength(0);
    });

    it("the projection itself refuses `unsupported`, so no caller can smuggle one in", () => {
        const result = classifyNonFormSource({ sourceKind: "form_packet_session", fileName: "x.pdf" });
        expect(toGovernedSourceClassification(result)).toBeNull();
        expect(safeParseGovernedSourceClassificationV1({ ...result })).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 8, 9, 10, 11. What a package may never carry
// ---------------------------------------------------------------------------

describe("P1.1-D — the package is provider-independent and carries no execution authority", () => {
    it("has zero provider cost, deterministic strategy, escalation 0", async () => {
        const { repository, packages, usage } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[0]!.input;
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        const pkg = packages[0]!;
        expect(pkg.economics.provider_cost_units).toBe(0);
        expect(pkg.economics.strategy_kind).toBe("deterministic");
        expect(pkg.economics.escalation_level).toBe(0);
        expect(usage[0]?.provider_cost_units).toBe(0);
        expect(usage[0]?.escalation_level).toBe(0);
    });

    it("carries no provider or model IDENTITY — only the sanctioned cost count", async () => {
        const { repository, packages } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[3]!.input;
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        const pkg = packages[0]!;

        // ADR-2: `provider_cost_units` is a COUNT and is provider-independent, so
        // it may sit on the package. Provider and model IDENTITY may not.
        const identityKeys = [
            "provider_key", "provider_name", "provider", "model", "model_id", "model_key",
            "model_name", "prompt", "system_prompt", "api_key", "temperature", "max_tokens",
        ];
        const walk = (value: unknown): string[] => {
            if (Array.isArray(value)) return value.flatMap(walk);
            if (value && typeof value === "object") {
                return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
                    identityKeys.includes(k) ? [k, ...walk(v)] : walk(v),
                );
            }
            return [];
        };
        expect(walk(pkg)).toEqual([]);
        expect(pkg.economics.provider_cost_units).toBe(0);

        // No provider vendor name appears as a VALUE anywhere either.
        const serialized = JSON.stringify(pkg).toLowerCase();
        for (const vendor of ["openai", "anthropic", "gpt-", "claude-", "gemini"]) {
            expect(serialized).not.toContain(vendor);
        }
    });

    it("declares no proposed command binding", async () => {
        const { repository, packages } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[0]!.input;
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        expect(packages[0]!.recommendation).not.toHaveProperty("proposed_command");
        expect(JSON.stringify(packages[0])).not.toContain("proposed_command");
    });

    it("writes nothing but the classification annotation — no identity, no plan, no case insert", async () => {
        const fake = makeFakeSupabase();
        const { repository } = makeRecordingRepository();
        await maybeClassifyProcessingCaseFromDocumentSafe(fake.supabase, {
            orgId: "o",
            caseId: "c",
            document: { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" },
            governance: govDeps(repository),
        });
        // The fake throws on any table other than processing_cases, and on insert.
        expect(fake.inserted).toBe(false);
        expect(fake.updates).toHaveLength(1);
        expect(Object.keys(fake.updates[0]!).sort()).toEqual(["case_type", "metadata"]);
    });
});

// ---------------------------------------------------------------------------
// 12, 20. Processing output unchanged; Trust suppressible
// ---------------------------------------------------------------------------

describe("P1.1-E — suppressing Trust leaves Processing-visible output byte-identical", () => {
    it("the stored classification and the update payload are identical with and without governance", async () => {
        const doc = { sourceKind: "document" as const, fileName: "Jane_Immunization_Record.pdf" };

        const plain = makeFakeSupabase();
        const withoutTrust = await maybeClassifyProcessingCaseFromDocumentSafe(plain.supabase, {
            orgId: "o", caseId: "c", document: doc,
        });

        const governedFake = makeFakeSupabase();
        const { repository, packages } = makeRecordingRepository();
        const withTrust = await maybeClassifyProcessingCaseFromDocumentSafe(governedFake.supabase, {
            orgId: "o", caseId: "c", document: doc, governance: govDeps(repository),
        });

        // Ignore only the persistence timestamp, which was never deterministic.
        const strip = (v: typeof withTrust) => ({ ...v, classified_at: "" });
        expect(JSON.stringify(strip(withTrust))).toBe(JSON.stringify(strip(withoutTrust)));

        const stripUpdate = (u: Record<string, unknown>) => {
            const meta = u.metadata as { classification: Record<string, unknown> };
            return JSON.stringify({ ...u, metadata: { classification: { ...meta.classification, classified_at: "" } } });
        };
        expect(stripUpdate(governedFake.updates[0]!)).toBe(stripUpdate(plain.updates[0]!));

        // ...and the governed run produced the package the plain run did not.
        expect(packages).toHaveLength(1);
    });

    it("reports `disabled` and creates nothing when governance is omitted", async () => {
        const fake = makeFakeSupabase();
        const seen: string[] = [];
        await maybeClassifyProcessingCaseFromDocumentSafe(fake.supabase, {
            orgId: "o", caseId: "c",
            document: { sourceKind: "document", fileName: "subsidy_contract.pdf" },
            onGovernanceResult: (r) => seen.push(r.status),
        });
        expect(seen).toEqual(["disabled"]);
    });
});

// ---------------------------------------------------------------------------
// 13, 14. Replay determinism of the governed judgment
// ---------------------------------------------------------------------------

describe("P1.1-F — identical material input yields an equivalent governed judgment", () => {
    it("same input, same material fingerprint and same judgment fingerprint", () => {
        const input = SUPPORTED_SOURCE_CASES[3]!.input;
        expect(classificationMaterialFingerprint(input)).toBe(classificationMaterialFingerprint(input));
        expect(classificationJudgmentFingerprint(classifyNonFormSource(input))).toBe(
            classificationJudgmentFingerprint(classifyNonFormSource(input)),
        );
    });

    it("metadata KEY ORDER does not change the material fingerprint or the judgment", () => {
        const a: ClassifyNonFormSourceInput = {
            sourceKind: "import",
            metadata: { alpha: "Monthly remittance", beta: "payment advice 835", gamma: 7 },
        };
        const b: ClassifyNonFormSourceInput = {
            sourceKind: "import",
            metadata: { gamma: 7, beta: "payment advice 835", alpha: "Monthly remittance" },
        };
        expect(classificationMaterialFingerprint(a)).toBe(classificationMaterialFingerprint(b));
        expect(classificationJudgmentFingerprint(classifyNonFormSource(a))).toBe(
            classificationJudgmentFingerprint(classifyNonFormSource(b)),
        );
        expect(classifyNonFormSource(a).classification_key).toBe(classifyNonFormSource(b).classification_key);
        expect(classifyNonFormSource(a).confidence).toBe(classifyNonFormSource(b).confidence);
    });

    it("mimeType is declared but immaterial — it changes neither fingerprint nor judgment", () => {
        const base: ClassifyNonFormSourceInput = { sourceKind: "document", fileName: "subsidy_contract.pdf" };
        const withMime: ClassifyNonFormSourceInput = { ...base, mimeType: "application/pdf" };
        expect(classificationMaterialFingerprint(base)).toBe(classificationMaterialFingerprint(withMime));
        expect(classifyNonFormSource(base)).toEqual(classifyNonFormSource(withMime));
    });

    it("a different material input yields a different fingerprint", () => {
        expect(classificationMaterialFingerprint({ sourceKind: "document", fileName: "subsidy.pdf" })).not.toBe(
            classificationMaterialFingerprint({ sourceKind: "document", fileName: "remittance.pdf" }),
        );
    });

    it("two governed runs of the same input agree on everything except package identity and timing", async () => {
        const input = SUPPORTED_SOURCE_CASES[0]!.input;
        const run = async () => {
            const { repository, packages, contracts } = makeRecordingRepository();
            await governSourceClassification(null, {
                orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
            });
            return { pkg: packages[0]!, contract: contracts[0]! };
        };
        const first = await run();
        const second = await run();

        // Package ids and contract ids are UUIDs — deliberately NOT deterministic.
        expect(first.pkg.id).not.toBe(second.pkg.id);
        // The governed judgment is.
        expect(first.pkg.recommendation).toEqual(second.pkg.recommendation);
        expect(first.pkg.confidence).toBe(second.pkg.confidence);
        expect(first.pkg.evidence).toEqual(second.pkg.evidence);
        expect(first.pkg.outcome).toBe(second.pkg.outcome);
        expect(first.pkg.strategy_version).toBe(second.pkg.strategy_version);
        expect(first.pkg.registry_version).toBe(second.pkg.registry_version);
        expect((first.contract.context as Record<string, unknown>).material_input_fingerprint).toBe(
            (second.contract.context as Record<string, unknown>).material_input_fingerprint,
        );
    });

    it("no source content leaks into the contract — the fingerprint replaces it", async () => {
        const { repository, contracts } = makeRecordingRepository();
        const input: ClassifyNonFormSourceInput = {
            sourceKind: "document",
            fileName: "Lyons_Family_Subsidy_Contract.pdf",
            title: "Alex Lyons — CCAP voucher",
        };
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        const serialized = JSON.stringify(contracts[0]!.context);
        expect(serialized).not.toContain("Lyons");
        expect(serialized).not.toContain("Alex");
        expect(serialized).not.toContain(".pdf");
    });
});

// ---------------------------------------------------------------------------
// 15. Invalid confidence fails closed
// ---------------------------------------------------------------------------

describe("P1.1-G — the classifier's real confidence contract is enforced, fail-closed", () => {
    it("the supported range is [0, MAX_CONFIDENCE] at two decimals", () => {
        expect(MAX_CONFIDENCE).toBe(0.95);
        for (const good of [0, 0.25, 0.7, 0.95]) {
            expect(safeParseGovernedSourceClassificationV1(recommendationWithConfidence(good))).not.toBeNull();
        }
        for (const bad of [-0.01, 0.96, 1, Number.NaN, Number.POSITIVE_INFINITY, 0.123]) {
            expect(safeParseGovernedSourceClassificationV1(recommendationWithConfidence(bad))).toBeNull();
        }
    });

    it("an out-of-range confidence produces failed_validation, never a clamp", async () => {
        const { repository, packages } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[0]!.input;
        const tampered = { ...classifyNonFormSource(input), confidence: 1.4 };

        const governance = await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: tampered, deps: govDeps(repository),
        });

        expect(governance.status).toBe("governed");
        const pkg = packages[0]!;
        expect(pkg.outcome).toBe("failed_validation");
        // Fails closed: no recommendation survives, and nothing was silently corrected.
        expect(pkg.recommendation).toBeNull();
    });

    function recommendationWithConfidence(confidence: unknown) {
        return {
            classification_key: "subsidy_contract",
            label: "Subsidy contract",
            confidence,
            status: "classified",
            classifier_version: CLASSIFIER_VERSION,
            signals: [],
        };
    }
});

// ---------------------------------------------------------------------------
// 16. Transaction boundary — the partial state is explicit, never silent
// ---------------------------------------------------------------------------

describe("P1.1-H — a Trust persistence failure is explicit and never blocks Processing", () => {
    /**
     * This fake permits only `processing_cases`, so the durable governance-gap
     * store is unreachable. That is the `gap_unrecordable` branch — the loudest
     * one — and it is asserted here deliberately. The durable-capture path and
     * its reconciliation are certified in
     * `processingSourceClassificationGovernanceGap.test.ts`, which models
     * `processing_exceptions`.
     */
    it("Processing still stores the classification, and the loss is reported and logged", async () => {
        const fake = makeFakeSupabase();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const results: string[] = [];

        const stored = await maybeClassifyProcessingCaseFromDocumentSafe(fake.supabase, {
            orgId: "o",
            caseId: "c",
            document: { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" },
            governance: {
                nowIso: FIXED_NOW,
                clock: () => 0,
                repository: {
                    async insertContract() {
                        throw new Error("trust db down");
                    },
                    async advanceContractLifecycle() {},
                    async insertPackage() {},
                    async insertObservation() {},
                    async insertReasoningUsage() {},
                },
            },
            onGovernanceResult: (r) => results.push(r.status),
        });

        // Processing authority is preserved: the classification is stored.
        expect(stored?.classification_key).toBe("subsidy_contract");
        expect(fake.updates).toHaveLength(1);
        // Neither the governed record nor its recovery record could be written,
        // so the result says exactly that and the log is at `error`, not `warn`.
        expect(results).toEqual(["gap_unrecordable"]);
        expect(errorSpy).toHaveBeenCalled();
        expect(errorSpy.mock.calls.flat().join(" ")).toContain(TRUST_GOVERNANCE_GAP_MARKER);
        warn.mockRestore();
        errorSpy.mockRestore();
    });

    it("a Processing persistence failure yields no package — governance never runs alone", async () => {
        const exploding = {
            from() {
                throw new Error("db down");
            },
        } as unknown as SupabaseClient;
        const { repository, contracts, packages } = makeRecordingRepository();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        const out = await maybeClassifyProcessingCaseFromDocumentSafe(exploding, {
            orgId: "o", caseId: "c",
            document: { fileName: "subsidy_contract.pdf" },
            governance: govDeps(repository),
        });

        expect(out).toBeNull();
        expect(contracts).toHaveLength(0);
        expect(packages).toHaveLength(0);
        warn.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 19. Measurement — counted exactly once
// ---------------------------------------------------------------------------

describe("P1.1-I — the governed decision is measured exactly once", () => {
    it("one contract, one package and one usage record per governed classification", async () => {
        const { repository, contracts, packages, usage } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[2]!.input;
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        expect(contracts).toHaveLength(1);
        expect(packages).toHaveLength(1);
        expect(usage).toHaveLength(1);
        expect(usage[0]!.decision_class_key).toBe(PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY);
        expect(usage[0]!.contract_id).toBe(contracts[0]!.id);
        expect(packages[0]!.contract_id).toBe(contracts[0]!.id);
    });

    it("a replayed classification is a NEW governed decision, not a duplicate of one", async () => {
        const { repository, contracts, packages, usage } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[2]!.input;
        const run = () =>
            governSourceClassification(null, {
                orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
            });
        await run();
        await run();
        // Two attempts, two contracts, two packages, two usage records — one each.
        expect(contracts).toHaveLength(2);
        expect(packages).toHaveLength(2);
        expect(usage).toHaveLength(2);
        expect(new Set(packages.map((p) => p.contract_id)).size).toBe(2);
    });

    it("an unsupported source produces no usage record, so it cannot inflate a metric", async () => {
        const { repository, usage } = makeRecordingRepository();
        const input: ClassifyNonFormSourceInput = { sourceKind: "form_submission", fileName: "x.pdf" };
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        expect(usage).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Privacy — nothing to minimize, and that is asserted rather than assumed
// ---------------------------------------------------------------------------

describe("P1.1-J — the governed elements are operational and require no redaction", () => {
    it("reports strict mode, operational class only, and zero redaction steps", async () => {
        const { repository, packages } = makeRecordingRepository();
        const input = SUPPORTED_SOURCE_CASES[0]!.input;
        await governSourceClassification(null, {
            orgId: "o", caseId: "c", input, result: classifyNonFormSource(input), deps: govDeps(repository),
        });
        const report = packages[0]!.privacy_report;
        expect(report.pii_mode).toBe("strict");
        expect(report.classes_present).toEqual(["operational"]);
        expect(report.redaction_steps).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// Direct consumer contract
// ---------------------------------------------------------------------------

describe("P1.1-K — the consumer refuses an ungrounded element rather than inventing one", () => {
    it("an empty classification element produces failed_reasoning, not a guess", async () => {
        const { repository } = makeRecordingRepository();
        const decision = await decideProcessingSourceClassification({
            org_id: "o",
            processing_case_id: "c",
            source_kind: "document",
            classification: { classification_key: "", status: "", classifier_version: "" },
            material_input_fingerprint: "f",
            material_input_version: CLASSIFICATION_MATERIAL_INPUT_VERSION,
            classifier_version: CLASSIFIER_VERSION,
            initiating_actor: { actor_type: "system", actor_id: null },
            channel: "system",
            repository,
            nowIso: FIXED_NOW,
            clock: () => 0,
        });
        expect(decision.package.outcome).toBe("failed_reasoning");
        expect(decision.package.recommendation).toBeNull();
    });
});
