/**
 * Phase 1.4 — dormant Processing identity decision class and Trust dry run.
 *
 * Proves the class composes and executes through the REAL Trust Runtime —
 * registry, strategy, privacy transform, validation, package construction —
 * while persisting nothing and having no production caller.
 *
 * The dry run is the primary certification; direct strategy calls only
 * supplement it, because bypassing the runtime would leave exactly the seams
 * this slice exists to prove unproven.
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
    toGovernedIdentitySubjectRecommendation,
    safeParseGovernedIdentitySubjectRecommendationV1,
    CASE_LEVEL_READINESS_CODES,
} from "@/lib/pos/processingIdentity/trustAdapter/governedIdentitySchema";

import { dryRunProcessingIdentitySubjectResolution } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/dryRun";
import {
    PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_DETERMINISTIC_STRATEGY_KEY,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION_POLICY_KEY,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import { listDecisionClassKeys, resolveDecisionClass } from "@/lib/trust/decisionClasses/decisionClassRegistry";
import { TRUST_REGISTRY } from "@/lib/trust/registry/trustRegistry";
import { composeTrustRegistry, TrustRegistryCompositionError } from "@/lib/trust/registry/composeTrustRegistry";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/contribution";
import { PLATFORM_PRIVACY_POLICY_CONTRIBUTION } from "@/lib/trust/platform/platformPrivacyPolicies";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";
import { assembleTrustEvidence } from "@/lib/trust/governance/trustEvidence";

const WEB_ROOT = join(__dirname, "..", "..");
const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const FACTS_HASH = "a".repeat(64);

/** Records every repository call so "no durable write" is measured, not assumed. */
function makeRecordingRepository() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const observations: unknown[] = [];
    const lifecycle: unknown[] = [];
    const repository: TrustRepository = {
        async insertContract(c) { contracts.push(c); },
        async advanceContractLifecycle(l) { lifecycle.push(l); },
        async insertPackage(p) { packages.push(p); },
        async insertObservation(o) { observations.push(o); },
        async insertReasoningUsage(u) { usage.push(u); },
    };
    return { repository, contracts, packages, usage, observations, lifecycle };
}

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
                explanation: "Email or phone matches Alex Lyons at alex@lyons.example.",
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

/** The full production path: engine result → Phase 1.3 adapter → governed shape. */
function recommendationFor(r: ProcessingResolutionRow, candidates: IdentityCandidate[]) {
    const material = buildProcessingIdentityTrustDecisionMaterial({
        orgId: "org-1",
        processingCaseId: "case-1",
        subjectRole: r.subject_role,
        eligibility: evaluateSubjectEligibility(r),
        candidates,
        createNewOverride: null,
        inputFactsHash: FACTS_HASH,
        materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identityResolverVersion: IDENTITY_RESOLVER_VERSION,
    });
    return toGovernedIdentitySubjectRecommendation(material);
}

async function dryRun(recommendation: Readonly<Record<string, unknown>>, repo = makeRecordingRepository()) {
    const result = await dryRunProcessingIdentitySubjectResolution({
        org_id: "org-1",
        processing_case_id: "case-1",
        recommendation,
        repository: repo.repository,
        nowIso: FIXED_NOW,
        clock: () => 0,
    });
    return { ...result, repo };
}

// ---------------------------------------------------------------------------
// 1-4, 32, 33. Composition
// ---------------------------------------------------------------------------

describe("P14-A — the third class composes", () => {
    it("registers exactly three classes, in deterministic order", () => {
        expect(listDecisionClassKeys()).toEqual([
            "attention_suggestion_enrichment",
            "processing_source_classification",
            "processing_identity_subject_resolution",
        ]);
    });

    it("declares the class with no _v1 suffix, escalation 0 and no AI feature gate", () => {
        const cls = resolveDecisionClass(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY);
        expect(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY).not.toMatch(/_v\d+$/);
        expect(cls?.risk_tier).toBe("mandatory");
        expect(cls?.economic_policy.max_escalation_level).toBe(0);
        expect(cls?.strategy_preference).toEqual(["deterministic"]);
        expect(cls?.requires_allowed_feature).toBeNull();
        expect(cls?.review_requirement).toBe("operator_review");
        expect(cls?.validation_policy_key).toBe(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_VALIDATION_POLICY_KEY);
    });

    it("registers exactly one deterministic strategy bound to the class", () => {
        const strategies = TRUST_REGISTRY.listStrategiesForDecisionClass(
            PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        );
        expect(strategies.map((s) => s.key)).toEqual([
            PROCESSING_IDENTITY_SUBJECT_RESOLUTION_DETERMINISTIC_STRATEGY_KEY,
        ]);
        expect(strategies[0]!.kind).toBe("deterministic");
    });

    it("references a PLATFORM-owned privacy policy that prohibits identity outright", () => {
        const policy = TRUST_REGISTRY.getPrivacyPolicy(PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY);
        expect(policy).not.toBeNull();
        expect(policy?.pii_mode).toBe("strict");
        expect(policy?.prohibited_classes).toEqual(["identity", "financial"]);
        expect(TRUST_REGISTRY.provenanceOf("privacy_policy", PROCESSING_IDENTITY_MINIMIZATION_POLICY_KEY)?.owner)
            .toBe("platform");
        expect(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION.privacyPolicies).toBeUndefined();
    });

    it("a duplicate identity-class registration fails composition loudly", () => {
        expect(() =>
            composeTrustRegistry([
                PLATFORM_PRIVACY_POLICY_CONTRIBUTION,
                PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION,
                { ...PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION, id: "capability.duplicate" },
            ]),
        ).toThrow(TrustRegistryCompositionError);
    });

    it("a dangling privacy-policy reference fails composition", () => {
        expect(() => composeTrustRegistry([PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CONTRIBUTION])).toThrow();
    });

    it("the two existing capabilities are unchanged", () => {
        const v1 = resolveDecisionClass("attention_suggestion_enrichment");
        expect(v1?.trust_threshold).toBe(0.5);
        expect(v1?.requires_allowed_feature).toBe("draft_enrichment");
        const classification = resolveDecisionClass("processing_source_classification");
        expect(classification?.risk_tier).toBe("convenience");
        expect(classification?.review_requirement).toBe("operator_review");
    });
});

// ---------------------------------------------------------------------------
// 17. The threshold sentinel
// ---------------------------------------------------------------------------

describe("P14-B — trust_threshold 0 is inert, not 'automatically trusted'", () => {
    it("the threshold is compared to the VECTOR score, never to confidence", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/trust/governance/trustEvidence.ts"), "utf8");
        expect(src).toContain("meets_class_threshold: score >= input.decisionClass.trust_threshold");
        // Confidence is not an input to the vector at all.
        expect(src).not.toContain("proposal.confidence");
    });

    it("`meets_class_threshold` has no consumer — it reaches no package field or route", () => {
        // CODE, not prose: the contribution's own comment explains that this
        // flag is inert, and a substring scan would report that explanation.
        const stripComments = (src: string) =>
            src
                .split("\n")
                .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
                .join("\n");

        const offenders: string[] = [];
        for (const area of ["lib", "app", "scripts"]) {
            for (const file of sourceFilesUnder(area)) {
                if (file.endsWith("trustEvidence.ts")) continue;
                if (stripComments(readFileSync(file, "utf8")).includes("meets_class_threshold")) {
                    offenders.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(offenders).toEqual([]);
        // ...and it is absent from the package type entirely.
        const pkgTypes = readFileSync(join(WEB_ROOT, "lib/trust/package/decisionPackageTypes.ts"), "utf8");
        expect(pkgTypes).not.toContain("meets_class_threshold");
    });

    it("a null-confidence package is NOT marked trusted by the zero threshold", async () => {
        const { package: pkg } = await dryRun(recommendationFor(row(), [candidate()]));
        expect(pkg.confidence).toBeNull();
        // Nothing in the package asserts automatic trust.
        expect(pkg.review_requirement).toBe("operator_review");
        expect(JSON.stringify(pkg)).not.toContain("meets_class_threshold");
        expect(JSON.stringify(pkg)).not.toContain("automatically_trusted");
    });

    it("the evaluation is identical whether the threshold is 0 or 1", () => {
        const cls = resolveDecisionClass(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY)!;
        const common = {
            context: { transformed: {}, knowledge: [], redaction_steps: [], classes_present: [], pii_mode: "strict" as const, transformations: [] },
            proposal: { recommendation: {}, confidence: null, evidence: [], explanation: "x", remaining_uncertainty: [] },
            validation: { policy_key: "p", policy_version: "1", results: [], passed: true },
            strategyKind: "deterministic",
        };
        const atZero = assembleTrustEvidence({ ...common, decisionClass: { ...cls, trust_threshold: 0 } });
        const atOne = assembleTrustEvidence({ ...common, decisionClass: { ...cls, trust_threshold: 1 } });
        // Only the inert flag differs; the score, vector and review requirement do not.
        expect(atZero.score).toBe(atOne.score);
        expect(atZero.vector).toEqual(atOne.vector);
        expect(atZero.review_requirement).toBe(atOne.review_requirement);
    });
});

// ---------------------------------------------------------------------------
// 7-16, 25-31. The dry run through the real runtime
// ---------------------------------------------------------------------------

describe("P14-C — the dry run traverses the real runtime and persists nothing", () => {
    it("executes every canonical step and returns an in-memory package", async () => {
        const { package: pkg, step_trace } = await dryRun(recommendationFor(row(), [candidate()]));
        expect(step_trace).toEqual([
            "resolve_truth_and_context",
            "classify_information",
            "apply_privacy_transformations",
            "retrieve_authorized_knowledge",
            "select_strategy",
            "execute_reasoning",
            "deterministic_validation",
            "trust_evaluation",
            "build_decision_package",
        ]);
        expect(pkg.outcome).toBe("recommended");
        expect(pkg.decision_class_key).toBe(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY);
    });

    it("the NULL repository receives no durable write at all", async () => {
        // The default repository is the null one; nothing to record.
        const result = await dryRunProcessingIdentitySubjectResolution({
            org_id: "org-1",
            processing_case_id: "case-1",
            recommendation: recommendationFor(row(), [candidate()]),
            nowIso: FIXED_NOW,
            clock: () => 0,
        });
        expect(result.package.id).toBeTruthy();
        expect(result.package.outcome).toBe("recommended");
    });

    it.each([
        ["confirmed_existing", () => row(), "automatic"],
        ["confirmed_new", () => row({ decision_action: "create_new", candidates: [] }), "automatic"],
        ["needs_review", () => row({ decision_action: "review_required", decided_by: "engine" }), "operator_review"],
        ["unresolved", () => row({ decision_action: "request_information" }), "operator_review"],
    ])("%s survives the runtime as a RECOMMENDED package", async (disposition, mk, perResult) => {
        const r = mk();
        const rec = recommendationFor(r, (r.candidates ?? []) as IdentityCandidate[]);
        const { package: pkg } = await dryRun(rec);
        expect(pkg.outcome).toBe("recommended");
        expect((pkg.recommendation as Record<string, unknown>).disposition).toBe(disposition);
        expect((pkg.recommendation as Record<string, unknown>).review_requirement).toBe(perResult);
        // Never a runtime failure.
        expect(pkg.outcome).not.toBe("failed_reasoning");
        expect(pkg.outcome).not.toBe("failed_validation");
    });

    it("conflicted survives as recommended and review-required, distinct from unresolved", async () => {
        const conflicted = candidate({
            confidenceBand: "conflicted",
            blockingConflicts: [
                {
                    key: "child_dob_mismatch", kind: "contradicting", strength: "strong",
                    subjectFactRefs: [], recordFieldRefs: [],
                    reasonCode: "child_dob_mismatch",
                    explanation: "Child Alex Lyons dob 2019-04-11 conflicts.",
                },
            ],
        });
        const r = row({ decision_action: "review_required", decided_by: "engine", candidates: [conflicted] });
        const { package: pkg } = await dryRun(recommendationFor(r, [conflicted]));
        const rec = pkg.recommendation as Record<string, unknown>;
        expect(pkg.outcome).toBe("recommended");
        expect(rec.disposition).toBe("conflicted");
        expect(rec.conflict_categories).toContain("conflicting_identity_facts");
    });

    it("numeric confidence is null and the categorical band is preserved", async () => {
        for (const band of ["confirmed", "strong", "possible", "weak"] as const) {
            const { package: pkg } = await dryRun(recommendationFor(row(), [candidate({ confidenceBand: band })]));
            expect(pkg.confidence).toBeNull();
            expect((pkg.recommendation as Record<string, unknown>).confidence_band).toBe(band);
        }
    });

    it("zero provider cost, no provider identity, no command binding, no case-level gate", async () => {
        const { package: pkg } = await dryRun(recommendationFor(row(), [candidate()]));
        expect(pkg.economics.provider_cost_units).toBe(0);
        expect(pkg.economics.strategy_kind).toBe("deterministic");
        expect(pkg.economics.escalation_level).toBe(0);
        const serialized = JSON.stringify(pkg).toLowerCase();
        for (const forbidden of [
            "provider_key", "provider_name", "model_id", "prompt", "api_key",
            "proposed_command", "command_key", "openai", "anthropic",
            "child_identity_unconfirmed", "plan_id", "approval",
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it("carries no candidate, person record, name, email, phone or date of birth", async () => {
        const piiCandidate = candidate({
            displayName: "Alex Lyons",
            explanation: "Matched Alex Lyons, alex@lyons.example, +15555550100, dob 2019-04-11.",
        });
        const { package: pkg } = await dryRun(recommendationFor(row({ candidates: [piiCandidate] }), [piiCandidate]));
        const serialized = JSON.stringify(pkg);
        for (const secret of ["Alex", "Lyons", "@lyons", "5555550100", "2019-04-11", "rec-1"]) {
            expect(serialized).not.toContain(secret);
        }
    });

    /**
     * An UNKNOWN key fails closed even earlier than validation.
     *
     * `classifyElements` maps an unmapped element to `identity` — the
     * conservative default — and this class's privacy policy prohibits
     * `identity` outright, so the transform refuses before reasoning runs.
     * That is a stronger guarantee than a validation rejection: the smuggled
     * value never reaches the strategy at all.
     */
    it("an unknown key fails CLOSED at the privacy layer, before reasoning", async () => {
        const good = recommendationFor(row(), [candidate()]);
        const { package: pkg, step_trace } = await dryRun({ ...good, unexpected_key: "smuggled" });
        expect(pkg.outcome).toBe("refused_privacy");
        expect(pkg.recommendation).toBeNull();
        // Reasoning never ran.
        expect(step_trace).not.toContain("execute_reasoning");
        expect(JSON.stringify(pkg)).not.toContain("smuggled");
    });

    it("a KNOWN key with an invalid value fails closed at validation", async () => {
        const good = recommendationFor(row(), [candidate()]);
        // Structurally legal shape, out-of-vocabulary disposition.
        const { package: pkg } = await dryRun({ ...good, disposition: "totally_made_up" });
        expect(pkg.outcome).toBe("failed_validation");
        expect(pkg.recommendation).toBeNull();
    });

    it("a smuggled provider or command field is refused, not carried", async () => {
        const good = recommendationFor(row(), [candidate()]);
        for (const smuggled of [{ provider_key: "openai" }, { proposed_command: { command_key: "create_person" } }]) {
            const { package: pkg } = await dryRun({ ...good, ...smuggled });
            expect(pkg.outcome).not.toBe("recommended");
            expect(pkg.recommendation).toBeNull();
            expect(JSON.stringify(pkg).toLowerCase()).not.toContain("openai");
            expect(JSON.stringify(pkg)).not.toContain("create_person");
        }
    });

    it("an empty element refuses rather than inventing a judgment", async () => {
        const { package: pkg } = await dryRun({
            subject_ref: "", disposition: "", identity_resolver_version: "",
        });
        expect(["failed_reasoning", "refused_insufficient_information"]).toContain(pkg.outcome);
        expect(pkg.recommendation).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 18. Review requirement agreement
// ---------------------------------------------------------------------------

describe("P14-D — review requirements resolve to the stricter value", () => {
    it("the class default cannot weaken a stricter per-result requirement", () => {
        expect(resolveEffectiveReviewRequirement("automatic", "operator_review")).toBe("operator_review");
        expect(resolveEffectiveReviewRequirement("operator_review", "automatic")).toBe("operator_review");
        expect(resolveEffectiveReviewRequirement("operator_review", "operator_review")).toBe("operator_review");
        // Only both-automatic yields automatic.
        expect(resolveEffectiveReviewRequirement("automatic", "automatic")).toBe("automatic");
    });

    it("the package carries the class default while the recommendation carries the refinement", async () => {
        const { package: pkg } = await dryRun(recommendationFor(row(), [candidate()]));
        // Class default — `assembleTrustEvidence` reads decisionClass.review_requirement.
        expect(pkg.review_requirement).toBe("operator_review");
        // Per-result refinement, for a confirmed subject.
        expect((pkg.recommendation as Record<string, unknown>).review_requirement).toBe("automatic");
        // Effective is the stricter of the two.
        expect(
            resolveEffectiveReviewRequirement(
                pkg.review_requirement,
                String((pkg.recommendation as Record<string, unknown>).review_requirement),
            ),
        ).toBe("operator_review");
    });

    it("an operator override stays identified as operator-originated", async () => {
        const material = buildProcessingIdentityTrustDecisionMaterial({
            orgId: "org-1", processingCaseId: "case-1", subjectRole: "parent",
            eligibility: evaluateSubjectEligibility(row()),
            candidates: [candidate()],
            createNewOverride: { rejectedCandidateIds: ["rec-9"] },
            inputFactsHash: FACTS_HASH,
            materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identityResolverVersion: IDENTITY_RESOLVER_VERSION,
        });
        const { package: pkg } = await dryRun(toGovernedIdentitySubjectRecommendation(material));
        expect((pkg.recommendation as Record<string, unknown>).disposition_source).toBe("operator_decision");
    });
});

// ---------------------------------------------------------------------------
// 29. Case-level readiness never enters
// ---------------------------------------------------------------------------

describe("P14-E — case-level readiness is not a subject judgment", () => {
    it("the projection drops the case gate, and the parser refuses it if forced", () => {
        const rec = recommendationFor(row({ decision_action: "review_required", decided_by: "engine" }), [candidate()]);
        expect(rec.blocking_reason_codes).not.toContain("child_identity_unconfirmed");
        // Forced past the projection, validation refuses it.
        const forced = { ...rec, blocking_reason_codes: [...CASE_LEVEL_READINESS_CODES] };
        expect(safeParseGovernedIdentitySubjectRecommendationV1(forced)).toBeNull();
    });

    it("a forced case gate makes the runtime produce failed_validation", async () => {
        const rec = recommendationFor(row(), [candidate()]);
        const { package: pkg } = await dryRun({ ...rec, blocking_reason_codes: ["child_identity_unconfirmed"] });
        expect(pkg.outcome).toBe("failed_validation");
        expect(JSON.stringify(pkg)).not.toContain("child_identity_unconfirmed");
    });
});

// ---------------------------------------------------------------------------
// 5, 6, 37, 38, 39. Determinism, purity and dormancy
// ---------------------------------------------------------------------------

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

describe("P14-F — deterministic, pure and dormant", () => {
    it("two runs of the same material agree on everything but package identity", async () => {
        const rec = recommendationFor(row(), [candidate()]);
        const a = await dryRun(rec);
        const b = await dryRun(rec);
        expect(a.package.id).not.toBe(b.package.id);
        expect(a.package.recommendation).toEqual(b.package.recommendation);
        expect(a.package.evidence).toEqual(b.package.evidence);
        expect(a.package.confidence).toBe(b.package.confidence);
        expect(a.package.trust_score).toBe(b.package.trust_score);
    });

    it("the strategy imports no matching engine and no Processing module", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/reasoning/strategies/processingIdentitySubjectResolutionDeterministic.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        expect(imports.some((i) => i.startsWith("@/lib/pos"))).toBe(false);
        for (const engine of ["generateCandidates", "householdGraph", "matchIdentity", "confidenceBand", "canonicalResolutionEngine"]) {
            expect(imports.some((i) => i.includes(engine))).toBe(false);
        }
    });

    it("lib/trust never imports the Processing identity ENGINE — only the adapter contract", () => {
        const posImports: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            for (const m of readFileSync(file, "utf8").matchAll(/from\s+"(@\/lib\/pos\/[^"]+)"/g)) {
                posImports.push(m[1]!);
            }
        }
        expect(posImports.sort()).toEqual([
            "@/lib/pos/processingCase/classification/governedClassificationSchema",
            "@/lib/pos/processingIdentity/trustAdapter/governedIdentitySchema",
        ]);
        // Neither is an engine module.
        for (const i of posImports) {
            expect(i).not.toContain("canonicalResolutionEngine");
            expect(i).not.toContain("generateCandidates");
        }
    });

    it("no production module imports the dry run", () => {
        const importers: string[] = [];
        for (const area of ["lib", "app", "scripts", "components"]) {
            let files: string[] = [];
            try { files = sourceFilesUnder(area); } catch { continue; }
            for (const file of files) {
                if (file.includes("processingIdentitySubjectResolution/dryRun.ts")) continue;
                if (readFileSync(file, "utf8").includes("processingIdentitySubjectResolution/dryRun")) {
                    importers.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(importers).toEqual([]);
    });

    it("no production module submits a contract for the identity class", () => {
        const callers: string[] = [];
        for (const area of ["lib", "app", "scripts"]) {
            for (const file of sourceFilesUnder(area)) {
                if (file.includes("/processingIdentitySubjectResolution/")) continue;
                const src = readFileSync(file, "utf8");
                if (src.includes("processing_identity_subject_resolution") && src.includes("executeDecisionContract")) {
                    callers.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(callers).toEqual([]);
    });

    it("the dry run mutates no Processing record — it holds no client at all", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/capabilities/processingIdentitySubjectResolution/dryRun.ts"),
            "utf8",
        );
        expect(src).not.toContain("supabase");
        expect([...src.matchAll(/\.from\(\s*["']/g)]).toEqual([]);
        expect(src).toContain("createNullTrustRepository");
    });
});
