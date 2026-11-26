/**
 * Phase 1 closeout certification — the whole Processing adoption, audited at once.
 *
 * Every prior slice certified itself. This asserts the properties that only make
 * sense ACROSS slices, and that a future change could break without failing any
 * single slice's own suite:
 *
 *  - the authority boundary between Processing and Trust, in both directions;
 *  - one exactly-once mechanism, reused, with no second idempotency table;
 *  - one gap-type registry that every readiness projection excludes by list;
 *  - no unsafe identity data anywhere in Trust's write surface;
 *  - Commit Plan, approval and executor authority never moved.
 *
 * Structural where the property has no runtime surface — a boundary is only
 * violated on the day someone adds the wrong import, and no behavioural test
 * would notice.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { TRUST_OBSERVATION_KINDS } from "@/lib/trust/persistence/trustDecisionRepository";
import { OPERATOR_DECISION_EFFECTS } from "@/lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect";

const WEB_ROOT = join(__dirname, "..", "..");

function sourceFilesUnder(area: string): string[] {
    const out: string[] = [];
    const walk = (dir: string) => {
        for (const entry of readdirSync(dir)) {
            if (entry === "node_modules" || entry === ".next") continue;
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p);
            else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
        }
    };
    walk(join(WEB_ROOT, area));
    return out;
}

const read = (rel: string) => readFileSync(join(WEB_ROOT, rel), "utf8");
const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Every Processing→Trust adapter and Trust capability module Phase 1 added. */
const PHASE_1_ADAPTERS = [
    "lib/pos/processingCase/classification/trustGovernanceGapDb.ts",
    "lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration.ts",
    "lib/pos/processingIdentity/trustAdapter/identityGovernanceGapDb.ts",
    "lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps.ts",
    "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts",
    "lib/pos/processingIdentity/trustAdapter/identityLineageGapDb.ts",
    "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
    "lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect.ts",
    "lib/pos/processingIdentity/trustAdapter/executionLineageService.ts",
    "lib/pos/processingIdentity/trustAdapter/executionOutcomeMapping.ts",
    "lib/pos/processingIdentity/trustAdapter/identityExecutionGapDb.ts",
    "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts",
    "lib/pos/processingIdentity/trustAdapter/planPackageLineage.ts",
];

// ---------------------------------------------------------------------------
// 1. Authority boundary
// ---------------------------------------------------------------------------

describe("P1-CLOSE-1 — Processing remains the domain authority", () => {
    it("no Trust module writes any Processing table", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = read(file.replace(`${WEB_ROOT}/`, ""));
            for (const m of src.matchAll(/\.from\(\s*["']([a-z_]+)["']/g)) {
                if (!m[1]!.startsWith("trust_")) offenders.push(`${file.replace(WEB_ROOT, "")}: ${m[1]}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("no Trust module mutates or deletes anything, anywhere", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = read(file.replace(`${WEB_ROOT}/`, ""));
            if (/\.delete\(\)/.test(src)) offenders.push(`${file.replace(WEB_ROOT, "")}: delete()`);
            // The repository's single sanctioned update is the contract lifecycle
            // advance, which the database restricts to that one column.
            if (/\.update\(/.test(src) && !file.endsWith("trustDecisionRepository.ts")) {
                offenders.push(`${file.replace(WEB_ROOT, "")}: update()`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("`lib/trust` imports Processing only for the schemas Processing owns", () => {
        // Established Phase 1.1: Trust references a governed-payload schema by its
        // OWNER rather than restating capability vocabulary. Anything else — a
        // service, an engine, a table module — is a real inversion.
        const allowed = ["governedIdentitySchema", "governedClassificationSchema"];
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = read(file.replace(`${WEB_ROOT}/`, ""));
            for (const m of src.matchAll(/from\s+"(@\/lib\/pos\/[^"]+)"/g)) {
                if (!allowed.some((a) => m[1]!.endsWith(a))) {
                    offenders.push(`${file.replace(WEB_ROOT, "")} → ${m[1]}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("no Processing adapter queries a `trust_` table directly", () => {
        for (const rel of PHASE_1_ADAPTERS) {
            const tables = [...read(rel).matchAll(/\.from\(\s*["']([a-z_]+)["']/g)].map((m) => m[1]!);
            for (const t of tables) expect(t.startsWith("trust_"), `${rel}: ${t}`).toBe(false);
        }
    });

    it("no Trust module can reach an executor, a plan builder or an approval", () => {
        const forbidden = [
            "commitExecutor", "executorPorts", "runPreflight", "buildCommitPlan",
            "bindApproval", "insertApproval", "insertCommitAttempt", "executeApprovedPlan",
        ];
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = stripComments(read(file.replace(`${WEB_ROOT}/`, "")));
            for (const f of forbidden) if (src.includes(f)) offenders.push(`${file.replace(WEB_ROOT, "")}: ${f}`);
        }
        expect(offenders).toEqual([]);
    });

    it("Trust performs no network call and reads no provider credential", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = read(file.replace(`${WEB_ROOT}/`, ""));
            for (const p of [/\bfetch\s*\(/, /@anthropic-ai/, /\bopenai\b/i, /axios/, /from\s+"node:https?"/]) {
                if (p.test(src)) offenders.push(`${file.replace(WEB_ROOT, "")}: ${p}`);
            }
        }
        expect(offenders).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2. Exactly-once audit
// ---------------------------------------------------------------------------

describe("P1-CLOSE-2 — one exactly-once mechanism, reused", () => {
    it("every Phase 1 identity derives a deterministic id from a stable digest", () => {
        const derivations = [
            ["lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity.ts", "proc-identity-adoption-v1"],
            ["lib/trust/lifecycle/supersessionLineage.ts", "trust-supersession-observation-v1"],
            ["lib/trust/lifecycle/reviewObservationIdentity.ts", "trust-operator-review-observation-v1"],
            ["lib/trust/execution/executionObservationIdentity.ts", "trust-execution-observation-v1"],
        ] as const;
        for (const [file, version] of derivations) {
            const src = read(file);
            expect(src, file).toContain(version);
            // Positionally serialized and unit-separated, so no component value
            // can impersonate a boundary and key order cannot reach the digest.
            expect(src, file).toContain('join("\\u001f")');
            expect(src, file).toMatch(/sha256/);
        }
    });

    it("NO new idempotency table was introduced across all of Phase 1", () => {
        // The authority is always a constraint the schema already declared:
        // `trust_decision_contracts.id` (PK), `trust_decision_packages.contract_id`
        // (UNIQUE) and `trust_decision_observations.id` (PK).
        const offenders: string[] = [];
        for (const area of ["lib", "app"]) {
            for (const file of sourceFilesUnder(area)) {
                const src = read(file.replace(`${WEB_ROOT}/`, ""));
                for (const m of src.matchAll(/\.from\(\s*["']([a-z_]+)["']/g)) {
                    if (/idempoten|dedup|_seen|_processed_keys/.test(m[1]!)) {
                        offenders.push(`${file.replace(WEB_ROOT, "")}: ${m[1]}`);
                    }
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("every governance-gap store claims by compare-and-swap on retry count", () => {
        for (const rel of [
            "lib/pos/processingIdentity/trustAdapter/identityGovernanceGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/identityLineageGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/identityExecutionGapDb.ts",
        ]) {
            const src = read(rel);
            expect(src, rel).toMatch(/subject_ref->>retry_count/);
            // ...and never claims a gap that has already been resolved.
            expect(src, rel).toMatch(/\.is\("resolved_at", null\)/);
        }
    });

    it("every reconciliation resolves only after an authoritative Trust result", () => {
        for (const rel of [
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts",
        ]) {
            const src = stripComments(read(rel));
            const stillFailing = src.indexOf('status: "still_failing"');
            const resolve = src.search(/await resolve\w*Gap\(/);
            expect(stillFailing, rel).toBeGreaterThan(-1);
            expect(resolve, rel).toBeGreaterThan(-1);
            // The failure branch returns BEFORE the resolve call is reached.
            expect(stillFailing, rel).toBeLessThan(resolve);
        }
    });

    it("no reconciliation ever reruns Processing", () => {
        const forbidden = [
            "runCanonicalIdentityResolution", "executeApprovedPlan", "buildCommitPlan",
            "bindApproval", "insertCommitAttempt", "matchIdentity", "generateCandidates",
        ];
        for (const rel of [
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts",
        ]) {
            const src = stripComments(read(rel));
            for (const f of forbidden) expect(src.includes(f), `${rel}: ${f}`).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// 3. Readiness isolation
// ---------------------------------------------------------------------------

describe("P1-CLOSE-3 — governance gaps are readiness-neutral", () => {
    it("all four gap types are registered in ONE shared list", () => {
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toEqual([
            "trust_governance_gap",
            "trust_identity_resolution_governance_gap",
            "trust_identity_lineage_governance_gap",
            "trust_identity_execution_governance_gap",
        ]);
        expect(new Set(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).size).toBe(
            TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES.length,
        );
    });

    it("every gap store records `warning`, never `blocker`", () => {
        for (const rel of [
            "lib/pos/processingIdentity/trustAdapter/identityGovernanceGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/identityLineageGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/identityExecutionGapDb.ts",
        ]) {
            const src = read(rel);
            expect(src, rel).toMatch(/GAP_SEVERITY = "warning"/);
            expect(stripComments(src).includes('"blocker"'), rel).toBe(false);
        }
    });

    it("no production projection counts processing_exceptions unfiltered", () => {
        const offenders: string[] = [];
        for (const area of ["lib", "app"]) {
            for (const file of sourceFilesUnder(area)) {
                const src = read(file.replace(`${WEB_ROOT}/`, ""));
                if (!src.includes('.from("processing_exceptions")')) continue;
                const isGapStore =
                    file.includes("GovernanceGapDb") ||
                    file.includes("LineageGapDb") ||
                    file.includes("ExecutionGapDb") ||
                    file.includes("attemptsDb");
                if (!isGapStore && !src.includes("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES")) {
                    offenders.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(offenders).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 4. Privacy audit
// ---------------------------------------------------------------------------

describe("P1-CLOSE-4 — no unsafe identity data reaches Trust", () => {
    it("no adapter reads an engine explanation, a display name or a raw candidate", () => {
        // `matchIdentity` interpolates a real person's name into its reasons, so
        // every engine explanation string is unsafe by construction (Phase 1.3).
        const forbidden = [".explanation", "displayName", "personDisplayNameFromRecord", "raw_value"];
        const offenders: string[] = [];
        for (const rel of PHASE_1_ADAPTERS) {
            const src = stripComments(read(rel));
            for (const f of forbidden) if (src.includes(f)) offenders.push(`${rel}: ${f}`);
        }
        expect(offenders).toEqual([]);
    });

    it("no lineage or execution adapter reads an operator's free text", () => {
        const forbidden = ["create_new_override", "readCreateNewOverride", "provisional"];
        const offenders: string[] = [];
        for (const rel of PHASE_1_ADAPTERS.filter((r) => !r.includes("captureIdentityGeneration"))) {
            const src = stripComments(read(rel));
            for (const f of forbidden) if (src.includes(f)) offenders.push(`${rel}: ${f}`);
        }
        expect(offenders).toEqual([]);
    });

    it("the governed identity schema screens for PII and admits a closed key set", () => {
        const src = read("lib/pos/processingIdentity/trustAdapter/governedIdentitySchema.ts");
        expect(src).toContain("PII_PATTERNS");
        expect(src).toMatch(/@\[\^\\s@\]\+\\\./); // email
        expect(src).toContain("GOVERNED_IDENTITY_RECOMMENDATION_KEYS");
        // Case-level readiness gates may never enter a SUBJECT package.
        expect(src).toContain("CASE_LEVEL_READINESS_CODES");
        expect(src).toContain("child_identity_unconfirmed");
    });

    it("every Trust-bound detail surface is an explicit allow-list", () => {
        const lists = [
            ["lib/trust/execution/executionObservation.ts", "ALLOWED_EXECUTION_DETAIL_KEYS"],
            [
                "lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution.ts",
                "ALLOWED_PROCESSING_EXECUTION_DETAIL_KEYS",
            ],
            [
                "lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview.ts",
                "ALLOWED_REVIEW_DETAIL_KEYS",
            ],
        ] as const;
        for (const [file, name] of lists) {
            const src = read(file);
            expect(src, file).toContain(name);
            for (const forbidden of ["first_name", "email", "phone", "dob", "address", "payload", "stack"]) {
                // The allow-list literal itself must not admit these.
                const list = src.slice(src.indexOf(name));
                expect(list.slice(0, 600).includes(`"${forbidden}"`), `${file}: ${forbidden}`).toBe(false);
            }
        }
    });

    it("no Decision Package carries provider identity or a command binding", () => {
        const src = read("lib/trust/persistence/trustDecisionRepository.ts");
        const pkgRow = src.slice(src.indexOf("function packageRow"), src.indexOf("export function createSupabase"));
        for (const forbidden of ["provider", "model", "command_key", "prompt"]) {
            expect(pkgRow.includes(forbidden), forbidden).toBe(false);
        }
    });
});

// ---------------------------------------------------------------------------
// 5. Commit Plan and execution audit
// ---------------------------------------------------------------------------

describe("P1-CLOSE-5 — Commit Plan, approval and executor authority never moved", () => {
    it("the plan hash covers only orgId, caseId and a whitelisted operation projection", () => {
        const src = read("lib/pos/processingIdentity/plan/planHash.ts");
        expect(src).toContain("function materialOperation");
        // Not a spread: a new operation field cannot silently enter the digest.
        expect(src).not.toMatch(/\.\.\.op[,\s}]/);
        // No Trust concept is reachable from the CODE. Comments are excluded:
        // the file cites governance "Decision F", which is a doc reference and
        // not a Decision Package.
        const code = stripComments(src).toLowerCase();
        for (const forbidden of ["package", "trust", "decisionpackage"]) {
            expect(code.includes(forbidden), forbidden).toBe(false);
        }
        // The signature takes exactly three inputs, so there is no parameter a
        // Trust value could arrive through.
        expect(src).toMatch(/computePlanContentHash\(input:\s*\{\s*\n\s*orgId: string;\s*\n\s*caseId: string;\s*\n\s*operations: PlanOperation\[\];/);
    });

    it("no plan or approval type carries a Decision Package reference", () => {
        for (const rel of ["lib/pos/processingIdentity/plan/planTypes.ts"]) {
            const src = read(rel);
            for (const forbidden of ["packageId", "package_id", "decisionPackage", "trustPackage"]) {
                expect(src.includes(forbidden), `${rel}: ${forbidden}`).toBe(false);
            }
        }
    });

    it("plan, approval, preflight and executor import nothing from Trust", () => {
        for (const rel of [
            "lib/pos/processingIdentity/plan/planHash.ts",
            "lib/pos/processingIdentity/plan/planTypes.ts",
            "lib/pos/processingIdentity/plan/approval.ts",
            "lib/pos/processingIdentity/plan/buildCommitPlan.ts",
            "lib/pos/processingIdentity/executor/commitExecutor.ts",
            "lib/pos/processingIdentity/executor/preflight.ts",
            "lib/pos/processingIdentity/executor/executorTypes.ts",
        ]) {
            const imports = [...read(rel).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            expect(imports.filter((i) => i.includes("/trust")), rel).toEqual([]);
            expect(imports.filter((i) => i.includes("trustAdapter")), rel).toEqual([]);
        }
    });

    it("plan lineage is reconstructed from resolutionRefs, never stored on the plan", () => {
        const src = read("lib/pos/processingIdentity/trustAdapter/planPackageLineage.ts");
        expect(src).toContain("resolutionRefs");
        expect(src).toContain("adoptionIdForResolutionRow");
        // Never "the latest package for this case".
        expect(stripComments(src)).not.toMatch(/order\(.*created_at.*\)[\s\S]{0,80}package/i);
    });

    it("execution binding runs only after the durable commit attempt is persisted", () => {
        const src = read("lib/pos/processingIdentity/operator/operatorReviewService.ts");
        const executed = src.indexOf("const attempt = await executeApprovedPlan(");
        const persisted = src.indexOf("commitAttemptId = await insertCommitAttempt(");
        const bound = src.indexOf("await bindCommitOutcomeToTrust(");
        expect(executed).toBeGreaterThan(-1);
        expect(persisted).toBeGreaterThan(executed);
        expect(bound).toBeGreaterThan(persisted);
        // The attempt returned to the caller is the executor's, untouched.
        expect(src.indexOf("return attempt;")).toBeGreaterThan(bound);
    });

    it("the execution reference is the durable row id, never the synthetic label", () => {
        const src = read("lib/pos/processingIdentity/trustAdapter/executionLineageService.ts");
        expect(src).toContain("execution_reference: input.commitAttemptId");
        expect(stripComments(src)).not.toContain("attempt.attemptId");
    });
});

// ---------------------------------------------------------------------------
// 6. Lifecycle vocabulary
// ---------------------------------------------------------------------------

describe("P1-CLOSE-6 — the lifecycle vocabulary stayed closed", () => {
    it("Phase 1 added NO observation kind", () => {
        // All ten predate Phase 1 (eight from the foundation, two from Slice 0.4).
        expect([...TRUST_OBSERVATION_KINDS]).toEqual([
            "presented", "accepted", "rejected", "overridden", "modified",
            "deferred", "executed", "outcome", "expired", "superseded",
        ]);
    });

    it("operator effects map only onto kinds that already existed", () => {
        const src = read("lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect.ts");
        expect(src).toContain('"accepted" | "deferred" | "superseded" | null');
        for (const effect of OPERATOR_DECISION_EFFECTS) {
            expect(typeof effect).toBe("string");
        }
    });

    it("an operator decision never becomes a deterministic Decision Package", () => {
        const forbidden = ["createDecisionContract", "executeDecisionContract", "trustRuntime"];
        for (const rel of [
            "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts",
            "lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/supersede.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution.ts",
        ]) {
            const imports = [...read(rel).matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            for (const f of forbidden) expect(imports.some((i) => i.includes(f)), `${rel}: ${f}`).toBe(false);
        }
    });

    it("identity numerical confidence remains null by construction", () => {
        // The deterministic strategy is the only producer, and it hard-codes
        // null rather than deriving a number from the band — the engine's
        // confidence is an ordered CATEGORY, not a probability.
        const src = read("lib/trust/reasoning/strategies/processingIdentitySubjectResolutionDeterministic.ts");
        expect(src).toContain("confidence: null");
        expect(src).toContain("band_not_calibrated");
        // The band itself travels as an operational category, not a score.
        const map = read("lib/trust/capabilities/processingIdentitySubjectResolution/semanticMap.ts");
        expect(map).toContain('confidence_band: "operational"');
    });
});
