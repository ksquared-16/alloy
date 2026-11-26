/**
 * Phase 1.7 negative controls.
 *
 * Each group builds the DEFECT the corresponding guarantee forbids and proves it
 * would be caught. A guarantee no test can fail is not a guarantee.
 *
 * Structural controls read source files rather than behaviour, because the
 * properties they assert — who may import the executor, who may write which
 * table, what may reach the plan hash — have no runtime surface until the day
 * they are violated in production.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import type { CommitPlan, PlanOperation } from "@/lib/pos/processingIdentity/plan/planTypes";
import type { CommitAttempt, OperationResult } from "@/lib/pos/processingIdentity/executor/executorTypes";
import { computePlanContentHash, planHashMatches } from "@/lib/pos/processingIdentity/plan/planHash";
import { evaluateApprovalReadiness, bindApproval } from "@/lib/pos/processingIdentity/plan/approval";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import { planPackageExecutionEvidence } from "@/lib/pos/processingIdentity/trustAdapter/executionOutcomeMapping";
import { bindCommitOutcomeToTrust } from "@/lib/pos/processingIdentity/trustAdapter/executionLineageService";
import {
    IDENTITY_EXECUTION_GAP_SEVERITY,
    TRUST_IDENTITY_EXECUTION_GAP_TYPE,
} from "@/lib/pos/processingIdentity/trustAdapter/identityExecutionGapDb";
import { TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import {
    observeProcessingIdentityExecution,
    ALLOWED_PROCESSING_EXECUTION_DETAIL_KEYS,
    type ExecutionObservationLookup,
    type ExecutionPackageLookup,
    type ExistingExecutionObservation,
    type TrustPackageExecutionRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution";
import type { SupersessionObservationLookup } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import { projectDecisionPackageLifecycle } from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import type { LifecycleObservationRecord } from "@/lib/trust/lifecycle/lifecycleObservation";
import type { TrustObservationInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const WEB_ROOT = join(__dirname, "..", "..");
const NOW = "2026-08-05T12:00:00.000Z";
const ORG = "org-1";
const CASE = "case-1";
const PLAN = "plan-1";
const ATTEMPT_ROW = "attempt-row-uuid-1";
const HASH_PARENT = "a".repeat(64);
const PKG_PARENT = "pkg-parent";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTrust(opts: { enforcePrimaryKey?: boolean } = {}) {
    const enforce = opts.enforcePrimaryKey ?? true;
    const observations: TrustObservationInput[] = [];
    const repository: TrustRepository = {
        async insertContract() {},
        async advanceContractLifecycle() {},
        async insertPackage() {},
        async insertObservation(o) {
            if (enforce && o.id && observations.some((x) => x.id === o.id)) {
                throw new Error('duplicate key value violates unique constraint "trust_decision_observations_pkey"');
            }
            observations.push(o);
        },
        async insertReasoningUsage() {},
    };
    const packages = new Map<string, TrustPackageExecutionRef>([
        [PKG_PARENT, { id: PKG_PARENT, org_id: ORG, contract_id: "contract-parent" }],
    ]);
    const packageLookup: ExecutionPackageLookup = async ({ package_id }) => packages.get(package_id) ?? null;
    const observationLookup: ExecutionObservationLookup = async ({ org_id, package_id }) =>
        observations
            .filter((o) => o.org_id === org_id && o.package_id === package_id)
            .map(
                (o): ExistingExecutionObservation => ({
                    observation_id: o.id!,
                    observation_kind: o.observation_kind,
                    execution_reference: o.execution_reference,
                }),
            );
    const supersessionLookup: SupersessionObservationLookup = async () => [];
    return { repository, observations, packages, packageLookup, observationLookup, supersessionLookup };
}

type Row = Record<string, unknown>;

function makeStore(resolutions: Row[] = []) {
    const exceptions: Row[] = [];
    const writes: string[] = [];
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
    return { client, exceptions, resolutions, writes };
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

const PARENT_ADOPTION = processingIdentitySubjectAdoptionId({
    org_id: ORG, processing_case_id: CASE, subject_ref: "parent-1",
    decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    input_facts_hash: HASH_PARENT,
    material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
    identity_resolver_version: IDENTITY_RESOLVER_VERSION,
});

function op(overrides: Partial<PlanOperation> = {}): PlanOperation {
    return {
        opId: "op-parent", opOrder: 1, opKind: "create",
        commandKey: "identity.create_person", commandVersion: "1",
        targetType: "person", targetId: null, payload: { role: "parent" },
        before: null, after: null, reason: "create parent",
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

function committedOp(opId: string): OperationResult {
    return { opId, commandKey: "k", status: "committed", recordId: "rec-1", idempotentReplay: false, error: null };
}

function attempt(overrides: Partial<CommitAttempt> = {}): CommitAttempt {
    return {
        attemptId: `${PLAN}:attempt:1`, orgId: ORG, caseId: CASE, planId: PLAN,
        planVersion: 1, planContentHash: plan().contentHash, attemptNo: 1,
        executionIdempotencyKey: "exec-1", actorId: "user-1",
        outcome: "committed", operations: [committedOp("op-parent")],
        compensation: [], events: [], preflightFailures: [],
        startedAt: NOW, finishedAt: NOW,
        ...overrides,
    };
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
        lookup: async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
            if (org_id !== ORG) return null;
            const packageId = governed[contract_id];
            return packageId ? { contract_id, package_id: packageId } : null;
        },
        now: () => NOW,
    };
}

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

const PHASE_17_MODULES = [
    "lib/pos/processingIdentity/trustAdapter/executionLineageService.ts",
    "lib/pos/processingIdentity/trustAdapter/executionOutcomeMapping.ts",
    "lib/pos/processingIdentity/trustAdapter/identityExecutionGapDb.ts",
    "lib/pos/processingIdentity/trustAdapter/planPackageLineage.ts",
    "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts",
    "lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution.ts",
    "lib/trust/execution/executionObservationIdentity.ts",
];

// ---------------------------------------------------------------------------

describe("P17-NC-1 — Trust initiating execution would be caught", () => {
    it("no Phase 1.7 module imports the executor, the plan builder or approval", () => {
        for (const file of PHASE_17_MODULES) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            for (const forbidden of [
                "commitExecutor",
                "executorPorts",
                "preflight",
                "buildCommitPlan",
                "/plan/approval",
                "operatorReviewService",
                "commands/registry",
            ]) {
                expect(imports.some((i) => i.includes(forbidden)), `${file} → ${forbidden}`).toBe(false);
            }
        }
    });

    it("no Phase 1.7 module calls an executor, command or approval function", () => {
        for (const file of PHASE_17_MODULES) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/.*$/gm, "");
            for (const forbidden of [
                "executeApprovedPlan",
                "ports.command",
                "ports.atomicGroup",
                "runPreflight",
                "bindApproval",
                "insertApproval",
                "insertCommitAttempt",
            ]) {
                expect(src.includes(forbidden), `${file} contains ${forbidden}`).toBe(false);
            }
        }
    });

    it("`lib/trust` still imports Processing only for the schemas Processing owns", () => {
        const allowed = ["governedIdentitySchema", "governedClassificationSchema"];
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/from\s+"(@\/lib\/pos\/[^"]+)"/g)) {
                const spec = m[1]!;
                if (!allowed.some((a) => spec.endsWith(a))) offenders.push(`${file.replace(WEB_ROOT, "")} → ${spec}`);
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the binding is only ever reached AFTER the executor returns", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        const executed = src.indexOf("const attempt = await executeApprovedPlan(");
        const persisted = src.indexOf("await insertCommitAttempt(");
        const bound = src.indexOf("await bindCommitOutcomeToTrust(");
        expect(executed).toBeGreaterThan(-1);
        expect(persisted).toBeGreaterThan(executed);
        expect(bound).toBeGreaterThan(persisted);
    });
});

describe("P17-NC-2 — observing before a durable commit result would be caught", () => {
    it("the entry point cannot be called without the durable attempt id", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/executionLineageService.ts"),
            "utf8",
        );
        // A required, non-optional parameter: there is no call shape without it.
        expect(src).toMatch(/commitAttemptId:\s*string;/);
        expect(src).not.toMatch(/commitAttemptId\?:/);
    });

    it("the caller binds only when the insert returned an id", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        expect(src).toContain("commitAttemptId = await insertCommitAttempt(");
        expect(src).toMatch(/deps\.trustExecution !== false && commitAttemptId/);
    });

    it("the reference is the durable row id, never the synthetic attempt label", async () => {
        const trust = makeTrust();
        const store = makeStore([resolutionRow()]);
        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: plan(), attempt: attempt(),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });
        expect(trust.observations[0]!.execution_reference).toBe(ATTEMPT_ROW);
        // The defect this rules out: using `attempt.attemptId`, which for a
        // freshly executed attempt is a label computed before persistence.
        expect(trust.observations[0]!.execution_reference).not.toContain(":attempt:");
    });
});

describe("P17-NC-3 — a package id reaching the plan hash would be caught", () => {
    it("the hash function takes no package parameter and no plan field", () => {
        const src = readFileSync(join(WEB_ROOT, "lib/pos/processingIdentity/plan/planHash.ts"), "utf8");
        expect(src).not.toContain("package");
        expect(src).not.toContain("trust");
        // The material projection is an explicit whitelist, not a spread.
        expect(src).toContain("function materialOperation");
        expect(src).not.toMatch(/\.\.\.op[,\s}]/);
    });

    it("a package id smuggled into a MATERIAL field WOULD move the hash", () => {
        const before = computePlanContentHash({ orgId: ORG, caseId: CASE, operations: [op()] });
        const smuggled = computePlanContentHash({
            orgId: ORG, caseId: CASE,
            operations: [op({ payload: { role: "parent", trust_package_id: PKG_PARENT } })],
        });
        // Proof the guard is real: material fields DO move the hash, which is
        // exactly why no Trust value may be placed in one.
        expect(smuggled).not.toBe(before);
    });

    it("an approval bound to the pre-lineage hash still validates", () => {
        const p = plan();
        const approval = bindApproval({ plan: p, approvingActor: "user-1", approvedAt: NOW });
        expect(approval.planContentHash).toBe(p.contentHash);

        // Everything Phase 1.7 touches is outside the hash, so the plan a later
        // reader recomputes is the plan that was approved.
        expect(planHashMatches(p)).toBe(true);
        expect(evaluateApprovalReadiness(p).ready).toBe(true);
    });

    it("no Phase 1.7 module writes to the plan or its operations", () => {
        for (const file of PHASE_17_MODULES) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const tables = [...src.matchAll(/\.from\(\s*"([^"]+)"/g)].map((m) => m[1]!);
            expect(tables).not.toContain("processing_commit_plans");
            expect(tables).not.toContain("processing_plan_approvals");
            expect(tables).not.toContain("processing_commit_attempts");
        }
    });
});

describe("P17-NC-4 — marking a blocked execution as executed would be caught", () => {
    it("every non-committed subject outcome yields `outcome`, never `executed`", () => {
        const contributor = {
            packageId: PKG_PARENT, adoptionId: PARENT_ADOPTION,
            resolutionId: "res-parent", subjectRef: "parent-1", opIds: ["op-a"],
        };
        const cases: CommitAttempt["outcome"][] = ["preflight_rejected", "failed", "partially_committed"];
        for (const outcome of cases) {
            const e = planPackageExecutionEvidence({
                attempt: attempt({
                    outcome,
                    operations: [{ opId: "op-a", commandKey: "k", status: "failed", recordId: null, idempotentReplay: false, error: "x" }],
                }),
                contributor,
            });
            expect(e.observationKind, outcome).toBe("outcome");
            expect(e.detail.result, outcome).toBe("failed");
        }

        // Control: a genuinely committed subject DOES yield executed, so the
        // assertion above is a discriminator rather than a constant.
        const ok = planPackageExecutionEvidence({
            attempt: attempt({ operations: [committedOp("op-a")] }),
            contributor,
        });
        expect(ok.observationKind).toBe("executed");
    });

    it("a failed outcome never projects as executed", () => {
        const failed: LifecycleObservationRecord = {
            id: "obs-1", org_id: ORG, package_id: PKG_PARENT, observation_kind: "outcome",
            observed_by_actor_type: "system", observed_by_actor_id: null, channel: "system",
            execution_reference: ATTEMPT_ROW,
            detail: { result: "failed", failure_class: "preflight_rejected" },
            observed_at_iso: NOW,
        };
        const r = projectDecisionPackageLifecycle({
            package: { id: PKG_PARENT, org_id: ORG, outcome: "recommended", created_at_iso: NOW, supersedes_package_id: null },
            observations: [failed], projectedAtIso: NOW,
        });
        expect(r.ok && r.projection.execution.state).not.toBe("executed");
        expect(r.ok && r.projection.disposition).toBe("execution_failed");
    });
});

describe("P17-NC-5 — duplicate observations being accepted would be caught", () => {
    it("a permissive store DOES duplicate; the enforcing one does not", async () => {
        const blind: ExecutionObservationLookup = async () => [];
        const input = {
            org_id: ORG, package_id: PKG_PARENT, observation_kind: "executed" as const,
            commit_attempt_id: ATTEMPT_ROW, plan_id: PLAN, plan_version: 1,
            plan_content_hash: plan().contentHash, execution_reference: ATTEMPT_ROW,
            detail: {}, actor_type: "system" as const, actor_id: null,
            channel: "system", correlation_id: CASE,
        };

        const permissive = makeTrust({ enforcePrimaryKey: false });
        await observeProcessingIdentityExecution(input, { ...permissive, observationLookup: blind });
        await observeProcessingIdentityExecution(input, { ...permissive, observationLookup: blind });
        expect(permissive.observations).toHaveLength(2);

        const enforcing = makeTrust();
        await observeProcessingIdentityExecution(input, { ...enforcing, observationLookup: blind });
        await observeProcessingIdentityExecution(input, { ...enforcing, observationLookup: blind });
        expect(enforcing.observations).toHaveLength(1);
    });

    it("a duplicate that DID land is visible in the observation count", () => {
        const dup = (id: string): LifecycleObservationRecord => ({
            id, org_id: ORG, package_id: PKG_PARENT, observation_kind: "executed",
            observed_by_actor_type: "system", observed_by_actor_id: null, channel: "system",
            execution_reference: ATTEMPT_ROW, detail: {}, observed_at_iso: NOW,
        });
        const r = projectDecisionPackageLifecycle({
            package: { id: PKG_PARENT, org_id: ORG, outcome: "recommended", created_at_iso: NOW, supersedes_package_id: null },
            observations: [dup("o1"), dup("o2")], projectedAtIso: NOW,
        });
        expect(r.ok && r.projection.observation_count).toBe(2);
        expect(r.ok && r.projection.disposition).toBe("executed");
    });
});

describe("P17-NC-6 — reconciliation rerunning the executor would be caught", () => {
    it("the module imports no executor, plan or resolution machinery", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        for (const forbidden of [
            "commitExecutor", "executorPorts", "planDb", "planHash",
            "processingResolutionsDb", "planPackageLineage", "executionOutcomeMapping",
            "canonicalResolutionEngine",
        ]) {
            expect(imports.some((i) => i.includes(forbidden)), forbidden).toBe(false);
        }
    });

    it("it touches exactly one table, and it is not a Processing authority table", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts"),
            "utf8",
        );
        // No direct table access at all: the gap store owns every query.
        expect([...src.matchAll(/\.from\(\s*["']/g)]).toEqual([]);
    });

    it("it replays the frozen snapshot rather than recomputing evidence", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/reconcileIdentityExecutionGaps.ts"),
            "utf8",
        );
        expect(src).toContain("s.observation_kind");
        expect(src).toContain("s.detail");
        expect(src).not.toContain("planPackageExecutionEvidence");
    });
});

describe("P17-NC-7 — an execution gap affecting readiness would be caught", () => {
    it("the gap is a warning and its type is excluded by the SHARED list", () => {
        expect(IDENTITY_EXECUTION_GAP_SEVERITY).toBe("warning");
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_IDENTITY_EXECUTION_GAP_TYPE);
    });

    it("the readiness count still excludes every gap type by list, not by name", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        expect(src).toContain("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES");
        expect(src).toMatch(/\.neq\(\s*"exception_type"\s*,\s*gapType\s*\)/);
        // Isolated by REGISTRATION, never by a second literal.
        expect(src).not.toContain("trust_identity_execution_governance_gap");
    });

    it("no production projection counts processing_exceptions unfiltered", () => {
        const offenders: string[] = [];
        for (const area of ["lib", "app"]) {
            for (const file of sourceFilesUnder(area)) {
                const src = readFileSync(file, "utf8");
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

    it("a gap never carries a blocker severity or a case-level readiness code", async () => {
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
                    async insertObservation() { throw new Error("down"); },
                } as TrustRepository,
            },
        });

        expect(store.exceptions[0]!.severity).toBe("warning");
        const serialized = JSON.stringify(store.exceptions);
        expect(serialized).not.toContain("child_identity_unconfirmed");
        expect(serialized).not.toContain("blocker");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

describe("P17-NC-8 — plan operations or PII entering Trust would be caught", () => {
    const PII_PAYLOAD = {
        first_name: "Alex", last_name: "Lyons", email: "alex@lyons.example",
        phone: "+1 415 555 0134", dob: "2019-04-11", address: "42 Elm Street",
    };

    it("the detail allow-list admits no operational or identity field", () => {
        for (const forbidden of [
            "payload", "operations", "before", "after", "record_id", "recordId",
            "first_name", "email", "phone", "dob", "address", "error", "stack",
        ]) {
            expect(ALLOWED_PROCESSING_EXECUTION_DETAIL_KEYS).not.toContain(forbidden);
        }
    });

    it("a caller supplying an unlisted detail key is refused before any write", async () => {
        const trust = makeTrust();
        const result = await observeProcessingIdentityExecution(
            {
                org_id: ORG, package_id: PKG_PARENT, observation_kind: "executed",
                commit_attempt_id: ATTEMPT_ROW, plan_id: PLAN, plan_version: 1,
                plan_content_hash: plan().contentHash, execution_reference: ATTEMPT_ROW,
                detail: { payload: "anything" } as unknown as Record<string, string>,
                actor_type: "system", actor_id: null, channel: "system", correlation_id: CASE,
            },
            trust,
        );
        expect(result).toEqual({ status: "refused", reason: "detail_key_not_allowed:payload" });
        expect(trust.observations).toHaveLength(0);
    });

    it("an unsafe detail VALUE is refused even under an allowed key", async () => {
        const trust = makeTrust();
        const result = await observeProcessingIdentityExecution(
            {
                org_id: ORG, package_id: PKG_PARENT, observation_kind: "executed",
                commit_attempt_id: ATTEMPT_ROW, plan_id: PLAN, plan_version: 1,
                plan_content_hash: plan().contentHash, execution_reference: ATTEMPT_ROW,
                detail: { failure_class: "Alex Lyons alex@lyons.example" },
                actor_type: "system", actor_id: null, channel: "system", correlation_id: CASE,
            },
            trust,
        );
        expect(result).toEqual({ status: "refused", reason: "unsafe_detail_value:failure_class" });
        expect(trust.observations).toHaveLength(0);
    });

    it("a plan stuffed with PII produces an observation containing none of it", async () => {
        const trust = makeTrust();
        const p = plan([op({ payload: PII_PAYLOAD, after: PII_PAYLOAD, reason: "Create Alex Lyons" })]);
        const store = makeStore([resolutionRow()]);

        await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: p,
            attempt: attempt({ planContentHash: p.contentHash }),
            commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: bindDeps(trust, { [PARENT_ADOPTION]: PKG_PARENT }),
        });

        const serialized = JSON.stringify(trust.observations);
        for (const leak of ["Alex", "Lyons", "@lyons", "2019-04-11", "Elm Street", "555", "rec-1"]) {
            expect(serialized).not.toContain(leak);
        }
        expect(trust.observations).toHaveLength(1);
    });

    it("the mapping reads no operation field beyond opId and status", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/executionOutcomeMapping.ts"),
            "utf8",
        )
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        for (const forbidden of [".payload", ".after", ".before", ".recordId", ".error", ".reason"]) {
            expect(src.includes(forbidden), forbidden).toBe(false);
        }
    });
});

describe("P17-NC-9 — Processing behaviour changing would be caught", () => {
    it("`trustExecution: false` is a real control arm", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        expect(src).toMatch(/trustExecution\?:\s*false\s*\|/);
        expect(src).toMatch(/deps\.trustExecution !== false/);
    });

    it("the binding sits AFTER every Processing step and changes none of them", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        const bound = src.indexOf("await bindCommitOutcomeToTrust(");
        for (const step of [
            "requirePlanEligibility(rows)",
            "const attempt = await executeApprovedPlan(",
            "await insertCommitAttempt(",
            "await applyCreateLeadPostCommitPersistence(",
        ]) {
            const at = src.indexOf(step);
            expect(at, step).toBeGreaterThan(-1);
            expect(at, step).toBeLessThan(bound);
        }
        // And the attempt returned to the caller is the executor's, untouched.
        expect(src.indexOf("return attempt;")).toBeGreaterThan(bound);
    });

    it("the executor, preflight, hash, approval and builder know nothing about Trust", () => {
        // Asserted on IMPORTS and SYMBOLS rather than the substring "trust",
        // which appears in `commitExecutor`'s pre-existing "trusted server-side
        // service" comment. A prose match here would fail for a reason that has
        // nothing to do with the property being protected.
        for (const file of [
            "lib/pos/processingIdentity/executor/commitExecutor.ts",
            "lib/pos/processingIdentity/executor/preflight.ts",
            "lib/pos/processingIdentity/executor/executorTypes.ts",
            "lib/pos/processingIdentity/plan/planHash.ts",
            "lib/pos/processingIdentity/plan/approval.ts",
            "lib/pos/processingIdentity/plan/buildCommitPlan.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            expect(imports.filter((i) => i.includes("/trust")), file).toEqual([]);
            expect(imports.filter((i) => i.includes("trustAdapter")), file).toEqual([]);
            for (const symbol of [
                "bindCommitOutcomeToTrust",
                "observeProcessingIdentityExecution",
                "trustExecution",
                "DecisionPackage",
                "package_id",
            ]) {
                expect(src.includes(symbol), `${file} contains ${symbol}`).toBe(false);
            }
        }
    });
});
