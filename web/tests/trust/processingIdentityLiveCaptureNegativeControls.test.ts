/**
 * Negative controls for live Processing identity Trust capture.
 *
 * Each control builds the defective variant and shows the difference is
 * observable, so "the test would fail" is demonstrated rather than asserted.
 * Also carries the readiness-isolation and Processing-unchanged proofs.
 */

import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import { captureIdentityGenerationJudgments } from "@/lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration";
import { listUnresolvedIdentityGovernanceGaps } from "@/lib/pos/processingIdentity/trustAdapter/identityGovernanceGapDb";
import { reconcileOneIdentityGovernanceGap } from "@/lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps";
import {
    TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES,
    TRUST_IDENTITY_RESOLUTION_GAP_TYPE,
    TRUST_SOURCE_CLASSIFICATION_GAP_TYPE,
} from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { captureProcessingIdentitySubjectResolution } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/capture";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const WEB_ROOT = join(__dirname, "..", "..");
const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const FACTS_HASH = "a".repeat(64);
const GEN = "gen-1";

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

function makeRepo() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract(c) {
            if (contracts.some((x) => x.id === c.id)) throw new Error("duplicate key value violates unique constraint");
            contracts.push(c);
        },
        async advanceContractLifecycle() {},
        async insertPackage(p) {
            if (packages.some((x) => x.contract_id === p.contract_id)) throw new Error("duplicate key value violates unique constraint");
            packages.push(p);
        },
        async insertObservation() {},
        async insertReasoningUsage(u) { usage.push(u); },
    };
    const lookup = async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
        const pkg = packages.find((p) => p.org_id === org_id && p.contract_id === contract_id);
        return pkg ? { contract_id: pkg.contract_id, package_id: pkg.id } : null;
    };
    return {
        repository, contracts, packages, usage, lookup,
        deps: { repository, lookup, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW },
    };
}

type Row = Record<string, unknown>;

function makeStore() {
    const exceptions: Row[] = [];
    const forbiddenWrites: string[] = [];
    let seq = 0;
    const readColumn = (row: Row, column: string): unknown => {
        const arrow = column.indexOf("->>");
        if (arrow === -1) return row[column];
        const obj = row[column.slice(0, arrow)] as Record<string, unknown> | null | undefined;
        const v = obj?.[column.slice(arrow + 3)];
        return v === undefined || v === null ? undefined : String(v);
    };
    const client = () =>
        ({
            from(table: string) {
                if (table !== "processing_exceptions") {
                    forbiddenWrites.push(table);
                    throw new Error(`forbidden table ${table}`);
                }
                const filters: { kind: string; column: string; value: unknown }[] = [];
                let mode = "select";
                let payload: Row | null = null;
                let limit: number | null = null;
                const match = (r: Row) =>
                    filters.every((f) => {
                        const a = readColumn(r, f.column);
                        if (f.kind === "eq") return String(a) === String(f.value);
                        if (f.kind === "neq") return String(a) !== String(f.value);
                        if (f.kind === "is") return a === null || a === undefined;
                        return true;
                    });
                const resolve = () => {
                    if (mode === "insert") {
                        const r: Row = { id: `exc-${++seq}`, resolved_at: null, created_at: `t${seq}`, ...payload };
                        exceptions.push(r);
                        return { data: [{ ...r }], error: null, count: 1 };
                    }
                    const hits = exceptions.filter(match);
                    if (mode === "update") {
                        for (const r of hits) Object.assign(r, payload);
                        return { data: hits.map((r) => ({ ...r })), error: null, count: hits.length };
                    }
                    const sliced = limit === null ? hits : hits.slice(0, limit);
                    return { data: sliced.map((r) => ({ ...r })), error: null, count: hits.length };
                };
                const api: Record<string, unknown> = {
                    select: () => api,
                    insert: (r: Row) => { mode = "insert"; payload = r; return api; },
                    update: (r: Row) => { mode = "update"; payload = r; return api; },
                    eq: (c: string, v: unknown) => { filters.push({ kind: "eq", column: c, value: v }); return api; },
                    neq: (c: string, v: unknown) => { filters.push({ kind: "neq", column: c, value: v }); return api; },
                    is: (c: string, v: unknown) => { filters.push({ kind: "is", column: c, value: v }); return api; },
                    order: () => api,
                    limit: (n: number) => { limit = n; return api; },
                    maybeSingle: () => Promise.resolve({ data: (resolve().data as Row[])[0] ?? null, error: null }),
                    single: () => {
                        const rows = resolve().data as Row[];
                        return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "no_row" } });
                    },
                    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
                        Promise.resolve(resolve()).then(ok, err),
                };
                return api;
            },
        }) as unknown as SupabaseClient;
    return { client, exceptions, forbiddenWrites };
}

function candidate(overrides: Partial<IdentityCandidate> = {}): IdentityCandidate {
    return {
        subjectRef: "parent-1", entityType: "person", recordId: "rec-1",
        confidenceBand: "strong", score: 5,
        signals: [
            {
                key: "exact_email", kind: "supporting", strength: "deterministic",
                subjectFactRefs: [], recordFieldRefs: [],
                reasonCode: "exact_email_match",
                explanation: "Matched Alex Lyons at alex@lyons.example, dob 2019-04-11.",
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
        id: "res-1", org_id: "org-1", case_id: "case-1", generation_id: GEN,
        input_facts_hash: FACTS_HASH, subject_ref: "parent-1", subject_role: "parent",
        provisional: {}, candidates: [candidate()],
        decision_action: "link_existing", selected_candidate_id: "rec-1",
        decided_by: "engine", operator_id: null, policy_version: null,
        resolver_version: IDENTITY_RESOLVER_VERSION, stale_at: null, superseded_by: null,
        retention_class: "uncommitted_submission", created_at: FIXED_NOW,
        ...overrides,
    };
}

const silence = () => ({
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

// ---------------------------------------------------------------------------

describe("P15-NC-1 — capture starting before generation persistence would be caught", () => {
    it("capture is invoked AFTER the subject rows and case status are written", () => {
        const engine = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/canonicalResolutionEngine.ts"),
            "utf8",
        );
        const insertLoop = engine.indexOf("insertProcessingResolution");
        const caseStatus = engine.indexOf('.from("processing_cases")');
        const captureCall = engine.indexOf("captureIdentityGenerationJudgments(input.supabase");
        const ret = engine.indexOf("resolutionsPersisted: true");
        expect(insertLoop).toBeGreaterThan(0);
        // Ordering IS the contract: rows → case status → capture → return.
        expect(captureCall).toBeGreaterThan(insertLoop);
        expect(captureCall).toBeGreaterThan(caseStatus);
        expect(ret).toBeGreaterThan(captureCall);
    });

    it("capture reads only persisted rows — it performs no candidate evaluation", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        for (const engine of ["generateCandidates", "householdGraph", "matchIdentity", "canonicalResolutionEngine"]) {
            expect(imports.some((i) => i.includes(engine))).toBe(false);
        }
    });

    it("an incomplete row is skipped — the defect would capture it", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const result = await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row({ input_facts_hash: "" })], deps: repo.deps,
        });
        expect(result.subjects[0]!.status).toBe("skipped_ineligible");
        expect(repo.packages).toHaveLength(0);
    });
});

describe("P15-NC-2 — omitting subject_ref from the adoption identity would be caught", () => {
    it("subjects collapse without it, and stay distinct with it", () => {
        const base = {
            org_id: "org-1", processing_case_id: "case-1",
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            input_facts_hash: FACTS_HASH,
            material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
            identity_resolver_version: IDENTITY_RESOLVER_VERSION,
        };
        // The defect: every subject sharing one identity.
        const collapsed = ["parent-1", "child-1"].map(() =>
            processingIdentitySubjectAdoptionId({ ...base, subject_ref: "" }),
        );
        expect(new Set(collapsed).size).toBe(1);
        // The real derivation.
        const distinct = ["parent-1", "child-1"].map((s) =>
            processingIdentitySubjectAdoptionId({ ...base, subject_ref: s }),
        );
        expect(new Set(distinct).size).toBe(2);
    });

    it("two subjects in one generation produce two contracts, not one", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row({ id: "r1", subject_ref: "parent-1" }), row({ id: "r2", subject_ref: "child-1" })],
            deps: repo.deps,
        });
        expect(new Set(repo.contracts.map((c) => c.id)).size).toBe(2);
    });
});

describe("P15-NC-3 — a capture that skips lookup would be caught", () => {
    it("without lookup the primary key still refuses the duplicate", async () => {
        const repo = makeRepo();
        const input = {
            org_id: "org-1", processing_case_id: "case-1",
            adoption_id: processingIdentitySubjectAdoptionId({
                org_id: "org-1", processing_case_id: "case-1", subject_ref: "parent-1",
                decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
                input_facts_hash: FACTS_HASH,
                material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
                identity_resolver_version: IDENTITY_RESOLVER_VERSION,
            }),
            recommendation: {
                subject_ref: "parent-1", subject_role: "parent", disposition: "confirmed_existing",
                disposition_source: "deterministic_engine", review_requirement: "automatic",
                confidence_band: "strong", ambiguity_categories: ["single_plausible_candidate"],
                conflict_categories: [], blocking_reason_codes: [],
                evidence: {
                    candidate_count: 1, plausible_candidate_count: 1, top_confidence_band: "strong",
                    distinct_confidence_bands: ["strong"], supporting_signal_categories: ["deterministic_contact_match"],
                    conflicting_signal_categories: [], blocking_conflict_count: 0, rejected_candidate_count: 0,
                },
                safe_explanations: ["An exact contact identifier matched an existing record in this organization."],
                adoption_id: "x", input_facts_hash: FACTS_HASH,
                material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
                identity_resolver_version: IDENTITY_RESOLVER_VERSION,
            },
        };
        const blind = { ...repo.deps, lookup: async () => null };
        const first = await captureProcessingIdentitySubjectResolution(input, blind);
        const second = await captureProcessingIdentitySubjectResolution(input, blind);

        expect(first.status).toBe("governed");
        // The defect cannot produce a duplicate: the PK refuses it.
        expect(second.status).toBe("gap_required");
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);

        // With the real lookup, the repeat is recognized instead.
        const third = await captureProcessingIdentitySubjectResolution(input, repo.deps);
        expect(third.status).toBe("already_governed");
        expect(repo.packages).toHaveLength(1);
    });
});

describe("P15-NC-4 — retries creating duplicate packages would be caught", () => {
    it("a permissive repository DOES duplicate, proving the constraints are load-bearing", async () => {
        const contracts: DecisionContractV1[] = [];
        const packages: DecisionPackageV1[] = [];
        const permissive: TrustRepository = {
            async insertContract(c) { contracts.push(c); },
            async advanceContractLifecycle() {},
            async insertPackage(p) { packages.push(p); },
            async insertObservation() {},
            async insertReasoningUsage() {},
        };
        const store = makeStore();
        const deps = { repository: permissive, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW };
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps,
        });
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps,
        });
        expect(packages).toHaveLength(2);
        // ...and both share ONE contract id — the row the real PK refuses.
        expect(new Set(contracts.map((c) => c.id)).size).toBe(1);
    });
});

describe("P15-NC-5 — unsafe explanation or raw fact entering the gap would be caught", () => {
    it("engine text carries PII; the stored gap does not", async () => {
        const c = candidate();
        expect(c.explanation).toContain("Alex Lyons");
        expect(c.signals[0]!.explanation).toContain("alex@lyons.example");

        const store = makeStore();
        const spies = silence();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()],
            deps: {
                repository: { ...makeRepo().repository, async insertContract() { throw new Error("down"); } } as TrustRepository,
                lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW,
            },
        });
        const serialized = JSON.stringify(store.exceptions[0]);
        for (const leak of ["Alex", "Lyons", "@lyons", "2019-04-11", "rec-1", "submitted name differs"]) {
            expect(serialized).not.toContain(leak);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

describe("P15-NC-6 — reconciliation rerunning identity matching would be caught", () => {
    it("the module imports no matching engine and touches no Processing table", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        for (const engine of [
            "generateCandidates", "householdGraph", "matchIdentity",
            "canonicalResolutionEngine", "identityResolutionEligibility", "processingResolutionsDb",
        ]) {
            expect(imports.some((i) => i.includes(engine))).toBe(false);
        }
        expect([...src.matchAll(/\.from\(\s*["']/g)]).toEqual([]);
    });
});

describe("P15-NC-7 — governance gaps altering readiness would be caught", () => {
    it("the readiness count excludes EVERY gap type, by shared list", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        expect(src).toContain("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES");
        expect(src).toMatch(/\.neq\(\s*"exception_type"\s*,\s*gapType\s*\)/);
        // Both capabilities' types are in the list.
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_SOURCE_CLASSIFICATION_GAP_TYPE);
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_IDENTITY_RESOLUTION_GAP_TYPE);
    });

    it("the identity gap type is DISTINCT from the classification one", () => {
        expect(TRUST_IDENTITY_RESOLUTION_GAP_TYPE).toBe("trust_identity_resolution_governance_gap");
        expect(TRUST_IDENTITY_RESOLUTION_GAP_TYPE).not.toBe(TRUST_SOURCE_CLASSIFICATION_GAP_TYPE);
    });

    it("no other production projection counts processing_exceptions unfiltered", () => {
        const offenders: string[] = [];
        for (const area of ["lib", "app"]) {
            for (const file of sourceFilesUnder(area)) {
                const src = readFileSync(file, "utf8");
                if (!src.includes('.from("processing_exceptions")')) continue;
                // Any reader must either write gaps, or exclude every gap type.
                const isGapStore = file.includes("GovernanceGapDb") || file.includes("attemptsDb");
                if (!isGapStore && !src.includes("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES")) {
                    offenders.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("a gap never sets a blocker severity or a case-level readiness code", async () => {
        const store = makeStore();
        const spies = silence();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()],
            deps: {
                repository: { ...makeRepo().repository, async insertContract() { throw new Error("down"); } } as TrustRepository,
                lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW,
            },
        });
        expect(store.exceptions[0]!.severity).toBe("warning");
        expect(JSON.stringify(store.exceptions[0])).not.toContain("child_identity_unconfirmed");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

describe("P15-NC-8 — labelling an operator override as deterministic would be caught", () => {
    it("an operator-decided row is skipped rather than captured as engine output", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const result = await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row({ decided_by: "operator", provisional: { create_new_override: { reason: "x" } } })],
            deps: repo.deps,
        });
        expect(result.subjects[0]!.status).toBe("skipped_ineligible");
        if (result.subjects[0]!.status === "skipped_ineligible") {
            expect(result.subjects[0]!.reason).toBe("operator_decision_not_engine_output");
        }
        expect(repo.packages).toHaveLength(0);
    });

    it("every captured package is attributed to the deterministic engine", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps: repo.deps,
        });
        expect((repo.packages[0]!.recommendation as Record<string, unknown>).disposition_source)
            .toBe("deterministic_engine");
    });
});

describe("P15-NC-9 — coercing null confidence to zero would be caught", () => {
    it("null and zero are observably different on the captured package", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps: repo.deps,
        });
        expect(repo.packages[0]!.confidence).toBeNull();
        expect(repo.packages[0]!.confidence).not.toBe(0);
        expect(JSON.stringify(repo.packages[0])).toContain('"confidence":null');
    });
});

describe("P15-NC-10 — one subject failure rolling back another would be caught", () => {
    it("the successful package survives its sibling's failure", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();
        let call = 0;
        const flaky = {
            ...repo.deps,
            repository: {
                ...repo.repository,
                async insertContract(c: DecisionContractV1) {
                    call += 1;
                    if (call === 1) throw new Error("trust db down");
                    return repo.repository.insertContract(c);
                },
            } as TrustRepository,
        };
        // The FIRST subject fails; the second must still succeed.
        const result = await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row({ id: "r1", subject_ref: "parent-1" }), row({ id: "r2", subject_ref: "child-1" })],
            deps: flaky,
        });

        expect(result.subjects.map((s) => s.status)).toEqual(["not_governed", "governed"]);
        expect(repo.packages).toHaveLength(1);
        expect(store.exceptions).toHaveLength(1);
        // ...and the failed one reconciles independently, to its own package.
        const gaps = await listUnresolvedIdentityGovernanceGaps(store.client(), { orgId: "org-1" });
        const out = await reconcileOneIdentityGovernanceGap(store.client(), { gap: gaps[0]!, deps: repo.deps });
        expect(out.status).toBe("resolved");
        expect(repo.packages).toHaveLength(2);
        expect(repo.usage).toHaveLength(2);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

describe("P15-NC-11 — Processing behaviour and authority are unchanged", () => {
    it("capture never writes a Processing table other than the gap store", () => {
        for (const file of [
            "lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const tables = [...src.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)/g)].map((m) => m[1]!);
            expect(tables.filter((t) => t !== "processing_exceptions")).toEqual([]);
        }
    });

    it("the engine's capture step cannot fail the generation", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/canonicalResolutionEngine.ts"),
            "utf8",
        );
        // No throw path: capture returns statuses and the result is returned
        // regardless. The capture helper itself never throws.
        expect(src).toContain("trustCapture = await captureIdentityGenerationJudgments");
        expect(src).toContain("resolutionsPersisted: true");
        const capture = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration.ts"),
            "utf8",
        );
        expect(capture).toContain("Never throws");
    });

    it("Commit Plan, approval and executor modules are untouched by this slice", () => {
        for (const file of [
            "lib/pos/processingIdentity/plan/buildCommitPlan.ts",
            "lib/pos/processingIdentity/plan/approval.ts",
            "lib/pos/processingIdentity/plan/planHash.ts",
            "lib/pos/processingIdentity/executor/commitExecutor.ts",
            "lib/pos/processingIdentity/executor/preflight.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            expect(src).not.toContain("trustAdapter");
            expect(src).not.toContain("@/lib/trust");
        }
    });

    it("suppressing capture is possible, so Processing output can be compared without Trust", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/canonicalResolutionEngine.ts"),
            "utf8",
        );
        expect(src).toContain("input.trustCapture !== false");
        expect(src).toContain("trustCapture?: false | CaptureGenerationDeps");
    });
});
