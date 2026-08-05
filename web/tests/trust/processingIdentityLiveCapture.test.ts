/**
 * Phase 1.5 — live Processing identity Trust capture.
 *
 * Each completed deterministic identity-subject judgment becomes one immutable
 * Decision Package, captured only after the resolution generation is durable.
 * Processing keeps every authority it had; a Trust outage produces durable
 * per-subject gaps and never fails a generation.
 *
 * The recording repository ENFORCES the two constraints the real schema
 * declares — `trust_decision_contracts.id` PRIMARY KEY and
 * `trust_decision_packages.contract_id` UNIQUE — because a fake that stores
 * duplicates the database would refuse turns every exactly-once assertion into
 * theatre.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import { captureIdentityGenerationJudgments } from "@/lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration";
import {
    listUnresolvedIdentityGovernanceGaps,
    TRUST_IDENTITY_RESOLUTION_GAP_TYPE,
} from "@/lib/pos/processingIdentity/trustAdapter/identityGovernanceGapDb";
import {
    reconcileIdentityGovernanceGaps,
    reconcileOneIdentityGovernanceGap,
} from "@/lib/pos/processingIdentity/trustAdapter/reconcileIdentityGovernanceGaps";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type { DecisionContractV1 } from "@/lib/trust/contract/decisionContractTypes";
import type { DecisionPackageV1 } from "@/lib/trust/package/decisionPackageTypes";
import type { ReasoningUsageInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const FIXED_NOW = "2026-08-05T12:00:00.000Z";
const FACTS_HASH = "a".repeat(64);
const GEN = "gen-1";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Enforces the real schema's uniqueness, so idempotency is measured. */
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
    /** Reads current state, so a concurrent loser can see the winner. */
    const lookup = async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
        const pkg = packages.find((p) => p.org_id === org_id && p.contract_id === contract_id);
        return pkg ? { contract_id: pkg.contract_id, package_id: pkg.id } : null;
    };
    const deps = { repository, lookup, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW };
    return { repository, contracts, packages, usage, lookup, deps };
}

const failingRepository: TrustRepository = {
    async insertContract() { throw new Error("trust db down"); },
    async advanceContractLifecycle() {},
    async insertPackage() {},
    async insertObservation() {},
    async insertReasoningUsage() {},
};

type Row = Record<string, unknown>;

/** Durable `processing_exceptions`, plus a guard on every other table. */
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
                    throw new Error(`capture touched a forbidden table: ${table}`);
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
                        return { data: [{ ...r }], error: null };
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

const adoptionFor = (r: ProcessingResolutionRow) =>
    processingIdentitySubjectAdoptionId({
        org_id: "org-1", processing_case_id: "case-1", subject_ref: r.subject_ref,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: r.input_facts_hash,
        material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identity_resolver_version: r.resolver_version,
    });

function capture(
    store: ReturnType<typeof makeStore>,
    repo: ReturnType<typeof makeRepo>,
    rows: ProcessingResolutionRow[],
) {
    return captureIdentityGenerationJudgments(store.client(), {
        orgId: "org-1", caseId: "case-1", generationId: GEN,
        resolutionRows: rows,
        deps: repo.deps,
    });
}

const silence = () => ({
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
});

// ---------------------------------------------------------------------------
// 2-8, 33. Capture per subject
// ---------------------------------------------------------------------------

describe("P15-A — one completed subject judgment becomes one package", () => {
    it("a single subject creates one package and one usage record", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const result = await capture(store, repo, [row()]);

        expect(result.subjects).toHaveLength(1);
        expect(result.subjects[0]!.status).toBe("governed");
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
        expect(store.exceptions).toHaveLength(0);
    });

    it("multiple subjects create independent packages, counted as multiple decisions", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const rows = [
            row({ id: "r1", subject_ref: "parent-1", subject_role: "parent" }),
            row({ id: "r2", subject_ref: "child-1", subject_role: "child" }),
            row({ id: "r3", subject_ref: "household-1", subject_role: "household" }),
        ];
        const result = await capture(store, repo, rows);

        expect(result.subjects.map((s) => s.status)).toEqual(["governed", "governed", "governed"]);
        expect(repo.packages).toHaveLength(3);
        expect(repo.usage).toHaveLength(3);
        // Distinct adoption identities, distinct contracts.
        expect(new Set(repo.contracts.map((c) => c.id)).size).toBe(3);
        expect(repo.contracts.map((c) => c.id).sort()).toEqual(rows.map(adoptionFor).sort());
    });

    it.each([
        ["confirmed_existing", () => row(), "automatic"],
        ["confirmed_new", () => row({ decision_action: "create_new", candidates: [] }), "automatic"],
        ["needs_review", () => row({ decision_action: "review_required" }), "operator_review"],
        ["unresolved", () => row({ decision_action: "request_information" }), "operator_review"],
    ])("%s captures as a RECOMMENDED package", async (disposition, mk, perResult) => {
        const store = makeStore();
        const repo = makeRepo();
        await capture(store, repo, [mk()]);
        const pkg = repo.packages[0]!;
        const rec = pkg.recommendation as Record<string, unknown>;
        expect(pkg.outcome).toBe("recommended");
        expect(rec.disposition).toBe(disposition);
        expect(rec.review_requirement).toBe(perResult);
    });

    it("conflicted captures as recommended and review-required", async () => {
        const store = makeStore();
        const repo = makeRepo();
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
        await capture(store, repo, [row({ decision_action: "review_required", candidates: [conflicted] })]);
        const rec = repo.packages[0]!.recommendation as Record<string, unknown>;
        expect(repo.packages[0]!.outcome).toBe("recommended");
        expect(rec.disposition).toBe("conflicted");
        expect(rec.conflict_categories).toContain("conflicting_identity_facts");
    });
});

// ---------------------------------------------------------------------------
// 1, 9, 10. Eligibility and timing
// ---------------------------------------------------------------------------

describe("P15-B — only completed ENGINE judgments are captured", () => {
    it.each([
        ["a row from another generation", { generation_id: "other-gen" }, "different_generation"],
        ["a superseded row", { superseded_by: "res-9" }, "superseded_row"],
        ["an operator decision", { decided_by: "operator" }, "operator_decision_not_engine_output"],
        ["an incomplete row with no facts hash", { input_facts_hash: "" }, "incomplete_generation_no_facts_hash"],
        ["an incomplete row with no subject", { subject_ref: "" }, "incomplete_generation_no_subject"],
    ])("%s is skipped, not captured", async (_label, override, reason) => {
        const store = makeStore();
        const repo = makeRepo();
        const result = await capture(store, repo, [row(override as Partial<ProcessingResolutionRow>)]);

        expect(result.subjects[0]!.status).toBe("skipped_ineligible");
        if (result.subjects[0]!.status === "skipped_ineligible") {
            expect(result.subjects[0]!.reason).toBe(reason);
        }
        expect(repo.packages).toHaveLength(0);
        expect(repo.usage).toHaveLength(0);
        expect(store.exceptions).toHaveLength(0);
    });

    it("an operator decision never masquerades as deterministic engine output", async () => {
        const store = makeStore();
        const repo = makeRepo();
        // The engine-time row captures; the operator-decided row does not.
        await capture(store, repo, [row(), row({ id: "r2", subject_ref: "child-1", decided_by: "operator" })]);
        expect(repo.packages).toHaveLength(1);
        const rec = repo.packages[0]!.recommendation as Record<string, unknown>;
        expect(rec.disposition_source).toBe("deterministic_engine");
    });
});

// ---------------------------------------------------------------------------
// 11-19. Exactly-once
// ---------------------------------------------------------------------------

describe("P15-C — capture is exactly-once on the adoption identity", () => {
    it("the deterministic contract id is stable and equals the adoption identity", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const r = row();
        await capture(store, repo, [r]);
        expect(repo.contracts[0]!.id).toBe(adoptionFor(r));
        expect(repo.packages[0]!.contract_id).toBe(adoptionFor(r));
    });

    it("repeating capture returns the existing package and adds no usage record", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const first = await capture(store, repo, [row()]);
        const second = await capture(store, repo, [row()]);
        const third = await capture(store, repo, [row()]);

        expect(first.subjects[0]!.status).toBe("governed");
        expect(second.subjects[0]!.status).toBe("already_governed");
        expect(third.subjects[0]!.status).toBe("already_governed");
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
    });

    it.each([
        ["subject", { subject_ref: "child-1" }],
        ["facts hash", { input_facts_hash: "b".repeat(64) }],
        ["resolver version", { resolver_version: "proc-identity-v2" }],
    ])("a changed %s is a NEW governed decision", async (_label, override) => {
        const store = makeStore();
        const repo = makeRepo();
        await capture(store, repo, [row()]);
        await capture(store, repo, [row(override as Partial<ProcessingResolutionRow>)]);
        expect(repo.packages).toHaveLength(2);
        expect(repo.usage).toHaveLength(2);
    });

    it("a changed projection version is a new governed decision", () => {
        const r = row();
        const base = adoptionFor(r);
        const bumped = processingIdentitySubjectAdoptionId({
            org_id: "org-1", processing_case_id: "case-1", subject_ref: r.subject_ref,
            decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
            input_facts_hash: r.input_facts_hash,
            material_projection_version: "proc-identity-fact-material-v2",
            identity_resolver_version: r.resolver_version,
        });
        expect(bumped).not.toBe(base);
    });

    it("concurrent captures produce at most one package, and the loser converges", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();

        const [a, b] = await Promise.all([capture(store, repo, [row()]), capture(store, repo, [row()])]);

        // The invariant, unconditionally.
        expect(repo.contracts).toHaveLength(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);

        const statuses = [a, b].map((r) => r.subjects[0]!.status);
        expect(statuses.filter((s) => s === "governed" || s === "already_governed").length).toBeGreaterThanOrEqual(1);

        // A loser, if there was one, left a durable gap that converges.
        if (statuses.includes("not_governed")) {
            const gaps = await listUnresolvedIdentityGovernanceGaps(store.client(), { orgId: "org-1" });
            expect(gaps).toHaveLength(1);
            const out = await reconcileOneIdentityGovernanceGap(store.client(), { gap: gaps[0]!, deps: repo.deps });
            expect(out.status).toBe("already_governed");
            expect(repo.packages).toHaveLength(1);
            expect(repo.usage).toHaveLength(1);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 20-22, 31, 32. Gaps
// ---------------------------------------------------------------------------

describe("P15-D — a failed capture becomes one durable subject-level gap", () => {
    const failingDeps = { repository: failingRepository, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW };

    it("one subject failure creates exactly one gap of the identity type", async () => {
        const store = makeStore();
        const spies = silence();
        const result = await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row()], deps: failingDeps,
        });

        expect(result.subjects[0]!.status).toBe("not_governed");
        expect(store.exceptions).toHaveLength(1);
        expect(store.exceptions[0]!.exception_type).toBe(TRUST_IDENTITY_RESOLUTION_GAP_TYPE);
        expect(store.exceptions[0]!.severity).toBe("warning");
        expect(store.exceptions[0]!.resolved_at).toBeNull();
        // A DISTINCT type from source classification.
        expect(TRUST_IDENTITY_RESOLUTION_GAP_TYPE).not.toBe("trust_governance_gap");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the gap snapshot carries the exact bounded safe material", async () => {
        const store = makeStore();
        const spies = silence();
        const r = row();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [r], deps: failingDeps,
        });
        const snap = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snap.adoption_id).toBe(adoptionFor(r));
        expect(snap.subject_ref).toBe("parent-1");
        expect(snap.generation_id).toBe(GEN);
        expect(snap.input_facts_hash).toBe(FACTS_HASH);
        expect(snap.material_projection_version).toBe(PROCESSING_IDENTITY_FACT_MATERIAL_VERSION);
        expect(snap.identity_resolver_version).toBe(IDENTITY_RESOLVER_VERSION);
        expect(snap.retry_count).toBe(0);
        expect(snap.first_failed_at).toBe(FIXED_NOW);
        expect(snap.package_id).toBeNull();
        const rec = snap.recommendation as Record<string, unknown>;
        expect(rec.disposition).toBe("confirmed_existing");
        expect(rec.confidence_band).toBe("strong");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the gap snapshot contains no raw identity data or unsafe explanation", async () => {
        const store = makeStore();
        const spies = silence();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps: failingDeps,
        });
        const serialized = JSON.stringify(store.exceptions[0]);
        for (const secret of ["Alex", "Lyons", "@lyons", "2019-04-11", "rec-1", "submitted name differs"]) {
            expect(serialized).not.toContain(secret);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("multiple subject failures create DISTINCT gaps", async () => {
        const store = makeStore();
        const spies = silence();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row({ id: "r1", subject_ref: "parent-1" }), row({ id: "r2", subject_ref: "child-1" })],
            deps: failingDeps,
        });
        expect(store.exceptions).toHaveLength(2);
        const ids = store.exceptions.map((e) => (e.subject_ref as Record<string, unknown>).adoption_id);
        expect(new Set(ids).size).toBe(2);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("one subject's failure does not undo another subject's success", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();
        let call = 0;
        // First subject succeeds, second fails.
        const flaky = {
            ...repo.deps,
            repository: {
                ...repo.repository,
                async insertContract(c: DecisionContractV1) {
                    call += 1;
                    if (call === 2) throw new Error("trust db down");
                    return repo.repository.insertContract(c);
                },
            } as TrustRepository,
        };
        const result = await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN,
            resolutionRows: [row({ id: "r1", subject_ref: "parent-1" }), row({ id: "r2", subject_ref: "child-1" })],
            deps: flaky,
        });

        expect(result.subjects.map((s) => s.status)).toEqual(["governed", "not_governed"]);
        // The successful package survives.
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
        // Exactly one gap, for the failing subject only.
        expect(store.exceptions).toHaveLength(1);
        expect((store.exceptions[0]!.subject_ref as Record<string, unknown>).subject_ref).toBe("child-1");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 23-29, 34. Reconciliation
// ---------------------------------------------------------------------------

describe("P15-E — reconciliation converges without duplicating", () => {
    const failingDeps = { repository: failingRepository, lookup: async () => null, nowIso: FIXED_NOW, clock: () => 0, now: () => FIXED_NOW };

    async function withGap() {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps: failingDeps,
        });
        spies.warn.mockRestore();
        spies.error.mockRestore();
        return { store, repo };
    }

    it("reconciliation creates exactly one package and one usage record", async () => {
        const { store, repo } = await withGap();
        const sweep = await reconcileIdentityGovernanceGaps(store.client(), { orgId: "org-1", deps: repo.deps });

        expect(sweep.scanned).toBe(1);
        expect(sweep.resolved).toBe(1);
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
        expect(store.exceptions[0]!.resolved_at).toBe(FIXED_NOW);
        const snap = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snap.package_id).toBe(repo.packages[0]!.id);
    });

    it("never reruns identity matching and never rewrites the generation", async () => {
        const { store, repo } = await withGap();
        await reconcileIdentityGovernanceGaps(store.client(), { orgId: "org-1", deps: repo.deps });
        // The store throws on ANY table but processing_exceptions, so touching
        // processing_resolutions would have surfaced as an error.
        expect(store.forbiddenWrites).toEqual([]);
    });

    it("a resolved gap cannot be reclaimed", async () => {
        const { store, repo } = await withGap();
        const gaps = await listUnresolvedIdentityGovernanceGaps(store.client(), { orgId: "org-1" });
        await reconcileOneIdentityGovernanceGap(store.client(), { gap: gaps[0]!, deps: repo.deps });
        const late = await reconcileOneIdentityGovernanceGap(store.client(), { gap: gaps[0]!, deps: repo.deps });
        expect(late.status).toBe("claim_lost");
        expect(repo.packages).toHaveLength(1);
        expect(await listUnresolvedIdentityGovernanceGaps(store.client(), { orgId: "org-1" })).toHaveLength(0);
    });

    it("ambiguous success is recovered as already_governed, not duplicated", async () => {
        const store = makeStore();
        const repo = makeRepo();
        const spies = silence();
        // A capture that really succeeded...
        await capture(store, repo, [row()]);
        expect(repo.packages).toHaveLength(1);
        // ...whose response was lost, so a gap was recorded anyway.
        await captureIdentityGenerationJudgments(store.client(), {
            orgId: "org-1", caseId: "case-1", generationId: GEN, resolutionRows: [row()], deps: failingDeps,
        });
        const gaps = await listUnresolvedIdentityGovernanceGaps(store.client(), { orgId: "org-1" });
        expect(gaps).toHaveLength(1);

        const out = await reconcileOneIdentityGovernanceGap(store.client(), { gap: gaps[0]!, deps: repo.deps });
        expect(out.status).toBe("already_governed");
        expect(repo.packages).toHaveLength(1);
        expect(repo.usage).toHaveLength(1);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("a failing retry leaves the gap unresolved with advanced retry evidence", async () => {
        const { store } = await withGap();
        const gaps = await listUnresolvedIdentityGovernanceGaps(store.client(), { orgId: "org-1" });
        const out = await reconcileOneIdentityGovernanceGap(store.client(), {
            gap: gaps[0]!,
            deps: {
                lookup: async () => null,
                capture: async () => ({ status: "gap_required", contractId: "c", reason: "still down" }),
                now: () => "2026-08-06T00:00:00.000Z",
            },
        });
        expect(out.status).toBe("still_failing");
        expect(store.exceptions[0]!.resolved_at).toBeNull();
        const snap = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snap.retry_count).toBe(1);
        expect(snap.last_attempt_at).toBe("2026-08-06T00:00:00.000Z");
        expect(snap.package_id).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 36-38. Preserved guarantees
// ---------------------------------------------------------------------------

describe("P15-F — Phase 1.3/1.4 guarantees survive live capture", () => {
    it("numeric confidence is null, band preserved, no provider, no command, no case gate", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await capture(store, repo, [row()]);
        const pkg = repo.packages[0]!;
        expect(pkg.confidence).toBeNull();
        expect((pkg.recommendation as Record<string, unknown>).confidence_band).toBe("strong");
        expect(pkg.economics.provider_cost_units).toBe(0);
        const serialized = JSON.stringify(pkg).toLowerCase();
        for (const forbidden of [
            "provider_key", "model_id", "prompt", "openai", "anthropic",
            "proposed_command", "command_key", "child_identity_unconfirmed",
            "plan_id", "approval", "alex", "lyons", "2019-04-11",
        ]) {
            expect(serialized).not.toContain(forbidden);
        }
    });

    it("the package carries the class default review requirement", async () => {
        const store = makeStore();
        const repo = makeRepo();
        await capture(store, repo, [row()]);
        expect(repo.packages[0]!.review_requirement).toBe("operator_review");
    });
});
