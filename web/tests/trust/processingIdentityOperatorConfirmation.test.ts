/**
 * Operator confirmation is not supersession.
 *
 * Phase 1.6 classified from `decided_by === "operator"` alone, so agreeing with
 * the engine recorded the judgment as replaced — and because Phase 1.7 excludes
 * superseded packages from execution binding, the NORMAL reviewed path could
 * never record its real-world outcome.
 *
 * ```text
 * operator agrees / engine declined to decide → accepted  (package stays current)
 * operator postpones                          → deferred  (package stays current)
 * operator replaces the judgment              → superseded
 * unrecognised shape                          → nothing at all
 * ```
 *
 * The second half of this suite proves the whole reviewed chain end to end:
 * judgment → package → confirmation → plan → approval → commit → `executed`.
 *
 * The observation store ENFORCES `trust_decision_observations.id PRIMARY KEY`,
 * because a fake that accepts duplicates the database would refuse turns every
 * exactly-once assertion into theatre.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import type { CommitPlan, PlanOperation } from "@/lib/pos/processingIdentity/plan/planTypes";
import type { CommitAttempt, OperationResult } from "@/lib/pos/processingIdentity/executor/executorTypes";
import { computePlanContentHash } from "@/lib/pos/processingIdentity/plan/planHash";
import { bindApproval, evaluateApprovalReadiness } from "@/lib/pos/processingIdentity/plan/approval";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { engineJudgmentFromCandidates } from "@/lib/pos/processingIdentity/engineJudgment";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import { classifyOperatorIdentityDecisionEffect } from "@/lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect";
import {
    recordOperatorDecisionLifecycle,
    supersedeForReplacementPackage,
} from "@/lib/pos/processingIdentity/trustAdapter/identityLineageService";
import { resolvePlanPackageLineage } from "@/lib/pos/processingIdentity/trustAdapter/planPackageLineage";
import { bindCommitOutcomeToTrust } from "@/lib/pos/processingIdentity/trustAdapter/executionLineageService";
import { listUnresolvedIdentityLineageGaps } from "@/lib/pos/processingIdentity/trustAdapter/identityLineageGapDb";
import { reconcileIdentityLineageGaps } from "@/lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type {
    ExistingReviewObservation,
    ReviewObservationLookup,
    ReviewPackageLookup,
    TrustPackageReviewRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview";
import type {
    ExecutionObservationLookup,
    ExecutionPackageLookup,
    ExistingExecutionObservation,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeExecution";
import type {
    ExistingSupersession,
    PackageLineageLookup,
    SupersessionObservationLookup,
    TrustPackageLineageRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import { projectDecisionPackageLifecycle } from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import type { LifecycleObservationRecord } from "@/lib/trust/lifecycle/lifecycleObservation";
import type {
    ReasoningUsageInput,
    TrustObservationInput,
    TrustRepository,
} from "@/lib/trust/persistence/trustDecisionRepository";

const NOW = "2026-08-05T12:00:00.000Z";
const ORG = "org-1";
const CASE = "case-1";
const PLAN = "plan-1";
const ATTEMPT_ROW = "attempt-row-1";
const GEN = "gen-1";
const HASH = "a".repeat(64);
const PKG = "pkg-parent";
const PKG_CHILD = "pkg-child";
const HASH_CHILD = "b".repeat(64);

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

function makeTrust() {
    const observations: TrustObservationInput[] = [];
    const usage: ReasoningUsageInput[] = [];
    const contracts: unknown[] = [];
    const packagesCreated: unknown[] = [];

    const repository: TrustRepository = {
        async insertContract(c) { contracts.push(c); },
        async advanceContractLifecycle() {},
        async insertPackage(p) { packagesCreated.push(p); },
        async insertObservation(o) {
            if (o.id && observations.some((x) => x.id === o.id)) {
                throw new Error('duplicate key value violates unique constraint "trust_decision_observations_pkey"');
            }
            observations.push(o);
        },
        async insertReasoningUsage(u) { usage.push(u); },
    };

    const packages = new Map<string, TrustPackageLineageRef>([
        [PKG, { id: PKG, org_id: ORG, contract_id: "contract-parent", supersedes_package_id: null }],
        [PKG_CHILD, { id: PKG_CHILD, org_id: ORG, contract_id: "contract-child", supersedes_package_id: null }],
    ]);

    const ref = (id: string): TrustPackageReviewRef | null => {
        const p = packages.get(id);
        return p ? { id: p.id, org_id: p.org_id, contract_id: p.contract_id } : null;
    };

    const packageLookup: PackageLineageLookup = async ({ package_id }) => packages.get(package_id) ?? null;
    const reviewPackageLookup: ReviewPackageLookup = async ({ package_id }) => ref(package_id);
    const execPackageLookup: ExecutionPackageLookup = async ({ package_id }) => ref(package_id);

    const of = (kinds: string[]) => async ({ org_id, package_id }: { org_id: string; package_id: string }) =>
        observations.filter(
            (o) => o.org_id === org_id && o.package_id === package_id && kinds.includes(o.observation_kind),
        );

    const reviewObservationLookup: ReviewObservationLookup = async (i) =>
        (await of(["accepted", "deferred", "rejected", "overridden", "modified", "presented"])(i)).map(
            (o): ExistingReviewObservation => ({ observation_id: o.id!, observation_kind: o.observation_kind }),
        );

    const observationLookup: SupersessionObservationLookup = async (i) =>
        (await of(["superseded"])(i)).map(
            (o): ExistingSupersession => ({
                observation_id: o.id!,
                superseding_package_id: (o.detail.superseding_package_id as string | null) ?? null,
                superseding_reference: (o.detail.superseding_reference as string | null) ?? null,
                reason: (o.detail.reason as string | null) ?? null,
            }),
        );

    const executionObservationLookup: ExecutionObservationLookup = async (i) =>
        (await of(["executed", "outcome"])(i)).map(
            (o): ExistingExecutionObservation => ({
                observation_id: o.id!,
                observation_kind: o.observation_kind,
                execution_reference: o.execution_reference,
            }),
        );

    return {
        repository, observations, usage, contracts, packagesCreated, packages,
        packageLookup, reviewPackageLookup, observationLookup,
        reviewObservationLookup, executionObservationLookup, execPackageLookup,
    };
}

function deps(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
    return {
        repository: trust.repository,
        packageLookup: trust.packageLookup,
        reviewPackageLookup: trust.reviewPackageLookup,
        observationLookup: trust.observationLookup,
        reviewObservationLookup: trust.reviewObservationLookup,
        supersessionLookup: trust.observationLookup,
        executionObservationLookup: trust.executionObservationLookup,
        lookup: async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
            if (org_id !== ORG) return null;
            const id = governed[contract_id];
            return id ? { contract_id, package_id: id } : null;
        },
        now: () => NOW,
    };
}

/**
 * The execution binding needs EXECUTION-shaped lookups.
 *
 * `observationLookup` means different things to the two ports — the supersede
 * port reads lineage claims, the execution port reads `executed`/`outcome` —
 * so they cannot be spread from one object. Built explicitly rather than by
 * override, which is what makes the difference visible.
 */
function execDeps(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
    const { lookup, now } = deps(trust, governed);
    return {
        repository: trust.repository,
        packageLookup: trust.execPackageLookup,
        observationLookup: trust.executionObservationLookup,
        supersessionLookup: trust.observationLookup,
        lookup,
        now,
    };
}

type Row = Record<string, unknown>;

function makeStore(resolutions: Row[] = []) {
    const exceptions: Row[] = [];
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
    return { client, exceptions, resolutions };
}

/** A candidate at a chosen band. `confirmed` is what makes the engine ASSERT. */
function candidate(recordId: string, band: string, subjectRef = "parent-1"): IdentityCandidate {
    return {
        subjectRef, entityType: "person", recordId,
        confidenceBand: band as IdentityCandidate["confidenceBand"],
        signals: [], blockingConflicts: [],
        explanation: "Matched Alex Lyons at alex@lyons.example.",
        resolverVersion: IDENTITY_RESOLVER_VERSION,
        displayName: "Alex Lyons",
    } as IdentityCandidate;
}

function row(overrides: Partial<ProcessingResolutionRow> = {}): Row {
    return {
        id: "res-parent", org_id: ORG, case_id: CASE, generation_id: GEN,
        input_facts_hash: HASH, subject_ref: "parent-1", subject_role: "parent",
        provisional: {}, candidates: [], decision_action: "create_new",
        selected_candidate_id: null, decided_by: "operator", operator_id: "user-1",
        policy_version: null, resolver_version: IDENTITY_RESOLVER_VERSION,
        stale_at: null, superseded_by: null, retention_class: "uncommitted_submission",
        created_at: "2026-08-05T10:00:00.000Z",
        ...overrides,
    } as Row;
}

function adoptionIdFor(subjectRef: string, factsHash: string): string {
    return processingIdentitySubjectAdoptionId({
        org_id: ORG, processing_case_id: CASE, subject_ref: subjectRef,
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: factsHash,
        material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identity_resolver_version: IDENTITY_RESOLVER_VERSION,
    });
}

const ADOPTION = adoptionIdFor("parent-1", HASH);
const ADOPTION_CHILD = adoptionIdFor("child-1", HASH_CHILD);

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
        sourceResolutionVersions: [GEN], downstreamEffectPreview: [],
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

// ---------------------------------------------------------------------------
// 1. The classifier
// ---------------------------------------------------------------------------

describe("PC-1 — the effect is classified from the judgment, not from who acted", () => {
    it("engine recommends an existing candidate and the operator confirms it", () => {
        const c = classifyOperatorIdentityDecisionEffect({
            candidates: [candidate("rec-A", "confirmed")],
            decision_action: "link_existing",
            selected_candidate_id: "rec-A",
        });
        expect(c.effect).toBe("confirmation");
        expect(c.consequence).toBe("remains_current");
        expect(c.observationKind).toBe("accepted");
    });

    it("engine recommends new and the operator confirms new", () => {
        const c = classifyOperatorIdentityDecisionEffect({
            candidates: [],
            decision_action: "create_new",
            selected_candidate_id: null,
        });
        expect(c.effect).toBe("confirmation");
        expect(c.observationKind).toBe("accepted");
    });

    it("engine recommends A and the operator selects B", () => {
        const c = classifyOperatorIdentityDecisionEffect({
            candidates: [candidate("rec-A", "confirmed")],
            decision_action: "link_existing",
            selected_candidate_id: "rec-B",
        });
        expect(c.effect).toBe("override_existing_candidate");
        expect(c.consequence).toBe("superseded");
        expect(c.observationKind).toBe("superseded");
    });

    it("engine recommends existing and the operator creates new", () => {
        const c = classifyOperatorIdentityDecisionEffect({
            candidates: [candidate("rec-A", "confirmed")],
            decision_action: "create_new",
            selected_candidate_id: null,
        });
        expect(c.effect).toBe("override_create_new");
        expect(c.observationKind).toBe("superseded");
    });

    it("engine recommends new and the operator selects existing", () => {
        const c = classifyOperatorIdentityDecisionEffect({
            candidates: [],
            decision_action: "link_existing",
            selected_candidate_id: "rec-Z",
        });
        expect(c.effect).toBe("override_existing_candidate");
        expect(c.observationKind).toBe("superseded");
    });

    it("the operator rejects a candidate the engine had asserted", () => {
        const c = classifyOperatorIdentityDecisionEffect({
            candidates: [candidate("rec-A", "confirmed")],
            decision_action: "reject",
            selected_candidate_id: null,
        });
        expect(c.effect).toBe("rejection");
        expect(c.observationKind).toBe("superseded");
        // Distinct from confirmation in every respect.
        expect(c.consequence).toBe("superseded");
    });

    it("the engine DECLINED to decide, so the operator's answer replaces nothing", () => {
        // `strong` → probable_match → review_required. The engine asserted no result.
        for (const action of ["link_existing", "create_new", "reject"]) {
            const c = classifyOperatorIdentityDecisionEffect({
                candidates: [candidate("rec-A", "strong")],
                decision_action: action,
                selected_candidate_id: action === "link_existing" ? "rec-B" : null,
            });
            expect(c.engine.action, action).toBe("review_required");
            expect(c.engine.assertedResult, action).toBe(false);
            expect(c.effect, action).toBe("engine_deferred_review");
            expect(c.observationKind, action).toBe("accepted");
        }
    });

    it("the operator postpones", () => {
        for (const action of ["request_information", "escalate_duplicate", "propose_merge"]) {
            const c = classifyOperatorIdentityDecisionEffect({
                candidates: [candidate("rec-A", "confirmed")],
                decision_action: action,
                selected_candidate_id: null,
            });
            expect(c.effect, action).toBe("operator_deferred");
            expect(c.consequence, action).toBe("remains_current");
            expect(c.observationKind, action).toBe("deferred");
        }
    });

    it("an unrecognised shape fails closed and records nothing", () => {
        for (const action of [null, "", "teleport_subject"]) {
            const c = classifyOperatorIdentityDecisionEffect({
                candidates: [candidate("rec-A", "confirmed")],
                decision_action: action,
                selected_candidate_id: null,
            });
            expect(c.effect, String(action)).toBe("unsupported_or_ambiguous");
            expect(c.consequence, String(action)).toBe("none");
            expect(c.observationKind, String(action)).toBeNull();
        }
    });

    it("the engine judgment it compares against is the engine's own derivation", () => {
        expect(engineJudgmentFromCandidates([candidate("rec-A", "confirmed")])).toMatchObject({
            action: "link_existing", selectedCandidateId: "rec-A", assertedResult: true,
        });
        expect(engineJudgmentFromCandidates([])).toMatchObject({
            action: "create_new", selectedCandidateId: null, assertedResult: true,
        });
        expect(engineJudgmentFromCandidates([candidate("rec-A", "conflicted")])).toMatchObject({
            action: "reject", assertedResult: true,
        });
        // A `none` record id is not a selection.
        expect(engineJudgmentFromCandidates([candidate("none", "excluded")]).selectedCandidateId).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// 2. Confirmation behaviour
// ---------------------------------------------------------------------------

describe("PC-2 — confirming does not supersede", () => {
    function confirmedExisting() {
        return row({
            candidates: [candidate("rec-A", "confirmed")] as unknown as ProcessingResolutionRow["candidates"],
            decision_action: "link_existing",
            selected_candidate_id: "rec-A",
        } as Partial<ProcessingResolutionRow>);
    }

    it("confirming the engine-selected existing candidate appends `accepted`", async () => {
        const trust = makeTrust();
        const store = makeStore([confirmedExisting()]);

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(outcome).toMatchObject({
            status: "reviewed", priorPackageId: PKG,
            effect: "confirmation", observationKind: "accepted",
        });
        expect(trust.observations).toHaveLength(1);
        const o = trust.observations[0]!;
        expect(o.observation_kind).toBe("accepted");
        expect(o.observed_by_actor_type).toBe("operator");
        expect(o.observed_by_actor_id).toBe("user-1");
        expect(o.execution_reference).toBeNull();
        expect(o.detail.effect).toBe("confirmation");
        // No supersession anywhere.
        expect(trust.observations.some((x) => x.observation_kind === "superseded")).toBe(false);
    });

    it("confirming engine-recommended create-new appends `accepted`", async () => {
        const trust = makeTrust();
        const store = makeStore([row({ candidates: [], decision_action: "create_new", selected_candidate_id: null })]);

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(outcome).toMatchObject({ status: "reviewed", effect: "confirmation", observationKind: "accepted" });
        expect(trust.observations[0]!.observation_kind).toBe("accepted");
    });

    it("confirmation is idempotent", async () => {
        const trust = makeTrust();
        const store = makeStore([confirmedExisting()]);
        const d = deps(trust, { [ADOPTION]: PKG });
        const call = () =>
            recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1", deps: d,
            });

        const first = await call();
        const second = await call();
        const third = await call();

        expect(first.status).toBe("reviewed");
        expect(second.status).toBe("already_reviewed");
        expect(third.status).toBe("already_reviewed");
        expect(trust.observations).toHaveLength(1);
    });

    it("creates no Decision Package and no reasoning-usage row", async () => {
        const trust = makeTrust();
        const store = makeStore([confirmedExisting()]);

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(trust.contracts).toEqual([]);
        expect(trust.packagesCreated).toEqual([]);
        expect(trust.usage).toEqual([]);
    });

    it("no operator free text reaches Trust", async () => {
        const UNSAFE = "Alex Lyons at alex@lyons.example, born 2019-04-11, 42 Elm Street, +1 415 555 0134";
        const trust = makeTrust();
        const store = makeStore([
            row({
                candidates: [candidate("rec-A", "confirmed")] as unknown as ProcessingResolutionRow["candidates"],
                decision_action: "link_existing",
                selected_candidate_id: "rec-A",
                provisional: { create_new_override: { reason: UNSAFE }, note: UNSAFE },
            } as Partial<ProcessingResolutionRow>),
        ]);

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        const serialized = JSON.stringify(trust.observations);
        for (const leak of ["Alex", "Lyons", "@lyons", "2019-04-11", "Elm Street", "555"]) {
            expect(serialized).not.toContain(leak);
        }
    });

    it("a deferring operator action appends `deferred` and leaves the package current", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({
                candidates: [candidate("rec-A", "confirmed")] as unknown as ProcessingResolutionRow["candidates"],
                decision_action: "request_information",
                selected_candidate_id: null,
            } as Partial<ProcessingResolutionRow>),
        ]);

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(outcome).toMatchObject({ status: "reviewed", effect: "operator_deferred", observationKind: "deferred" });
        expect(trust.observations[0]!.observation_kind).toBe("deferred");
    });

    it("an unrecognised action records nothing at all", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({ decision_action: "teleport_subject", candidates: [candidate("rec-A", "confirmed")] as unknown as ProcessingResolutionRow["candidates"] } as Partial<ProcessingResolutionRow>),
        ]);

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(outcome).toEqual({ status: "no_lineage", reason: "unclassified_effect:unsupported_or_ambiguous" });
        expect(trust.observations).toEqual([]);
    });

    it("a Trust failure still yields a durable gap that reconciliation completes as `accepted`", async () => {
        const trust = makeTrust();
        const store = makeStore([confirmedExisting()]);
        const spies = silence();
        const governed = { [ADOPTION]: PKG };

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: {
                ...deps(trust, governed),
                repository: {
                    ...trust.repository,
                    async insertObservation() { throw new Error("trust db down"); },
                } as TrustRepository,
            },
        });

        const gaps = await listUnresolvedIdentityLineageGaps(store.client(), { orgId: ORG });
        expect(gaps).toHaveLength(1);
        expect(gaps[0]!.snapshot.observation_kind).toBe("accepted");
        expect(gaps[0]!.snapshot.reason).toBe("operator_confirmed_engine_judgment");

        const sweep = await reconcileIdentityLineageGaps(store.client(), { orgId: ORG, deps: deps(trust, governed) });
        expect(sweep).toMatchObject({ scanned: 1, resolved: 1 });
        expect(trust.observations).toHaveLength(1);
        // The frozen kind is replayed — NOT a supersession.
        expect(trust.observations[0]!.observation_kind).toBe("accepted");

        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 3. Confirmed packages stay bindable
// ---------------------------------------------------------------------------

describe("PC-3 — a confirmed package remains eligible for execution binding", () => {
    function confirmedRow(id = "res-parent", subjectRef = "parent-1", hash = HASH) {
        return row({
            id, subject_ref: subjectRef, input_facts_hash: hash,
            candidates: [candidate("rec-A", "confirmed", subjectRef)] as unknown as ProcessingResolutionRow["candidates"],
            decision_action: "link_existing",
            selected_candidate_id: "rec-A",
        } as Partial<ProcessingResolutionRow>);
    }

    it("the lineage resolver INCLUDES a confirmed package", async () => {
        const trust = makeTrust();
        const store = makeStore([confirmedRow()]);
        const governed = { [ADOPTION]: PKG };

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, governed),
        });
        expect(trust.observations[0]!.observation_kind).toBe("accepted");

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG, plan: plan(), deps: deps(trust, governed),
        });

        expect(lineage.contributing.map((c) => c.packageId)).toEqual([PKG]);
        expect(lineage.excluded).toEqual([]);
    });

    it("the lineage resolver still EXCLUDES an overridden package", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({
                candidates: [candidate("rec-A", "confirmed")] as unknown as ProcessingResolutionRow["candidates"],
                decision_action: "create_new",
                selected_candidate_id: null,
            } as Partial<ProcessingResolutionRow>),
        ]);
        const governed = { [ADOPTION]: PKG };

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, governed),
        });
        expect(outcome.status).toBe("superseded");

        const lineage = await resolvePlanPackageLineage(store.client(), {
            orgId: ORG, plan: plan(), deps: deps(trust, governed),
        });

        expect(lineage.contributing).toEqual([]);
        expect(lineage.excluded[0]!.reason).toBe("package_superseded");
    });

    // ---- the whole reviewed chain, end to end ------------------------------

    async function reviewedExecution(input: {
        rows: Row[];
        governed: Record<string, string>;
        operations: PlanOperation[];
        results: OperationResult[];
        outcome?: CommitAttempt["outcome"];
    }) {
        const trust = makeTrust();
        const store = makeStore(input.rows);
        const d = deps(trust, input.governed);

        // 1. operator confirms every subject
        for (const r of input.rows) {
            await recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG, caseId: CASE, resolutionId: String(r.id), actorId: "user-1", deps: d,
            });
        }

        // 2. the plan, its exact hash, and an approval bound to it
        const p = plan(input.operations);
        expect(evaluateApprovalReadiness(p).ready).toBe(true);
        const approval = bindApproval({ plan: p, approvingActor: "user-1", approvedAt: NOW });
        expect(approval.planContentHash).toBe(p.contentHash);

        // 3. the executor commits, and the attempt row is durable
        const a = attempt({
            planContentHash: p.contentHash,
            operations: input.results,
            outcome: input.outcome ?? "committed",
        });

        // 4. Trust observes the outcome
        const binding = await bindCommitOutcomeToTrust(store.client(), {
            orgId: ORG, plan: p, attempt: a, commitAttemptId: ATTEMPT_ROW, actorId: "user-1",
            deps: execDeps(trust, input.governed),
        });

        return { trust, store, binding, plan: p, approval };
    }

    function projectFor(trust: ReturnType<typeof makeTrust>, packageId: string) {
        const observations: LifecycleObservationRecord[] = trust.observations
            .filter((o) => o.package_id === packageId)
            .map((o, i) => ({
                id: o.id ?? `obs-${i}`,
                org_id: o.org_id,
                package_id: o.package_id,
                observation_kind: o.observation_kind,
                observed_by_actor_type: o.observed_by_actor_type,
                observed_by_actor_id: o.observed_by_actor_id,
                channel: o.channel,
                execution_reference: o.execution_reference,
                detail: o.detail,
                observed_at_iso: NOW,
            }));
        return projectDecisionPackageLifecycle({
            package: {
                id: packageId, org_id: ORG, outcome: "recommended",
                created_at_iso: "2026-08-05T09:00:00.000Z", supersedes_package_id: null,
            },
            observations,
            projectedAtIso: NOW,
        });
    }

    it("confirmed EXISTING: the committed flow projects executed", async () => {
        const { trust, binding } = await reviewedExecution({
            rows: [confirmedRow()],
            governed: { [ADOPTION]: PKG },
            operations: [op()],
            results: [committedOp("op-parent")],
        });

        expect(binding.packages).toEqual([
            { status: "observed", packageId: PKG, observationId: expect.any(String) },
        ]);
        const kinds = trust.observations.filter((o) => o.package_id === PKG).map((o) => o.observation_kind);
        expect(kinds).toEqual(["accepted", "executed"]);

        const r = projectFor(trust, PKG);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.projection.review.state).toBe("accepted");
        expect(r.projection.execution.state).toBe("executed");
        expect(r.projection.execution.reference).toBe(ATTEMPT_ROW);
        expect(r.projection.supersession.superseded).toBe(false);
        expect(r.projection.disposition).toBe("executed");
    });

    it("confirmed NEW: the committed flow projects executed", async () => {
        const { trust } = await reviewedExecution({
            rows: [row({ candidates: [], decision_action: "create_new", selected_candidate_id: null })],
            governed: { [ADOPTION]: PKG },
            operations: [op()],
            results: [committedOp("op-parent")],
        });

        const r = projectFor(trust, PKG);
        expect(r.ok && r.projection.disposition).toBe("executed");
        expect(r.ok && r.projection.review.state).toBe("accepted");
    });

    it("MULTIPLE confirmed packages in one plan each bind once", async () => {
        const { trust, binding } = await reviewedExecution({
            rows: [confirmedRow(), confirmedRow("res-child", "child-1", HASH_CHILD)],
            governed: { [ADOPTION]: PKG, [ADOPTION_CHILD]: PKG_CHILD },
            operations: [op(), op({ opId: "op-child", opOrder: 2, resolutionRefs: ["res-child"] })],
            results: [committedOp("op-parent"), committedOp("op-child")],
        });

        expect(binding.packages.map((p) => p.status)).toEqual(["observed", "observed"]);
        for (const pkg of [PKG, PKG_CHILD]) {
            const r = projectFor(trust, pkg);
            expect(r.ok && r.projection.disposition, pkg).toBe("executed");
        }
        // Exactly one executed observation each — no cross-binding.
        expect(trust.observations.filter((o) => o.observation_kind === "executed")).toHaveLength(2);
        expect(trust.usage).toEqual([]);
    });

    it("PARTIAL commit binds at subject grain: the committed subject executes, the other does not", async () => {
        const { trust } = await reviewedExecution({
            rows: [confirmedRow(), confirmedRow("res-child", "child-1", HASH_CHILD)],
            governed: { [ADOPTION]: PKG, [ADOPTION_CHILD]: PKG_CHILD },
            operations: [op(), op({ opId: "op-child", opOrder: 2, resolutionRefs: ["res-child"] })],
            results: [
                committedOp("op-parent"),
                { opId: "op-child", commandKey: "k", status: "failed", recordId: null, idempotentReplay: false, error: "boom" },
            ],
            outcome: "partially_committed",
        });

        const parent = projectFor(trust, PKG);
        expect(parent.ok && parent.projection.disposition).toBe("executed");

        const child = projectFor(trust, PKG_CHILD);
        expect(child.ok && child.projection.execution.state).toBe("failed");
        expect(child.ok && child.projection.disposition).toBe("execution_failed");

        expect(trust.observations.filter((o) => o.observation_kind === "executed")).toHaveLength(1);
    });

    it("the plan hash and its approval are untouched by any of this", async () => {
        const { plan: p, approval } = await reviewedExecution({
            rows: [confirmedRow()],
            governed: { [ADOPTION]: PKG },
            operations: [op()],
            results: [committedOp("op-parent")],
        });

        expect(p.contentHash).toBe(computePlanContentHash({ orgId: ORG, caseId: CASE, operations: p.operations }));
        expect(approval.planContentHash).toBe(p.contentHash);
        expect(approval.planVersion).toBe(p.version);
        expect(evaluateApprovalReadiness(p).ready).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// 4. Unchanged behaviour
// ---------------------------------------------------------------------------

describe("PC-4 — everything else is where it was", () => {
    it("a fact correction fabricates no replacement lineage", async () => {
        // `recordCorrection` appends a fact version and does not re-run
        // resolution, so no resolution row changes and no lineage seam fires.
        const src = await import("node:fs").then((fs) =>
            fs.readFileSync(
                new URL("../../lib/pos/processingIdentity/operator/operatorReviewService.ts", import.meta.url),
                "utf8",
            ),
        );
        const correctionStart = src.indexOf("export async function recordCorrection(");
        const correctionEnd = src.indexOf("export async function recordResolutionDecision(");
        const body = src.slice(correctionStart, correctionEnd);
        expect(body).not.toContain("recordOperatorDecisionLifecycle");
        expect(body).not.toContain("bindCommitOutcomeToTrust");
        expect(body).toContain("appendCorrectedProcessingFact");
    });

    it("replacement-generation supersession still fires only after the new package exists", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({ id: "res-old", decided_by: "engine", operator_id: null }),
            row({
                id: "res-new", generation_id: "gen-2", input_facts_hash: HASH_CHILD,
                decided_by: "engine", operator_id: null, created_at: "2026-08-05T11:00:00.000Z",
            } as Partial<ProcessingResolutionRow>),
        ]);

        const outcome = await supersedeForReplacementPackage(store.client(), {
            orgId: ORG, caseId: CASE, subjectRef: "parent-1",
            replacementGenerationId: "gen-2", replacementPackageId: PKG_CHILD,
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(outcome).toMatchObject({ status: "superseded", priorPackageId: PKG });
        const o = trust.observations[0]!;
        expect(o.observation_kind).toBe("superseded");
        expect(o.detail.superseding_package_id).toBe(PKG_CHILD);
        expect(o.detail.reason).toBe("replacement_engine_generation");
    });

    it("the engine's own derivation is unchanged — one definition, shared", async () => {
        const engineSrc = await import("node:fs").then((fs) =>
            fs.readFileSync(
                new URL("../../lib/pos/processingIdentity/canonicalResolutionEngine.ts", import.meta.url),
                "utf8",
            ),
        );
        // The engine imports the shared definition rather than keeping a copy.
        expect(engineSrc).toContain('from "./engineJudgment"');
        expect(engineSrc).not.toMatch(/function bandToLegacyConfidence/);
        // ...and still calls it exactly where it always did.
        expect(engineSrc).toContain("bandToLegacyConfidence(top.confidenceBand)");
        expect(engineSrc).toContain("defaultActionForConfidence(legacyConfidence)");
    });
});
