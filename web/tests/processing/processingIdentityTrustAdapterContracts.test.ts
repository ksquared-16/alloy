/**
 * Phase 1.3 — Processing identity Trust adapter contracts.
 *
 * A pure contract slice: the adapter DESCRIBES a judgment the Processing engine
 * already made. These assertions prove it maps every state explicitly, keeps
 * confidence categorical, never copies explanation PII, and never recomputes
 * candidate logic — and that nothing in production calls it yet.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import type { IdentityCandidate, CandidateConfidenceBand } from "@/lib/identity";
import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityResolutionEligibility } from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";
import { evaluateSubjectEligibility } from "@/lib/pos/processingIdentity/operator/identityResolutionEligibility";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import {
    buildProcessingIdentityTrustDecisionMaterial,
    identityEngineFailureMaterial,
    identityInvalidInputMaterial,
    IDENTITY_AMBIGUITY_CATEGORIES,
    PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
} from "@/lib/pos/processingIdentity/trustAdapter/identityTrustDecisionMaterial";
import {
    processingIdentitySubjectAdoptionId,
    IDENTITY_ADOPTION_IDENTITY_VERSION,
} from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import {
    identityExplanationCategory,
    isProcessingAuthoredExplanation,
    safeIdentityExplanation,
} from "@/lib/pos/processingIdentity/trustAdapter/safeExplanation";

const WEB_ROOT = join(__dirname, "..", "..");
const FACTS_HASH = "a".repeat(64);

/**
 * A candidate carrying REAL PII in every free-text field, exactly as the engine
 * emits it — `matchIdentity` interpolates a person's name into `reasons`, which
 * lands in both of these.
 */
function candidate(overrides: Partial<IdentityCandidate> = {}): IdentityCandidate {
    return {
        subjectRef: "parent-1",
        entityType: "person",
        recordId: "rec-1",
        confidenceBand: "strong",
        score: 5,
        signals: [
            {
                key: "exact_email",
                kind: "supporting",
                strength: "deterministic",
                subjectFactRefs: ["fact-1"],
                recordFieldRefs: ["persons.email"],
                reasonCode: "exact_email_match",
                explanation: "Exact canonical email match within organization.",
            },
        ],
        blockingConflicts: [],
        explanation: "Email or phone matches Alex Lyons, but the submitted name differs.",
        resolverVersion: IDENTITY_RESOLVER_VERSION,
        displayName: "Alex Lyons",
        ...overrides,
    };
}

function conflictedCandidate(): IdentityCandidate {
    return candidate({
        confidenceBand: "conflicted",
        blockingConflicts: [
            {
                key: "identity_name_mismatch",
                kind: "contradicting",
                strength: "strong",
                subjectFactRefs: ["fact-1"],
                recordFieldRefs: [],
                reasonCode: "identity_name_mismatch",
                // The engine's real shape: a person's name, inline.
                explanation: "Email or phone matches Alex Lyons, but the submitted name differs.",
            },
        ],
    });
}

function row(overrides: Partial<ProcessingResolutionRow> = {}): ProcessingResolutionRow {
    return {
        id: "res-1",
        org_id: "org-1",
        case_id: "case-1",
        generation_id: "gen-1",
        input_facts_hash: FACTS_HASH,
        subject_ref: "parent-1",
        subject_role: "parent",
        provisional: {},
        candidates: [candidate()],
        decision_action: "link_existing",
        selected_candidate_id: "rec-1",
        decided_by: "operator",
        operator_id: "op-1",
        policy_version: null,
        resolver_version: IDENTITY_RESOLVER_VERSION,
        stale_at: null,
        superseded_by: null,
        retention_class: "uncommitted_submission",
        created_at: "2026-08-05T12:00:00.000Z",
        ...overrides,
    };
}

function build(
    eligibility: IdentityResolutionEligibility,
    candidates: IdentityCandidate[],
    override?: { rejectedCandidateIds: string[] } | null,
) {
    return buildProcessingIdentityTrustDecisionMaterial({
        orgId: "org-1",
        processingCaseId: "case-1",
        subjectRole: "parent",
        eligibility,
        candidates,
        createNewOverride: override ?? null,
        inputFactsHash: FACTS_HASH,
        materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identityResolverVersion: IDENTITY_RESOLVER_VERSION,
    });
}

/** Drives the REAL eligibility engine so mappings track its actual output. */
function eligibilityFor(r: ProcessingResolutionRow): IdentityResolutionEligibility {
    return evaluateSubjectEligibility(r);
}

// ---------------------------------------------------------------------------
// 1-7. Status mapping
// ---------------------------------------------------------------------------

describe("P13-A — every Processing identity state maps explicitly", () => {
    it("confirmed_existing → recommended / automatic", () => {
        const e = eligibilityFor(row());
        expect(e.state).toBe("confirmed_existing");
        const m = build(e, [candidate()]);
        expect(m.disposition).toBe("confirmed_existing");
        expect(m.outcome).toBe("recommended");
        expect(m.review_requirement).toBe("automatic");
    });

    it("confirmed_new → recommended / automatic", () => {
        const e = eligibilityFor(row({ decision_action: "create_new", candidates: [] }));
        expect(e.state).toBe("confirmed_new");
        const m = build(e, []);
        expect(m.outcome).toBe("recommended");
        expect(m.review_requirement).toBe("automatic");
        expect(m.ambiguity_categories).toContain("no_candidate");
    });

    it("needs_review is a SUCCESSFUL governed judgment requiring review, not a failure", () => {
        const e = eligibilityFor(row({ decision_action: "review_required", decided_by: "engine" }));
        expect(e.state).toBe("needs_review");
        const m = build(e, [candidate()]);
        expect(m.outcome).toBe("recommended");
        expect(m.review_requirement).toBe("operator_review");
        expect(m.outcome).not.toBe("failed_reasoning");
        expect(m.ambiguity_categories).toContain("operator_review_required");
    });

    it("conflicted stays DISTINCT from unresolved", () => {
        const conflicted = build(
            eligibilityFor(row({ decision_action: "review_required", decided_by: "engine", candidates: [conflictedCandidate()] })),
            [conflictedCandidate()],
        );
        const unresolved = build(
            eligibilityFor(row({ decision_action: "request_information" })),
            [candidate()],
        );
        expect(conflicted.disposition).toBe("conflicted");
        expect(unresolved.disposition).toBe("unresolved");
        expect(conflicted.disposition).not.toBe(unresolved.disposition);
        expect(conflicted.conflict_categories).toContain("conflicting_identity_facts");
        expect(unresolved.conflict_categories).toEqual([]);
        expect(unresolved.ambiguity_categories).toContain("insufficient_evidence");
    });

    it("ambiguous candidate states stay distinct — one vs many vs none", () => {
        const e = eligibilityFor(row({ decision_action: "review_required", decided_by: "engine" }));
        const none = build(e, []);
        const one = build(e, [candidate()]);
        const many = build(e, [candidate(), candidate({ recordId: "rec-2" })]);
        expect(none.ambiguity_categories).toContain("no_candidate");
        expect(one.ambiguity_categories).toContain("single_plausible_candidate");
        expect(many.ambiguity_categories).toContain("multiple_plausible_candidates");
        // Never collapsed into a single generic bucket.
        expect(new Set([none, one, many].map((m) => m.ambiguity_categories.join(",")))?.size).toBe(3);
    });

    it("an explicit create-new override is attributed to the OPERATOR, not the engine", () => {
        const e = eligibilityFor(row());
        const m = build(e, [candidate()], { rejectedCandidateIds: ["rec-9", "rec-8"] });
        expect(m.disposition_source).toBe("operator_decision");
        expect(m.ambiguity_categories).toContain("operator_override_applied");
        expect(m.evidence.rejected_candidate_count).toBe(2);
        // The rejected ids themselves never enter the material.
        expect(JSON.stringify(m)).not.toContain("rec-9");
    });

    it("invalid input and engine failure remain distinguishable", () => {
        const common = {
            orgId: "org-1", processingCaseId: "case-1", subjectRef: "parent-1", subjectRole: "parent",
            inputFactsHash: FACTS_HASH,
            materialProjectionVersion: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identityResolverVersion: IDENTITY_RESOLVER_VERSION,
        };
        const invalid = identityInvalidInputMaterial({ ...common, blockingReasonCode: "needs_information" });
        const failure = identityEngineFailureMaterial({ ...common, failureCode: "resolver_threw" });
        expect(invalid.outcome).toBe("refused_insufficient_information");
        expect(failure.outcome).toBe("failed_reasoning");
        expect(invalid.outcome).not.toBe(failure.outcome);
        // Both share the adoption identity, so a retry is recognizable.
        expect(invalid.adoption_id).toBe(failure.adoption_id);
    });

    it("covers the full eligibility state vocabulary", () => {
        const states = new Set(
            [
                row(),
                row({ decision_action: "create_new", candidates: [] }),
                row({ decision_action: "review_required", decided_by: "engine" }),
                row({ decision_action: "review_required", decided_by: "engine", candidates: [conflictedCandidate()] }),
                row({ decision_action: "request_information" }),
            ].map((r) => build(eligibilityFor(r), (r.candidates ?? []) as IdentityCandidate[]).disposition),
        );
        expect(states).toEqual(
            new Set(["confirmed_existing", "confirmed_new", "needs_review", "conflicted", "unresolved"]),
        );
    });
});

// ---------------------------------------------------------------------------
// 8, 9, 10. Confidence
// ---------------------------------------------------------------------------

describe("P13-B — confidence stays categorical", () => {
    it("numeric confidence is ALWAYS null, on every path", () => {
        const materials = [
            build(eligibilityFor(row()), [candidate()]),
            build(eligibilityFor(row({ decision_action: "request_information" })), []),
            identityInvalidInputMaterial({
                orgId: "o", processingCaseId: "c", subjectRef: "s", subjectRole: "parent",
                inputFactsHash: FACTS_HASH, materialProjectionVersion: "v", identityResolverVersion: "r",
                blockingReasonCode: "x",
            }),
        ];
        for (const m of materials) expect(m.confidence).toBeNull();
    });

    it("the engine's band vocabulary is carried through unchanged", () => {
        const bands: CandidateConfidenceBand[] = ["confirmed", "strong", "possible", "weak"];
        for (const band of bands) {
            const m = build(eligibilityFor(row()), [candidate({ confidenceBand: band })]);
            expect(m.confidence_band).toBe(band);
        }
    });

    it("candidate `score` is never read and never becomes a probability", () => {
        const a = build(eligibilityFor(row()), [candidate({ score: 1 })]);
        const b = build(eligibilityFor(row()), [candidate({ score: 999 })]);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
        expect(JSON.stringify(a)).not.toContain("999");
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityTrustDecisionMaterial.ts"),
            "utf8",
        );
        expect(src).not.toMatch(/\.score\b/);
    });

    it("no band is expressed as a percentage or ratio anywhere in the output", () => {
        const m = build(eligibilityFor(row()), [candidate()]);
        const serialized = JSON.stringify(m);
        expect(serialized).not.toMatch(/0\.\d+/);
        expect(serialized).not.toContain("%");
    });
});

// ---------------------------------------------------------------------------
// 11-17. Explanation PII audit + bounded evidence
// ---------------------------------------------------------------------------

describe("P13-C — no explanation PII crosses the boundary", () => {
    const PII = [
        "Alex Lyons",
        "alex@lyons.example",
        "+15555550100",
        "2019-04-11",
        "12 Oak Street",
        "Subsidy_Contract_Lyons.pdf",
    ];

    function piiLoadedCandidate(): IdentityCandidate {
        return candidate({
            displayName: "Alex Lyons",
            explanation: "Email or phone matches Alex Lyons at alex@lyons.example, +15555550100.",
            signals: [
                {
                    key: "exact_email",
                    kind: "supporting",
                    strength: "deterministic",
                    subjectFactRefs: ["fact-1"],
                    recordFieldRefs: ["persons.email"],
                    reasonCode: "exact_email_match",
                    explanation: "Matched alex@lyons.example for Alex Lyons, dob 2019-04-11, 12 Oak Street.",
                },
            ],
            blockingConflicts: [
                {
                    key: "child_dob_mismatch",
                    kind: "contradicting",
                    strength: "strong",
                    subjectFactRefs: [],
                    recordFieldRefs: [],
                    reasonCode: "child_dob_mismatch",
                    explanation: "Child Alex Lyons dob 2019-04-11 conflicts. Source: Subsidy_Contract_Lyons.pdf",
                },
            ],
        });
    }

    it("names, emails, phones, dates of birth, addresses and document titles are all absent", () => {
        const m = build(eligibilityFor(row({ candidates: [piiLoadedCandidate()] })), [piiLoadedCandidate()]);
        const serialized = JSON.stringify(m);
        for (const secret of PII) expect(serialized).not.toContain(secret);
        // Not even a fragment.
        for (const fragment of ["Lyons", "Alex", "@lyons", "5555550100", "Oak Street", ".pdf"]) {
            expect(serialized).not.toContain(fragment);
        }
    });

    it("every emitted explanation is Processing-authored, never engine text", () => {
        const m = build(eligibilityFor(row({ candidates: [piiLoadedCandidate()] })), [piiLoadedCandidate()]);
        expect(m.safe_explanations.length).toBeGreaterThan(0);
        for (const text of m.safe_explanations) {
            expect(isProcessingAuthoredExplanation(text)).toBe(true);
        }
    });

    it("raw fact values and record ids are not copied", () => {
        const m = build(eligibilityFor(row()), [candidate({ recordId: "rec-secret-1" })]);
        const serialized = JSON.stringify(m);
        expect(serialized).not.toContain("rec-secret-1");
        expect(serialized).not.toContain("fact-1");
        expect(serialized).not.toContain("persons.email");
    });

    it("evidence is bounded — counts and categories only, no unbounded arrays of records", () => {
        const many = Array.from({ length: 40 }, (_, i) => candidate({ recordId: `rec-${i}` }));
        const m = build(eligibilityFor(row({ candidates: many })), many);
        expect(m.evidence.candidate_count).toBe(40);
        expect(m.evidence.plausible_candidate_count).toBe(40);
        // The categories are a closed vocabulary, so they cannot grow with input.
        expect(m.evidence.supporting_signal_categories.length).toBeLessThanOrEqual(3);
        expect(JSON.stringify(m).length).toBeLessThan(2000);
        for (let i = 0; i < 40; i += 1) expect(JSON.stringify(m)).not.toContain(`rec-${i}`);
    });

    it("an unknown engine code degrades to `unclassified`, never to raw text", () => {
        expect(identityExplanationCategory("some_brand_new_code")).toBe("unclassified");
        expect(safeIdentityExplanation("some_brand_new_code")).not.toContain("some_brand_new_code");
        const withUnknown = candidate({
            signals: [
                {
                    key: "novel", kind: "supporting", strength: "weak",
                    subjectFactRefs: [], recordFieldRefs: [],
                    reasonCode: "novel_signal_with_PII_Alex_Lyons",
                    explanation: "Alex Lyons matched.",
                },
            ],
        });
        const m = build(eligibilityFor(row({ candidates: [withUnknown] })), [withUnknown]);
        expect(JSON.stringify(m)).not.toContain("Alex");
        expect(m.evidence.supporting_signal_categories).toEqual(["unclassified"]);
    });
});

// ---------------------------------------------------------------------------
// 18-23. Adoption identity
// ---------------------------------------------------------------------------

describe("P13-D — the subject adoption identity behaves", () => {
    const base = {
        org_id: "org-1",
        processing_case_id: "case-1",
        subject_ref: "parent-1",
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: FACTS_HASH,
        material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identity_resolver_version: IDENTITY_RESOLVER_VERSION,
    };

    it("is deterministic and uuid-shaped", () => {
        const id = processingIdentitySubjectAdoptionId(base);
        expect(id).toBe(processingIdentitySubjectAdoptionId({ ...base }));
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("object-key order does not change it", () => {
        const reordered = Object.fromEntries(Object.entries(base).reverse()) as typeof base;
        expect(Object.keys(reordered)).not.toEqual(Object.keys(base));
        expect(processingIdentitySubjectAdoptionId(reordered)).toBe(
            processingIdentitySubjectAdoptionId(base),
        );
    });

    it.each([
        ["subject_ref", { subject_ref: "child-1" }],
        ["input_facts_hash", { input_facts_hash: "b".repeat(64) }],
        ["material_projection_version", { material_projection_version: "proc-identity-fact-material-v2" }],
        ["identity_resolver_version", { identity_resolver_version: "proc-identity-v2" }],
        ["org_id", { org_id: "org-2" }],
        ["processing_case_id", { processing_case_id: "case-2" }],
        ["decision_class_key", { decision_class_key: "other_class" }],
    ])("a changed %s produces a different identity", (_name, change) => {
        expect(processingIdentitySubjectAdoptionId({ ...base, ...change })).not.toBe(
            processingIdentitySubjectAdoptionId(base),
        );
    });

    it("every subject on one case is distinct", () => {
        const ids = ["parent-1", "parent-2", "child-1", "household-1", "household-1:lead"].map((s) =>
            processingIdentitySubjectAdoptionId({ ...base, subject_ref: s }),
        );
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("no component can impersonate a field boundary", () => {
        // Values that would collide under naive concatenation.
        const a = processingIdentitySubjectAdoptionId({ ...base, org_id: "a", processing_case_id: "bc" });
        const b = processingIdentitySubjectAdoptionId({ ...base, org_id: "ab", processing_case_id: "c" });
        expect(a).not.toBe(b);
    });

    it("the adapter's adoption_id matches the helper for the same components", () => {
        const m = build(eligibilityFor(row()), [candidate()]);
        expect(m.adoption_id).toBe(processingIdentitySubjectAdoptionId(base));
        expect(IDENTITY_ADOPTION_IDENTITY_VERSION).toBe("proc-identity-adoption-v1");
    });
});

// ---------------------------------------------------------------------------
// 24-26, 29, 30. What must be absent
// ---------------------------------------------------------------------------

describe("P13-E — the material carries no execution or provider authority", () => {
    it("no provider identity, command binding or Commit Plan operation", () => {
        const m = build(eligibilityFor(row()), [candidate()]);
        const serialized = JSON.stringify(m).toLowerCase();
        for (const forbidden of [
            "provider", "model", "prompt", "api_key",
            "proposed_command", "command_key", "commandkey",
            "plan_id", "planid", "commit_plan", "operations", "approval",
            "openai", "anthropic",
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it("is a pure function — no I/O, no persistence, no Trust import", () => {
        const dir = join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter");
        for (const file of readdirSync(dir)) {
            const src = readFileSync(join(dir, file), "utf8");
            expect(src).not.toContain("@/lib/trust");
            expect(src).not.toContain("supabase");
            // Persistence, specifically: a table query or a write. `.update(`
            // alone would report `createHash().update()`, which is a digest, not
            // a mutation — and unlike `lib/trust`, `lib/pos` may use the builder.
            expect([...src.matchAll(/\.from\(\s*["']/g)]).toEqual([]);
            expect([...src.matchAll(/\.(insert|upsert|delete)\(/g)]).toEqual([]);
        }
    });

    it("does not mutate its inputs", () => {
        const c = [candidate()];
        const e = eligibilityFor(row());
        const before = JSON.stringify({ c, e });
        build(e, c);
        expect(JSON.stringify({ c, e })).toBe(before);
    });

    it("does not recompute candidate logic — it imports no matching engine", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityTrustDecisionMaterial.ts"),
            "utf8",
        );
        // IMPORTS, not prose — the module's own documentation legitimately
        // names `matchIdentity` when explaining where the PII originates.
        const imports = [...src.matchAll(/^import[\s\S]*?from\s+"([^"]+)";$/gm)].map((m) => m[1]!);
        for (const engine of [
            "generateCandidates",
            "householdGraph",
            "resolveIntakeRecordResolution",
            "matchIdentity",
            "canonicalResolutionEngine",
        ]) {
            expect(imports.some((i) => i.includes(engine))).toBe(false);
        }
        // Types only from the candidate contracts; the one value import is the
        // eligibility projection the operator surface already computed.
        expect(src).toContain("import type { IdentityCandidate");
    });
});

// ---------------------------------------------------------------------------
// Dormancy
// ---------------------------------------------------------------------------

describe("P13-F — the adapter is dormant", () => {
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

    /**
     * Phase 1.4 registered the identity capability, whose validation policy calls
     * out to this adapter's SCHEMA — the sanctioned pattern Phase 1.1 established.
     * What stays dormant is the material BUILDER: nothing in production computes
     * identity Trust material, which is what "no production caller" protects.
     */
    it("no production module imports the adapter's material builder", () => {
        const importers: string[] = [];
        for (const area of ["lib", "app", "scripts", "components"]) {
            let files: string[] = [];
            try {
                files = sourceFilesUnder(area);
            } catch {
                continue;
            }
            for (const file of files) {
                if (file.includes("/trustAdapter/")) continue;
                const src = readFileSync(file, "utf8");
                // The capability contribution may reference the SCHEMA (the
                // validation call-out). The builder must have no production caller.
                if (src.includes("identityTrustDecisionMaterial") || src.includes("identityAdoptionIdentity")) {
                    importers.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(importers).toEqual([]);
    });

    it("the decision class key is stable and suffix-free, and is now registered dormant", async () => {
        const { listDecisionClassKeys } = await import("@/lib/trust/decisionClasses/decisionClassRegistry");
        expect(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY).toBe("processing_identity_subject_resolution");
        expect(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY).not.toMatch(/_v\d+$/);
        // Phase 1.4 registered it. Registration makes the class AVAILABLE;
        // dormancy is proven by the absence of a production caller, above.
        expect(listDecisionClassKeys()).toContain(PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY);
    });

    it("lib/trust does not IMPORT the Processing identity engine", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            // Imports only. `decisionPackageFingerprint.ts` legitimately NAMES
            // `planHash.ts` in a comment as a stylistic precedent; a substring
            // scan would report that as a boundary breach.
            for (const m of src.matchAll(/from\s+"(@\/lib\/pos\/[^"]+)"/g)) {
                // The adapter CONTRACT is admissible (the validation call-out).
                // The ENGINE never is.
                for (const engine of [
                    "canonicalResolutionEngine", "generateCandidates", "householdGraph",
                    "matchIdentity", "processingFactsDb", "processingResolutionsDb",
                    "identityResolutionEligibility",
                ]) {
                    if (m[1]!.includes(engine)) offenders.push(`${file.replace(WEB_ROOT, "")}: ${m[1]}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("every lib/trust → lib/pos import is an owner-authored validation call-out", () => {
        const posImports: string[] = [];
        for (const file of sourceFilesUnder("lib/trust")) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/from\s+"(@\/lib\/pos\/[^"]+)"/g)) posImports.push(m[1]!);
        }
        // Both are owner-authored SCHEMA call-outs, never engine modules.
        expect(posImports.sort()).toEqual([
            "@/lib/pos/processingCase/classification/governedClassificationSchema",
            "@/lib/pos/processingIdentity/trustAdapter/governedIdentitySchema",
        ]);
    });

    it("every ambiguity category is reachable from some mapped state", () => {
        const produced = new Set<string>();
        for (const r of [
            row(),
            row({ decision_action: "create_new", candidates: [] }),
            row({ decision_action: "review_required", decided_by: "engine" }),
            row({ decision_action: "request_information" }),
        ]) {
            const cands = (r.candidates ?? []) as IdentityCandidate[];
            for (const c of build(eligibilityFor(r), cands).ambiguity_categories) produced.add(c);
        }
        for (const c of build(eligibilityFor(row()), [candidate()], { rejectedCandidateIds: ["x"] })
            .ambiguity_categories) {
            produced.add(c);
        }
        for (const c of build(eligibilityFor(row()), [candidate(), candidate({ recordId: "r2" })])
            .ambiguity_categories) {
            produced.add(c);
        }
        expect(produced).toEqual(new Set(IDENTITY_AMBIGUITY_CATEGORIES));
    });
});
