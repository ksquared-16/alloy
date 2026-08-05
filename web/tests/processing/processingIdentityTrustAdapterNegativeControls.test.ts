/**
 * Negative controls for the Processing identity Trust adapter contracts.
 *
 * Each control builds the defective variant and shows the difference is
 * observable, so "the test would fail" is demonstrated rather than asserted.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { IdentityCandidate } from "@/lib/identity";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import { evaluateSubjectEligibility } from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import {
    buildProcessingIdentityTrustDecisionMaterial,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
} from "@/lib/pos/processingIdentity/trustAdapter/identityTrustDecisionMaterial";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import { isProcessingAuthoredExplanation } from "@/lib/pos/processingIdentity/trustAdapter/safeExplanation";

const WEB_ROOT = join(__dirname, "..", "..");
const FACTS_HASH = "a".repeat(64);
const PII_EXPLANATION = "Email or phone matches Alex Lyons at alex@lyons.example, dob 2019-04-11.";

function candidate(overrides: Partial<IdentityCandidate> = {}): IdentityCandidate {
    return {
        subjectRef: "parent-1",
        entityType: "person",
        recordId: "rec-1",
        confidenceBand: "strong",
        score: 5,
        signals: [
            {
                key: "exact_email", kind: "supporting", strength: "deterministic",
                subjectFactRefs: [], recordFieldRefs: [],
                reasonCode: "exact_email_match",
                explanation: PII_EXPLANATION,
            },
        ],
        blockingConflicts: [],
        explanation: PII_EXPLANATION,
        resolverVersion: IDENTITY_RESOLVER_VERSION,
        displayName: "Alex Lyons",
        ...overrides,
    };
}

function row(overrides: Partial<ProcessingResolutionRow> = {}): ProcessingResolutionRow {
    return {
        id: "res-1", org_id: "org-1", case_id: "case-1", generation_id: "gen-1",
        input_facts_hash: FACTS_HASH, subject_ref: "parent-1", subject_role: "parent",
        provisional: {}, candidates: [candidate()],
        decision_action: "link_existing", selected_candidate_id: "rec-1",
        decided_by: "operator", operator_id: "op-1", policy_version: null,
        resolver_version: IDENTITY_RESOLVER_VERSION, stale_at: null, superseded_by: null,
        retention_class: "uncommitted_submission", created_at: "2026-08-05T12:00:00.000Z",
        ...overrides,
    };
}

function build(r: ProcessingResolutionRow, candidates: IdentityCandidate[]) {
    return buildProcessingIdentityTrustDecisionMaterial({
        orgId: "org-1",
        processingCaseId: "case-1",
        subjectRole: "parent",
        eligibility: evaluateSubjectEligibility(r),
        candidates,
        createNewOverride: null,
        inputFactsHash: FACTS_HASH,
        materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identityResolverVersion: IDENTITY_RESOLVER_VERSION,
    });
}

// ---------------------------------------------------------------------------

describe("P13-NC-1 — copying explanation PII would be caught", () => {
    it("the engine text DOES carry PII; the adapter's output does not", () => {
        const c = candidate();
        // The defect, reproduced: a naive adapter that passes engine text through.
        const naive = { explanation: c.explanation, signal: c.signals[0]!.explanation, name: c.displayName };
        expect(JSON.stringify(naive)).toContain("Alex Lyons");
        expect(JSON.stringify(naive)).toContain("alex@lyons.example");
        expect(JSON.stringify(naive)).toContain("2019-04-11");

        // The real adapter, same input.
        const serialized = JSON.stringify(build(row(), [c]));
        for (const secret of ["Alex Lyons", "alex@lyons.example", "2019-04-11", "Lyons"]) {
            expect(serialized).not.toContain(secret);
        }
    });

    it("engine text is not merely redacted — it is never carried at all", () => {
        const m = build(row(), [candidate()]);
        for (const text of m.safe_explanations) {
            expect(isProcessingAuthoredExplanation(text)).toBe(true);
        }
        // A redaction-based adapter would leave a marker like `[name:redacted]`.
        // There is none, because the string never entered in the first place.
        const serialized = JSON.stringify(m);
        expect(serialized).not.toMatch(/\[[a-z_]*redacted[a-z_]*\]/i);
        expect(serialized.toLowerCase()).not.toContain("redacted");
        expect(serialized).not.toContain("***");
    });

    it("a PII-bearing reasonCode still cannot leak — codes are looked up, not echoed", () => {
        const c = candidate({
            signals: [
                {
                    key: "k", kind: "supporting", strength: "weak",
                    subjectFactRefs: [], recordFieldRefs: [],
                    reasonCode: "matched_Alex_Lyons_alex@lyons.example",
                    explanation: PII_EXPLANATION,
                },
            ],
        });
        expect(JSON.stringify(build(row(), [c]))).not.toContain("Alex");
    });
});

describe("P13-NC-2 — converting bands to probabilities would be caught", () => {
    it("a probability-mapping variant DOES differ from the categorical output", () => {
        // The defect: bands rendered as numbers.
        const BAND_PROBABILITY = { confirmed: 0.95, strong: 0.8, possible: 0.5, weak: 0.2 } as const;
        const defective = { confidence: BAND_PROBABILITY.strong, confidence_band: "strong" };
        expect(JSON.stringify(defective)).toMatch(/0\.\d+/);

        const m = build(row(), [candidate({ confidenceBand: "strong" })]);
        expect(m.confidence).toBeNull();
        expect(m.confidence_band).toBe("strong");
        expect(JSON.stringify(m)).not.toMatch(/0\.\d+/);
    });

    it("score is not a probability and is never read", () => {
        const low = build(row(), [candidate({ score: 1 })]);
        const high = build(row(), [candidate({ score: 100 })]);
        expect(low.confidence).toBeNull();
        expect(high.confidence).toBeNull();
        expect(JSON.stringify(low)).toBe(JSON.stringify(high));
    });
});

describe("P13-NC-3 — treating needs_review as failure would be caught", () => {
    it("needs_review is `recommended` with operator review, not a refusal", () => {
        const m = build(row({ decision_action: "review_required", decided_by: "engine" }), [candidate()]);
        expect(m.disposition).toBe("needs_review");
        // The defect would be either of these.
        expect(m.outcome).not.toBe("failed_reasoning");
        expect(m.outcome).not.toBe("refused_insufficient_information");
        expect(m.outcome).toBe("recommended");
        expect(m.review_requirement).toBe("operator_review");
    });

    it("ambiguity alone is not a refusal", () => {
        const many = [candidate(), candidate({ recordId: "rec-2" }), candidate({ recordId: "rec-3" })];
        const m = build(row({ decision_action: "review_required", decided_by: "engine" }), many);
        expect(m.ambiguity_categories).toContain("multiple_plausible_candidates");
        expect(m.outcome).toBe("recommended");
    });
});

describe("P13-NC-4 — omitting subject_ref from the adoption identity would be caught", () => {
    it("two subjects on one case collide once subject_ref is dropped", () => {
        const base = {
            org_id: "org-1", processing_case_id: "case-1",
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            input_facts_hash: FACTS_HASH,
            material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identity_resolver_version: IDENTITY_RESOLVER_VERSION,
        };
        // The defect: same subject_ref for every subject — they collapse.
        const collapsed = ["parent-1", "child-1"].map((_s) =>
            processingIdentitySubjectAdoptionId({ ...base, subject_ref: "" }),
        );
        expect(new Set(collapsed).size).toBe(1);

        // The real derivation keeps them distinct.
        const distinct = ["parent-1", "child-1"].map((s) =>
            processingIdentitySubjectAdoptionId({ ...base, subject_ref: s }),
        );
        expect(new Set(distinct).size).toBe(2);
    });

    it("the adapter always sources subject_ref from the eligibility projection", () => {
        const a = build(row({ subject_ref: "parent-1" }), [candidate()]);
        const b = build(row({ subject_ref: "child-1" }), [candidate()]);
        expect(a.subject_ref).toBe("parent-1");
        expect(b.subject_ref).toBe("child-1");
        expect(a.adoption_id).not.toBe(b.adoption_id);
    });
});

describe("P13-NC-5 — admitting provider or command fields would be caught", () => {
    it("the material type cannot express them, and the output contains none", () => {
        const m = build(row(), [candidate()]);
        const keys = Object.keys(m);
        for (const forbidden of ["provider", "provider_key", "model", "proposed_command", "command_key"]) {
            expect(keys).not.toContain(forbidden);
        }
        // A defective variant would be visible immediately.
        const defective = { ...m, provider_key: "openai", proposed_command: { command_key: "create_person" } };
        expect(JSON.stringify(defective).toLowerCase()).toContain("openai");
        expect(JSON.stringify(m).toLowerCase()).not.toContain("openai");
    });

    it("no Commit Plan, approval or executor field appears", () => {
        const serialized = JSON.stringify(build(row(), [candidate()])).toLowerCase();
        for (const forbidden of ["plan_id", "planversion", "content_hash", "approval", "attempt", "executor"]) {
            expect(serialized).not.toContain(forbidden);
        }
    });
});

describe("P13-NC-6 — the adapter recomputing candidate logic would be caught", () => {
    it("output tracks the candidates it is HANDED, never a re-derivation", () => {
        // Same eligibility row, deliberately contradictory candidate list. A
        // re-deriving adapter would ignore the argument and recompute from the
        // row; this one reports what it was given.
        const handedNone = build(row(), []);
        const handedTwo = build(row(), [candidate(), candidate({ recordId: "rec-2" })]);
        expect(handedNone.evidence.candidate_count).toBe(0);
        expect(handedTwo.evidence.candidate_count).toBe(2);
        expect(handedNone.ambiguity_categories).toContain("no_candidate");
        expect(handedTwo.ambiguity_categories).toContain("multiple_plausible_candidates");
    });

    it("the module imports no matching or scoring engine", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityTrustDecisionMaterial.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        for (const engine of [
            "generateCandidates", "householdGraph", "matchIdentity",
            "resolveIntakeRecordResolution", "canonicalResolutionEngine", "confidenceBand",
        ]) {
            expect(imports.some((i) => i.includes(engine))).toBe(false);
        }
    });

    it("band ordering is the engine's vocabulary, not a re-scoring", () => {
        const m = build(row(), [
            candidate({ confidenceBand: "weak", recordId: "r1" }),
            candidate({ confidenceBand: "confirmed", recordId: "r2" }),
        ]);
        // Declaration order of the engine's own band vocabulary.
        expect(m.evidence.distinct_confidence_bands).toEqual(["confirmed", "weak"]);
    });
});
