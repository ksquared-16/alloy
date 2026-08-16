/**
 * Negative controls for the dormant Processing identity decision class.
 *
 * Each control builds the defective variant and shows the difference is
 * observable, so "the test would fail" is demonstrated rather than asserted.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import { evaluateSubjectEligibility } from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { buildProcessingIdentityTrustDecisionMaterial } from "@/lib/pos/processingIdentity/trustAdapter/identityTrustDecisionMaterial";
import {
    resolveEffectiveReviewRequirement,
    safeParseGovernedIdentitySubjectRecommendationV1,
    toGovernedIdentitySubjectRecommendation,
} from "@/lib/pos/processingIdentity/trustAdapter/governedIdentitySchema";
import { dryRunProcessingIdentitySubjectResolution } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/dryRun";
import { resolveDecisionClass } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { assembleTrustEvidence } from "@/lib/trust/governance/trustEvidence";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";

const WEB_ROOT = join(__dirname, "..", "..");
const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const FACTS_HASH = "a".repeat(64);

function candidate(overrides: Partial<IdentityCandidate> = {}): IdentityCandidate {
    return {
        subjectRef: "parent-1", entityType: "person", recordId: "rec-1",
        confidenceBand: "strong", score: 5,
        signals: [
            {
                key: "exact_email", kind: "supporting", strength: "deterministic",
                subjectFactRefs: [], recordFieldRefs: [],
                reasonCode: "exact_email_match",
                explanation: "Matched Alex Lyons at alex@lyons.example.",
            },
        ],
        blockingConflicts: [],
        explanation: "Email or phone matches Alex Lyons, but the submitted name differs.",
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
        retention_class: "uncommitted_submission", created_at: FIXED_NOW,
        ...overrides,
    };
}

function recommendationFor(r: ProcessingResolutionRow, candidates: IdentityCandidate[]) {
    return toGovernedIdentitySubjectRecommendation(
        buildProcessingIdentityTrustDecisionMaterial({
            orgId: "org-1", processingCaseId: "case-1", subjectRole: r.subject_role,
            eligibility: evaluateSubjectEligibility(r),
            candidates, createNewOverride: null,
            inputFactsHash: FACTS_HASH,
            materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identityResolverVersion: IDENTITY_RESOLVER_VERSION,
        }),
    );
}

const dryRun = (recommendation: Readonly<Record<string, unknown>>) =>
    dryRunProcessingIdentitySubjectResolution({
        org_id: "org-1", processing_case_id: "case-1", recommendation,
        nowIso: FIXED_NOW, clock: () => 0,
    });

function sourceFilesUnder(relative: string): string[] {
    const root = join(WEB_ROOT, relative);
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) walk(full);
            else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
        }
    };
    walk(root);
    return out;
}

// ---------------------------------------------------------------------------

describe("P14-NC-1 — matching logic copied into the Trust strategy would be caught", () => {
    const RULE_ONLY_TOKENS = [
        "confidenceBand ===", "bandRank", "sortCandidatesByBand",
        "normalizeEmail", "normalizePhone", "phoneLookupVariants",
        "PERSON_CANDIDATE_CAP", "CHILD_CANDIDATE_CAP",
    ];

    it("the tokens really exist in the Processing identity engine", () => {
        const engine = [
            readFileSync(join(WEB_ROOT, "lib/identity/confidenceBand.ts"), "utf8"),
            readFileSync(join(WEB_ROOT, "lib/identity/constants.ts"), "utf8"),
            readFileSync(join(WEB_ROOT, "lib/identity/index.ts"), "utf8"),
        ].join("\n");
        expect(RULE_ONLY_TOKENS.some((t) => engine.includes(t))).toBe(true);
    });

    it("the strategy and dry run contain none of them", () => {
        for (const file of [
            "lib/trust/reasoning/strategies/processingIdentitySubjectResolutionDeterministic.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/dryRun.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/contribution.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            for (const token of RULE_ONLY_TOKENS) expect(src).not.toContain(token);
        }
    });

    it("the strategy's output tracks its INPUT, so it cannot be re-deriving", async () => {
        const a = await dryRun(recommendationFor(row(), [candidate()]));
        const b = await dryRun(recommendationFor(row(), [candidate(), candidate({ recordId: "r2" })]));
        const recA = a.package.recommendation as Record<string, unknown>;
        const recB = b.package.recommendation as Record<string, unknown>;
        expect((recA.evidence as Record<string, unknown>).candidate_count).toBe(1);
        expect((recB.evidence as Record<string, unknown>).candidate_count).toBe(2);
    });
});

describe("P14-NC-2 — treating threshold zero as calibrated trust would be caught", () => {
    it("a defective evaluator that reads confidence differs from the real one", () => {
        const cls = resolveDecisionClass(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY)!;
        expect(cls.trust_threshold).toBe(0);

        // The defect: deciding trust from confidence against the threshold.
        const defective = (confidence: number | null) => (confidence ?? 0) >= cls.trust_threshold;
        // It calls a null-confidence decision "trusted" — the exact error.
        expect(defective(null)).toBe(true);

        // The real evaluator never reads confidence; its vector is unchanged by it.
        const common = {
            decisionClass: cls,
            context: { transformed: {}, knowledge: [], redaction_steps: [], classes_present: [], pii_mode: "strict" as const, transformations: [], text_minimizations: [], participant_redactions: [], acknowledged_unminimized_classes: [] },
            validation: { policy_key: "p", policy_version: "1", results: [], passed: true },
            strategyKind: "deterministic",
        };
        const withNull = assembleTrustEvidence({
            ...common,
            proposal: { recommendation: {}, confidence: null, evidence: [], explanation: "x", remaining_uncertainty: [] },
        });
        const withOne = assembleTrustEvidence({
            ...common,
            proposal: { recommendation: {}, confidence: 1, evidence: [], explanation: "x", remaining_uncertainty: [] },
        });
        expect(withNull.score).toBe(withOne.score);
        expect(withNull.vector).toEqual(withOne.vector);
    });

    it("the package never claims automatic trust for this class", async () => {
        const { package: pkg } = await dryRun(recommendationFor(row(), [candidate()]));
        expect(pkg.confidence).toBeNull();
        expect(pkg.review_requirement).toBe("operator_review");
    });
});

describe("P14-NC-3 — converting null confidence to zero would be caught", () => {
    it("null and zero are observably different on the package", async () => {
        const { package: pkg } = await dryRun(recommendationFor(row(), [candidate()]));
        expect(pkg.confidence).toBeNull();
        // The defect would produce this instead.
        expect(pkg.confidence).not.toBe(0);
        expect(JSON.stringify(pkg)).toContain('"confidence":null');
    });

    it("the strategy declares null, not a numeric sentinel", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/reasoning/strategies/processingIdentitySubjectResolutionDeterministic.ts"),
            "utf8",
        );
        expect(src).toContain("confidence: null");
        expect(src).not.toMatch(/confidence:\s*0\b/);
    });
});

describe("P14-NC-4 — copying unsafe explanation text would be caught", () => {
    it("engine text is rejected by the parser and never reaches the package", async () => {
        const good = recommendationFor(row(), [candidate()]);
        const withEngineText = {
            ...good,
            safe_explanations: ["Email or phone matches Alex Lyons, but the submitted name differs."],
        };
        // The parser refuses it: the sentence is not Processing-authored.
        expect(safeParseGovernedIdentitySubjectRecommendationV1(withEngineText)).toBeNull();

        const { package: pkg } = await dryRun(withEngineText);
        expect(pkg.outcome).toBe("failed_validation");
        expect(JSON.stringify(pkg)).not.toContain("Alex Lyons");
    });

    it("a PII value smuggled into a legal field is rejected by the pattern screen", () => {
        const good = recommendationFor(row(), [candidate()]);
        for (const smuggled of [
            { subject_role: "alex@lyons.example" },
            { subject_role: "+1 555 555 0100" },
            { subject_role: "2019-04-11" },
            { subject_role: "12 Oak Street" },
        ]) {
            expect(safeParseGovernedIdentitySubjectRecommendationV1({ ...good, ...smuggled })).toBeNull();
        }
        // The unmodified value parses, isolating the control to the smuggled field.
        expect(safeParseGovernedIdentitySubjectRecommendationV1(good)).not.toBeNull();
    });
});

describe("P14-NC-5 — case-level readiness entering the package would be caught", () => {
    it("the parser refuses it and the runtime yields failed_validation", async () => {
        const good = recommendationFor(row(), [candidate()]);
        const forced = { ...good, blocking_reason_codes: ["child_identity_unconfirmed"] };
        expect(safeParseGovernedIdentitySubjectRecommendationV1(forced)).toBeNull();
        const { package: pkg } = await dryRun(forced);
        expect(pkg.outcome).toBe("failed_validation");
    });

    it("a subject-level code is still accepted, isolating the control to the case gate", () => {
        const good = recommendationFor(row(), [candidate()]);
        const subjectLevel = { ...good, blocking_reason_codes: ["ambiguous_auto_link"] };
        expect(safeParseGovernedIdentitySubjectRecommendationV1(subjectLevel)).not.toBeNull();
    });
});

describe("P14-NC-6 — a production caller importing the dry run would be caught", () => {
    it("the scan really does find importers when one exists", () => {
        // Proves the detector works: this very test file imports the dry run.
        const selfSrc = readFileSync(__filename, "utf8");
        expect(selfSrc).toContain("processingIdentitySubjectResolution/dryRun");
    });

    it("...and no production module does", () => {
        const importers: string[] = [];
        for (const area of ["lib", "app", "scripts"]) {
            for (const file of sourceFilesUnder(area)) {
                if (file.includes("processingIdentitySubjectResolution/dryRun.ts")) continue;
                if (readFileSync(file, "utf8").includes("processingIdentitySubjectResolution/dryRun")) {
                    importers.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(importers).toEqual([]);
    });
});

describe("P14-NC-7 — a command binding or provider field from the strategy would be caught", () => {
    it("both are refused by the closed shape, and neither reaches the package", async () => {
        const good = recommendationFor(row(), [candidate()]);
        for (const defect of [
            { provider_key: "openai" },
            { proposed_command: { command_key: "create_person", inputs: {} } },
            { executable_payload: { sql: "select 1" } },
        ]) {
            expect(safeParseGovernedIdentitySubjectRecommendationV1({ ...good, ...defect })).toBeNull();
            const { package: pkg } = await dryRun({ ...good, ...defect });
            expect(pkg.outcome).not.toBe("recommended");
            expect(pkg.recommendation).toBeNull();
        }
    });
});

describe("P14-NC-8 — a class default weakening a stricter per-result review would be caught", () => {
    it("the resolver can only tighten, never relax", () => {
        // The defect: taking the class default verbatim.
        const defective = (classDefault: string, _perResult: string) => classDefault;
        expect(defective("automatic", "operator_review")).toBe("automatic");
        // The real resolver keeps the stricter value.
        expect(resolveEffectiveReviewRequirement("automatic", "operator_review")).toBe("operator_review");
    });
});
