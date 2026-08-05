/**
 * Phase 1.6 negative controls.
 *
 * Each group builds the DEFECT the corresponding guarantee forbids and proves it
 * would be caught. A guarantee no test can fail is not a guarantee, and these are
 * the failures the Phase 1.6 suite is measuring.
 *
 * Structural controls read source files rather than behaviour, because the
 * properties they assert — who may import what, who may write which table — have
 * no runtime surface until the day they are violated in production.
 */

import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import { IDENTITY_RESOLVER_VERSION } from "@/lib/identity";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";
import { PROCESSING_IDENTITY_FACT_MATERIAL_VERSION } from "@/lib/pos/processingIdentity/factMaterialProjection";
import { processingIdentitySubjectAdoptionId } from "@/lib/pos/processingIdentity/trustAdapter/identityAdoptionIdentity";
import {
    supersedeForOperatorDecision,
    supersedeForReplacementPackage,
} from "@/lib/pos/processingIdentity/trustAdapter/identityLineageService";
import { identitySupersessionReasonForDecision } from "@/lib/pos/processingIdentity/trustAdapter/identitySupersessionReasons";
import {
    IDENTITY_LINEAGE_GAP_SEVERITY,
    TRUST_IDENTITY_LINEAGE_GAP_TYPE,
} from "@/lib/pos/processingIdentity/trustAdapter/identityLineageGapDb";
import {
    TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES,
    TRUST_IDENTITY_RESOLUTION_GAP_TYPE,
    TRUST_SOURCE_CLASSIFICATION_GAP_TYPE,
} from "@/lib/pos/trustGovernance/gapExceptionTypes";
import { PROCESSING_IDENTITY_SUBJECT_RESOLUTION_CLASS_KEY } from "@/lib/trust/capabilities/processingIdentitySubjectResolution/keys";
import {
    supersedeGovernedIdentityJudgment,
    type ExistingSupersession,
    type PackageLineageLookup,
    type SupersessionObservationLookup,
    type TrustPackageLineageRef,
} from "@/lib/trust/capabilities/processingIdentitySubjectResolution/supersede";
import { projectDecisionPackageLifecycle } from "@/lib/trust/lifecycle/decisionPackageLifecycle";
import type { LifecycleObservationRecord } from "@/lib/trust/lifecycle/lifecycleObservation";
import type { TrustObservationInput, TrustRepository } from "@/lib/trust/persistence/trustDecisionRepository";

const WEB_ROOT = join(__dirname, "..", "..");
const NOW = "2026-08-05T12:00:00.000Z";
const ORG = "org-1";
const CASE = "case-1";
const FACTS_HASH = "a".repeat(64);
const PRIOR_GEN = "gen-1";
const NEW_GEN = "gen-2";
const PRIOR_PKG = "pkg-prior";
const NEW_PKG = "pkg-new";

// ---------------------------------------------------------------------------
// Harness (mirrors the positive suite; the DEFECT is what varies)
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
    const packages = new Map<string, TrustPackageLineageRef>([
        [PRIOR_PKG, { id: PRIOR_PKG, org_id: ORG, contract_id: "contract-prior", supersedes_package_id: null }],
        [NEW_PKG, { id: NEW_PKG, org_id: ORG, contract_id: "contract-new", supersedes_package_id: null }],
    ]);
    const packageLookup: PackageLineageLookup = async ({ package_id }) => packages.get(package_id) ?? null;
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
    return { repository, observations, packages, packageLookup, observationLookup };
}

type Row = Record<string, unknown>;

function makeStore(resolutions: Row[] = []) {
    const exceptions: Row[] = [];
    const resolutionWrites: string[] = [];
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
                        if (table === "processing_resolutions") for (const r of hits) resolutionWrites.push(String(r.id));
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
                        const out = resolve().data as Row[];
                        return Promise.resolve({ data: out[0] ?? null, error: out[0] ? null : { message: "no_row" } });
                    },
                    then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) =>
                        Promise.resolve(resolve()).then(ok, err),
                };
                return api;
            },
        }) as unknown as SupabaseClient;
    return { client, exceptions, resolutions, resolutionWrites };
}

function row(overrides: Partial<ProcessingResolutionRow> = {}): Row {
    return {
        id: "res-1", org_id: ORG, case_id: CASE, generation_id: PRIOR_GEN,
        input_facts_hash: FACTS_HASH, subject_ref: "parent-1", subject_role: "parent",
        provisional: {}, candidates: [], decision_action: "link_existing",
        selected_candidate_id: "rec-1", decided_by: "operator", operator_id: "user-1",
        policy_version: null, resolver_version: IDENTITY_RESOLVER_VERSION,
        stale_at: null, superseded_by: null, retention_class: "uncommitted_submission",
        created_at: "2026-08-05T10:00:00.000Z",
        ...overrides,
    } as Row;
}

function adoptionIdFor(subjectRef = "parent-1", factsHash = FACTS_HASH): string {
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

function lineageDeps(trust: ReturnType<typeof makeTrust>, governed: Record<string, string>) {
    return {
        repository: trust.repository,
        packageLookup: trust.packageLookup,
        observationLookup: trust.observationLookup,
        lookup: async ({ org_id, contract_id }: { org_id: string; contract_id: string }) => {
            if (org_id !== ORG) return null;
            const packageId = governed[contract_id];
            return packageId ? { contract_id, package_id: packageId } : null;
        },
        now: () => NOW,
    };
}

function silence() {
    return {
        warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
        error: vi.spyOn(console, "error").mockImplementation(() => {}),
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

// ---------------------------------------------------------------------------

describe("P16-NC-1 — superseding before the correction is durable would be caught", () => {
    it("a row whose decision has NOT committed produces no observation", async () => {
        const trust = makeTrust();
        // The defect: the caller asked for a decision, but the row still says engine.
        const store = makeStore([row({ decided_by: "engine", operator_id: null })]);

        const outcome = await supersedeForOperatorDecision(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });

        expect(outcome).toEqual({ status: "no_lineage", reason: "operator_decision_not_durable" });
        expect(trust.observations).toHaveLength(0);

        // Control: the SAME call on a durable row does supersede, so the guard
        // is the difference rather than a broken harness.
        const durable = makeStore([row()]);
        const ok = await supersedeForOperatorDecision(durable.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });
        expect(ok.status).toBe("superseded");
    });

    it("the service re-reads the DURABLE row and never trusts a caller's copy", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts"),
            "utf8",
        );
        expect(src).toContain("findResolutionById");
        expect(src).toContain('row.decided_by !== "operator"');
    });
});

describe("P16-NC-2 — an operator decision becoming a deterministic package would be caught", () => {
    it("the lineage path creates no contract, package or reasoning usage", async () => {
        const created: string[] = [];
        const trust = makeTrust();
        const store = makeStore([row()]);

        await supersedeForOperatorDecision(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
            deps: {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: {
                    async insertContract() { created.push("contract"); },
                    async advanceContractLifecycle() {},
                    async insertPackage() { created.push("package"); },
                    async insertObservation(o) { await trust.repository.insertObservation(o); },
                    async insertReasoningUsage() { created.push("usage"); },
                } as TrustRepository,
            },
        });

        expect(created).toEqual([]);
        expect(trust.observations).toHaveLength(1);
    });

    it("no lineage module imports the decision-contract or runtime seam", () => {
        for (const file of [
            "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/supersede.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            for (const forbidden of ["createDecisionContract", "trustRuntime", "executeDecisionContract"]) {
                expect(imports.some((i) => i.includes(forbidden))).toBe(false);
            }
        }
    });

    it("Phase 1.5 still SKIPS an operator-decided row rather than governing it", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration.ts"),
            "utf8",
        );
        expect(src).toContain("operator_decision_not_engine_output");
        expect(src).toMatch(/row\.decided_by === "operator"/);
    });
});

describe("P16-NC-3 — superseding before the replacement package exists would be caught", () => {
    it("lineage runs only on the successful-capture branch", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration.ts"),
            "utf8",
        );
        const successBranch = src.indexOf('result.status === "governed" || result.status === "already_governed"');
        // The CALL SITE, not the import at the top of the file.
        const lineageCall = src.indexOf("await supersedeForReplacementPackage(");
        const gapBranch = src.indexOf("await recordIdentityGovernanceGap(");
        expect(successBranch).toBeGreaterThan(-1);
        expect(lineageCall).toBeGreaterThan(-1);
        expect(gapBranch).toBeGreaterThan(-1);
        // The call sits INSIDE the success branch, before the gap branch.
        expect(lineageCall).toBeGreaterThan(successBranch);
        expect(lineageCall).toBeLessThan(gapBranch);
    });

    it("a capture that produced only a gap supersedes nothing", async () => {
        const { captureIdentityGenerationJudgments } = await import(
            "@/lib/pos/processingIdentity/trustAdapter/captureIdentityGeneration"
        );
        const trust = makeTrust();
        const store = makeStore([row({ decided_by: "engine", operator_id: null })]);
        const spies = silence();

        const result = await captureIdentityGenerationJudgments(store.client(), {
            orgId: ORG, caseId: CASE, generationId: NEW_GEN,
            resolutionRows: [
                row({
                    id: "res-2", generation_id: NEW_GEN, input_facts_hash: "b".repeat(64),
                    decided_by: "engine", operator_id: null,
                }) as unknown as ProcessingResolutionRow,
            ],
            deps: {
                repository: {
                    async insertContract() { throw new Error("trust db down"); },
                    async advanceContractLifecycle() {},
                    async insertPackage() {},
                    async insertObservation() {},
                    async insertReasoningUsage() {},
                },
                lookup: async () => null,
                nowIso: NOW, clock: () => 0, now: () => NOW,
                lineage: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
            },
        });

        expect(result.subjects[0]!.status).toBe("not_governed");
        expect(trust.observations).toHaveLength(0);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

describe("P16-NC-4 — duplicate observations being allowed would be caught", () => {
    it("a permissive store DOES duplicate; the enforcing one does not", async () => {
        const input = {
            org_id: ORG,
            prior_package_id: PRIOR_PKG,
            supersession_source: "replacement_decision_package" as const,
            superseding_package_id: NEW_PKG,
            superseding_reference: null,
            reason: "replacement_engine_generation",
            actor_type: "system" as const,
            actor_id: null,
            channel: "system",
            correlation_id: CASE,
        };
        const blind: SupersessionObservationLookup = async () => [];

        const permissive = makeTrust({ enforcePrimaryKey: false });
        await supersedeGovernedIdentityJudgment(input, { ...permissive, observationLookup: blind });
        await supersedeGovernedIdentityJudgment(input, { ...permissive, observationLookup: blind });
        expect(permissive.observations).toHaveLength(2);

        const enforcing = makeTrust();
        await supersedeGovernedIdentityJudgment(input, { ...enforcing, observationLookup: blind });
        await supersedeGovernedIdentityJudgment(input, { ...enforcing, observationLookup: blind });
        expect(enforcing.observations).toHaveLength(1);
    });

    it("a duplicate that DID land would be visible to the projection", () => {
        const dup = (id: string): LifecycleObservationRecord => ({
            id, org_id: ORG, package_id: PRIOR_PKG, observation_kind: "superseded",
            observed_by_actor_type: "system", observed_by_actor_id: null, channel: "system",
            execution_reference: null,
            detail: {
                supersession_source: "replacement_decision_package",
                superseding_package_id: NEW_PKG, superseding_reference: null,
                reason: "replacement_engine_generation",
            },
            observed_at_iso: NOW,
        });
        const r = projectDecisionPackageLifecycle({
            package: { id: PRIOR_PKG, org_id: ORG, outcome: "recommended", created_at_iso: NOW, supersedes_package_id: null },
            observations: [dup("o1"), dup("o2")],
            projectedAtIso: NOW,
        });
        // Equivalent duplicates are idempotent; the COUNT is what exposes them.
        expect(r.ok && r.projection.observation_count).toBe(2);
        expect(r.ok && r.projection.disposition).toBe("superseded");
    });
});

describe("P16-NC-5 — superseding another subject would be caught", () => {
    it("only the requested subject's prior package is superseded", async () => {
        const trust = makeTrust();
        const store = makeStore([
            row({ id: "res-1", subject_ref: "parent-1", generation_id: PRIOR_GEN, decided_by: "engine", operator_id: null }),
            row({ id: "res-2", subject_ref: "child-1", generation_id: PRIOR_GEN, decided_by: "engine", operator_id: null }),
            row({
                id: "res-3", subject_ref: "parent-1", generation_id: NEW_GEN,
                input_facts_hash: "b".repeat(64), decided_by: "engine", operator_id: null,
                created_at: "2026-08-05T11:00:00.000Z",
            } as Partial<ProcessingResolutionRow>),
        ]);
        const governed = {
            [adoptionIdFor("parent-1")]: PRIOR_PKG,
            [adoptionIdFor("child-1")]: "pkg-child",
        };
        trust.packages.set("pkg-child", {
            id: "pkg-child", org_id: ORG, contract_id: "contract-child", supersedes_package_id: null,
        });

        await supersedeForReplacementPackage(store.client(), {
            orgId: ORG, caseId: CASE, subjectRef: "parent-1",
            replacementGenerationId: NEW_GEN, replacementPackageId: NEW_PKG,
            deps: lineageDeps(trust, governed),
        });

        expect(trust.observations).toHaveLength(1);
        expect(trust.observations[0]!.package_id).toBe(PRIOR_PKG);
        // The defect this rules out: a case-wide sweep.
        expect(trust.observations.some((o) => o.package_id === "pkg-child")).toBe(false);
    });

    it("the prior-package lookup is by adoption identity, never 'latest for case'", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts"),
            "utf8",
        );
        expect(src).toContain("adoptionIdForResolutionRow");
        // The lookup key IS the adoption identity, used verbatim as the contract id.
        expect(src).toContain("contract_id: priorAdoptionId");
        // ...and there is no second, weaker way in: exactly one lookup call.
        expect([...src.matchAll(/await lookup\(/g)]).toHaveLength(1);
    });
});

describe("P16-NC-6 — unsafe reason text entering Trust would be caught", () => {
    const UNSAFE = "Alex Lyons alex@lyons.example 2019-04-11";

    it("an unsafe reason is refused before any write", async () => {
        const trust = makeTrust();
        const result = await supersedeGovernedIdentityJudgment(
            {
                org_id: ORG, prior_package_id: PRIOR_PKG,
                supersession_source: "external_authority_decision",
                superseding_package_id: null,
                superseding_reference: "processing_resolution:res-1",
                reason: UNSAFE,
                actor_type: "operator", actor_id: "user-1",
                channel: "system", correlation_id: CASE,
            },
            trust,
        );
        expect(result).toEqual({ status: "refused", reason: "malformed_detail:unsafe_reason_category" });
        expect(trust.observations).toHaveLength(0);
    });

    it("the Processing mapper cannot emit an operator's words", () => {
        expect(identitySupersessionReasonForDecision(UNSAFE)).toBe("operator_corrected_identity");
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identitySupersessionReasons.ts"),
            "utf8",
        );
        // A leaf module: nothing to smuggle a value in through.
        expect([...src.matchAll(/^import\s/gm)]).toEqual([]);
    });

    it("no lineage module reads the operator's free-text override reason", () => {
        for (const file of [
            "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts",
            "lib/pos/processingIdentity/trustAdapter/identityLineageGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
        ]) {
            // Strip comments: the rule is about what the CODE reads, and a doc
            // comment naming the forbidden field is how the rule is explained.
            const src = readFileSync(join(WEB_ROOT, file), "utf8")
                .replace(/\/\*[\s\S]*?\*\//g, "")
                .replace(/\/\/.*$/gm, "");
            for (const field of [
                "create_new_override",
                "readCreateNewOverride",
                "displayName",
                "explanation",
                "provisional",
                "candidates",
            ]) {
                expect(src).not.toContain(field);
            }
        }
    });
});

describe("P16-NC-7 — a Trust failure rolling back the correction would be caught", () => {
    it("the correction survives a Trust failure at every stage of the lineage path", async () => {
        const stages: { name: string; deps: Record<string, unknown> }[] = [
            {
                name: "prior_package_lookup",
                deps: {
                    lookup: async () => {
                        throw new Error("trust db down");
                    },
                },
            },
            {
                name: "existing_supersession_lookup",
                deps: {
                    observationLookup: (async () => {
                        throw new Error("trust db down");
                    }) as SupersessionObservationLookup,
                },
            },
        ];

        for (const stage of stages) {
            const trust = makeTrust();
            const store = makeStore([row()]);
            const spies = silence();
            const before = JSON.stringify(store.resolutions);

            const outcome = await supersedeForOperatorDecision(store.client(), {
                orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
                deps: { ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }), ...stage.deps },
            });

            expect(outcome.status, stage.name).toBe("deferred");
            expect(trust.observations, stage.name).toHaveLength(0);
            // The correction is untouched, at every stage.
            expect(JSON.stringify(store.resolutions), stage.name).toBe(before);
            expect(store.resolutionWrites, stage.name).toEqual([]);
            spies.warn.mockRestore();
            spies.error.mockRestore();
        }
    });

    it("losing BOTH the observation and the gap is loud, and still not a rollback", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        const spies = silence();
        const before = JSON.stringify(store.resolutions);

        // The gap store itself is broken too.
        const brokenClient = {
            from(table: string) {
                if (table === "processing_exceptions") throw new Error("exceptions table down");
                return (store.client() as unknown as { from: (t: string) => unknown }).from(table);
            },
        } as unknown as SupabaseClient;

        const outcome = await supersedeForOperatorDecision(brokenClient, {
            orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
            deps: {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: {
                    ...trust.repository,
                    async insertObservation() { throw new Error("trust db down"); },
                } as TrustRepository,
            },
        });

        expect(outcome.status).toBe("gap_unrecordable");
        expect(spies.error).toHaveBeenCalled();
        expect(JSON.stringify(store.resolutions)).toBe(before);
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });

    it("the service declares no throw path into its caller", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts"),
            "utf8",
        );
        // No bare `throw` outside of the type-level surface.
        expect([...src.matchAll(/^\s*throw\s/gm)]).toEqual([]);
    });
});

describe("P16-NC-8 — lineage gaps affecting readiness would be caught", () => {
    it("the gap is a warning and its type is excluded by the SHARED list", () => {
        expect(IDENTITY_LINEAGE_GAP_SEVERITY).toBe("warning");
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_IDENTITY_LINEAGE_GAP_TYPE);
        // All three capabilities, one list.
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_SOURCE_CLASSIFICATION_GAP_TYPE);
        expect(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).toContain(TRUST_IDENTITY_RESOLUTION_GAP_TYPE);
        expect(new Set(TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES).size).toBe(3);
    });

    it("the readiness count still excludes every gap type by list, not by name", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/pos/processingIdentity/operator/operatorReviewService.ts"),
            "utf8",
        );
        expect(src).toContain("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES");
        expect(src).toMatch(/\.neq\(\s*"exception_type"\s*,\s*gapType\s*\)/);
        // The new type is isolated by REGISTRATION, never by a second literal.
        expect(src).not.toContain("trust_identity_lineage_governance_gap");
    });

    it("no production projection counts processing_exceptions unfiltered", () => {
        const offenders: string[] = [];
        for (const area of ["lib", "app"]) {
            for (const file of sourceFilesUnder(area)) {
                const src = readFileSync(file, "utf8");
                if (!src.includes('.from("processing_exceptions")')) continue;
                const isGapStore =
                    file.includes("GovernanceGapDb") || file.includes("LineageGapDb") || file.includes("attemptsDb");
                if (!isGapStore && !src.includes("TRUST_GOVERNANCE_GAP_EXCEPTION_TYPES")) {
                    offenders.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("a lineage gap never carries a blocker severity or a case-level readiness code", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        const spies = silence();

        await supersedeForOperatorDecision(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
            deps: {
                ...lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
                repository: {
                    ...trust.repository,
                    async insertObservation() { throw new Error("trust db down"); },
                } as TrustRepository,
            },
        });

        expect(store.exceptions[0]!.severity).toBe("warning");
        expect(JSON.stringify(store.exceptions)).not.toContain("child_identity_unconfirmed");
        expect(JSON.stringify(store.exceptions)).not.toContain("blocker");
        spies.warn.mockRestore();
        spies.error.mockRestore();
    });
});

describe("P16-NC-9 — Processing writing the Trust observation table would be caught", () => {
    it("no Processing or route module queries trust_decision_observations", () => {
        const offenders: string[] = [];
        for (const area of ["lib", "app"]) {
            for (const file of sourceFilesUnder(area)) {
                if (file.includes(join("lib", "trust"))) continue;
                // Operational Intelligence reads observations to MEASURE them.
                // That is a read by the measurement layer, not a Processing write.
                if (file.includes(join("lib", "metrics"))) continue;
                const src = readFileSync(file, "utf8");
                if (/\.from\(\s*["']trust_decision_observations["']/.test(src)) {
                    offenders.push(file.replace(WEB_ROOT, ""));
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the measurement layer only READS observations; it never writes one", () => {
        for (const file of sourceFilesUnder(join("lib", "metrics"))) {
            const src = readFileSync(file, "utf8");
            if (!src.includes("trust_decision_observations")) continue;
            expect(src).not.toMatch(/\.insert\(/);
            expect(src).not.toMatch(/\.update\(/);
            expect(src).not.toMatch(/\.delete\(/);
        }
    });

    it("no Processing lineage module queries ANY trust_ table", () => {
        for (const file of [
            "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts",
            "lib/pos/processingIdentity/trustAdapter/identityLineageGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const tables = [...src.matchAll(/\.from\(\s*"([^"]+)"/g)].map((m) => m[1]!);
            for (const table of tables) expect(table.startsWith("trust_")).toBe(false);
        }
    });

    it("the new lineage modules create no lib/trust → Processing dependency", () => {
        for (const file of [
            "lib/trust/lifecycle/supersessionLineage.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/supersede.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            expect(imports.filter((i) => i.startsWith("@/lib/pos/"))).toEqual([]);
        }
    });

    it("lib/trust imports Processing ONLY for the schemas Processing owns", () => {
        // Established since Phase 1.1: Trust references a governed-payload schema
        // by its OWNER rather than restating capability vocabulary. Anything
        // else — a service, an engine, a table module — is a real inversion.
        const allowed = ["governedIdentitySchema", "governedClassificationSchema"];
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = readFileSync(file, "utf8");
            for (const m of src.matchAll(/from\s+"(@\/lib\/pos\/[^"]+)"/g)) {
                const spec = m[1]!;
                if (!allowed.some((a) => spec.endsWith(a))) {
                    offenders.push(`${file.replace(WEB_ROOT, "")} → ${spec}`);
                }
            }
        }
        expect(offenders).toEqual([]);
    });

    it("the observation is written through the ONE canonical writer", () => {
        const src = readFileSync(
            join(WEB_ROOT, "lib/trust/capabilities/processingIdentitySubjectResolution/supersede.ts"),
            "utf8",
        );
        expect(src).toContain("captureOutcome");
        // Never the repository directly.
        expect(src).not.toContain("insertObservation");
    });

    it("`lib/trust` still contains no `.update(` — packages stay immutable", () => {
        const offenders: string[] = [];
        for (const file of sourceFilesUnder(join("lib", "trust"))) {
            const src = readFileSync(file, "utf8");
            if (src.includes(".update(") && !file.endsWith("trustDecisionRepository.ts")) {
                offenders.push(file.replace(WEB_ROOT, ""));
            }
        }
        // The repository's only update is the contract lifecycle advance.
        expect(offenders).toEqual([]);
        const repo = readFileSync(join(WEB_ROOT, "lib/trust/persistence/trustDecisionRepository.ts"), "utf8");
        expect([...repo.matchAll(/\.update\(/g)]).toHaveLength(1);
        expect(repo).toContain("advanceContractLifecycle");
    });
});

describe("P16-NC-10 — Commit Plan, approval and executor authority moving would be caught", () => {
    it("no lineage module imports plan, approval or executor machinery", () => {
        for (const file of [
            "lib/pos/processingIdentity/trustAdapter/identityLineageService.ts",
            "lib/pos/processingIdentity/trustAdapter/identityLineageGapDb.ts",
            "lib/pos/processingIdentity/trustAdapter/reconcileIdentityLineageGaps.ts",
            "lib/trust/capabilities/processingIdentitySubjectResolution/supersede.ts",
        ]) {
            const src = readFileSync(join(WEB_ROOT, file), "utf8");
            const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);
            for (const forbidden of ["/plan", "/executor", "buildCommitPlan", "insertApproval", "executeApprovedPlan"]) {
                expect(imports.some((i) => i.includes(forbidden))).toBe(false);
            }
        }
    });

    it("the observation carries no execution reference and no command binding", async () => {
        const trust = makeTrust();
        const store = makeStore([row()]);
        await supersedeForOperatorDecision(store.client(), {
            orgId: ORG, caseId: CASE, resolutionId: "res-1", actorId: "user-1",
            deps: lineageDeps(trust, { [adoptionIdFor()]: PRIOR_PKG }),
        });
        const o = trust.observations[0]!;
        expect(o.execution_reference).toBeNull();
        const detail = JSON.stringify(o.detail);
        for (const forbidden of ["command", "operation", "plan_id", "approval", "provider", "model"]) {
            expect(detail).not.toContain(forbidden);
        }
    });
});
