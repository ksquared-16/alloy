/**
 * Phase 1.7 — Processing Commit Plan outcome binding.
 *
 * The real-world outcome of a governed identity judgment becomes visible to
 * Trust, in one direction only:
 *
 * ```text
 * authoritative Processing commit result → bounded Trust execution evidence
 * ```
 *
 * The observation store ENFORCES `trust_decision_observations.id PRIMARY KEY`,
 * because a fake that accepts duplicates the database would refuse turns every
 * exactly-once assertion into theatre.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import type { CommitPlan, PlanOperation } from "@/lib/pos/processingIdentity/plan/planTypes";
import type { CommitAttempt, OperationResult } from "@/lib/pos/processingIdentity/executor/executorTypes";
import { computePlanContentHash } from "@/lib/pos/processingIdentity/plan/planHash";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import { resolvePlanPackageLineage } from "@/lib/pos/processingIdentity/trustAdapter/planPackageLineage";
import { planPackageExecutionEvidence } from "@/lib/pos/processingIdentity/trustAdapter/executionOutcomeMapping";
import { bindCommitOutcomeToTrust } from "@/lib/pos/processingIdentity/trustAdapter/executionLineageService";
import {
    listUnresolvedIdentityExecutionGaps,
    TRUST_IDENTITY_EXECUTION_GAP_TYPE,
} from "@/lib/pos/processingIdentity/trustAdapter/identityExecutionGapDb";
import {
    reconcileIdentityExecutionGaps,
    reconcileOneIdentityExecutionGap,
} from "@/lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps";
import { TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import {
    observeProcessingIdentityExecution,
    type ExecutionObservationLookup,
    type ExecutionPackageLookup,
    type ExistingExecutionObservation,
    type TrustPackageExecutionRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution";
import type { ExistingSupersession, SupersessionObservationLookup } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import { executionObservationId } from "@/lib/trust/execution/executionObservationIdentity";
import { projectDecisionPackageLifecycle } from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import type { LifecycleObservationRecord, LifecycleSubjectPackage } from "@/lib/trust/lifecycle/lifecycleObservation";
import type {
    ReasoningUsageInput,
    TrustObservationInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";

const NOW = "2026-08-05T12:00:00.000Z";
const ORG = "org-1";
const CASE = "case-1";
const PLAN = "plan-1";
const ATTEMPT_ROW = "attempt-row-uuid-1";
const HASH_PARENT = "a".repeat(64);
const HASH_CHILD = "b".repeat(64);
const PKG_PARENT = "pkg-parent";
const PKG_CHILD = "pkg-child";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Enforces `trust_decision_observations.id PRIMARY KEY`, so exactly-once is measured. */
function makeTrust(opts: { enforcePrimaryKey?: boolean; supersededPackages?: string[] } = {}) {
    const enforce = opts.enforcePrimaryKey ?? true;
    const superseded = new Set(opts.supersededPackages ?? []);
    const observations: TrustObservationInput[] = [];
    const usage: ReasoningUsageInput[] = [];
    const contracts: unknown[] = [];
    const packagesCreated: unknown[] = [];

    const repository: TrustRepository = {
        async insertContract(c) {
            contracts.push(c);
        },
        async advanceContractLifecycle() {},
        async insertPackage(p) {
            packagesCreated.push(p);
        },
        async insertObservation(o) {
            if (enforce && o.id && observations.some((x) => x.id === o.id)) {
                throw new Error('duplicate key value violates unique constraint "trust_decision_observations_pkey"');
            }
            observations.push(o);
        },
        async insertReasoningUsage(u) {
            usage.push(u);
        },
    };

    const packages = new Map<string, TrustPackageExecutionRef>([
        [PKG_PARENT, { id: PKG_PARENT, org_id: ORG, contract_id: "contract-parent" }],
        [PKG_CHILD, { id: PKG_CHILD, org_id: ORG, contract_id: "contract-child" }],
    ]);

    const packageLookup: ExecutionPackageLookup = async ({ package_id }) => packages.get(package_id) ?? null;

    const observationLookup: ExecutionObservationLookup = async ({ org_id, package_id }) =>
        observations
            .filter(
                (o) =>
                    o.org_id === org_id &&
                    o.package_id === package_id &&
                    (o.observation_kind === "executed" || o.observation_kind === "outcome"),
            )
            .map(
                (o): ExistingExecutionObservation => ({
                    observation_id: o.id!,
                    observation_kind: o.observation_kind,
                    execution_reference: o.execution_reference,
                }),
            );

    const supersessionLookup: SupersessionObservationLookup = async ({ package_id }) =>
        superseded.has(package_id)
            ? ([
                  {
                      observation_id: "obs-supersede",
                      superseding_package_id: null,
                      superseding_reference: "processing_resolution:res-parent",
                      reason: "operator_confirmed_existing",
                  },
              ] as ExistingSupersession[])
            : [];

    return {
        repository,
        observations,
        usage,
        contracts,
        packagesCreated,
        packages,
        packageLookup,
        observationLookup,
        supersessionLookup,
    };
}

/** Governed packages, keyed by the adoption identity that IS the contract id. */
function governedLookup(entries: Record<string, string>) {
    return async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
        if (org_id !== ORG) return null;
        const packageId = entries[contract_id];
        return packageId ? { contract_id, package_id: packageId } : null;
    };
}

type Row = Record<string, unknown>;

function makeStore(resolutions: Row[] = []) {
    const exceptions: Row[] = [];
    const writes: string[] = [];
    const touched: string[] = [];
    let seq = 0;
    const readColumn = (r: Row, column: string): unknown => {
        const arrow = column.indexOf("->>");
        if (arrow === -1) return r[column];
        const obj = r[column.slice(0, arrow)] as Record<string, unknown> | null | undefined;
        const v = obj?.[column.slice(arrow + 3)];
        return v === undefined || v === null ? undefined : String(v);
    };
    const client = () =>
        ({
            from(table: string) {
                touched.push(table);
                const rows = table === "processing_exceptions" ? exceptions : resolutions;
                const filters: { kind: string; column: string; value: unknown }[] = [];
                let mode = "select";
                let payload: Row | null = null;
                let limit: number | null = null;
                const match = (r: Row) =>
                    filters.every((f) => {
                        const a = readColumn(r, f.column);
                        if (f.kind === "eq") return String(a) === String(f.value);
                        if (f.kind === "is") return a === null || a === undefined;
                        return true;
                    });
                const resolve = () => {
                    if (mode === "insert") {
                        const r: Row = { id: `exc-${++seq}`, resolved_at: null, created_at: `t${seq}`, ...payload };
                        rows.push(r);
                        return { data: [{ ...r }], error: null };
                    }
                    const hits = rows.filter(match);
                    if (mode === "update") {
                        if (table !== "processing_exceptions") for (const r of hits) writes.push(String(r.id));
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
                    neq: () => api,
                    is: (c: string, v: unknown) => { filters.push({ kind: "is", column: c, value: v }); return api; },
                    order: () => api,
                    limit: (n: number) => { limit = n; return api; },
                    maybeSingle: () => Promise.resolve({ data: (resolve().data as Row[])[0] ?? null, error: null }),
                    single: () => {
                        const out = resolve().data as Row[];
                        return Promise.resolve({ data: out[0] ?? null, error: out[0] ? null : { message: "no_row" } });
                    },
                    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
                        Promise.resolve(resolve()).then(ok, err),
                };
                return api;
            },
        }) as unknown as SupabaseClient;
    return { client, exceptions, resolutions, writes, touched };
}

function resolutionRow(overrides: Partial<ProcessingResolutionRow> = {}): Row {
    return {
        id: "res-parent", org_id: ORG, case_id: CASE, generation_id: "gen-1",
        input_facts_hash: HASH_PARENT, subject_ref: "parent-1", subject_role: "parent",
        provisional: {}, candidates: [], decision_action: "create_new",
        selected_candidate_id: null, decided_by: "engine", operator_id: null,
        policy_version: null, resolver_version: IDENTITY_RESOLVER_VERSION,
        stale_at: null, superseded_by: null, retention_class: "uncommitted_submission",
        created_at: "2026-08-05T10:00:00.000Z",
        ...overrides,
    } as Row;
}

function adoptionIdFor(subjectRef: string, factsHash: string): string {
    return processingIdentitySubjectAdoptionId({
        org_id: ORG,
        processing_case_id: CASE,
        subject_ref: subjectRef,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: factsHash,
        material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identity_resolver_version: IDENTITY_RESOLVER_VERSION,
    });
}

function op(overrides: Partial<PlanOperation> = {}): PlanOperation {
    return {
        opId: "op-parent", opOrder: 1, opKind: "create",
        commandKey: "identity.create_person", commandVersion: "1",
        targetType: "person", targetId: null, payload: { role: "parent" },
        before: null, after: { role: "parent" }, reason: "create parent",
        evidenceRefs: [], resolutionRefs: ["res-parent"], risk: "low",
        dependsOn: [], atomicGroup: "identity_core", preconditionRecordVersion: null,
        included: true, optional: false, reversibility: "reversible",
        atomicity: "atomic", expectedSideEffects: [],
        ...overrides,
    };
}

function plan(operations: PlanOperation[] = [op()]): CommitPlan {
    return {
        planId: PLAN, orgId: ORG, caseId: CASE, version: 1,
        contentHash: computePlanContentHash({ orgId: ORG, caseId: CASE, operations }),
        operations, preconditions: [], atomicGroups: ["identity_core"],
        sourceResolutionVersions: ["gen-1"], downstreamEffectPreview: [],
        requiresApproval: true, requiresPrivilegedApproval: false, reversible: true,
        status: "approved", builtAt: NOW, supersededBy: null, supersededAt: null,
        retentionClass: "uncommitted_submission",
    };
}

function attempt(overrides: Partial<CommitAttempt> = {}): CommitAttempt {
    const p = overrides.planContentHash ?? plan().contentHash;
    return {
        attemptId: `${PLAN}:attempt:1`, orgId: ORG, caseId: CASE, planId: PLAN,
        planVersion: 1, planContentHash: p, attemptNo: 1,
        executionIdempotencyKey: "exec-1", actorId: "user-1",
        outcome: "committed",
        operations: [committedOp("op-parent")],
        compensation: [], events: [], preflightFailures: [],
        startedAt: NOW, finishedAt: NOW,
        ...overrides,
    };
}

function committedOp(opId: string): OperationResult {
    return { opId, commandKey: "identity.create_person", status: "committed", recordId: "rec-1", idempotentReplay: false, error: null };
}

function failedOp(opId: string): OperationResult {
    return { opId, commandKey: "identity.create_person", status: "failed", recordId: null, idempotentReplay: false, error: "boom" };
}

function silence() {
    return {
        warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
        error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
}

function bindDeps(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
    return {
        repository: trust.repository,
        packageLookup: trust.packageLookup,
        observationLookup: trust.observationLookup,
        supersessionLookup: trust.supersessionLookup,
        lookup: governedLookup(governed),
        now: () => NOW,
    };
}

const PARENT_ADOPTION = adoptionIdFor("parent-1", HASH_PARENT);
const CHILD_ADOPTION = adoptionIdFor("child-1", HASH_CHILD);

// ---------------------------------------------------------------------------
// 1. Plan → package lineage
// ---------------------------------------------------------------------------

describe("P17-1 — a plan resolves to the exact governed judgments it derived from", () => {
    it("joins by exact adoption identity, never by case", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG,
            plan: plan(),
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(lineage.contributing).toHaveLength(1);
        expect(lineage.contributing[0]).toMatchObject({
            packageId: PKG_PARENT,
            adoptionId: PARENT_ADOPTION,
            resolutionId: "res-parent",
            subjectRef: "parent-1",
            opIds: ["op-parent"],
        });
        expect(lineage.unattributedOpIds).toEqual([]);
    });

    it("does NOT link another subject's package", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);

        // A package exists for a different subject's adoption identity.
        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG,
            plan: plan(),
            deps: bindDeps(trust, { [CHILD_ADOPTION]: PKG_CHILD }),
        });

        expect(lineage.contributing).toEqual([]);
        expect(lineage.excluded).toEqual([
            { resolutionId: "res-parent", subjectRef: "parent-1", reason: "no_governed_package" },
        ]);
    });

    it("deduplicates a resolution referenced by several operations", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow({ id: "res-child", subject_ref: "child-1", input_facts_hash: HASH_CHILD } as Partial<ProcessingResolutionRow>)]);
        // A child op and its synthesized participation op share one resolutionRef.
        const p = plan([
            op({ opId: "op-child", resolutionRefs: ["res-child"] }),
            op({ opId: "op-participation", opOrder: 2, resolutionRefs: ["res-child"], atomicGroup: null }),
        ]);

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG, plan: p,
            deps: bindDeps(trust, { [CHILD_ADOPTION]: PKG_CHILD }),
        });

        expect(lineage.contributing).toHaveLength(1);
        expect(lineage.contributing[0]!.opIds).toEqual(["op-child", "op-participation"]);
    });

    it("invents no package for an operator-only resolution", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow({ decided_by: "operator", operator_id: "user-1" })]);

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG, plan: plan(),
            // No governed package for this identity at all.
            deps: bindDeps(trust, {}),
        });

        expect(lineage.contributing).toEqual([]);
        expect(lineage.excluded[0]!.reason).toBe("no_governed_package");
    });

    it("excludes a superseded package — the operator's decision executed, not the engine's", async () => {
        const trust = makeTrust({ supersededPackages: [PKG_PARENT] });
        const store = makeStore([resolutionRow({ decided_by: "operator", operator_id: "user-1" })]);

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG, plan: plan(),
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(lineage.contributing).toEqual([]);
        expect(lineage.excluded).toEqual([
            { resolutionId: "res-parent", subjectRef: "parent-1", reason: "package_superseded" },
        ]);
    });

    it("ignores excluded operations", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const p = plan([op({ included: false })]);

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG, plan: p,
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(lineage.contributing).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 2. Plan hash and approval are untouched
// ---------------------------------------------------------------------------

describe("P17-2 — Trust lineage cannot move the plan hash or void an approval", () => {
    it("the hash covers only orgId, caseId and the material operation projection", () => {
        const operations = [op()];
        const before = computePlanContentHash({ orgId: ORG, caseId: CASE, operations });

        // Every non-material plan field, changed at once.
        const mutated: CommitPlan = {
            ...plan(operations),
            sourceResolutionVersions: ["gen-9", "gen-8"],
            downstreamEffectPreview: ["anything"],
            status: "committed",
            builtAt: "2030-01-01T00:00:00.000Z",
            retentionClass: "changed",
        };
        const after = computePlanContentHash({
            orgId: mutated.orgId,
            caseId: mutated.caseId,
            operations: mutated.operations,
        });

        expect(after).toBe(before);
    });

    it("a Decision Package id placed anywhere non-material leaves the hash unchanged", () => {
        const operations = [op()];
        const before = computePlanContentHash({ orgId: ORG, caseId: CASE, operations });

        // The signature takes only these three inputs, so a package id cannot
        // reach the digest by construction — there is no parameter for it.
        const withLineage = operations.map((o) => ({
            ...o,
            // Non-material operation fields, per `materialOperation`'s whitelist.
            reason: `${o.reason} [package:${PKG_PARENT}]`,
            evidenceRefs: [...o.evidenceRefs, PKG_PARENT],
            resolutionRefs: [...o.resolutionRefs, "res-extra"],
            opOrder: 99,
            risk: "high" as const,
        }));
        const after = computePlanContentHash({ orgId: ORG, caseId: CASE, operations: withLineage });

        expect(after).toBe(before);
    });

    it("this slice adds NO plan field, so no historical hash can move", () => {
        // The strongest available proof: the plan type carries no Trust field,
        // and the lineage resolver reads `resolutionRefs`, which predates it.
        const p = plan();
        expect(Object.keys(p)).not.toContain("decisionPackageIds");
        expect(Object.keys(p)).not.toContain("trustPackageIds");
        expect(Object.keys(p.operations[0]!)).not.toContain("decisionPackageId");
        expect(p.contentHash).toBe(
            computePlanContentHash({ orgId: ORG, caseId: CASE, operations: p.operations }),
        );
    });

    it("a MATERIAL edit still moves the hash — the guard is not vacuous", () => {
        const before = computePlanContentHash({ orgId: ORG, caseId: CASE, operations: [op()] });
        const after = computePlanContentHash({
            orgId: ORG, caseId: CASE,
            operations: [op({ payload: { role: "parent", changed: true } })],
        });
        expect(after).not.toBe(before);
    });
});

// ---------------------------------------------------------------------------
// 3. Outcome mapping
// ---------------------------------------------------------------------------

describe("P17-3 — Processing outcomes map honestly", () => {
    const contributor = {
        packageId: PKG_PARENT, adoptionId: PARENT_ADOPTION,
        resolutionId: "res-parent", subjectRef: "parent-1", opIds: ["op-a", "op-b"],
    };

    it("committed, all of this subject's operations → executed", () => {
        const e = planPackageExecutionEvidence({
            attempt: attempt({ operations: [committedOp("op-a"), committedOp("op-b")] }),
            contributor,
        });
        expect(e.observationKind).toBe("executed");
        expect(e.detail.committed_operation_count).toBe(2);
        expect(e.detail.contributing_operation_count).toBe(2);
    });

    it("preflight rejected → outcome/failed, never executed", () => {
        const e = planPackageExecutionEvidence({
            attempt: attempt({ outcome: "preflight_rejected", operations: [], preflightFailures: ["plan_superseded"] }),
            contributor,
        });
        expect(e.observationKind).toBe("outcome");
        expect(e.detail.result).toBe("failed");
        expect(e.detail.failure_class).toBe("preflight_rejected");
    });

    it("attempt failed → outcome/failed, subject_not_committed", () => {
        const e = planPackageExecutionEvidence({
            attempt: attempt({ outcome: "failed", operations: [failedOp("op-a"), failedOp("op-b")] }),
            contributor,
        });
        expect(e.observationKind).toBe("outcome");
        expect(e.detail.failure_class).toBe("subject_not_committed");
    });

    it("partial attempt, but THIS subject fully committed → executed", () => {
        // Another subject's operation failed; this subject's did not.
        const e = planPackageExecutionEvidence({
            attempt: attempt({
                outcome: "partially_committed",
                operations: [committedOp("op-a"), committedOp("op-b"), failedOp("op-other")],
            }),
            contributor,
        });
        expect(e.observationKind).toBe("executed");
        expect(e.detail.processing_outcome).toBe("partially_committed");
    });

    it("partial WITHIN one subject is never flattened into executed", () => {
        const e = planPackageExecutionEvidence({
            attempt: attempt({
                outcome: "partially_committed",
                operations: [committedOp("op-a"), failedOp("op-b")],
            }),
            contributor,
        });
        expect(e.observationKind).toBe("outcome");
        expect(e.detail.failure_class).toBe("partial_commit");
        expect(e.detail.subject_operation_outcome).toBe("partially_committed");
        expect(e.detail.committed_operation_count).toBe(1);
    });

    it("a COMPENSATED operation is not counted as committed", () => {
        const compensated: OperationResult = {
            opId: "op-b", commandKey: "k", status: "compensated",
            recordId: null, idempotentReplay: false, error: null,
        };
        const e = planPackageExecutionEvidence({
            attempt: attempt({ outcome: "partially_committed", operations: [committedOp("op-a"), compensated] }),
            contributor,
        });
        // A reversed operation reported as a commit would be a lie.
        expect(e.observationKind).toBe("outcome");
        expect(e.detail.failure_class).toBe("partial_commit");
    });

    it("an idempotent replay of a prior commit still counts as committed", () => {
        const replayed: OperationResult = {
            opId: "op-b", commandKey: "k", status: "skipped",
            recordId: "rec-9", idempotentReplay: true, error: null,
        };
        const e = planPackageExecutionEvidence({
            attempt: attempt({ operations: [committedOp("op-a"), replayed] }),
            contributor,
        });
        expect(e.observationKind).toBe("executed");
    });

    it("never emits infrastructure_failure — Processing cannot report one", () => {
        for (const outcome of ["preflight_rejected", "failed", "partially_committed"] as const) {
            const e = planPackageExecutionEvidence({
                attempt: attempt({ outcome, operations: [failedOp("op-a"), failedOp("op-b")] }),
                contributor,
            });
            expect(e.detail.failure_class).not.toBe("infrastructure_failure");
        }
    });
});

// ---------------------------------------------------------------------------
// 4. Binding
// ---------------------------------------------------------------------------

describe("P17-4 — a durable commit result becomes bounded Trust evidence", () => {
    it("appends executed with the DURABLE commit-attempt id as the reference", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);

        const result = await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(result.packages).toEqual([
            { status: "observed", packageId: PKG_PARENT, observationId: expect.any(String) },
        ]);
        const o = trust.observations[0]!;
        expect(o.observation_kind).toBe("executed");
        expect(o.package_id).toBe(PKG_PARENT);
        // The authoritative durable row id, not the synthetic attempt label.
        expect(o.execution_reference).toBe(ATTEMPT_ROW);
        expect(o.execution_reference).not.toBe(`${PLAN}:attempt:1`);
        expect(o.detail.plan_id).toBe(PLAN);
        expect(o.detail.plan_content_hash).toBe(plan().contentHash);
    });

    it("one commit attempt binds to MULTIPLE packages without duplication", async () => {
        const trust = makeTrust();
        const store = makeStore([
            resolutionRow(),
            resolutionRow({ id: "res-child", subject_ref: "child-1", input_facts_hash: HASH_CHILD } as Partial<ProcessingResolutionRow>),
        ]);
        const p = plan([
            op({ opId: "op-parent", resolutionRefs: ["res-parent"] }),
            op({ opId: "op-child", opOrder: 2, resolutionRefs: ["res-child"] }),
        ]);

        const result = await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: p,
            attempt: attempt({
                planContentHash: p.contentHash,
                operations: [committedOp("op-parent"), committedOp("op-child")],
            }),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT, [CHILD_ADOPTION]: PKG_CHILD }),
        });

        expect(result.packages.map((p2) => p2.status)).toEqual(["observed", "observed"]);
        expect(new Set(trust.observations.map((o) => o.package_id))).toEqual(new Set([PKG_PARENT, PKG_CHILD]));
        expect(trust.observations).toHaveLength(2);
        // Distinct packages → distinct observation ids.
        expect(new Set(trust.observations.map((o) => o.id)).size).toBe(2);
    });

    it("repeated handling of the same executor response appends nothing new", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const deps = bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT });
        const call = () =>
            bindCommitOutcomeToTrust(store.client(), {
                orgId: ORG, plan: plan(), attempt: attempt(),
                commitAttemptId: ATTEMPT_ROW, actorId: "user-1", deps,
            });

        const first = await call();
        const second = await call();
        const third = await call();

        expect(first.packages[0]!.status).toBe("observed");
        expect(second.packages[0]!.status).toBe("already_observed");
        expect(third.packages[0]!.status).toBe("already_observed");
        expect(trust.observations).toHaveLength(1);
    });

    it("a DISTINCT retry attempt stays distinguishable", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const deps = bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT });

        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt({ attemptNo: 1 }),
            commitAttemptId: "attempt-row-1", actorId: "user-1", deps,
        });
        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt({ attemptNo: 2 }),
            commitAttemptId: "attempt-row-2", actorId: "user-1", deps,
        });

        expect(trust.observations).toHaveLength(2);
        expect(new Set(trust.observations.map((o) => o.execution_reference))).toEqual(
            new Set(["attempt-row-1", "attempt-row-2"]),
        );
    });

    it("recovers an AMBIGUOUS success: the row committed, the response did not", async () => {
        const trust = makeTrust();
        const observationId = executionObservationId({
            org_id: ORG, package_id: PKG_PARENT, plan_id: PLAN, plan_version: 1,
            plan_content_hash: plan().contentHash, commit_attempt_id: ATTEMPT_ROW,
            observation_kind: "executed",
        });
        await trust.repository.insertObservation({
            id: observationId, org_id: ORG, package_id: PKG_PARENT,
            observation_kind: "executed", observed_by_actor_type: "system",
            observed_by_actor_id: null, channel: "system",
            execution_reference: ATTEMPT_ROW, detail: {},
        });

        const store = makeStore([resolutionRow()]);
        const result = await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(result.packages[0]).toMatchObject({ status: "already_observed", observationId });
        expect(trust.observations).toHaveLength(1);
    });

    it("a permissive store DOES duplicate, proving the primary key is load-bearing", async () => {
        const permissive = makeTrust({ enforcePrimaryKey: false });
        const blind: ExecutionObservationLookup = async () => [];
        const input = {
            org_id: ORG, package_id: PKG_PARENT, observation_kind: "executed" as const,
            commit_attempt_id: ATTEMPT_ROW, plan_id: PLAN, plan_version: 1,
            plan_content_hash: plan().contentHash, execution_reference: ATTEMPT_ROW,
            detail: {}, actor_type: "system" as const, actor_id: null,
            channel: "system", correlation_id: CASE,
        };
        await observeProcessingIdentityExecution(input, { ...permissive, observationLookup: blind });
        await observeProcessingIdentityExecution(input, { ...permissive, observationLookup: blind });
        expect(permissive.observations).toHaveLength(2);
        expect(new Set(permissive.observations.map((o) => o.id)).size).toBe(1);

        const enforcing = makeTrust();
        await observeProcessingIdentityExecution(input, { ...enforcing, observationLookup: blind });
        await observeProcessingIdentityExecution(input, { ...enforcing, observationLookup: blind });
        expect(enforcing.observations).toHaveLength(1);
    });

    it("a blocked plan never appends executed", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);

        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(),
            attempt: attempt({ outcome: "preflight_rejected", operations: [], preflightFailures: ["plan_superseded"] }),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(trust.observations).toHaveLength(1);
        expect(trust.observations[0]!.observation_kind).toBe("outcome");
        expect(trust.observations.some((o) => o.observation_kind === "executed")).toBe(false);
    });

    it("refuses a package belonging to another organization", async () => {
        const trust = makeTrust();
        trust.packages.set(PKG_PARENT, { id: PKG_PARENT, org_id: "org-2", contract_id: "c" });
        const store = makeStore([resolutionRow()]);
        const spies = silence();

        const result = await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(result.packages[0]).toEqual({
            status: "refused", packageId: PKG_PARENT, reason: "package_org_mismatch",
        });
        expect(trust.observations).toHaveLength(0);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 5. Durable execution gaps
// ---------------------------------------------------------------------------

describe("P17-5 — a Trust failure leaves the execution authoritative and the evidence owed", () => {
    function failing(trust: ReturnType<typeof makeTrust>) {
        return {
            ...trust.repository,
            async insertObservation() {
                throw new Error("trust db down");
            },
        } as TrustRepository;
    }

    it("records a bounded gap and rewrites nothing in Processing", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const spies = silence();

        const result = await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: { ...bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }), repository: failing(trust) },
        });

        expect(result.packages[0]!.status).toBe("deferred");
        expect(store.writes).toEqual([]);

        const exc = store.exceptions[0]!;
        expect(exc.exception_type).toBe(TRUST_IDENTITY_EXECUTION_GAP_TYPE);
        expect(exc.severity).toBe("warning");

        const snapshot = exc.subject_ref as Record<string, unknown>;
        expect(snapshot.package_id).toBe(PKG_PARENT);
        expect(snapshot.commit_attempt_id).toBe(ATTEMPT_ROW);
        expect(snapshot.processing_outcome).toBe("committed");
        expect(snapshot.observation_kind).toBe("executed");
        expect(snapshot.plan_content_hash).toBe(plan().contentHash);

        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the gap carries no plan operation, payload, record id or PII", async () => {
        const trust = makeTrust();
        // A plan whose operation payload is full of exactly what must not travel.
        const p = plan([
            op({
                payload: {
                    first_name: "Alex", last_name: "Lyons",
                    email: "alex@lyons.example", phone: "+1 415 555 0134",
                    dob: "2019-04-11", address: "42 Elm Street",
                },
                after: { display_name: "Alex Lyons" },
                reason: "Create Alex Lyons at alex@lyons.example",
            }),
        ]);
        const store = makeStore([resolutionRow()]);
        const spies = silence();

        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: p,
            attempt: attempt({ planContentHash: p.contentHash }),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: { ...bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }), repository: failing(trust) },
        });

        const serialized = JSON.stringify(store.exceptions);
        for (const leak of ["Alex", "Lyons", "@lyons", "2019-04-11", "Elm Street", "555", "rec-1", "payload"]) {
            expect(serialized).not.toContain(leak);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("repeated failures accumulate on ONE row", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const spies = silence();
        const deps = { ...bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }), repository: failing(trust) };

        for (let i = 0; i < 3; i += 1) {
            await bindCommitOutcomeToTrust(store.client(), {
                orgId: ORG, plan: plan(), attempt: attempt(),
                commitAttemptId: ATTEMPT_ROW, actorId: "user-1", deps,
            });
        }

        expect(store.exceptions).toHaveLength(1);
        expect((store.exceptions[0]!.subject_ref as Record<string, unknown>).retry_count).toBe(2);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the gap type is registered so every readiness projection excludes it", () => {
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_IDENTITY_EXECUTION_GAP_TYPE);
        expect(TRUST_IDENTITY_EXECUTION_GAP_TYPE).toBe("trust_identity_execution_governance_gap");
        expect(new Set(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).size).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// 6. Reconciliation
// ---------------------------------------------------------------------------

describe("P17-6 — reconciliation completes owed evidence exactly once", () => {
    async function deferOne(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
        const store = makeStore([resolutionRow()]);
        const spies = silence();
        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: {
                ...bindDeps(trust, governed),
                repository: {
                    ...trust.repository,
                    async insertObservation() { throw new Error("trust db down"); },
                } as TrustRepository,
            },
        });
        spies.warn.mockRestore();
        spies.error.mockRestore();
        return store;
    }

    it("appends the observation and resolves the gap", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);

        const sweep = await reconcileIdentityExecutionGaps(store.client(), {
            orgId: ORG, deps: bindDeps(trust, governed),
        });

        expect(sweep).toMatchObject({ scanned: 1, resolved: 1 });
        expect(trust.observations).toHaveLength(1);
        expect(trust.observations[0]!.observation_kind).toBe("executed");
        expect(trust.observations[0]!.execution_reference).toBe(ATTEMPT_ROW);
        expect(store.exceptions[0]!.resolved_at).toBe(NOW);
    });

    it("never reruns the executor and never reads a Processing table beyond the gap store", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);
        store.touched.length = 0;

        await reconcileIdentityExecutionGaps(store.client(), { orgId: ORG, deps: bindDeps(trust, governed) });

        expect(new Set(store.touched)).toEqual(new Set(["processing_exceptions"]));
        expect(store.writes).toEqual([]);
    });

    it("a resolved gap cannot be reclaimed", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);
        const gaps = await listUnresolvedIdentityExecutionGaps(store.client(), { orgId: ORG });

        await reconcileIdentityExecutionGaps(store.client(), { orgId: ORG, deps: bindDeps(trust, governed) });
        // A straggler holding the pre-resolution row tries again.
        const straggler = await reconcileOneIdentityExecutionGap(store.client(), {
            gap: gaps[0]!, deps: bindDeps(trust, governed),
        });

        expect(straggler.status).toBe("claim_lost");
        expect(trust.observations).toHaveLength(1);
    });

    it("a second sweep finds nothing left to do", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);

        await reconcileIdentityExecutionGaps(store.client(), { orgId: ORG, deps: bindDeps(trust, governed) });
        const second = await reconcileIdentityExecutionGaps(store.client(), {
            orgId: ORG, deps: bindDeps(trust, governed),
        });

        expect(second.scanned).toBe(0);
        expect(trust.observations).toHaveLength(1);
    });

    it("a concurrent reconciler loses the claim rather than double-appending", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);
        const gaps = await listUnresolvedIdentityExecutionGaps(store.client(), { orgId: ORG });

        const [a, b] = await Promise.all([
            reconcileOneIdentityExecutionGap(store.client(), { gap: gaps[0]!, deps: bindDeps(trust, governed) }),
            reconcileOneIdentityExecutionGap(store.client(), { gap: gaps[0]!, deps: bindDeps(trust, governed) }),
        ]);

        expect([a.status, b.status].filter((s) => s === "claim_lost")).toHaveLength(1);
        expect(trust.observations).toHaveLength(1);
    });

    it("closes a deterministic refusal instead of retrying forever", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);
        // The package turns out to belong to another org: refuses identically forever.
        trust.packages.set(PKG_PARENT, { id: PKG_PARENT, org_id: "org-2", contract_id: "c" });

        const sweep = await reconcileIdentityExecutionGaps(store.client(), {
            orgId: ORG, deps: bindDeps(trust, governed),
        });

        expect(sweep).toMatchObject({ scanned: 1, abandoned: 1 });
        expect(store.exceptions[0]!.resolved_at).toBe(NOW);
        expect(trust.observations).toHaveLength(0);
    });

    it("replays the FROZEN evidence, not a recomputation", async () => {
        const trust = makeTrust();
        const governed = { [PARENT_ADOPTION]: PKG_PARENT };
        const store = await deferOne(trust, governed);

        // The resolution row is gone entirely. Reconciliation must still work:
        // the authoritative outcome was frozen when the commit succeeded.
        store.resolutions.length = 0;

        const sweep = await reconcileIdentityExecutionGaps(store.client(), {
            orgId: ORG, deps: bindDeps(trust, governed),
        });

        expect(sweep.resolved).toBe(1);
        expect(trust.observations[0]!.observation_kind).toBe("executed");
    });
});

// ---------------------------------------------------------------------------
// 7. Lifecycle projection
// ---------------------------------------------------------------------------

describe("P17-7 — the projection reports execution deterministically", () => {
    const pkg: LifecycleSubjectPackage = {
        id: PKG_PARENT, org_id: ORG, outcome: "recommended",
        created_at_iso: "2026-08-05T09:00:00.000Z", supersedes_package_id: null,
    };

    function executedObs(overrides: Partial<LifecycleObservationRecord> = {}): LifecycleObservationRecord {
        return {
            id: "obs-exec", org_id: ORG, package_id: PKG_PARENT,
            observation_kind: "executed", observed_by_actor_type: "system",
            observed_by_actor_id: null, channel: "system",
            execution_reference: ATTEMPT_ROW,
            detail: { plan_id: PLAN, commit_attempt_id: ATTEMPT_ROW },
            observed_at_iso: NOW,
            ...overrides,
        };
    }

    it("an accepted package with no execution evidence stays not_bound", () => {
        const accepted = executedObs({ id: "obs-acc", observation_kind: "accepted", detail: {}, execution_reference: null });
        const r = projectDecisionPackageLifecycle({ package: pkg, observations: [accepted], projectedAtIso: NOW });
        expect(r.ok && r.projection.execution.state).toBe("not_bound");
        expect(r.ok && r.projection.disposition).toBe("accepted");
    });

    it("a committed result plus an executed observation projects executed", () => {
        const r = projectDecisionPackageLifecycle({ package: pkg, observations: [executedObs()], projectedAtIso: NOW });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.projection.disposition).toBe("executed");
        expect(r.projection.execution.state).toBe("executed");
        expect(r.projection.execution.reference).toBe(ATTEMPT_ROW);
        expect(r.projection.operator_action_available).toBe(false);
    });

    it("a blocked result never projects executed", () => {
        const blocked = executedObs({
            id: "obs-blocked", observation_kind: "outcome",
            detail: { result: "failed", failure_class: "preflight_rejected" },
        });
        const r = projectDecisionPackageLifecycle({ package: pkg, observations: [blocked], projectedAtIso: NOW });
        expect(r.ok && r.projection.execution.state).toBe("failed");
        expect(r.ok && r.projection.disposition).toBe("execution_failed");
    });

    it("execution outranks supersession, per established precedence", () => {
        const superseded: LifecycleObservationRecord = {
            ...executedObs({ id: "obs-sup", observation_kind: "superseded", execution_reference: null }),
            detail: {
                supersession_source: "external_authority_decision",
                superseding_package_id: null,
                superseding_reference: "processing_resolution:res-parent",
                reason: "operator_confirmed_existing",
            },
            observed_at_iso: "2026-08-05T13:00:00.000Z",
        };
        const r = projectDecisionPackageLifecycle({
            package: pkg, observations: [executedObs(), superseded], projectedAtIso: NOW,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.projection.supersession.superseded).toBe(true);
        expect(r.projection.disposition).toBe("executed");
    });

    it("duplicate observations and shuffled order are deterministic", () => {
        const rows = [executedObs({ id: "obs-c" }), executedObs({ id: "obs-a" }), executedObs({ id: "obs-b" })];
        const forward = projectDecisionPackageLifecycle({ package: pkg, observations: rows, projectedAtIso: NOW });
        const reversed = projectDecisionPackageLifecycle({
            package: pkg, observations: [...rows].reverse(), projectedAtIso: NOW,
        });
        expect(forward.ok && reversed.ok).toBe(true);
        if (!forward.ok || !reversed.ok) return;
        expect(reversed.projection).toEqual(forward.projection);
        expect(forward.projection.disposition).toBe("executed");
        expect(forward.projection.execution.reference).toBe(ATTEMPT_ROW);
        expect(forward.projection.execution.evidence?.observation_id).toBe("obs-a");
    });
});

// ---------------------------------------------------------------------------
// 8. Measurement and authority
// ---------------------------------------------------------------------------

describe("P17-8 — execution evidence is not a governed decision", () => {
    it("creates no contract, package or reasoning-usage row", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);

        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        expect(trust.contracts).toEqual([]);
        expect(trust.packagesCreated).toEqual([]);
        expect(trust.usage).toEqual([]);
        expect(trust.observations).toHaveLength(1);
    });

    it("repeat binding cannot inflate execution-derived counts", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const deps = bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT });

        for (let i = 0; i < 5; i += 1) {
            await bindCommitOutcomeToTrust(store.client(), {
                orgId: ORG, plan: plan(), attempt: attempt(),
                commitAttemptId: ATTEMPT_ROW, actorId: "user-1", deps,
            });
        }

        expect(trust.observations).toHaveLength(1);
        expect(trust.usage).toEqual([]);
    });

    it("a FAILED Trust observation is not reported as executed", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        const spies = silence();

        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: {
                ...bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
                repository: {
                    ...trust.repository,
                    async insertObservation() { throw new Error("trust db down"); },
                } as TrustRepository,
            },
        });

        expect(trust.observations).toHaveLength(0);
        const r = projectDecisionPackageLifecycle({
            package: { id: PKG_PARENT, org_id: ORG, outcome: "recommended", created_at_iso: NOW, supersedes_package_id: null },
            observations: [], projectedAtIso: NOW,
        });
        expect(r.ok && r.projection.execution.state).toBe("not_bound");
        expect(r.ok && r.projection.disposition).toBe("proposed");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});
