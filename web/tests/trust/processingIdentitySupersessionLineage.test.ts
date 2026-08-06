/**
 * Phase 1.6 — operator-correction lineage and Trust supersession.
 *
 * When an operator correction or a replacement engine judgment makes a prior
 * governed identity judgment non-current, exactly one canonical `superseded`
 * observation is appended to the prior Decision Package. Processing keeps every
 * authority it had, no Decision Package is ever mutated, and no operator
 * decision becomes deterministic reasoning.
 *
 * The observation store ENFORCES the real schema's `id uuid PRIMARY KEY`,
 * because a fake that accepts duplicates the database would refuse turns every
 * exactly-once assertion into theatre.
 */

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import {
    adoptionIdForResolutionRow,
    recordOperatorDecisionLifecycle,
    supersedeForReplacementPackage,
} from "@/lib/pos/processingIdentity/trustAdapter/identityLineageService";
import {
    identitySupersessionReasonForEffect,
    IDENTITY_SUPERSESSION_REASONS,
} from "@/lib/pos/processingIdentity/trustAdapter/identitySupersessionReasons";
import {
    listUnresolvedIdentityLineageGaps,
    TRUST_IDENTITY_LINEAGE_GAP_TYPE,
} from "@/lib/pos/processingIdentity/trustAdapter/identityLineageGapDb";
import {
    reconcileIdentityLineageGaps,
    reconcileOneIdentityLineageGap,
} from "@/lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps";
import { recordResolutionDecision } from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import type { OperatorReviewDeps } from "@/lib/pos/processingIdentity/operator/operatorReviewService";
import { TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES } from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import {
    supersedeGovernedIdentityJudgment,
    type ExistingSupersession,
    type PackageLineageLookup,
    type SupersessionObservationLookup,
    type TrustPackageLineageRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import {
    buildSupersessionDetail,
    supersessionObservationId,
} from "@/lib/trust/lifecycle/supersessionLineage";
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
const FACTS_HASH = "a".repeat(64);
const PRIOR_GEN = "gen-1";
const NEW_GEN = "gen-2";
const PRIOR_PKG = "pkg-prior";
const NEW_PKG = "pkg-new";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Enforces `trust_decision_observations.id PRIMARY KEY`, so exactly-once is measured. */
function makeTrust() {
    const observations: TrustObservationInput[] = [];
    const usage: ReasoningUsageInput[] = [];
    const repository: TrustRepository = {
        async insertContract() {},
        async advanceContractLifecycle() {},
        async insertPackage() {},
        async insertObservation(o) {
            if (o.id && observations.some((x) => x.id === o.id)) {
                throw new Error('duplicate key value violates unique constraint "trust_decision_observations_pkey"');
            }
            observations.push(o);
        },
        async insertReasoningUsage(u) {
            usage.push(u);
        },
    };

    const packages = new Map<string, TrustPackageLineageRef>([
        [PRIOR_PKG, { id: PRIOR_PKG, org_id: ORG, contract_id: "contract-prior", supersedes_package_id: null }],
        [NEW_PKG, { id: NEW_PKG, org_id: ORG, contract_id: "contract-new", supersedes_package_id: null }],
    ]);

    const packageLookup: PackageLineageLookup = async ({ package_id }) => packages.get(package_id) ?? null;

    /** Reads current state, so a concurrent loser can see the winner. */
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

    return { repository, observations, usage, packages, packageLookup, observationLookup };
}

/** Governed packages, keyed by the adoption identity that IS the contract id. */
function makeGovernedLookup(entries: Record<string, string>) {
    return async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
        if (org_id !== ORG) return null;
        const packageId = entries[contract_id];
        return packageId ? { contract_id, package_id: packageId } : null;
    };
}

type Row = Record<string, unknown>;

/**
 * `processing_resolutions` (read-only for lineage) + durable
 * `processing_exceptions`. Every write to a resolution row is recorded so a
 * control can prove reconciliation never rewrites Processing.
 */
function makeStore(resolutions: Row[] = []) {
    const exceptions: Row[] = [];
    const resolutionWrites: string[] = [];
    const forbiddenTables: string[] = [];
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
                if (table !== "processing_exceptions" && table !== "processing_resolutions") {
                    forbiddenTables.push(table);
                    throw new Error(`lineage touched a forbidden table: ${table}`);
                }
                const rows = table === "processing_exceptions" ? exceptions : resolutions;
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
                        rows.push(r);
                        return { data: [{ ...r }], error: null };
                    }
                    const hits = rows.filter(match);
                    if (mode === "update") {
                        if (table === "processing_resolutions") {
                            for (const r of hits) resolutionWrites.push(String(r.id));
                        }
                        for (const r of hits) Object.assign(r, payload);
                        return { data: hits.map((r) => ({ ...r })), error: null };
                    }
                    const sliced = limit === null ? hits : hits.slice(0, limit);
                    return { data: sliced.map((r) => ({ ...r })), error: null };
                };
                const api: Record<string, unknown> = {
                    select: () => api,
                    insert: (r: Row) => {
                        mode = "insert";
                        payload = r;
                        return api;
                    },
                    update: (r: Row) => {
                        mode = "update";
                        payload = r;
                        return api;
                    },
                    eq: (c: string, v: unknown) => {
                        filters.push({ kind: "eq", column: c, value: v });
                        return api;
                    },
                    neq: (c: string, v: unknown) => {
                        filters.push({ kind: "neq", column: c, value: v });
                        return api;
                    },
                    is: (c: string, v: unknown) => {
                        filters.push({ kind: "is", column: c, value: v });
                        return api;
                    },
                    order: () => api,
                    limit: (n: number) => {
                        limit = n;
                        return api;
                    },
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

    return { client, exceptions, resolutions, resolutionWrites, forbiddenTables };
}

/**
 * The candidate the ENGINE recommended.
 *
 * `confirmed` is what makes the engine assert `link_existing` rather than defer
 * with `review_required`, and only an assertion can be contradicted. This suite
 * is about SUPERSESSION, so its fixtures must be genuine overrides — a fixture
 * with no candidates at all would be classified as one for the wrong reason.
 */
function engineCandidate(recordId: string): Record<string, unknown> {
    return {
        subjectRef: "parent-1",
        entityType: "person",
        recordId,
        confidenceBand: "confirmed",
        signals: [],
        blockingConflicts: [],
        explanation: "",
        resolverVersion: IDENTITY_RESOLVER_VERSION,
    };
}

function row(overrides: Partial<ProcessingResolutionRow> = {}): Row {
    return {
        id: "res-1",
        org_id: ORG,
        case_id: CASE,
        generation_id: PRIOR_GEN,
        input_facts_hash: FACTS_HASH,
        subject_ref: "parent-1",
        subject_role: "parent",
        provisional: {},
        // The engine asserted `link_existing` → `rec-engine`; the operator chose
        // `rec-1`. A genuine disagreement, which is what supersession records.
        candidates: [engineCandidate("rec-engine")],
        decision_action: "link_existing",
        selected_candidate_id: "rec-1",
        decided_by: "operator",
        operator_id: "user-1",
        policy_version: null,
        resolver_version: IDENTITY_RESOLVER_VERSION,
        stale_at: null,
        superseded_by: null,
        retention_class: "uncommitted_submission",
        created_at: "2026-08-05T10:00:00.000Z",
        ...overrides,
    } as Row;
}

function adoptionIdFor(overrides: { subjectRef?: string; factsHash?: string } = {}): string {
    return processingIdentitySubjectAdoptionId({
        org_id: ORG,
        processing_case_id: CASE,
        subject_ref: overrides.subjectRef ?? "parent-1",
        decision_class_key: PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY,
        input_facts_hash: overrides.factsHash ?? FACTS_HASH,
        material_projection_version: PROCESSING_IDENTITY_FACT_MATERIAL_VERSION,
        identity_resolver_version: IDENTITY_RESOLVER_VERSION,
    });
}

function silence() {
    return {
        warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
        error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
}

function lineageDeps(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
    return {
        repository: trust.repository,
        packageLookup: trust.packageLookup,
        observationLookup: trust.observationLookup,
        lookup: makeGovernedLookup(governed),
        now: () => NOW,
    };
}

// ---------------------------------------------------------------------------
// 1. Direct operator correction
// ---------------------------------------------------------------------------

describe("P16-1 — an operator correction supersedes the prior engine judgment", () => {
    it("appends exactly one superseded observation naming the durable Processing decision", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(outcome.status).toBe("superseded");
        expect(trust.observations).toHaveLength(1);
        const o = trust.observations[0]!;
        expect(o.observation_kind).toBe("superseded");
        expect(o.package_id).toBe(PRIOR_PKG);
        expect(o.detail.supersession_source).toBe("external_authority_decision");
        // No fake package id is invented for an operator.
        expect(o.detail.superseding_package_id).toBeNull();
        expect(o.detail.superseding_reference).toBe("processing_resolution:res-1");
        expect(o.detail.reason).toBe("operator_selected_other_candidate");
        // Supersession is not an execution.
        expect(o.execution_reference).toBeNull();
    });

    it("takes the actor from authoritative server context, not the resolution row", async () => {
        const trust = makeTrust();
        // The row claims a different operator; server context must win.
        const store = makeStore([row({ operator_id: "spoofed-by-payload" } as Partial<ProcessingResolutionRow>)]);

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "server-context-user",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(trust.observations[0]!.observed_by_actor_type).toBe("operator");
        expect(trust.observations[0]!.observed_by_actor_id).toBe("server-context-user");
    });

    it("does NOT supersede before the correction is durable", async () => {
        const trust = makeTrust();
        // The engine still owns this row: no operator decision committed.
        const store = makeStore([row({ decided_by: "engine", operator_id: null })]);

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(outcome).toEqual({ status: "no_lineage", reason: "operator_decision_not_durable" });
        expect(trust.observations).toHaveLength(0);
    });

    it("identifies the prior package by EXACT subject adoption identity", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        // A package exists, but for a DIFFERENT subject's adoption identity.
        const spies = silence();

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor({ subjectRef: "child-9" })]: PRIOR_PKG }),
        });

        expect(outcome.status).toBe("deferred");
        expect(trust.observations).toHaveLength(0);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("leaves another subject's package untouched", async () => {
        const trust = makeTrust();
        const store = makeStore([row(), row({ id: "res-2", subject_ref: "child-1" })]);
        const governed = { [adoptionIdFor()]: PRIOR_PKG, [adoptionIdFor({ subjectRef: "child-1" })]: NEW_PKG };

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, governed),
        });

        expect(trust.observations).toHaveLength(1);
        expect(trust.observations[0]!.package_id).toBe(PRIOR_PKG);
        expect(trust.observations.some((o) => o.package_id === NEW_PKG)).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// 2. Idempotency
// ---------------------------------------------------------------------------

describe("P16-2 — supersession is exactly once", () => {
    it("retrying the same operator action appends no second observation", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        const deps = lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG });
        const call = () =>
            recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG,
                caseId: CASE,
                resolutionId: "res-1",
                actorId: "user-1",
                deps,
            });

        const first = await call();
        const second = await call();
        const third = await call();

        expect(first.status).toBe("superseded");
        expect(second.status).toBe("already_superseded");
        expect(third.status).toBe("already_superseded");
        expect(trust.observations).toHaveLength(1);
    });

    it("recovers an AMBIGUOUS success: the row committed, the response did not", async () => {
        const trust = makeTrust();
        const observationId = supersessionObservationId({
            org_id: ORG,
            prior_package_id: PRIOR_PKG,
            superseding_package_id: null,
            superseding_reference: "processing_resolution:res-1",
            reason: "operator_selected_other_candidate",
        });
        // The write LANDED, then the caller saw an error.
        await trust.repository.insertObservation({
            id: observationId,
            org_id: ORG,
            package_id: PRIOR_PKG,
            observation_kind: "superseded",
            observed_by_actor_type: "operator",
            observed_by_actor_id: "user-1",
            channel: "system",
            execution_reference: null,
            detail: {
                supersession_source: "external_authority_decision",
                superseding_package_id: null,
                superseding_reference: "processing_resolution:res-1",
                reason: "operator_selected_other_candidate",
            },
        });

        const store = makeStore([row()]);
        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(outcome).toMatchObject({ status: "already_superseded", observationId });
        expect(trust.observations).toHaveLength(1);
    });

    it("a pre-check that is BYPASSED still cannot duplicate — the primary key refuses", async () => {
        const trust = makeTrust();
        // A lookup that always reports "nothing here" defeats layer 1 and 3.
        const blind: SupersessionObservationLookup = async () => [];
        const input = {
            org_id: ORG,
            prior_package_id: PRIOR_PKG,
            supersession_source: "external_authority_decision" as const,
            superseding_package_id: null,
            superseding_reference: "processing_resolution:res-1",
            reason: "operator_selected_other_candidate",
            actor_type: "operator" as const,
            actor_id: "user-1",
            channel: "system",
            correlation_id: CASE,
        };
        const deps = {
            repository: trust.repository,
            packageLookup: trust.packageLookup,
            observationLookup: blind,
        };

        const first = await supersedeGovernedIdentityJudgment(input, deps);
        const second = await supersedeGovernedIdentityJudgment(input, deps);

        expect(first.status).toBe("superseded");
        // The database refused; with a blind lookup it cannot converge, so it
        // reports a gap rather than a false success or a duplicate.
        expect(second.status).toBe("gap_required");
        expect(trust.observations).toHaveLength(1);
    });

    it("a permissive store DOES duplicate, proving the primary key is load-bearing", async () => {
        const permissiveObservations: TrustObservationInput[] = [];
        const permissive: TrustRepository = {
            async insertContract() {},
            async advanceContractLifecycle() {},
            async insertPackage() {},
            async insertObservation(o) {
                permissiveObservations.push(o);
            },
            async insertReasoningUsage() {},
        };
        const trust = makeTrust();
        const input = {
            org_id: ORG,
            prior_package_id: PRIOR_PKG,
            supersession_source: "external_authority_decision" as const,
            superseding_package_id: null,
            superseding_reference: "processing_resolution:res-1",
            reason: "operator_selected_other_candidate",
            actor_type: "operator" as const,
            actor_id: "user-1",
            channel: "system",
            correlation_id: CASE,
        };
        const deps = {
            repository: permissive,
            packageLookup: trust.packageLookup,
            observationLookup: (async () => []) as SupersessionObservationLookup,
        };

        await supersedeGovernedIdentityJudgment(input, deps);
        await supersedeGovernedIdentityJudgment(input, deps);

        expect(permissiveObservations).toHaveLength(2);
        // ...and both carry ONE id — the row the real primary key refuses.
        expect(new Set(permissiveObservations.map((o) => o.id)).size).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// 3. Lineage rules
// ---------------------------------------------------------------------------

describe("P16-3 — lineage rules are enforced before the write", () => {
    const base = {
        org_id: ORG,
        supersession_source: "replacement_decision_package" as const,
        superseding_reference: null,
        reason: "replacement_engine_generation",
        actor_type: "system" as const,
        actor_id: null,
        channel: "system",
        correlation_id: CASE,
    };

    it("rejects self-supersession", async () => {
        const trust = makeTrust();
        const result = await supersedeGovernedIdentityJudgment(
            { ...base, prior_package_id: PRIOR_PKG, superseding_package_id: PRIOR_PKG },
            trust,
        );
        expect(result).toEqual({ status: "refused", reason: "self_supersession" });
        expect(trust.observations).toHaveLength(0);
    });

    it("rejects a cross-org replacement", async () => {
        const trust = makeTrust();
        trust.packages.set("pkg-other-org", {
            id: "pkg-other-org",
            org_id: "org-2",
            contract_id: "contract-other",
            supersedes_package_id: null,
        });
        const result = await supersedeGovernedIdentityJudgment(
            { ...base, prior_package_id: PRIOR_PKG, superseding_package_id: "pkg-other-org" },
            trust,
        );
        expect(result).toEqual({ status: "refused", reason: "cross_org_supersession" });
        expect(trust.observations).toHaveLength(0);
    });

    it("rejects a lineage cycle", async () => {
        const trust = makeTrust();
        trust.packages.set(PRIOR_PKG, {
            id: PRIOR_PKG,
            org_id: ORG,
            contract_id: "contract-prior",
            supersedes_package_id: NEW_PKG,
        });
        trust.packages.set(NEW_PKG, {
            id: NEW_PKG,
            org_id: ORG,
            contract_id: "contract-new",
            supersedes_package_id: PRIOR_PKG,
        });
        const result = await supersedeGovernedIdentityJudgment(
            { ...base, prior_package_id: PRIOR_PKG, superseding_package_id: NEW_PKG },
            trust,
        );
        expect(result).toEqual({ status: "refused", reason: "supersession_cycle" });
        expect(trust.observations).toHaveLength(0);
    });

    it("rejects a second, materially different supersession claim", async () => {
        const trust = makeTrust();
        await supersedeGovernedIdentityJudgment(
            { ...base, prior_package_id: PRIOR_PKG, superseding_package_id: NEW_PKG },
            trust,
        );
        const conflicting = await supersedeGovernedIdentityJudgment(
            {
                ...base,
                prior_package_id: PRIOR_PKG,
                supersession_source: "external_authority_decision",
                superseding_package_id: null,
                superseding_reference: "processing_resolution:res-9",
                reason: "operator_overrode_with_create_new",
            },
            trust,
        );
        expect(conflicting).toEqual({
            status: "refused",
            reason: "conflicting_supersession_already_recorded",
        });
        expect(trust.observations).toHaveLength(1);
    });

    it("malformed detail fails closed, before any write", async () => {
        const trust = makeTrust();

        // An external source that invents a package id.
        const invented = await supersedeGovernedIdentityJudgment(
            {
                ...base,
                prior_package_id: PRIOR_PKG,
                supersession_source: "external_authority_decision",
                superseding_package_id: NEW_PKG,
                superseding_reference: "processing_resolution:res-1",
            },
            trust,
        );
        expect(invented).toEqual({
            status: "refused",
            reason: "malformed_detail:external_source_may_not_name_a_package",
        });

        // A replacement source that names nothing.
        const unnamed = await supersedeGovernedIdentityJudgment(
            { ...base, prior_package_id: PRIOR_PKG, superseding_package_id: null },
            trust,
        );
        expect(unnamed).toEqual({
            status: "refused",
            reason: "malformed_detail:replacement_source_requires_package_id",
        });

        expect(trust.observations).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// 4. Replacement engine generation
// ---------------------------------------------------------------------------

describe("P16-4 — a replacement package supersedes the prior one", () => {
    const NEW_HASH = "b".repeat(64);

    function twoGenerations() {
        return [
            row({ id: "res-1", generation_id: PRIOR_GEN, decided_by: "engine", operator_id: null }),
            row({
                id: "res-2",
                generation_id: NEW_GEN,
                input_facts_hash: NEW_HASH,
                decided_by: "engine",
                operator_id: null,
                created_at: "2026-08-05T11:00:00.000Z",
            } as Partial<ProcessingResolutionRow>),
        ];
    }

    it("names the replacement package and the prior generation", async () => {
        const trust = makeTrust();
        const store = makeStore(twoGenerations());

        const outcome = await supersedeForReplacementPackage(store.client(), {
            orgId: ORG,
            caseId: CASE,
            subjectRef: "parent-1",
            replacementGenerationId: NEW_GEN,
            replacementPackageId: NEW_PKG,
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(outcome).toMatchObject({ status: "superseded", priorPackageId: PRIOR_PKG });
        const o = trust.observations[0]!;
        expect(o.package_id).toBe(PRIOR_PKG);
        expect(o.detail.superseding_package_id).toBe(NEW_PKG);
        expect(o.detail.supersession_source).toBe("replacement_decision_package");
        expect(o.detail.reason).toBe("replacement_engine_generation");
        expect(o.detail.prior_generation_id).toBe(PRIOR_GEN);
        expect(o.detail.replacement_generation_id).toBe(NEW_GEN);
        // A replacement is the system's act, not an operator's.
        expect(o.observed_by_actor_type).toBe("system");
        expect(o.observed_by_actor_id).toBeNull();
    });

    it("does nothing when there is no prior generation for the subject", async () => {
        const trust = makeTrust();
        const store = makeStore([twoGenerations()[1]!]);

        const outcome = await supersedeForReplacementPackage(store.client(), {
            orgId: ORG,
            caseId: CASE,
            subjectRef: "parent-1",
            replacementGenerationId: NEW_GEN,
            replacementPackageId: NEW_PKG,
            deps: lineageDeps(trust, {}),
        });

        expect(outcome).toEqual({ status: "no_lineage", reason: "no_prior_generation_for_subject" });
        expect(trust.observations).toHaveLength(0);
    });

    it("refuses when the replacement resolves to the SAME governed judgment", async () => {
        const trust = makeTrust();
        // Same facts hash in both generations: one adoption identity, one package.
        const store = makeStore([
            row({ id: "res-1", generation_id: PRIOR_GEN, decided_by: "engine", operator_id: null }),
            row({
                id: "res-2",
                generation_id: NEW_GEN,
                decided_by: "engine",
                operator_id: null,
                created_at: "2026-08-05T11:00:00.000Z",
            } as Partial<ProcessingResolutionRow>),
        ]);

        const outcome = await supersedeForReplacementPackage(store.client(), {
            orgId: ORG,
            caseId: CASE,
            subjectRef: "parent-1",
            replacementGenerationId: NEW_GEN,
            // The recapture returned the SAME package.
            replacementPackageId: PRIOR_PKG,
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(outcome).toEqual({ status: "refused", reason: "identical_adoption_identity" });
        expect(trust.observations).toHaveLength(0);
    });

    it("a FAILED replacement capture supersedes nothing", async () => {
        const { captureIdentityGenerationJudgments } = await import(
            "@/lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration"
        );
        const trust = makeTrust();
        const store = makeStore(twoGenerations());
        const spies = silence();

        await captureIdentityGenerationJudgments(store.client(), {
            orgId: ORG,
            caseId: CASE,
            generationId: NEW_GEN,
            resolutionRows: [
                {
                    ...(twoGenerations()[1] as unknown as ProcessingResolutionRow),
                },
            ],
            deps: {
                // Capture fails, so no replacement package ever exists.
                repository: {
                    async insertContract() {
                        throw new Error("trust db down");
                    },
                    async advanceContractLifecycle() {},
                    async insertPackage() {},
                    async insertObservation() {},
                    async insertReasoningUsage() {},
                },
                lookup: async () => null,
                nowIso: NOW,
                clock: () => 0,
                now: () => NOW,
                lineage: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
            },
        });

        expect(trust.observations).toHaveLength(0);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 5. Durable lineage gaps
// ---------------------------------------------------------------------------

describe("P16-5 — a Trust failure produces a durable, readiness-neutral gap", () => {
    function failingTrust() {
        const trust = makeTrust();
        return {
            ...trust,
            repository: {
                ...trust.repository,
                async insertObservation() {
                    throw new Error("trust db down");
                },
            } as TrustRepository,
        };
    }

    it("the correction stays authoritative and a gap carries the owed lineage", async () => {
        const trust = failingTrust();
        const store = makeStore([row()]);
        const spies = silence();

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: { ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }), repository: trust.repository },
        });

        expect(outcome.status).toBe("deferred");
        // Processing was never rewritten.
        expect(store.resolutionWrites).toEqual([]);
        expect((store.resolutions[0] as Row).decision_action).toBe("link_existing");

        expect(store.exceptions).toHaveLength(1);
        const exc = store.exceptions[0]!;
        expect(exc.exception_type).toBe(TRUST_IDENTITY_LINEAGE_GAP_TYPE);
        expect(exc.severity).toBe("warning");

        const snapshot = exc.subject_ref as Record<string, unknown>;
        expect(snapshot.prior_package_id).toBe(PRIOR_PKG);
        expect(snapshot.prior_adoption_id).toBe(adoptionIdFor());
        expect(snapshot.reason).toBe("operator_selected_other_candidate");
        expect(snapshot.actor_id).toBe("user-1");
        expect(snapshot.superseding_reference).toBe("processing_resolution:res-1");

        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("repeated failures accumulate on ONE row rather than accumulating rows", async () => {
        const trust = failingTrust();
        const store = makeStore([row()]);
        const spies = silence();
        const deps = { ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }), repository: trust.repository };

        for (let i = 0; i < 3; i += 1) {
            await recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG,
                caseId: CASE,
                resolutionId: "res-1",
                actorId: "user-1",
                deps,
            });
        }

        expect(store.exceptions).toHaveLength(1);
        expect((store.exceptions[0]!.subject_ref as Record<string, unknown>).retry_count).toBe(2);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("a prior judgment that is not governed YET defers rather than guessing", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        const spies = silence();

        const outcome = await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            // No governed package for this adoption identity — its capture gap is open.
            deps: lineageDeps(trust, {}),
        });

        expect(outcome.status).toBe("deferred");
        const snapshot = store.exceptions[0]!.subject_ref as Record<string, unknown>;
        expect(snapshot.failure_class).toBe("prior_package_absent");
        expect(snapshot.prior_package_id).toBeNull();
        expect(trust.observations).toHaveLength(0);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the gap type is registered so every readiness projection excludes it", () => {
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_IDENTITY_LINEAGE_GAP_TYPE);
        expect(TRUST_IDENTITY_LINEAGE_GAP_TYPE).toBe("trust_identity_lineage_governance_gap");
    });
});

// ---------------------------------------------------------------------------
// 6. Reconciliation
// ---------------------------------------------------------------------------

describe("P16-6 — reconciliation completes deferred supersession", () => {
    async function deferOne(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
        const store = makeStore([row()]);
        const spies = silence();
        const failing = {
            ...trust.repository,
            async insertObservation() {
                throw new Error("trust db down");
            },
        } as TrustRepository;
        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: { ...lineageDeps(trust, governed), repository: failing },
        });
        spies.warn.mockRestore();
        spies.error.mockRestore();
        return store;
    }

    it("appends exactly one observation and resolves the gap", async () => {
        const trust = makeTrust();
        const governed = { [adoptionIdFor()]: PRIOR_PKG };
        const store = await deferOne(trust, governed);

        const sweep = await reconcileIdentityLineageGaps(store.client(), {
            orgId: ORG,
            deps: lineageDeps(trust, governed),
        });

        expect(sweep).toMatchObject({ scanned: 1, resolved: 1 });
        expect(trust.observations).toHaveLength(1);
        expect(store.exceptions[0]!.resolved_at).toBe(NOW);
        // Processing was never rewritten.
        expect(store.resolutionWrites).toEqual([]);
    });

    it("a second sweep finds the existing observation and appends nothing", async () => {
        const trust = makeTrust();
        const governed = { [adoptionIdFor()]: PRIOR_PKG };
        const store = await deferOne(trust, governed);

        await reconcileIdentityLineageGaps(store.client(), { orgId: ORG, deps: lineageDeps(trust, governed) });
        const second = await reconcileIdentityLineageGaps(store.client(), {
            orgId: ORG,
            deps: lineageDeps(trust, governed),
        });

        expect(second.scanned).toBe(0);
        expect(trust.observations).toHaveLength(1);
    });

    it("completes lineage deferred because the prior package did not exist yet", async () => {
        const trust = makeTrust();
        // Deferred with NO governed package at all.
        const store = await deferOne(trust, {});
        expect((store.exceptions[0]!.subject_ref as Record<string, unknown>).failure_class).toBe(
            "prior_package_absent",
        );

        // Still absent: the gap waits rather than superseding something else.
        const early = await reconcileIdentityLineageGaps(store.client(), {
            orgId: ORG,
            deps: lineageDeps(trust, {}),
        });
        expect(early).toMatchObject({ scanned: 1, priorPackageAbsent: 1, resolved: 0 });
        expect(trust.observations).toHaveLength(0);

        // The capture gap reconciles; the package now exists.
        const later = await reconcileIdentityLineageGaps(store.client(), {
            orgId: ORG,
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });
        expect(later).toMatchObject({ scanned: 1, resolved: 1 });
        expect(trust.observations).toHaveLength(1);
    });

    it("closes a gap whose refusal is deterministic rather than retrying forever", async () => {
        const trust = makeTrust();
        const governed = { [adoptionIdFor()]: PRIOR_PKG };
        const store = await deferOne(trust, governed);

        // A different supersession landed meanwhile: this one can never succeed.
        await supersedeGovernedIdentityJudgment(
            {
                org_id: ORG,
                prior_package_id: PRIOR_PKG,
                supersession_source: "replacement_decision_package",
                superseding_package_id: NEW_PKG,
                superseding_reference: null,
                reason: "replacement_engine_generation",
                actor_type: "system",
                actor_id: null,
                channel: "system",
                correlation_id: CASE,
            },
            trust,
        );

        const sweep = await reconcileIdentityLineageGaps(store.client(), {
            orgId: ORG,
            deps: lineageDeps(trust, governed),
        });

        expect(sweep).toMatchObject({ scanned: 1, abandoned: 1 });
        expect(store.exceptions[0]!.resolved_at).toBe(NOW);
        expect(trust.observations).toHaveLength(1);
    });

    it("preserves the ORIGINAL actor rather than whoever ran reconciliation", async () => {
        const trust = makeTrust();
        const governed = { [adoptionIdFor()]: PRIOR_PKG };
        const store = await deferOne(trust, governed);

        await reconcileIdentityLineageGaps(store.client(), { orgId: ORG, deps: lineageDeps(trust, governed) });

        expect(trust.observations[0]!.observed_by_actor_type).toBe("operator");
        expect(trust.observations[0]!.observed_by_actor_id).toBe("user-1");
    });

    it("a concurrent reconciler loses the claim rather than double-appending", async () => {
        const trust = makeTrust();
        const governed = { [adoptionIdFor()]: PRIOR_PKG };
        const store = await deferOne(trust, governed);
        const { listUnresolvedIdentityLineageGaps: list } = await import(
            "@/lib/pos/processingIdentity/trustAdapter/identityLineageGapDb"
        );
        const [gap] = await list(store.client(), { orgId: ORG });

        const [a, b] = await Promise.all([
            reconcileOneIdentityLineageGap(store.client(), { gap: gap!, deps: lineageDeps(trust, governed) }),
            reconcileOneIdentityLineageGap(store.client(), { gap: gap!, deps: lineageDeps(trust, governed) }),
        ]);

        expect([a.status, b.status].filter((s) => s === "claim_lost")).toHaveLength(1);
        expect(trust.observations).toHaveLength(1);
    });

    it("never touches a table other than exceptions", async () => {
        const trust = makeTrust();
        const governed = { [adoptionIdFor()]: PRIOR_PKG };
        const store = await deferOne(trust, governed);
        await reconcileIdentityLineageGaps(store.client(), { orgId: ORG, deps: lineageDeps(trust, governed) });
        expect(store.forbiddenTables).toEqual([]);
        expect(store.resolutionWrites).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// 7. Privacy
// ---------------------------------------------------------------------------

describe("P16-7 — no identity or operator text reaches Trust", () => {
    const UNSAFE_NOTE =
        "Alex Lyons at alex@lyons.example, born 2019-04-11, lives at 42 Elm Street — confirmed by phone +1 415 555 0134.";

    it("an operator's own words never enter the observation or the gap", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({
                decision_action: "create_new",
                provisional: {
                    create_new_override: {
                        reason: UNSAFE_NOTE,
                        reasonCode: "operator_create_new_override",
                        rejectedCandidateIds: ["rec-1"],
                        decidedAt: NOW,
                        operatorId: "user-1",
                    },
                },
            }),
        ]);

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        const serialized = JSON.stringify(trust.observations);
        for (const leak of ["Alex", "Lyons", "@lyons", "2019-04-11", "Elm Street", "555", "confirmed by phone"]) {
            expect(serialized).not.toContain(leak);
        }
        // Only the bounded category survives.
        expect(trust.observations[0]!.detail.reason).toBe("operator_overrode_with_create_new");
    });

    it("the reason vocabulary is closed and an unknown effect degrades safely", () => {
        // Keyed on the classified EFFECT, not on `decision_action`. Keying on
        // the action is what let `link_existing` map to a reason named
        // "confirmed" while the lifecycle recorded a supersession.
        expect(identitySupersessionReasonForEffect("confirmation")).toBe("operator_confirmed_engine_judgment");
        expect(identitySupersessionReasonForEffect("engine_deferred_review")).toBe("operator_resolved_engine_review");
        expect(identitySupersessionReasonForEffect("operator_deferred")).toBe("operator_deferred_decision");
        expect(identitySupersessionReasonForEffect("override_existing_candidate")).toBe(
            "operator_selected_other_candidate",
        );
        expect(identitySupersessionReasonForEffect("override_create_new")).toBe("operator_overrode_with_create_new");
        expect(identitySupersessionReasonForEffect("rejection")).toBe("operator_rejected_candidate");
        // Never the raw string.
        expect(identitySupersessionReasonForEffect(UNSAFE_NOTE)).toBe("operator_corrected_identity");
        expect(identitySupersessionReasonForEffect(null)).toBe("operator_corrected_identity");
        expect(IDENTITY_SUPERSESSION_REASONS).toContain("replacement_engine_generation");
    });

    it("unsafe text cannot be smuggled through detail, even by a direct caller", () => {
        const unsafe = buildSupersessionDetail({
            supersession_source: "external_authority_decision",
            superseding_reference: `processing_resolution:res-1 ${UNSAFE_NOTE}`,
            reason: "operator_overrode_with_create_new",
        });
        expect(unsafe).toEqual({ ok: false, reason: "unsafe_superseding_reference" });

        const unsafeReason = buildSupersessionDetail({
            supersession_source: "external_authority_decision",
            superseding_reference: "processing_resolution:res-1",
            reason: UNSAFE_NOTE,
        });
        expect(unsafeReason).toEqual({ ok: false, reason: "unsafe_reason_category" });

        const unsafeContext = buildSupersessionDetail({
            supersession_source: "external_authority_decision",
            superseding_reference: "processing_resolution:res-1",
            reason: "operator_overrode_with_create_new",
            context: { note: UNSAFE_NOTE },
        });
        expect(unsafeContext).toEqual({ ok: false, reason: "unsafe_context_value:note" });
    });

    it("the durable gap carries no operator note either", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({
                decision_action: "create_new",
                provisional: { create_new_override: { reason: UNSAFE_NOTE } },
            }),
        ]);
        const spies = silence();

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: {
                    ...trust.repository,
                    async insertObservation() {
                        throw new Error("trust db down");
                    },
                } as TrustRepository,
            },
        });

        const serialized = JSON.stringify(store.exceptions);
        for (const leak of ["Alex", "Lyons", "@lyons", "2019-04-11", "Elm Street", "555"]) {
            expect(serialized).not.toContain(leak);
        }
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

// ---------------------------------------------------------------------------
// 8. Lifecycle projection
// ---------------------------------------------------------------------------

describe("P16-8 — the projection reports supersession deterministically", () => {
    const pkg: LifecycleSubjectPackage = {
        id: PRIOR_PKG,
        org_id: ORG,
        outcome: "recommended",
        created_at_iso: "2026-08-05T09:00:00.000Z",
        supersedes_package_id: null,
    };

    function obs(overrides: Partial<LifecycleObservationRecord> = {}): LifecycleObservationRecord {
        return {
            id: "obs-1",
            org_id: ORG,
            package_id: PRIOR_PKG,
            observation_kind: "superseded",
            observed_by_actor_type: "operator",
            observed_by_actor_id: "user-1",
            channel: "system",
            execution_reference: null,
            detail: {
                supersession_source: "external_authority_decision",
                superseding_package_id: null,
                superseding_reference: "processing_resolution:res-1",
                reason: "operator_selected_other_candidate",
            },
            observed_at_iso: NOW,
            ...overrides,
        };
    }

    it("projects `proposed` with no supersession", () => {
        const r = projectDecisionPackageLifecycle({ package: pkg, observations: [], projectedAtIso: NOW });
        expect(r.ok && r.projection.disposition).toBe("proposed");
        expect(r.ok && r.projection.supersession.superseded).toBe(false);
    });

    it("projects `superseded` for an operator correction with NO replacement package", () => {
        const r = projectDecisionPackageLifecycle({ package: pkg, observations: [obs()], projectedAtIso: NOW });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.projection.disposition).toBe("superseded");
        expect(r.projection.supersession).toMatchObject({
            superseded: true,
            superseding_package_id: null,
            source: "external_authority_decision",
            superseding_reference: "processing_resolution:res-1",
            reason: "operator_selected_other_candidate",
            lineage_verified: false,
        });
        expect(r.projection.operator_action_available).toBe(false);
    });

    it("projects `superseded` for a replacement package, with lineage verified", () => {
        const replacement = obs({
            detail: {
                supersession_source: "replacement_decision_package",
                superseding_package_id: NEW_PKG,
                superseding_reference: null,
                reason: "replacement_engine_generation",
            },
        });
        const r = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [replacement],
            projectedAtIso: NOW,
            supersedingPackages: { [NEW_PKG]: { id: NEW_PKG, org_id: ORG, supersedes_package_id: null } },
        });
        expect(r.ok && r.projection.supersession).toMatchObject({
            superseded: true,
            superseding_package_id: NEW_PKG,
            source: "replacement_decision_package",
            lineage_verified: true,
        });
    });

    it("an ACCEPTED prior package still projects superseded", () => {
        const accepted: LifecycleObservationRecord = {
            ...obs({ id: "obs-0", observation_kind: "accepted", detail: {} }),
            observed_at_iso: "2026-08-05T11:00:00.000Z",
        };
        const r = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [accepted, obs()],
            projectedAtIso: NOW,
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.projection.review.state).toBe("accepted");
        // Standing outranks review.
        expect(r.projection.disposition).toBe("superseded");
    });

    it("duplicate observations do not change the projection", () => {
        const one = projectDecisionPackageLifecycle({ package: pkg, observations: [obs()], projectedAtIso: NOW });
        const many = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [obs(), obs({ id: "obs-2" }), obs({ id: "obs-3" })],
            projectedAtIso: NOW,
        });
        expect(one.ok && many.ok).toBe(true);
        if (!one.ok || !many.ok) return;
        expect(many.projection.disposition).toBe(one.projection.disposition);
        expect(many.projection.supersession.superseding_reference).toBe(
            one.projection.supersession.superseding_reference,
        );
    });

    it("equal timestamps and shuffled input produce the same projection", () => {
        const rows = [obs({ id: "obs-c" }), obs({ id: "obs-a" }), obs({ id: "obs-b" })];
        const forward = projectDecisionPackageLifecycle({ package: pkg, observations: rows, projectedAtIso: NOW });
        const reversed = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [...rows].reverse(),
            projectedAtIso: NOW,
        });
        expect(forward.ok && reversed.ok).toBe(true);
        if (!forward.ok || !reversed.ok) return;
        expect(reversed.projection).toEqual(forward.projection);
        // The canonical (observed_at, id) order picks the same evidence row.
        expect(forward.projection.supersession.evidence?.observation_id).toBe("obs-a");
    });

    it("reports contradictory lineage rather than choosing", () => {
        const r = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [
                obs(),
                obs({
                    id: "obs-2",
                    detail: {
                        supersession_source: "replacement_decision_package",
                        superseding_package_id: NEW_PKG,
                        superseding_reference: null,
                        reason: "replacement_engine_generation",
                    },
                }),
            ],
            projectedAtIso: NOW,
        });
        expect(r.ok).toBe(false);
        if (r.ok) return;
        expect(r.error.code).toBe("CONTRADICTORY_SUPERSESSION");
    });

    it("rejects self-supersession, cross-org lineage and a cycle", () => {
        const named = (id: string) =>
            obs({
                detail: {
                    supersession_source: "replacement_decision_package",
                    superseding_package_id: id,
                    superseding_reference: null,
                    reason: "replacement_engine_generation",
                },
            });

        const self = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [named(PRIOR_PKG)],
            projectedAtIso: NOW,
        });
        expect(!self.ok && self.error.code).toBe("SELF_SUPERSESSION");

        const crossOrg = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [named(NEW_PKG)],
            projectedAtIso: NOW,
            supersedingPackages: { [NEW_PKG]: { id: NEW_PKG, org_id: "org-2", supersedes_package_id: null } },
        });
        expect(!crossOrg.ok && crossOrg.error.code).toBe("CROSS_ORG_SUPERSESSION");

        const cycle = projectDecisionPackageLifecycle({
            package: { ...pkg, supersedes_package_id: NEW_PKG },
            observations: [named(NEW_PKG)],
            projectedAtIso: NOW,
            supersedingPackages: { [NEW_PKG]: { id: NEW_PKG, org_id: ORG, supersedes_package_id: PRIOR_PKG } },
        });
        expect(!cycle.ok && cycle.error.code).toBe("SUPERSESSION_CYCLE");
    });

    it("an external supersession with no reference fails closed", () => {
        const r = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [
                obs({
                    detail: {
                        supersession_source: "external_authority_decision",
                        superseding_package_id: null,
                        superseding_reference: null,
                        reason: "operator_selected_other_candidate",
                    },
                }),
            ],
            projectedAtIso: NOW,
        });
        expect(!r.ok && r.error.code).toBe("MISSING_SUPERSESSION_REFERENCE");
    });

    it("history written before the source existed still requires a package id", () => {
        const r = projectDecisionPackageLifecycle({
            package: pkg,
            observations: [obs({ detail: { reason: "legacy" } })],
            projectedAtIso: NOW,
        });
        expect(!r.ok && r.error.code).toBe("MISSING_SUPERSEDING_PACKAGE_ID");
    });
});

// ---------------------------------------------------------------------------
// 9. Measurement and authority
// ---------------------------------------------------------------------------

describe("P16-9 — supersession is lineage, not a new governed decision", () => {
    it("creates no Decision Package and no reasoning usage row", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(trust.usage).toHaveLength(0);
        expect(trust.observations).toHaveLength(1);
    });

    it("repeat supersession cannot inflate observation-derived metrics", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        const deps = lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG });

        for (let i = 0; i < 5; i += 1) {
            await recordOperatorDecisionLifecycle(store.client(), {
                orgId: ORG,
                caseId: CASE,
                resolutionId: "res-1",
                actorId: "user-1",
                deps,
            });
        }

        expect(trust.observations).toHaveLength(1);
        expect(trust.usage).toHaveLength(0);
    });

    it("a FAILED supersession records no completed lifecycle change", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        const spies = silence();

        await recordOperatorDecisionLifecycle(store.client(), {
            orgId: ORG,
            caseId: CASE,
            resolutionId: "res-1",
            actorId: "user-1",
            deps: {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: {
                    ...trust.repository,
                    async insertObservation() {
                        throw new Error("trust db down");
                    },
                } as TrustRepository,
            },
        });

        expect(trust.observations).toHaveLength(0);
        const r = projectDecisionPackageLifecycle({
            package: {
                id: PRIOR_PKG,
                org_id: ORG,
                outcome: "recommended",
                created_at_iso: NOW,
                supersedes_package_id: null,
            },
            observations: [],
            projectedAtIso: NOW,
        });
        expect(r.ok && r.projection.disposition).toBe("proposed");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the adoption identity of a row is the identity Phase 1.5 captured", () => {
        expect(adoptionIdForResolutionRow(row() as unknown as ProcessingResolutionRow)).toBe(adoptionIdFor());
    });
});

// ---------------------------------------------------------------------------
// 10. The operator service seam
// ---------------------------------------------------------------------------

describe("P16-10 — the operator service commits first, then supersedes", () => {
    function operatorDeps(
        store: ReturnType<typeof makeStore>,
        trustLineage: OperatorReviewDeps["trustLineage"],
    ): OperatorReviewDeps {
        return {
            supabase: store.client(),
            orgId: ORG,
            actorId: "user-1",
            actorAuthorized: true,
            executorPorts: {} as OperatorReviewDeps["executorPorts"],
            now: () => NOW,
            trustLineage,
        };
    }

    it("the resolution row is durable before any observation is written", async () => {
        const trust = makeTrust();
        const store = makeStore([row({ decided_by: "engine", operator_id: null, decision_action: null })]);
        const order: string[] = [];
        const observing = {
            ...trust.repository,
            async insertObservation(o: TrustObservationInput) {
                // Read the durable row at the moment Trust is written.
                order.push(`row_decided_by=${(store.resolutions[0] as Row).decided_by}`);
                await trust.repository.insertObservation(o);
            },
        } as TrustRepository;

        const result = await recordResolutionDecision(
            operatorDeps(store, {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: observing,
            }),
            { caseId: CASE, resolutionId: "res-1", decisionAction: "link_existing", selectedCandidateId: "rec-1" },
        );

        expect((store.resolutions[0] as Row).decided_by).toBe("operator");
        expect(order).toEqual(["row_decided_by=operator"]);
        expect(result.trustLineage?.status).toBe("superseded");
        expect(trust.observations).toHaveLength(1);
    });

    it("`trustLineage: false` leaves the Processing decision byte-identical", async () => {
        const withTrust = makeStore([row({ decided_by: "engine", operator_id: null, decision_action: null })]);
        const withoutTrust = makeStore([row({ decided_by: "engine", operator_id: null, decision_action: null })]);
        const trust = makeTrust();

        await recordResolutionDecision(
            operatorDeps(withTrust, lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG })),
            { caseId: CASE, resolutionId: "res-1", decisionAction: "link_existing", selectedCandidateId: "rec-1" },
        );
        const control = await recordResolutionDecision(operatorDeps(withoutTrust, false), {
            caseId: CASE,
            resolutionId: "res-1",
            decisionAction: "link_existing",
            selectedCandidateId: "rec-1",
        });

        expect(control.trustLineage).toBeNull();
        expect(JSON.stringify(withoutTrust.resolutions)).toBe(JSON.stringify(withTrust.resolutions));
    });

    it("a Trust outage does NOT roll back the operator correction", async () => {
        const trust = makeTrust();
        const store = makeStore([row({ decided_by: "engine", operator_id: null, decision_action: null })]);
        const spies = silence();

        const result = await recordResolutionDecision(
            operatorDeps(store, {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: {
                    ...trust.repository,
                    async insertObservation() {
                        throw new Error("trust db down");
                    },
                } as TrustRepository,
            }),
            { caseId: CASE, resolutionId: "res-1", decisionAction: "reject" },
        );

        // The correction stands.
        expect((store.resolutions[0] as Row).decision_action).toBe("reject");
        expect((store.resolutions[0] as Row).decided_by).toBe("operator");
        // And the owed lineage is durable.
        expect(result.trustLineage?.status).toBe("deferred");
        const gaps = await listUnresolvedIdentityLineageGaps(store.client(), { orgId: ORG });
        expect(gaps).toHaveLength(1);
        expect(gaps[0]!.snapshot.reason).toBe("operator_rejected_candidate");

        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});
