import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    IDENTITY_COMMAND_KEYS,
} from "@/lib/pos/processingIdentity/commands";
import {
    type PlanOperationInput,
    bindApproval,
    buildCommitPlan,
    buildPlanDiffView,
    computePlanContentHash,
    evaluateApprovalReadiness,
    approvalBindsToPlan,
    insertApproval,
    insertCommitPlan,
    isApprovalStale,
    loadActiveApproval,
    loadCommitPlan,
    PlanBuildError,
    planToOperationInputs,
    revisePlan,
    supersedePlan,
    toggleInclusion,
    validatePlanInclusion,
} from "@/lib/pos/processingIdentity/plan";

// New-family fixture (person + household + link + child + link_child + lead + participation)
function newFamilyOps(): PlanOperationInput[] {
    return [
        { ref: "p1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createPerson, payload: { email: "a@b.com", first_name: "Ann" }, after: { email: "a@b.com" }, reason: "no candidate" },
        { ref: "h1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createHousehold, payload: { household_name: "Ann Household" }, after: { name: "Ann Household" } },
        { ref: "l1", opKind: "link", commandKey: IDENTITY_COMMAND_KEYS.linkPersonToHousehold, payload: { person_id: "@p1", household_id: "@h1" }, dependsOnRefs: ["p1", "h1"] },
        { ref: "c1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createChild, payload: { household_id: "@h1", display_name: "Kid" }, dependsOnRefs: ["h1"], after: { display_name: "Kid" } },
        { ref: "lead1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createLead, payload: { household_id: "@h1", primary_person_id: "@p1", name: "Ann Household — Lead" }, dependsOnRefs: ["h1", "p1"] },
        { ref: "part1", opKind: "workflow", commandKey: IDENTITY_COMMAND_KEYS.createProcessParticipation, payload: { child_id: "@c1", lead_id: "@lead1" }, dependsOnRefs: ["c1", "lead1"], optional: true },
    ];
}

const ORG = "org-A";
const CASE = "case-1";

describe("D1 plan generation", () => {
    it("builds a deterministic plan from resolution input", () => {
        const a = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const b = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        expect(a.contentHash).toBe(b.contentHash);
        expect(a.operations.map((o) => o.opId)).toEqual(b.operations.map((o) => o.opId));
        expect(a.contentHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("orders identity-atomic ops before dependent/async ops and preserves atomic group", () => {
        const plan = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        expect(plan.atomicGroups).toContain("identity_core");
        const person = plan.operations.find((o) => o.opId === "p1")!;
        const lead = plan.operations.find((o) => o.opId === "lead1")!;
        expect(person.atomicGroup).toBe("identity_core");
        expect(person.opOrder).toBeLessThan(lead.opOrder);
        // create_lead is a dependent op (sequences after the identity group)
        expect(lead.atomicGroup).toBeNull();
    });

    it("rejects an unsupported / physical command", () => {
        expect(() =>
            buildCommitPlan({
                orgId: ORG,
                caseId: CASE,
                operations: [{ ref: "x", opKind: "update", commandKey: "insert_persons_row", payload: {} }],
            }),
        ).toThrow(PlanBuildError);
    });

    it("supports an explicit no-op operation", () => {
        const plan = buildCommitPlan({
            orgId: ORG,
            caseId: CASE,
            operations: [
                { ref: "noop", opKind: "no_op", commandKey: IDENTITY_COMMAND_KEYS.updatePerson, payload: { person_id: "p-1" }, targetId: "p-1", reason: "already up to date" },
            ],
        });
        expect(plan.operations[0].opKind).toBe("no_op");
    });

    it("captures record-version preconditions", () => {
        const plan = buildCommitPlan({
            orgId: ORG,
            caseId: CASE,
            operations: [
                { ref: "u1", opKind: "update", commandKey: IDENTITY_COMMAND_KEYS.updatePerson, payload: { person_id: "p-1" }, targetId: "p-1", preconditionRecordVersion: "2026-01-01T00:00:00Z" },
            ],
            sourceResolutionVersions: ["gen-1"],
        });
        expect(plan.preconditions.some((p) => p.kind === "record_version" && p.expected === "2026-01-01T00:00:00Z")).toBe(true);
        expect(plan.preconditions.some((p) => p.kind === "resolution_generation" && p.ref === "gen-1")).toBe(true);
    });

    it("builds the existing-person-update + document-attach plan", () => {
        const plan = buildCommitPlan({
            orgId: ORG,
            caseId: CASE,
            operations: [
                { ref: "u1", opKind: "update", commandKey: IDENTITY_COMMAND_KEYS.updatePerson, payload: { person_id: "p-9" }, targetId: "p-9", before: { phone: null }, after: { phone: "+15550001111" } },
                { ref: "d1", opKind: "attach", commandKey: IDENTITY_COMMAND_KEYS.attachDocument, payload: { document_id: "doc-1", target_entity_type: "person", target_entity_id: "p-9" }, targetId: "doc-1" },
            ],
        });
        // async attach sequences after dependent update
        expect(plan.operations.map((o) => o.opKind)).toEqual(["update", "attach"]);
    });
});

describe("D1 hashing and versioning", () => {
    it("a material value edit produces a new version and new hash", () => {
        const v1 = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const edited = planToOperationInputs(v1).map((op) =>
            op.ref === "p1" ? { ...op, payload: { ...op.payload, first_name: "Annette" }, after: { email: "a@b.com", first_name: "Annette" } } : op,
        );
        const { plan: v2, material } = revisePlan(v1, edited);
        expect(material).toBe(true);
        expect(v2.version).toBe(2);
        expect(v2.contentHash).not.toBe(v1.contentHash);
    });

    it("an include/exclude toggle is a material change", () => {
        const v1 = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const excluded = toggleInclusion(planToOperationInputs(v1), "part1", false);
        const { plan: v2, material } = revisePlan(v1, excluded);
        expect(material).toBe(true);
        expect(v2.contentHash).not.toBe(v1.contentHash);
    });

    it("a non-material re-explanation (reason only) keeps the same hash", () => {
        const v1 = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const reworded = planToOperationInputs(v1).map((op) => ({ ...op, reason: `${op.reason} (reworded)` }));
        const rebuilt = computePlanContentHash({ orgId: ORG, caseId: CASE, operations: buildCommitPlan({ orgId: ORG, caseId: CASE, operations: reworded }).operations });
        expect(rebuilt).toBe(v1.contentHash);
    });
});

describe("D1 inclusion rules", () => {
    it("allows excluding an optional operation with no included dependents", () => {
        const v1 = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const inputs = toggleInclusion(planToOperationInputs(v1), "part1", false);
        expect(validatePlanInclusion(inputs).ok).toBe(true);
    });

    it("forbids excluding a required dependency while a dependent remains included", () => {
        const v1 = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const inputs = toggleInclusion(planToOperationInputs(v1), "h1", false); // household required by link + child + lead
        const res = validatePlanInclusion(inputs);
        expect(res.ok).toBe(false);
        expect(res.issues.map((i) => i.code)).toContain("cannot_exclude_required");
    });
});

describe("D1 diff view", () => {
    it("exposes a full canonical diff for operator review", () => {
        const plan = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const view = buildPlanDiffView(plan);
        expect(view.entries).toHaveLength(plan.operations.length);
        const link = view.entries.find((e) => e.opId === "l1")!;
        expect(link.kind).toBe("link");
        expect(link.dependsOn).toEqual(expect.arrayContaining(["p1", "h1"]));
        expect(view.contentHash).toBe(plan.contentHash);
    });
});

describe("D1 approval binding", () => {
    it("binds an approval to the exact plan version + hash", () => {
        const plan = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const readiness = evaluateApprovalReadiness(plan);
        expect(readiness.ready).toBe(true);
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        expect(approval.planContentHash).toBe(plan.contentHash);
        expect(approval.planVersion).toBe(plan.version);
        expect(approvalBindsToPlan(approval, plan)).toBe(true);
    });

    it("invalidates a prior approval after a material edit (stale)", () => {
        const v1 = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const approval = bindApproval({ plan: v1, approvingActor: "user-1" });
        const edited = planToOperationInputs(v1).map((op) =>
            op.ref === "p1" ? { ...op, payload: { ...op.payload, first_name: "Zed" } } : op,
        );
        const { plan: v2 } = revisePlan(v1, edited);
        expect(isApprovalStale(approval, v2)).toBe(true);
        expect(approvalBindsToPlan(approval, v2)).toBe(false);
    });

    it("blocks approval when a blocking conflict is unresolved", () => {
        const plan = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const readiness = evaluateApprovalReadiness(plan, { blockingConflicts: ["dob_mismatch"] });
        expect(readiness.ready).toBe(false);
        expect(readiness.blockers).toContain("unresolved_blocking_conflict");
    });
});

// ---------------------------------------------------------------------------
// Persistence round-trip with an in-memory Supabase fake
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
class FakeSupabase {
    tables: Record<string, Row[]> = {};
    private seq = 0;
    from(name: string) {
        this.tables[name] ??= [];
        return new FakeBuilder(this.tables[name], name, () => `${name}-id-${++this.seq}`);
    }
}
class FakeBuilder {
    private op: "select" | "insert" | "update" | null = null;
    private payload: Row | Row[] | null = null;
    private filters: [string, unknown][] = [];
    private wantSelect = false;
    constructor(private rows: Row[], private name: string, private mkId: () => string) {}
    insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
    update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
    select() { this.wantSelect = true; if (this.op == null) this.op = "select"; return this; }
    eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
    is(c: string, v: unknown) { this.filters.push([c, v]); return this; }
    private match(r: Row) { return this.filters.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)); }
    private apply() {
        if (this.op === "insert") {
            const list = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
            const inserted = list.map((r) => ({ id: this.mkId(), ...r }));
            this.rows.push(...inserted);
            return inserted;
        }
        if (this.op === "update") {
            const matched = this.rows.filter((r) => this.match(r));
            for (const r of matched) Object.assign(r, this.payload);
            return matched;
        }
        return this.rows.filter((r) => this.match(r));
    }
    async single() { const r = this.apply(); return { data: r[0] ?? null, error: r[0] ? null : { message: "no_row" } }; }
    async maybeSingle() { const r = this.apply(); return { data: r[0] ?? null, error: null }; }
    then(res: (v: { data: Row[]; error: null }) => void) { res({ data: this.apply(), error: null }); }
}

describe("D1 persistence round-trip", () => {
    it("inserts a plan + operations, loads them back, and supersession invalidates approval", async () => {
        const db = new FakeSupabase() as unknown as import("@supabase/supabase-js").SupabaseClient;
        const plan = buildCommitPlan({ orgId: ORG, caseId: CASE, operations: newFamilyOps() });
        const persisted = await insertCommitPlan(db, plan);
        expect(persisted.planId).toMatch(/processing_commit_plans-id/);

        const loaded = await loadCommitPlan(db, { orgId: ORG, planId: persisted.planId });
        expect(loaded).not.toBeNull();
        expect(loaded!.operations).toHaveLength(plan.operations.length);
        expect(loaded!.contentHash).toBe(plan.contentHash);

        const approval = bindApproval({ plan: persisted, approvingActor: "user-1" });
        await insertApproval(db, approval);
        expect(await loadActiveApproval(db, { orgId: ORG, planId: persisted.planId })).not.toBeNull();

        // build v2, supersede v1 → its approval is invalidated
        const v2 = buildCommitPlan({ orgId: ORG, caseId: CASE, version: 2, operations: newFamilyOps().map((o) => (o.ref === "p1" ? { ...o, payload: { ...o.payload, first_name: "Bea" } } : o)) });
        const persistedV2 = await insertCommitPlan(db, v2);
        await supersedePlan(db, { orgId: ORG, previousPlanId: persisted.planId, newPlanId: persistedV2.planId });
        expect(await loadActiveApproval(db, { orgId: ORG, planId: persisted.planId })).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// Migration shape
// ---------------------------------------------------------------------------
describe("D1 commit plans migration", () => {
    const migrationsDir = resolve(__dirname, "../../../supabase/migrations");
    const sql = [
        "20260717120000_processing_identity_d1_commit_plans.sql",
        "20260717120500_processing_identity_d1_commit_plans_tables2.sql",
        "20260717121000_processing_identity_d1_commit_plans_indexes.sql",
        "20260717121500_processing_identity_d1_processing_approvals.sql",
        "20260717122000_processing_identity_d1_plan_operations_index.sql",
        "20260717122500_processing_identity_d1_approvals_plan_index.sql",
        "20260717123000_processing_identity_d1_approvals_case_index.sql",
        "20260717123500_processing_identity_d1_approvals_active_unique.sql",
        "20260717125000_processing_identity_d1_commit_plans_guards_rls.sql",
        "20260717125500_processing_identity_d1_plan_operations_guard.sql",
        "20260717126000_processing_identity_d1_commit_plans_rls.sql",
    ]
        .map((name) => readFileSync(resolve(migrationsDir, name), "utf8"))
        .join("\n");
    it("creates the three D1 tables with version+hash and immutability", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_commit_plans");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_plan_operations");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_approvals");
        expect(sql).toContain("content_hash text NOT NULL");
        expect(sql).toContain("uq_processing_commit_plans_case_version");
        expect(sql).toContain("plan_content_hash text NOT NULL");
        expect(sql).toContain("processing_plan_operations_immutable_guard");
    });
    it("scopes RLS with has_org_role and service-role writes", () => {
        expect(sql).toContain("has_org_role(org_id");
        expect(sql).toContain("_all_service_role");
    });
});
