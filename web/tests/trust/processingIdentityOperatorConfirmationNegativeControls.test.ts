/**
 * Negative controls for the confirmation-versus-supersession correction.
 *
 * Each group builds the DEFECT the correction removes and proves it would be
 * caught. The first two are the exact shape of the Phase 1.6 defect, so they
 * double as regression guards: if anyone reverts to classifying from
 * `decided_by`, these fail.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { IdentityCandidate } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import type { CommitPlan, PlanOperation } from "@/lib/pos/processingIdentity/plan/planTypes";
import type { CommitAttempt, OperationResult } from "@/lib/pos/processingIdentity/executor/executorTypes";
import { computePlanContentHash } from "@/lib/pos/processingIdentity/plan/planHash";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import {
    classifyOperatorIdentityDecisionEffect,
    OPERATOR_DECISION_EFFECTS,
} from "@/lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect";
import { recordOperatorDecisionLifecycle } from "@/lib/pos/processingIdentity/trustAdapter/identityLineageService";
import { resolvePlanPackageLineage } from "@/lib/pos/processingIdentity/trustAdapter/planPackageLineage";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import type {
    ExistingReviewObservation,
    ReviewObservationLookup,
    ReviewPackageLookup,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview";
import type {
    ExistingSupersession,
    PackageLineageLookup,
    SupersessionObservationLookup,
    TrustPackageLineageRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import type { TrustObservationInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const WEB_ROOT = join(__dirname, "..", "..");
const NOW = "2026-08-05T12:00:00.000Z";
const ORG = "org-1";
const CASE = "case-1";
const GEN = "gen-1";
const HASH = "a".repeat(64);
const PKG = "pkg-parent";

// ---------------------------------------------------------------------------

function makeTrust() {
    const observations: TrustObservationInput[] = [];
    const contracts: unknown[] = [];
    const packagesCreated: unknown[] = [];
    const usage: unknown[] = [];
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
    ]);
    const packageLookup: PackageLineageLookup = async ({ package_id }) => packages.get(package_id) ?? null;
    const reviewPackageLookup: ReviewPackageLookup = async ({ package_id }) => {
        const p = packages.get(package_id);
        return p ? { id: p.id, org_id: p.org_id, contract_id: p.contract_id } : null;
    };
    const observationLookup: SupersessionObservationLookup = async ({ org_id, package_id }) =>
        observations
            .filter((o) => o.org_id === org_id && o.package_id === package_id && o.observation_kind === "superseded")
            .map(
                (o): ExistingSupersession => ({
                    observation_id: o.id!,
                    superseding_package_id: (o.detail.superseding_package_id as string | null) ?? null,
                    superseding_reference: (o.detail.superseding_reference as string | null) ?? null,
                    reason: (o.detail.reason as string | null) ?? null,
                }),
            );
    const reviewObservationLookup: ReviewObservationLookup = async ({ org_id, package_id }) =>
        observations
            .filter(
                (o) =>
                    o.org_id === org_id &&
                    o.package_id === package_id &&
                    ["accepted", "deferred", "rejected", "overridden", "modified", "presented"].includes(
                        o.observation_kind,
                    ),
            )
            .map((o): ExistingReviewObservation => ({ observation_id: o.id!, observation_kind: o.observation_kind }));

    return {
        repository, observations, contracts, packagesCreated, usage, packages,
        packageLookup, reviewPackageLookup, observationLookup, reviewObservationLookup,
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
        lookup: async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
            if (org_id !== ORG) return null;
            const id = governed[contract_id];
            return id ? { contract_id, package_id: id } : null;
        },
        now: () => NOW,
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

function candidate(recordId: string, band: string): IdentityCandidate {
    return {
        subjectRef: "parent-1", entityType: "person", recordId,
        confidenceBand: band as IdentityCandidate["confidenceBand"],
        signals: [], blockingConflicts: [], explanation: "",
        resolverVersion: IDENTITY_RESOLVER_VERSION,
    } as IdentityCandidate;
}

function row(overrides: Partial<ProcessingResolutionRow> = {}): Row {
    return {
        id: "res-parent", org_id: ORG, case_id: CASE, generation_id: GEN,
        input_facts_hash: HASH, subject_ref: "parent-1", subject_role: "parent",
        provisional: {},
        candidates: [candidate("rec-A", "confirmed")],
        decision_action: "link_existing", selected_candidate_id: "rec-A",
        decided_by: "operator", operator_id: "user-1",
        policy_version: null, resolver_version: IDENTITY_RESOLVER_VERSION,
        stale_at: null, superseded_by: null, retention_class: "uncommitted_submission",
        created_at: "2026-08-05T10:00:00.000Z",
        ...overrides,
    } as Row;
}

const ADOPTION = processingIdentitySubjectAdoptionId({
    org_id: ORG, processing_case_id: CASE, subject_ref: "parent-1",
    decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
    input_facts_hash: HASH,
    material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
    identity_resolver_version: IDENTITY_RESOLVER_VERSION,
});

function op(overrides: Partial<PlanOperation> = {}): PlanOperation {
    return {
        opId: "op-parent", opOrder: 1, opKind: "create",
        commandKey: "identity.create_person", commandVersion: "1",
        targetType: "person", targetId: null, payload: {},
        before: null, after: null, reason: "", evidenceRefs: [],
        resolutionRefs: ["res-parent"], risk: "low", dependsOn: [],
        atomicGroup: "identity_core", preconditionRecordVersion: null,
        included: true, optional: false, reversibility: "reversible",
        atomicity: "atomic", expectedSideEffects: [],
        ...overrides,
    };
}

function plan(operations: PlanOperation[] = [op()]): CommitPlan {
    return {
        planId: "plan-1", orgId: ORG, caseId: CASE, version: 1,
        contentHash: computePlanContentHash({ orgId: ORG, caseId: CASE, operations }),
        operations, preconditions: [], atomicGroups: ["identity_core"],
        sourceResolutionVersions: [GEN], downstreamEffectPreview: [],
        requiresApproval: true, requiresPrivilegedApproval: false, reversible: true,
        status: "approved", builtAt: NOW, supersededBy: null, supersededAt: null,
        retentionClass: "uncommitted_submission",
    };
}

function silence() {
    return {
        warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
        error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
}

// ---------------------------------------------------------------------------

describe("PC-NC-1 — treating every operator action as supersession would be caught", () => {
    it("the same actor, the same `decided_by`, opposite lifecycle outcomes", async () => {
        const governed = { [ADOPTION]: PKG };

        // Confirmation: same action AND same record as the engine asserted.
        const confirmTrust = makeTrust();
        const confirmStore = makeStore([row({ selected_candidate_id: "rec-A" })]);
        const confirmed = await recordOperatorDecisionLifecycle(confirmStore.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(confirmTrust, governed),
        });

        // Override: identical in every respect EXCEPT the record chosen.
        const overrideTrust = makeTrust();
        const overrideStore = makeStore([row({ selected_candidate_id: "rec-B" })]);
        const overridden = await recordOperatorDecisionLifecycle(overrideStore.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(overrideTrust, governed),
        });

        expect(confirmed.status).toBe("reviewed");
        expect(overridden.status).toBe("superseded");
        expect(confirmTrust.observations[0]!.observation_kind).toBe("accepted");
        expect(overrideTrust.observations[0]!.observation_kind).toBe("superseded");
    });

    it("no operator action supersedes when the engine asserted nothing", async () => {
        // `strong` → review_required. Nothing to contradict, whatever is chosen.
        for (const [action, selected] of [
            ["link_existing", "rec-Z"],
            ["create_new", null],
            ["reject", null],
        ] as const) {
            const trust = makeTrust();
            const store = makeStore([
                row({
                    candidates: [candidate("rec-A", "strong")] as unknown as ProcessingResolutionRow["candidates"],
                    decision_action: action,
                    selected_candidate_id: selected,
                } as Partial<ProcessingResolutionRow>),
            ]);
            await recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
                deps: deps(trust, { [ADOPTION]: PKG }),
            });
            expect(trust.observations[0]!.observation_kind, action).toBe("accepted");
        }
    });
});

describe("PC-NC-2 — classifying from `decided_by` alone would be caught", () => {
    it("the classifier does not read `decided_by` at all", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect.ts"),
            "utf8",
        )
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        expect(src).not.toContain("decided_by");
        expect(src).not.toContain("operator_id");
        // It compares the two things that actually differ.
        expect(src).toContain("engine.action");
        expect(src).toContain("engineJudgmentFromCandidates");
    });

    it("its input type cannot even see `decided_by`", () => {
        // Two rows identical to the classifier, differing only in `decided_by`,
        // must classify identically — the field is not part of the question.
        const shape = {
            candidates: [candidate("rec-A", "confirmed")] as unknown as ProcessingResolutionRow["candidates"],
            decision_action: "link_existing",
            selected_candidate_id: "rec-A",
        };
        expect(classifyOperatorIdentityDecisionEffect(shape).effect).toBe("confirmation");
    });

    it("it reads no free-text operator field", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/classifyOperatorDecisionEffect.ts"),
            "utf8",
        )
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\/\/.*$/gm, "");
        for (const field of ["provisional", "create_new_override", "reason", "explanation", "displayName"]) {
            expect(src.includes(field), field).toBe(false);
        }
    });
});

describe("PC-NC-3 — confirmation creating a Decision Package would be caught", () => {
    it("no contract, package or reasoning-usage row is written", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(trust.contracts).toEqual([]);
        expect(trust.packagesCreated).toEqual([]);
        expect(trust.usage).toEqual([]);
        expect(trust.observations).toHaveLength(1);
    });

    it("the review port imports no contract or runtime seam", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        for (const forbidden of ["createDecisionContract", "trustRuntime", "executeDecisionContract"]) {
            expect(imports.some((i) => i.includes(forbidden)), forbidden).toBe(false);
        }
        // It writes through the ONE observation writer, never the repository.
        expect(src).toContain("captureOutcome");
        expect(src).not.toContain("insertObservation");
    });
});

describe("PC-NC-4 — excluding confirmed packages from execution binding would be caught", () => {
    it("a confirmed package is included; only a superseded one is excluded", async () => {
        const governed = { [ADOPTION]: PKG };

        const confirmTrust = makeTrust();
        const confirmStore = makeStore([row({ selected_candidate_id: "rec-A" })]);
        await recordOperatorDecisionLifecycle(confirmStore.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(confirmTrust, governed),
        });
        const included = await resolvePlanPackageLineage(confirmStore.client(), {
            orgId: ORG, plan: plan(), deps: deps(confirmTrust, governed),
        });

        const overrideTrust = makeTrust();
        const overrideStore = makeStore([row({ selected_candidate_id: "rec-B" })]);
        await recordOperatorDecisionLifecycle(overrideStore.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(overrideTrust, governed),
        });
        const excluded = await resolvePlanPackageLineage(overrideStore.client(), {
            orgId: ORG, plan: plan(), deps: deps(overrideTrust, governed),
        });

        expect(included.contributing.map((c) => c.packageId)).toEqual([PKG]);
        expect(excluded.contributing).toEqual([]);
        expect(excluded.excluded[0]!.reason).toBe("package_superseded");
    });

    it("the resolver excludes on SUPERSESSION, not on any review observation", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/planPackageLineage.ts"),
            "utf8",
        );
        expect(src).toContain("supersessionLookup");
        // Accepted and deferred are reviews, not replacements; excluding on them
        // would put the normal reviewed path right back where it started.
        expect(src).not.toContain('"accepted"');
        expect(src).not.toContain('"deferred"');
    });
});

describe("PC-NC-5 — leaving an overridden package current would be caught", () => {
    it("every disagreement yields `superseded` and a distinct reason", async () => {
        const cases: { action: string; selected: string | null; reason: string }[] = [
            { action: "link_existing", selected: "rec-B", reason: "operator_selected_other_candidate" },
            { action: "create_new", selected: null, reason: "operator_overrode_with_create_new" },
            { action: "reject", selected: null, reason: "operator_rejected_candidate" },
        ];
        for (const c of cases) {
            const trust = makeTrust();
            const store = makeStore([
                row({ decision_action: c.action, selected_candidate_id: c.selected } as Partial<ProcessingResolutionRow>),
            ]);
            const outcome = await recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
                deps: deps(trust, { [ADOPTION]: PKG }),
            });
            expect(outcome.status, c.action).toBe("superseded");
            expect(trust.observations[0]!.observation_kind, c.action).toBe("superseded");
            expect(trust.observations[0]!.detail.reason, c.action).toBe(c.reason);
        }
    });

    it("the effect vocabulary keeps agreement and disagreement separable", () => {
        for (const effect of ["confirmation", "engine_deferred_review", "operator_deferred"]) {
            expect(OPERATOR_DECISION_EFFECTS).toContain(effect);
        }
        for (const effect of ["override_existing_candidate", "override_create_new", "rejection"]) {
            expect(OPERATOR_DECISION_EFFECTS).toContain(effect);
        }
        expect(OPERATOR_DECISION_EFFECTS).toContain("unsupported_or_ambiguous");
    });
});

describe("PC-NC-6 — recording execution before commit success would be caught", () => {
    it("a review observation carries no execution reference", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });
        // A review is not an execution. Nothing acted on the world.
        expect(trust.observations[0]!.execution_reference).toBeNull();
        expect(trust.observations[0]!.observation_kind).not.toBe("executed");
    });

    it("the review port cannot emit an executed or outcome observation", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/capabilities/processingIdentitySubjectResolution/observeOperatorReview.ts"),
            "utf8",
        );
        // The kind is a closed union of two review kinds, and the reference is
        // hard-coded null.
        expect(src).toContain('readonly observation_kind: "accepted" | "deferred";');
        expect(src).toContain("execution_reference: null");
    });

    it("the decision path never touches the executor or a commit attempt", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts"),
            "utf8",
        );
        const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
        for (const forbidden of ["commitExecutor", "executorPorts", "attemptsDb", "executionLineageService"]) {
            expect(imports.some((i) => i.includes(forbidden)), forbidden).toBe(false);
        }
    });

    it("a decision that has NOT committed records nothing", async () => {
        const trust = makeTrust();
        const store = makeStore([row({ decided_by: "engine", operator_id: null })]);
        const spies = silence();

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-parent", actorId: "user-1",
            deps: deps(trust, { [ADOPTION]: PKG }),
        });

        expect(outcome).toEqual({ status: "no_lineage", reason: "operator_decision_not_durable" });
        expect(trust.observations).toEqual([]);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});
