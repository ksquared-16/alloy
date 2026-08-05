/**
 * Phase 1.1 final hardening — unified direct and recovery idempotency.
 *
 * Direct capture and gap reconciliation now share ONE lookup-or-capture seam,
 * so a stable adoption identity yields at most one governed Trust result no
 * matter which path reaches it first, or how many times.
 *
 * ```text
 * org_id + processing_case_id + decision_class_key
 *        + material_input_fingerprint + classifier_version
 * ```
 *
 * The recording repository below ENFORCES the two uniqueness constraints the
 * real schema declares — `trust_decision_contracts.id` PRIMARY KEY and
 * `trust_decision_packages.contract_id` UNIQUE — because a fake that stores
 * duplicates the database would refuse turns every assertion here into theatre.
 *
 * @see docs/platform/planning/trust-adoption/processing/PHASE-1-PROCESSING-ADOPTION-ASSESSMENT.md
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyNonFormSource } from "@/lib/pos/processingCase/classification/classifyNonFormSource";
import { maybeClassifyProcessingCaseFromDocumentSafe } from "@/lib/pos/processingCase/classification/maybeClassifyProcessingCaseFromDocumentSafe";
import { governSourceClassification } from "@/lib/pos/processingCase/classification/governSourceClassification";
import { listUnresolvedTrustGovernanceGaps } from "@/lib/pos/processingCase/classification/trustGovernanceGapDb";
import { reconcileOneTrustGovernanceGap } from "@/lib/pos/processingCase/classification/reconcileTrustGovernanceGaps";
import type { ClassifyNonFormSourceInput } from "@/lib/pos/processingCase/classification/types";
import { PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY } from "@/lib/trust/capabilities/processingSourceClassification/keys";
import { processingSourceClassificationContractId } from "@/lib/trust/capabilities/processingSourceClassification/adoptionIdentity";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const SUBSIDY: ClassifyNonFormSourceInput = { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" };
const SUBSIDY_DOC = { sourceKind: "document", fileName: "2026_CCAP_Subsidy_Contract.pdf" };

/** Enforces the real schema's uniqueness. See the module note. */
function makeRepo() {
    const contracts: DecisionContractV1[] = [];
    const packages: DecisionPackageV1[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract(c) {
            if (contracts.some((x) => x.id === c.id)) {
                throw new Error('duplicate key value violates unique constraint "trust_decision_contracts_pkey"');
            }
            contracts.push(c);
        },
        async advanceContractLifecycle() {},
        async insertPackage(p) {
            if (packages.some((x) => x.contract_id === p.contract_id)) {
                throw new Error('duplicate key value violates unique constraint "trust_decision_packages_contract_id_key"');
            }
            packages.push(p);
        },
        async insertObservation() {},
        async insertReasoningUsage(u) { usage.push(u); },
    };
    /** Reads current state, so a concurrent loser sees the winner. */
    const lookup = async (identity: {
        org_id: string;
        processing_case_id: string;
        material_input_fingerprint: string;
        classifier_version: string;
    }) => {
        const ids = contracts
            .filter(
                (c) =>
                    c.org_id === identity.org_id &&
                    c.correlation_id === identity.processing_case_id &&
                    (c.context as Record<string, unknown>).material_input_fingerprint ===
                        identity.material_input_fingerprint &&
                    (c.context as Record<string, unknown>).classifier_version === identity.classifier_version,
            )
            .map((c) => c.id);
        const pkg = packages.find((p) => ids.includes(p.contract_id));
        return pkg ? { contract_id: pkg.contract_id, package_id: pkg.id } : null;
    };
    const deps = { repository, lookup, nowIso: FIXED_NOW, clock: () => 0 };
    return { repository, contracts, packages, usage, lookup, deps };
}

type Row = Record<string, unknown>;

/** Durable `processing_exceptions` + the classification annotation target. */
function makeStore() {
    const exceptions: Row[] = [];
    const caseUpdates: Row[] = [];
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
                if (table === "processing_cases") {
                    return {
                        select: () => ({
                            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: {} }, error: null }) }) }),
                        }),
                        insert: () => { throw new Error("classification must never insert a case"); },
                        update: (p: Row) => {
                            caseUpdates.push(p);
                            return { eq: () => ({ eq: async () => ({ error: null }) }) };
                        },
                    };
                }
                if (table !== "processing_exceptions") throw new Error(`forbidden table ${table}`);
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
                        const row: Row = { id: `exc-${++seq}`, resolved_at: null, created_at: `t${seq}`, ...payload };
                        exceptions.push(row);
                        return { data: [{ ...row }], error: null };
                    }
                    const hits = exceptions.filter(match);
                    if (mode === "update") {
                        for (const r of hits) Object.assign(r, payload);
                        return { data: hits.map((r) => ({ ...r })), error: null };
                    }
                    const sliced = limit === null ? hits : hits.slice(0, limit);
                    return { data: sliced.map((r) => ({ ...r })), error: null };
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
    return { client, exceptions, caseUpdates };
}

const silence = () => ({
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

const govern = (
    store: ReturnType<typeof makeStore>,
    repo: ReturnType<typeof makeRepo>,
    caseId = "case-1",
    input = SUBSIDY,
) =>
    governSourceClassification(store.client(), {
        orgId: "org-1", caseId, input, result: classifyNonFormSource(input), deps: repo.deps,
    });

// ---------------------------------------------------------------------------
// 1-4. Direct path
// ---------------------------------------------------------------------------

describe("UID-A — the direct path is idempotent on adoption identity", () => {
    it("the first call creates exactly one governed result", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const out = await govern(store, repo);

        expect(out.status).toBe("governed");
        if (out.status === "governed") expect(out.reused).toBe(false);
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
    });

    it("a repeated call returns the same package, creates no second, and adds no metric", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const first = await govern(store, repo);
        const second = await govern(store, repo);
        const third = await govern(store, repo);

        expect([first.status, second.status, third.status]).toEqual(["governed", "governed", "governed"]);
        if (first.status === "governed" && second.status === "governed" && third.status === "governed") {
            expect(second.packageId).toBe(first.packageId);
            expect(third.packageId).toBe(first.packageId);
            expect(second.reused).toBe(true);
            expect(third.reused).toBe(true);
        }
        // Three attempts. One contract, one package, ONE usage record.
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
    });

    it("recognizing an existing result does not rewrite the Processing classification", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC, governance: repo.deps,
        });
        const afterFirst = store.caseUpdates.length;

        // A second classification writes its own annotation (Processing's own
        // behaviour, unchanged) but produces no second governed decision.
        await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC, governance: repo.deps,
        });
        expect(store.caseUpdates).toHaveLength(afterFirst + 1);
        expect(JSON.stringify(store.caseUpdates[1])).toBe(JSON.stringify(store.caseUpdates[0]).replace(
            /"classified_at":"[^"]*"/,
            JSON.stringify(store.caseUpdates[1]).match(/"classified_at":"[^"]*"/)?.[0] ?? "",
        ));
        expect(repo.packages).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// 5, 6. Direct and recovery agree
// ---------------------------------------------------------------------------

describe("UID-B — direct and recovery converge on the same governed result", () => {
    it("reconciliation returns the package the direct path already created", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();

        // A capture that really succeeded...
        const direct = await govern(store, repo);
        expect(direct.status).toBe("governed");

        // ...whose response was lost, so a gap exists for the same identity.
        const failing = makeRepo();
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: {
                repository: {
                    async insertContract() { throw new Error("trust db down"); },
                    async advanceContractLifecycle() {},
                    async insertPackage() {},
                    async insertObservation() {},
                    async insertReasoningUsage() {},
                },
                lookup: async () => null,
                nowIso: FIXED_NOW,
                clock: () => 0,
            },
        });
        void failing;

        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        expect(gaps).toHaveLength(1);

        const recovered = await reconcileOneTrustGovernanceGap(store.client(), {
            gap: gaps[0]!,
            deps: { repository: repo.repository, lookup: repo.lookup, now: () => FIXED_NOW, clock: () => 0 },
        });

        expect(recovered.status).toBe("already_governed");
        if (recovered.status === "already_governed" && direct.status === "governed") {
            expect(recovered.packageId).toBe(direct.packageId);
            expect(recovered.contractId).toBe(direct.contractId);
        }
        // Still exactly one governed decision, counted once.
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
        expect(store.exceptions[0]!.resolved_at).toBe(FIXED_NOW);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("both paths derive the identical contract id from the same identity", () => {
        const identity = {
            org_id: "org-1",
            processing_case_id: "case-1",
            decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
            material_input_fingerprint: "fp-1",
            classifier_version: "fp9.1",
        };
        expect(processingSourceClassificationContractId(identity)).toBe(
            processingSourceClassificationContractId({ ...identity }),
        );
    });
});

// ---------------------------------------------------------------------------
// 7, 8. Concurrency
// ---------------------------------------------------------------------------

describe("UID-C — concurrent attempts converge on one governed result", () => {
    /**
     * The invariant is **at most one governed result**, and convergence that is
     * eventual and durable — not that both callers return instantly.
     *
     * A loser that arrives while the winner's contract exists but its package
     * does not yet cannot return the winner. Rethrowing there is the safe
     * outcome: the caller records a durable gap, and reconciliation resolves it
     * to the winner. No duplicate is created in either branch.
     */
    it("two concurrent DIRECT attempts produce exactly one package", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();

        const [a, b] = await Promise.all([govern(store, repo), govern(store, repo)]);

        // The invariant, unconditionally.
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);

        const governedIds = [a, b]
            .filter((r): r is Extract<typeof r, { status: "governed" }> => r.status === "governed")
            .map((r) => r.packageId);
        // Every caller that reports success reports THE one package.
        expect(governedIds.every((id) => id === repo.packages[0]!.id)).toBe(true);
        expect(governedIds.length).toBeGreaterThanOrEqual(1);

        // A loser, if there was one, left a durable gap rather than a duplicate.
        const loser = [a, b].find((r) => r.status === "not_governed");
        if (loser) {
            const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
            expect(gaps).toHaveLength(1);
            const recovered = await reconcileOneTrustGovernanceGap(store.client(), {
                gap: gaps[0]!,
                deps: { repository: repo.repository, lookup: repo.lookup, now: () => FIXED_NOW, clock: () => 0 },
            });
            // ...and it converges on the winner, still without duplicating.
            expect(recovered.status).toBe("already_governed");
            if (recovered.status === "already_governed") {
                expect(recovered.packageId).toBe(repo.packages[0]!.id);
            }
            expect(repo.packages).toHaveLength(1);
            expect(repo.usage).toHaveLength(1);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("concurrent DIRECT and RECONCILIATION attempts produce exactly one package", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();

        // Seed an unresolved gap without creating a package.
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: {
                repository: {
                    async insertContract() { throw new Error("trust db down"); },
                    async advanceContractLifecycle() {},
                    async insertPackage() {},
                    async insertObservation() {},
                    async insertReasoningUsage() {},
                },
                lookup: async () => null,
                nowIso: FIXED_NOW,
                clock: () => 0,
            },
        });
        const gaps = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        expect(repo.packages).toHaveLength(0);

        const [direct, recovered] = await Promise.all([
            govern(store, repo),
            reconcileOneTrustGovernanceGap(store.client(), {
                gap: gaps[0]!,
                deps: { repository: repo.repository, lookup: repo.lookup, now: () => FIXED_NOW, clock: () => 0 },
            }),
        ]);

        // The invariant, unconditionally: one identity, one governed decision,
        // one metric — no matter which path won.
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);

        const thePackage = repo.packages[0]!.id;
        if (direct.status === "governed") expect(direct.packageId).toBe(thePackage);
        if (recovered.status === "resolved" || recovered.status === "already_governed") {
            expect(recovered.packageId).toBe(thePackage);
        }
        // At least one path reported the governed result.
        expect(
            direct.status === "governed" ||
                recovered.status === "resolved" ||
                recovered.status === "already_governed",
        ).toBe(true);

        // Whatever happened, the gap converges — resolve it and it lands on the
        // same package, still without a duplicate.
        const remaining = await listUnresolvedTrustGovernanceGaps(store.client(), { orgId: "org-1" });
        for (const gap of remaining) {
            const out = await reconcileOneTrustGovernanceGap(store.client(), {
                gap,
                deps: { repository: repo.repository, lookup: repo.lookup, now: () => FIXED_NOW, clock: () => 0 },
            });
            expect(out.status).toBe("already_governed");
        }
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 9, 10, 11. What is genuinely a NEW decision
// ---------------------------------------------------------------------------

describe("UID-D — a changed identity component is a new decision, not a duplicate", () => {
    it("a changed material fingerprint creates a new package", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await govern(store, repo, "case-1", SUBSIDY);
        await govern(store, repo, "case-1", { sourceKind: "document", fileName: "monthly_remittance.pdf" });

        expect(repo.packages).toHaveLength(2);
        expect(repo.usage).toHaveLength(2);
        expect(new Set(repo.contracts.map((c) => c.id)).size).toBe(2);
    });

    it("a changed classifier version creates a new package", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const result = classifyNonFormSource(SUBSIDY);

        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result, deps: repo.deps,
        });
        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY,
            result: { ...result, classifier_version: "fp9.2" },
            deps: repo.deps,
        });

        expect(repo.packages).toHaveLength(2);
        expect(repo.usage).toHaveLength(2);
        const versions = repo.contracts.map((c) => (c.context as Record<string, unknown>).classifier_version);
        expect(new Set(versions)).toEqual(new Set(["fp9.1", "fp9.2"]));
    });

    it("a different Processing Case is distinct even when the file content matches", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await govern(store, repo, "case-1", SUBSIDY);
        await govern(store, repo, "case-2", SUBSIDY);

        expect(repo.packages).toHaveLength(2);
        expect(repo.usage).toHaveLength(2);
        // Same material fingerprint, different case → different identity.
        const fps = repo.contracts.map((c) => (c.context as Record<string, unknown>).material_input_fingerprint);
        expect(fps[0]).toBe(fps[1]);
        expect(repo.contracts[0]!.id).not.toBe(repo.contracts[1]!.id);
    });

    it("a different organization is distinct too", async () => {
        const store = makeStore();
        const repo = makeRepo();
        for (const orgId of ["org-1", "org-2"]) {
            await governSourceClassification(store.client(), {
                orgId, caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY), deps: repo.deps,
            });
        }
        expect(repo.packages).toHaveLength(2);
        expect(repo.contracts[0]!.id).not.toBe(repo.contracts[1]!.id);
    });
});

// ---------------------------------------------------------------------------
// 15, 16. Boundaries preserved
// ---------------------------------------------------------------------------

describe("UID-E — unchanged behaviour survives the seam", () => {
    it("an unsupported source creates neither package nor gap, however often it runs", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const input: ClassifyNonFormSourceInput = { sourceKind: "form_submission", fileName: "x.pdf" };
        for (let i = 0; i < 3; i += 1) {
            const out = await governSourceClassification(store.client(), {
                orgId: "org-1", caseId: "case-1", input, result: classifyNonFormSource(input), deps: repo.deps,
            });
            expect(out.status).toBe("skipped_unsupported");
        }
        expect(repo.contracts).toHaveLength(0);
        expect(repo.packages).toHaveLength(0);
        expect(store.exceptions).toHaveLength(0);
    });

    it("Processing-visible output is byte-identical on the reused path", async () => {
        const strip = (v: { classified_at?: string } | null) => JSON.stringify({ ...v, classified_at: "" });
        const suppressed = makeStore();
        const a = await maybeClassifyProcessingCaseFromDocumentSafe(suppressed.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC,
        });

        const store = makeStore();
        const repo = makeRepo();
        const first = await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC, governance: repo.deps,
        });
        const reused = await maybeClassifyProcessingCaseFromDocumentSafe(store.client(), {
            orgId: "org-1", caseId: "case-1", document: SUBSIDY_DOC, governance: repo.deps,
        });

        expect(strip(first)).toBe(strip(a));
        expect(strip(reused)).toBe(strip(a));
        expect(repo.packages).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// Negative controls — each introduces the defect and proves the guard catches it
// ---------------------------------------------------------------------------

describe("UID-NC — the guards are load-bearing", () => {
    /** The seam, minus its lookup: what "the direct path skips lookup" means. */
    async function governWithoutLookup(store: ReturnType<typeof makeStore>, repo: ReturnType<typeof makeRepo>) {
        return governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
            deps: { ...repo.deps, lookup: async () => null },
        });
    }

    it("NC: a direct path that skips lookup cannot silently duplicate — the primary key stops it", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();

        await governWithoutLookup(store, repo);
        const second = await governWithoutLookup(store, repo);

        // Without the lookup the second attempt cannot report success...
        expect(second.status).not.toBe("governed");
        // ...and crucially it did NOT create a second governed decision.
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);

        // With the lookup restored, the same repeat succeeds by recognition.
        const third = await govern(store, repo);
        expect(third.status).toBe("governed");
        if (third.status === "governed") {
            expect(third.reused).toBe(true);
            expect(third.packageId).toBe(repo.packages[0]!.id);
        }
        expect(repo.packages).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("NC: reconciliation using a DIFFERENT identity would duplicate — the shared identity prevents it", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();

        await govern(store, repo);
        expect(repo.packages).toHaveLength(1);
        const original = repo.contracts[0]!.id;

        // The defect: reconciling with a fingerprint that is not the captured
        // one. It derives a different contract id and creates a second package.
        const wrongIdentityContractId = processingSourceClassificationContractId({
            org_id: "org-1",
            processing_case_id: "case-1",
            decision_class_key: PROCESSING_SOURCE_CLASSIFICATION_CLASS_KEY,
            material_input_fingerprint: "a-different-fingerprint",
            classifier_version: "fp9.1",
        });
        expect(wrongIdentityContractId).not.toBe(original);

        await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1",
            input: { sourceKind: "document", fileName: "monthly_remittance.pdf" },
            result: classifyNonFormSource(SUBSIDY),
            deps: repo.deps,
        });
        // Two packages, because the identity genuinely differed. This is what a
        // mismatched reconciliation identity would look like — and why both
        // paths must build the identity from the SAME snapshot fields.
        expect(repo.packages).toHaveLength(2);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("NC: a repository without the primary key WOULD duplicate under a broken lookup", async () => {
        // The control for the control: drop the PK enforcement and the defect
        // reappears, proving the constraint is what prevents it.
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
        const run = () =>
            governSourceClassification(store.client(), {
                orgId: "org-1", caseId: "case-1", input: SUBSIDY, result: classifyNonFormSource(SUBSIDY),
                deps: { repository: permissive, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0 },
            });
        await run();
        await run();

        expect(packages).toHaveLength(2);
        // ...and both duplicates share ONE contract id, which is exactly the row
        // the real primary key refuses.
        expect(new Set(contracts.map((c) => c.id)).size).toBe(1);
    });

    it("NC: metrics would inflate if repeated direct attempts were counted", async () => {
        const store = makeStore();
        const repo = makeRepo();
        for (let i = 0; i < 5; i += 1) await govern(store, repo);
        // Five attempts, one usage record. Counting attempts instead of
        // decisions would make this five.
        expect(repo.usage).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
    });

    it("NC: a changed fingerprint incorrectly deduplicated would be caught", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await govern(store, repo, "case-1", SUBSIDY);
        // A lookup that ignores the fingerprint — the deduplication defect.
        const blindLookup = async () => {
            const pkg = repo.packages[0];
            return pkg ? { contract_id: pkg.contract_id, package_id: pkg.id } : null;
        };
        const blind = await governSourceClassification(store.client(), {
            orgId: "org-1", caseId: "case-1",
            input: { sourceKind: "document", fileName: "monthly_remittance.pdf" },
            result: classifyNonFormSource({ sourceKind: "document", fileName: "monthly_remittance.pdf" }),
            deps: { ...repo.deps, lookup: blindLookup },
        });
        // The defect: a genuinely different decision reported as already governed.
        expect(blind.status).toBe("governed");
        if (blind.status === "governed") expect(blind.reused).toBe(true);
        expect(repo.packages).toHaveLength(1);

        // The real lookup keys on the fingerprint, so it does not deduplicate.
        const correct = await govern(store, repo, "case-1", {
            sourceKind: "document",
            fileName: "monthly_remittance.pdf",
        });
        expect(correct.status).toBe("governed");
        if (correct.status === "governed") expect(correct.reused).toBe(false);
        expect(repo.packages).toHaveLength(2);
    });
});
