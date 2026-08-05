import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands";
import { resolveRefsInValue } from "@/lib/pos/processingIdentity/executor/refResolution";
import type {
    AtomicGroupRunner,
    CommandExecutor,
    CompensationPort,
    ExecutorPorts,
} from "@/lib/pos/processingIdentity/executor";
import {
    approvePlan,
    buildPlan,
    buildRecommendations,
    canExecute,
    commitApprovedLeadForCase,
    deriveResolutionSetFromResolutions,
    executeApprovedPlanForCase,
    loadCaseReview,
    projectIdentityReadiness,
    recordCorrection,
    recordResolutionDecision,
    type IdentityResolutionSet,
    type OperatorReviewDeps,
} from "@/lib/pos/processingIdentity/operator";
import type { ProcessingResolutionRow } from "@/lib/pos/processingIdentity/processingResolutionsDb";

const ORG = "11111111-1111-4111-8111-111111111111";
const CASE = "22222222-2222-4222-8222-222222222222";
const clock = () => "2026-07-18T00:00:00.000Z";

// ---------------------------------------------------------------------------
// In-memory Supabase fake (adds order/limit over the D1 shape)
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
class FakeSupabase {
    tables: Record<string, Row[]> = {};
    private seq = 0;
    from(name: string) {
        this.tables[name] ??= [];
        return new FakeBuilder(this.tables[name], name, () => `${name}-id-${++this.seq}`);
    }
    seed(name: string, rows: Row[]) {
        this.tables[name] ??= [];
        this.tables[name].push(...rows);
    }
}
class FakeBuilder {
    private op: "select" | "insert" | "update" | null = null;
    private payload: Row | Row[] | null = null;
    private filters: [string, unknown][] = [];
    private negFilters: [string, unknown][] = [];
    private sortSpec: { col: string; asc: boolean } | null = null;
    private limitN: number | null = null;
    constructor(private rows: Row[], private name: string, private mkId: () => string) {}
    insert(payload: Row | Row[]) { this.op = "insert"; this.payload = payload; return this; }
    update(patch: Row) { this.op = "update"; this.payload = patch; return this; }
    select() { if (this.op == null) this.op = "select"; return this; }
    eq(c: string, v: unknown) { this.filters.push([c, v]); return this; }
    /**
     * The identity readiness count now excludes Trust governance gaps, which are
     * not identity exceptions (see `operatorReviewService`). The fake needs the
     * operator so it keeps modelling the real query.
     */
    neq(c: string, v: unknown) { this.negFilters.push([c, v]); return this; }
    is(c: string, v: unknown) { this.filters.push([c, v]); return this; }
    order(col: string, opts?: { ascending?: boolean }) { this.sortSpec = { col, asc: opts?.ascending ?? true }; return this; }
    limit(n: number) { this.limitN = n; return this; }
    private match(r: Row) {
        return (
            this.filters.every(([c, v]) => (v === null ? r[c] == null : r[c] === v)) &&
            this.negFilters.every(([c, v]) => r[c] !== v)
        );
    }
    private apply(): Row[] {
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
        let out = this.rows.filter((r) => this.match(r));
        if (this.sortSpec) {
            const { col, asc } = this.sortSpec;
            out = [...out].sort((a, b) => {
                const av = a[col] as number | string;
                const bv = b[col] as number | string;
                return (av < bv ? -1 : av > bv ? 1 : 0) * (asc ? 1 : -1);
            });
        }
        if (this.limitN != null) out = out.slice(0, this.limitN);
        return out;
    }
    async single() { const r = this.apply(); return { data: r[0] ?? null, error: r[0] ? null : { message: "no_row" } }; }
    async maybeSingle() { const r = this.apply(); return { data: r[0] ?? null, error: null }; }
    then(res: (v: { data: Row[]; error: null }) => void) { res({ data: this.apply(), error: null }); }
}

// ---------------------------------------------------------------------------
// Fake executor ports (all-or-nothing atomic group + dependent command exec)
// ---------------------------------------------------------------------------
class Counter {
    tables: Record<string, number> = {};
    seq = 0;
    bump(t: string) { this.tables[t] = (this.tables[t] ?? 0) + 1; return `${t}-${++this.seq}`; }
    count(t: string) { return this.tables[t] ?? 0; }
}
function atomicRunner(c: Counter, failOpId?: string): AtomicGroupRunner {
    return {
        async run(input) {
            if (failOpId && input.operations.some((o) => o.opId === failOpId)) {
                return { ok: false, error: `atomic_fail:${failOpId}` };
            }
            const refs: Record<string, string> = {};
            const staged: string[] = [];
            for (const op of input.operations) {
                resolveRefsInValue(op.payload, refs);
                let table = "persons";
                if (op.commandKey === IDENTITY_COMMAND_KEYS.createHousehold) table = "customers";
                else if (op.commandKey === IDENTITY_COMMAND_KEYS.linkPersonToHousehold) table = "customer_persons";
                else if (op.commandKey === IDENTITY_COMMAND_KEYS.createChild) table = "customer_members";
                const id = `${table}-${c.seq + staged.length + 1}`;
                refs[op.opId] = id;
                staged.push(table);
            }
            for (const t of staged) c.bump(t);
            return { ok: true, refs };
        },
    };
}
function commandExecutor(c: Counter, failKeys: string[] = []): CommandExecutor {
    const fail = new Set(failKeys);
    return {
        async execute(commandKey, payload) {
            if (fail.has(commandKey)) return { ok: false, refs: [], result: {}, idempotentReplay: false, error: `fail:${commandKey}` };
            const table = commandKey === IDENTITY_COMMAND_KEYS.createProcessParticipation ? "process_instances" : "opportunities";
            const id = c.bump(table);
            void payload;
            return { ok: true, refs: [{ targetType: "lead", recordId: id, created: true }], result: {}, idempotentReplay: false };
        },
    };
}
function compensationPort(rec: string[]): CompensationPort {
    return {
        async compensate(input) {
            rec.push(input.op.opId);
            return { opId: input.op.opId, action: "flagged_for_operator", status: "recorded", detail: "flagged" };
        },
    };
}
function ports(c: Counter, o: { failOpId?: string; failKeys?: string[]; comp?: string[] } = {}): ExecutorPorts {
    return {
        atomicGroup: atomicRunner(c, o.failOpId),
        command: commandExecutor(c, o.failKeys),
        compensation: compensationPort(o.comp ?? []),
    };
}

function deps(db: FakeSupabase, c: Counter, opts: { authorized?: boolean } = {}): OperatorReviewDeps {
    return {
        supabase: db as unknown as SupabaseClient,
        orgId: ORG,
        actorId: "user-1",
        actorAuthorized: opts.authorized ?? true,
        executorPorts: ports(c),
        now: clock,
    };
}

// New-family resolution rows (household + parent + child + lead), all actionable.
function seedNewFamily(db: FakeSupabase): void {
    db.seed("processing_facts", [
        { id: "fact-1", org_id: ORG, case_id: CASE, fact_type: "email", raw_value: "a@b.com", normalized_value: "a@b.com", corrected_from: null, created_at: "2026-07-18T00:00:00.000Z", evidence: {} },
    ]);
    const rows: Partial<ProcessingResolutionRow>[] = [
        { id: "res-hh", org_id: ORG, case_id: CASE, generation_id: "gen-1", subject_ref: "household:0", subject_role: "household", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { household_name: "Ann Household" } },
        { id: "res-p", org_id: ORG, case_id: CASE, generation_id: "gen-1", subject_ref: "parent:0", subject_role: "parent", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { first_name: "Ann", email: "a@b.com" } },
        { id: "res-c", org_id: ORG, case_id: CASE, generation_id: "gen-1", subject_ref: "child:0", subject_role: "child", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { display_name: "Kid" } },
        { id: "res-l", org_id: ORG, case_id: CASE, generation_id: "gen-1", subject_ref: "lead:0", subject_role: "lead", decision_action: "create_new", selected_candidate_id: null, candidates: [], provisional: { name: "Ann — Lead" } },
    ];
    db.seed("processing_resolutions", rows as Row[]);
}

// ---------------------------------------------------------------------------
// Recommendation builder
// ---------------------------------------------------------------------------
describe("D3 recommendation builder", () => {
    const set: IdentityResolutionSet = {
        subjects: [
            { ref: "household:0", role: "household", decision: "create", values: { household_name: "H" } },
            { ref: "parent:0", role: "parent", decision: "create", householdRef: "household:0", values: { first_name: "Ann" } },
            { ref: "child:0", role: "child", decision: "create", householdRef: "household:0", values: { display_name: "Kid" } },
            { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0", dependsOn: ["parent:0"], values: { name: "L" } },
        ],
    };

    it("emits only registered semantic commands (never physical / arbitrary)", () => {
        const { operations } = buildRecommendations(set);
        const keys = new Set(operations.map((o) => o.commandKey));
        expect(keys.has(IDENTITY_COMMAND_KEYS.createPerson)).toBe(true);
        expect(keys.has(IDENTITY_COMMAND_KEYS.createHousehold)).toBe(true);
        expect(keys.has(IDENTITY_COMMAND_KEYS.linkPersonToHousehold)).toBe(true);
        expect(keys.has(IDENTITY_COMMAND_KEYS.createChild)).toBe(true);
        expect(keys.has(IDENTITY_COMMAND_KEYS.createLead)).toBe(true);
        for (const k of keys) expect(k).not.toMatch(/insert_|_table|_row|ocm|process_instances/i);
    });

    it("is deterministic (same input → same operation refs)", () => {
        const a = buildRecommendations(set).operations.map((o) => o.ref);
        const b = buildRecommendations(set).operations.map((o) => o.ref);
        expect(a).toEqual(b);
    });

    it("treats merge as escalation only — never an executable operation", () => {
        const { operations, escalations } = buildRecommendations({
            subjects: [
                { ref: "p", role: "parent", decision: "propose_merge", duplicate: { entityType: "person", survivorId: "s1", duplicateId: "d1" } },
            ],
        });
        expect(operations).toHaveLength(0);
        expect(escalations[0].kind).toBe("merge_proposal");
    });

    it("routes request-information to a non-executable outcome", () => {
        const { operations, requestInformation } = buildRecommendations({
            subjects: [{ ref: "p", role: "parent", decision: "request_information" }],
        });
        expect(operations).toHaveLength(0);
        expect(requestInformation).toBe(true);
    });

    it("derives an actionable set from durable resolution rows", () => {
        const db = new FakeSupabase();
        seedNewFamily(db);
        const derived = deriveResolutionSetFromResolutions(db.tables["processing_resolutions"] as unknown as ProcessingResolutionRow[]);
        expect(derived.subjects.map((s) => s.role).sort()).toEqual(["child", "household", "lead", "parent"]);
        const parent = derived.subjects.find((s) => s.role === "parent")!;
        expect(parent.householdRef).toBe("household:0");
    });

    it("excludes review/reject decisions from the executable set", () => {
        const rows = [
            { id: "r1", org_id: ORG, case_id: CASE, generation_id: "g", subject_ref: "parent:0", subject_role: "parent", decision_action: "review_required", selected_candidate_id: null, candidates: [], provisional: {} },
            { id: "r2", org_id: ORG, case_id: CASE, generation_id: "g", subject_ref: "child:0", subject_role: "child", decision_action: "reject", selected_candidate_id: null, candidates: [], provisional: {} },
        ];
        const derived = deriveResolutionSetFromResolutions(rows as unknown as ProcessingResolutionRow[]);
        expect(derived.subjects).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Create Lead work-unit binding — Work View visibility (workUnitLeadMembership
// excludes work_unit_id IS NULL, so the created opportunity MUST carry the work
// unit the intake resolved or the new lead never appears in its Work View).
// ---------------------------------------------------------------------------
describe("Create Lead work-unit binding (Work View visibility)", () => {
    const leadSet = (leadValues: Record<string, unknown>): IdentityResolutionSet => ({
        subjects: [
            { ref: "household:0", role: "household", decision: "create", values: { household_name: "H" } },
            { ref: "lead:0", role: "lead", decision: "create", householdRef: "household:0", values: leadValues },
        ],
    });

    it("includes work_unit_id in the create_lead op when the lead subject carries it", () => {
        const op = buildRecommendations(leadSet({ name: "L", work_unit_id: "wu-1" })).operations.find(
            (o) => o.commandKey === IDENTITY_COMMAND_KEYS.createLead,
        );
        expect(op?.payload.work_unit_id).toBe("wu-1");
    });

    it("omits work_unit_id when the lead subject has none (unrelated intakes unchanged, no silent wrong value)", () => {
        const op = buildRecommendations(leadSet({ name: "L" })).operations.find(
            (o) => o.commandKey === IDENTITY_COMMAND_KEYS.createLead,
        );
        expect(op).toBeTruthy();
        expect("work_unit_id" in (op!.payload as Record<string, unknown>)).toBe(false);
    });

    it("buildPlan sources work_unit_id from the case create_lead_intake metadata onto the create_lead op", async () => {
        const db = new FakeSupabase();
        seedNewFamily(db);
        db.seed("processing_cases", [
            { id: CASE, org_id: ORG, metadata: { create_lead_intake: { work_unit_id: "wu-777" } } } as Row,
        ]);
        const d = deps(db, new Counter());
        const { plan } = await buildPlan(d, { caseId: CASE });
        const leadOp = plan.operations.find((o) => o.commandKey === IDENTITY_COMMAND_KEYS.createLead);
        expect(leadOp?.payload.work_unit_id).toBe("wu-777");
    });

    it("leaves the create_lead op work-unit-less when the case has no create_lead_intake (e.g. non-create-lead intake)", async () => {
        const db = new FakeSupabase();
        seedNewFamily(db);
        db.seed("processing_cases", [{ id: CASE, org_id: ORG, metadata: {} } as Row]);
        const d = deps(db, new Counter());
        const { plan } = await buildPlan(d, { caseId: CASE });
        const leadOp = plan.operations.find((o) => o.commandKey === IDENTITY_COMMAND_KEYS.createLead);
        expect("work_unit_id" in (leadOp!.payload as Record<string, unknown>)).toBe(false);
    });

    it("delivers work_unit_id to the opportunity-creation command port end to end", async () => {
        const db = new FakeSupabase();
        const counter = new Counter();
        seedNewFamily(db);
        db.seed("processing_cases", [
            { id: CASE, org_id: ORG, metadata: { create_lead_intake: { work_unit_id: "wu-888" } } } as Row,
        ]);
        const captured: Record<string, unknown>[] = [];
        const capturing: CommandExecutor = {
            async execute(commandKey, payload) {
                if (commandKey === IDENTITY_COMMAND_KEYS.createLead) captured.push(payload as Record<string, unknown>);
                const table = commandKey === IDENTITY_COMMAND_KEYS.createProcessParticipation ? "process_instances" : "opportunities";
                return { ok: true, refs: [{ targetType: "lead", recordId: counter.bump(table), created: true }], result: {}, idempotentReplay: false };
            },
        };
        const d: OperatorReviewDeps = {
            supabase: db as unknown as SupabaseClient,
            orgId: ORG,
            actorId: "user-1",
            actorAuthorized: true,
            executorPorts: { atomicGroup: atomicRunner(counter), command: capturing, compensation: compensationPort([]) },
            now: clock,
        };
        const { plan } = await buildPlan(d, { caseId: CASE });
        await approvePlan(d, { caseId: CASE, planId: plan.planId });
        await executeApprovedPlanForCase(d, { caseId: CASE, planId: plan.planId, executionIdempotencyKey: "exec-wu" });
        expect(captured).toHaveLength(1);
        expect(captured[0]?.work_unit_id).toBe("wu-888");
    });
});

// ---------------------------------------------------------------------------
// Case readiness projection
// ---------------------------------------------------------------------------
describe("D3 readiness projection", () => {
    const base = {
        hasFacts: true,
        resolutionCount: 2,
        undecidedResolutionCount: 0,
        blockingConflictCount: 0,
        needsInformation: false,
        plan: { exists: true, supersededOrStale: false },
        hasValidApproval: false,
        latestAttemptOutcome: null,
        hasOpenException: false,
    } as const;

    it("represents every required review state", () => {
        expect(projectIdentityReadiness({ ...base, hasFacts: false })).toBe("needs_understanding_review");
        expect(projectIdentityReadiness({ ...base, undecidedResolutionCount: 1 })).toBe("needs_identity_review");
        expect(projectIdentityReadiness({ ...base, plan: null })).toBe("needs_plan_review");
        expect(projectIdentityReadiness({ ...base })).toBe("ready_for_approval");
        expect(projectIdentityReadiness({ ...base, hasValidApproval: true })).toBe("approved_ready_to_commit");
        expect(projectIdentityReadiness({ ...base, plan: { exists: true, supersededOrStale: true } })).toBe("stale_plan");
        expect(projectIdentityReadiness({ ...base, needsInformation: true })).toBe("needs_information");
        expect(projectIdentityReadiness({ ...base, latestAttemptOutcome: "committing" })).toBe("committing");
        expect(projectIdentityReadiness({ ...base, latestAttemptOutcome: "partially_committed" })).toBe("partially_committed");
        expect(projectIdentityReadiness({ ...base, latestAttemptOutcome: "committed" })).toBe("committed");
        expect(projectIdentityReadiness({ ...base, hasOpenException: true })).toBe("exception");
    });

    it("only allows execution when approved (or resuming a partial)", () => {
        expect(canExecute("ready_for_approval")).toBe(false);
        expect(canExecute("approved_ready_to_commit")).toBe(true);
        expect(canExecute("partially_committed")).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Full operator workflow through the canonical service
// ---------------------------------------------------------------------------
describe("D3 operator workflow (service)", () => {
    it("loads facts + resolutions and derives needs_identity_review before decisions", async () => {
        const db = new FakeSupabase();
        db.seed("processing_facts", [{ id: "f1", org_id: ORG, case_id: CASE, fact_type: "email", normalized_value: "a@b.com", raw_value: "a@b.com", corrected_from: null, created_at: "t", evidence: {} }]);
        db.seed("processing_resolutions", [{ id: "r1", org_id: ORG, case_id: CASE, generation_id: "g", subject_ref: "parent:0", subject_role: "parent", decision_action: null, selected_candidate_id: null, candidates: [], provisional: {} }]);
        const state = await loadCaseReview(deps(db, new Counter()), CASE);
        expect(state.facts).toHaveLength(1);
        expect(state.readiness).toBe("needs_identity_review");
    });

    it("records a correction as a NEW fact version (original preserved)", async () => {
        const db = new FakeSupabase();
        db.seed("processing_facts", [{ id: "f1", org_id: ORG, case_id: CASE, source_id: null, subject_ref: null, fact_type: "email", semantic_key: "email", raw_value: "a@b.com", normalized_value: "a@b.com", data_type: "email", extraction_method: "intake_extract", evidence: {}, extraction_confidence: 0.9, validation_state: null, mapping_state: "unmapped", role_hint: null, produced_by: "intake", extractor_version: "b2", generation_id: "g", corrected_from: null, retention_class: "uncommitted_submission", created_at: "t" }]);
        const fact = await recordCorrection(deps(db, new Counter()), { caseId: CASE, originalFactId: "f1", correctedNormalizedValue: "fixed@b.com" });
        expect(fact.normalized_value).toBe("fixed@b.com");
        expect(fact.corrected_from).toBe("f1");
        expect(db.tables["processing_facts"]).toHaveLength(2); // original + corrected
    });

    it("persists a resolution decision durably", async () => {
        const db = new FakeSupabase();
        seedNewFamily(db);
        await recordResolutionDecision(deps(db, new Counter()), { caseId: CASE, resolutionId: "res-p", decisionAction: "link_existing", selectedCandidateId: "person-9" });
        const row = db.tables["processing_resolutions"].find((r) => r.id === "res-p")!;
        expect(row.decision_action).toBe("link_existing");
        expect(row.selected_candidate_id).toBe("person-9");
        expect(row.decided_by).toBe("operator");
    });

    it("builds a deterministic versioned plan from durable decisions, then approves and executes", async () => {
        const db = new FakeSupabase();
        const counter = new Counter();
        seedNewFamily(db);
        const d = deps(db, counter);

        const { plan } = await buildPlan(d, { caseId: CASE });
        expect(plan.version).toBe(1);
        expect(plan.atomicGroups).toContain("identity_core");

        // ready → approve
        let state = await loadCaseReview(d, CASE);
        expect(state.readiness).toBe("ready_for_approval");
        const approval = await approvePlan(d, { caseId: CASE, planId: plan.planId });
        expect(approval.planContentHash).toBe(plan.contentHash);

        state = await loadCaseReview(d, CASE);
        expect(state.readiness).toBe("approved_ready_to_commit");

        // explicit execute
        const attempt = await executeApprovedPlanForCase(d, { caseId: CASE, planId: plan.planId, executionIdempotencyKey: "exec-1" });
        expect(attempt.outcome).toBe("committed");
        expect(counter.count("persons")).toBe(1);
        expect(counter.count("customers")).toBe(1);
        expect(counter.count("customer_persons")).toBe(1);
        expect(counter.count("customer_members")).toBe(1);
        expect(counter.count("opportunities")).toBe(1); // dependent lead
        expect(db.tables["processing_commit_attempts"]).toHaveLength(1);

        state = await loadCaseReview(d, CASE);
        expect(state.readiness).toBe("committed");
    });

    it("commitApprovedLeadForCase composes build → approve → execute into one operator action (full lead + participation)", async () => {
        const db = new FakeSupabase();
        const counter = new Counter();
        seedNewFamily(db);
        const d = deps(db, counter);

        const { plan, approval, attempt } = await commitApprovedLeadForCase(d, { caseId: CASE });

        // One call performs the whole build → approve → execute chain.
        expect(approval.planContentHash).toBe(plan.contentHash);
        expect(attempt.outcome).toBe("committed");

        // Full record set — NOT a person-only minimal handoff.
        expect(counter.count("persons")).toBe(1);
        expect(counter.count("customers")).toBe(1);
        expect(counter.count("customer_members")).toBe(1);
        expect(counter.count("opportunities")).toBe(1); // lead
        expect(counter.count("process_instances")).toBe(1); // enrollment participation
        const participationOp = attempt.operations.find((o) => o.commandKey === "create_process_participation");
        expect(participationOp?.status).toBe("committed");

        expect((await loadCaseReview(d, CASE)).readiness).toBe("committed");
    });

    it("fails execution without an approval and records an exception", async () => {
        const db = new FakeSupabase();
        const counter = new Counter();
        seedNewFamily(db);
        const d = deps(db, counter);
        const { plan } = await buildPlan(d, { caseId: CASE });
        const attempt = await executeApprovedPlanForCase(d, { caseId: CASE, planId: plan.planId, executionIdempotencyKey: "x" });
        expect(attempt.outcome).toBe("preflight_rejected");
        expect(attempt.preflightFailures).toContain("no_approval");
        expect(counter.count("persons")).toBe(0);
        expect(db.tables["processing_exceptions"]).toHaveLength(1);
    });

    it("rejects approval and execution by an unauthorized actor", async () => {
        const db = new FakeSupabase();
        seedNewFamily(db);
        const authed = deps(db, new Counter());
        const { plan } = await buildPlan(authed, { caseId: CASE });
        const unauth = deps(db, new Counter(), { authorized: false });
        await expect(approvePlan(unauth, { caseId: CASE, planId: plan.planId })).rejects.toMatchObject({ code: "actor_not_authorized" });
        await expect(
            executeApprovedPlanForCase(unauth, { caseId: CASE, planId: plan.planId, executionIdempotencyKey: "x" }),
        ).rejects.toMatchObject({ code: "actor_not_authorized" });
    });

    it("a revised plan version invalidates the prior approval (stale)", async () => {
        const db = new FakeSupabase();
        const d = deps(db, new Counter());
        seedNewFamily(db);
        const { plan: v1 } = await buildPlan(d, { caseId: CASE });
        await approvePlan(d, { caseId: CASE, planId: v1.planId });
        // Eligible revision: reuse an existing household id instead of creating — still plan-eligible.
        await recordResolutionDecision(d, {
            caseId: CASE,
            resolutionId: "res-hh",
            decisionAction: "link_existing",
            selectedCandidateId: "existing-household-1",
        });
        const { plan: v2 } = await buildPlan(d, { caseId: CASE });
        expect(v2.version).toBe(2);
        expect(v2.contentHash).not.toBe(v1.contentHash);
        // v1 approval invalidated by supersession
        const v1Approval = db.tables["processing_approvals"].find((a) => a.plan_id === v1.planId)!;
        expect(v1Approval.invalidated_at).not.toBeNull();
    });

    it("refuses to build a plan when no decision is actionable", async () => {
        const db = new FakeSupabase();
        db.seed("processing_resolutions", [
            { id: "r1", org_id: ORG, case_id: CASE, generation_id: "g", subject_ref: "parent:0", subject_role: "parent", decision_action: "review_required", selected_candidate_id: null, candidates: [], provisional: {}, decided_by: "engine" },
        ]);
        await expect(buildPlan(deps(db, new Counter()), { caseId: CASE })).rejects.toMatchObject({ code: "identity_review_required" });
    });

    it("blocks create_new when a plausible child candidate exists without override", async () => {
        const db = new FakeSupabase();
        seedNewFamily(db);
        const child = db.tables["processing_resolutions"].find((r) => r.id === "res-c")!;
        child.candidates = [
            {
                subjectRef: "child:0",
                entityType: "child",
                recordId: "existing-child-1",
                confidenceBand: "possible",
                signals: [],
                blockingConflicts: [],
                explanation: "Same name in household",
                resolverVersion: "test",
            },
        ];
        child.decision_action = "create_new";
        child.decided_by = "engine";
        await expect(buildPlan(deps(db, new Counter()), { caseId: CASE })).rejects.toMatchObject({
            code: "identity_review_required",
        });
        await recordResolutionDecision(deps(db, new Counter()), {
            caseId: CASE,
            resolutionId: "res-c",
            decisionAction: "create_new",
            createNewOverrideReason: "Confirmed sibling with same first name is a different child",
        });
        const { plan } = await buildPlan(deps(db, new Counter()), { caseId: CASE });
        expect(plan.version).toBe(1);
        const updated = db.tables["processing_resolutions"].find((r) => r.id === "res-c")!;
        expect((updated.provisional as { create_new_override?: { reason: string } }).create_new_override?.reason).toContain("Confirmed sibling");
    });

    it("is idempotent: repeating execution with the same key does not double-commit", async () => {
        const db = new FakeSupabase();
        const counter = new Counter();
        seedNewFamily(db);
        const d = deps(db, counter);
        const { plan } = await buildPlan(d, { caseId: CASE });
        await approvePlan(d, { caseId: CASE, planId: plan.planId });
        const a1 = await executeApprovedPlanForCase(d, { caseId: CASE, planId: plan.planId, executionIdempotencyKey: "k" });
        const personsAfter = counter.count("persons");
        const a2 = await executeApprovedPlanForCase(d, { caseId: CASE, planId: plan.planId, executionIdempotencyKey: "k" });
        expect(a2.outcome).toBe("committed");
        expect(a2.attemptNo).toBe(a1.attemptNo); // replay of the same attempt, not a new one
        expect(counter.count("persons")).toBe(personsAfter); // no double-commit
        expect(db.tables["processing_commit_attempts"]).toHaveLength(1); // replay not re-persisted
    });
});
