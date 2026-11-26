import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IDENTITY_COMMAND_KEYS } from "@/lib/pos/processingIdentity/commands";
import { bindApproval, buildCommitPlan, type CommitPlan, type PlanApproval } from "@/lib/pos/processingIdentity/plan";
import {
    type AtomicGroupRunner,
    type CommandExecutor,
    type CompensationPort,
    type ExecutorPorts,
    executeApprovedPlan,
    runPreflight,
} from "@/lib/pos/processingIdentity/executor";
import { resolveRefsInValue } from "@/lib/pos/processingIdentity/executor/refResolution";

const ORG = "org-A";
const CASE = "case-1";

function newFamilyPlan(): CommitPlan {
    return buildCommitPlan({
        orgId: ORG,
        caseId: CASE,
        operations: [
            { ref: "p1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createPerson, payload: { email: "a@b.com", first_name: "Ann" } },
            { ref: "h1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createHousehold, payload: { household_name: "Ann Household" } },
            { ref: "l1", opKind: "link", commandKey: IDENTITY_COMMAND_KEYS.linkPersonToHousehold, payload: { person_id: "@p1", household_id: "@h1" }, dependsOnRefs: ["p1", "h1"] },
            { ref: "c1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createChild, payload: { household_id: "@h1", display_name: "Kid" }, dependsOnRefs: ["h1"] },
            { ref: "lead1", opKind: "create", commandKey: IDENTITY_COMMAND_KEYS.createLead, payload: { household_id: "@h1", primary_person_id: "@p1", name: "Ann — Lead" }, dependsOnRefs: ["h1", "p1"] },
            { ref: "part1", opKind: "workflow", commandKey: IDENTITY_COMMAND_KEYS.createProcessParticipation, payload: { child_id: "@c1", lead_id: "@lead1" }, dependsOnRefs: ["c1", "lead1"], optional: true },
            { ref: "doc1", opKind: "attach", commandKey: IDENTITY_COMMAND_KEYS.attachDocument, payload: { document_id: "doc-x", target_entity_type: "lead", target_entity_id: "@lead1" }, dependsOnRefs: ["lead1"], optional: true },
        ],
    });
}

type Row = Record<string, unknown> & { id: string };
class Store {
    tables: Record<string, Row[]> = {};
    seq = 0;
    add(t: string, row: Record<string, unknown>) {
        this.tables[t] ??= [];
        const r = { id: `${t}-${++this.seq}`, ...row } as Row;
        this.tables[t].push(r);
        return r.id;
    }
    count(t: string) {
        return (this.tables[t] ?? []).length;
    }
}

function atomicRunner(store: Store, opts: { failOpId?: string } = {}): AtomicGroupRunner {
    return {
        async run(input) {
            if (opts.failOpId && input.operations.some((o) => o.opId === opts.failOpId)) {
                // simulate transaction rollback: nothing persisted
                return { ok: false, error: `atomic_fail:${opts.failOpId}` };
            }
            const refs: Record<string, string> = {};
            const staged: { table: string; row: Record<string, unknown> }[] = [];
            for (const op of input.operations) {
                const payload = resolveRefsInValue(op.payload, refs) as Record<string, unknown>;
                let table = "persons";
                if (op.commandKey === IDENTITY_COMMAND_KEYS.createHousehold) table = "customers";
                else if (op.commandKey === IDENTITY_COMMAND_KEYS.linkPersonToHousehold) table = "customer_persons";
                else if (op.commandKey === IDENTITY_COMMAND_KEYS.createChild) table = "customer_members";
                const id = `${table}-${store.seq + staged.length + 1}`;
                refs[op.opId] = id;
                staged.push({ table, row: { id, ...payload } });
            }
            // commit staged rows atomically
            for (const s of staged) {
                store.tables[s.table] ??= [];
                store.tables[s.table].push(s.row as Row);
                store.seq += 1;
            }
            return { ok: true, refs };
        },
    };
}

function commandExecutor(store: Store, opts: { failKeys?: string[] } = {}): CommandExecutor {
    const fail = new Set(opts.failKeys ?? []);
    return {
        async execute(commandKey, payload) {
            if (fail.has(commandKey)) {
                return { ok: false, refs: [], result: {}, idempotentReplay: false, error: `command_fail:${commandKey}` };
            }
            let table = "opportunities";
            let targetType: "lead" | "participation" | "document" = "lead";
            if (commandKey === IDENTITY_COMMAND_KEYS.createProcessParticipation) {
                table = "process_instances";
                targetType = "participation";
            } else if (commandKey === IDENTITY_COMMAND_KEYS.attachDocument) {
                table = "documents";
                targetType = "document";
            }
            const id = store.add(table, payload);
            return { ok: true, refs: [{ targetType, recordId: id, created: true }], result: {}, idempotentReplay: false };
        },
    };
}

function compensationPort(recorded: string[]): CompensationPort {
    return {
        async compensate(input) {
            recorded.push(input.op.opId);
            return { opId: input.op.opId, action: "flagged_for_operator", status: "recorded", detail: "flagged" };
        },
    };
}

function ports(store: Store, o: { failOpId?: string; failKeys?: string[]; comp?: string[] } = {}): ExecutorPorts {
    return {
        atomicGroup: atomicRunner(store, { failOpId: o.failOpId }),
        command: commandExecutor(store, { failKeys: o.failKeys }),
        compensation: compensationPort(o.comp ?? []),
    };
}

const CTX = { orgId: ORG, actorId: "user-1", actorAuthorized: true };
const clock = () => "2026-07-17T00:00:00.000Z";

describe("D2 preflight rejection", () => {
    it("rejects an unapproved plan", async () => {
        const plan = newFamilyPlan();
        const att = await executeApprovedPlan(
            { plan, approval: null, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(new Store()),
        );
        expect(att.outcome).toBe("preflight_rejected");
        expect(att.preflightFailures).toContain("no_approval");
    });

    it("rejects a wrong-hash approval", async () => {
        const plan = newFamilyPlan();
        const approval: PlanApproval = { ...bindApproval({ plan, approvingActor: "user-1" }), planContentHash: "WRONG" };
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(new Store()),
        );
        expect(att.outcome).toBe("preflight_rejected");
        expect(att.preflightFailures).toContain("plan_hash_mismatch");
    });

    it("rejects a superseded plan", async () => {
        const plan = { ...newFamilyPlan(), supersededBy: "next" };
        const approval = bindApproval({ plan: newFamilyPlan(), approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(new Store()),
        );
        expect(att.preflightFailures).toContain("plan_superseded");
    });

    it("rejects a stale record version", async () => {
        const plan = buildCommitPlan({
            orgId: ORG,
            caseId: CASE,
            operations: [{ ref: "u1", opKind: "update", commandKey: IDENTITY_COMMAND_KEYS.updatePerson, payload: { person_id: "p-1" }, targetId: "p-1", preconditionRecordVersion: "v1" }],
        });
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", currentRecordVersions: { "p-1": "v2" }, now: clock },
            ports(new Store()),
        );
        expect(att.preflightFailures).toContain("stale_record_version:p-1");
    });

    it("rejects an unauthorized actor", async () => {
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: { ...CTX, actorAuthorized: false }, executionIdempotencyKey: "k1", now: clock },
            ports(new Store()),
        );
        expect(att.preflightFailures).toContain("actor_not_authorized");
    });

    it("rejects a cross-tenant plan", async () => {
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: { ...CTX, orgId: "org-OTHER" }, executionIdempotencyKey: "k1", now: clock },
            ports(new Store()),
        );
        expect(att.preflightFailures).toContain("tenant_mismatch");
    });

    it("rejects an unresolvable command via preflight", () => {
        const plan = newFamilyPlan();
        const tampered: CommitPlan = {
            ...plan,
            operations: [{ ...plan.operations[0], commandKey: "insert_persons_row" }],
        };
        const approval = bindApproval({ plan: tampered, approvingActor: "user-1" });
        const pf = runPreflight({ plan: tampered, approval, context: CTX, executionIdempotencyKey: "k1" });
        expect(pf.ok).toBe(false);
        expect(pf.failures.some((f) => f.startsWith("unresolvable_command"))).toBe(true);
    });

    it("requires an execution idempotency key", async () => {
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "", now: clock },
            ports(new Store()),
        );
        expect(att.preflightFailures).toContain("missing_execution_idempotency_key");
    });
});

describe("D2 execution", () => {
    it("commits a valid approved plan through registered commands, resolving dependent refs", async () => {
        const store = new Store();
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store),
        );
        expect(att.outcome).toBe("committed");
        // atomic identity group persisted person + household + link + child
        expect(store.count("persons")).toBe(1);
        expect(store.count("customers")).toBe(1);
        expect(store.count("customer_persons")).toBe(1);
        expect(store.count("customer_members")).toBe(1);
        // dependent lead + participation + async attach
        expect(store.count("opportunities")).toBe(1);
        expect(store.count("process_instances")).toBe(1);
        expect(store.count("documents")).toBe(1);
        // dependent lead payload resolved @h1/@p1 to real ids
        const lead = store.tables["opportunities"][0];
        expect(String(lead.household_id)).toMatch(/customers-/);
        expect(String(lead.primary_person_id)).toMatch(/persons-/);
        expect(att.events.length).toBeGreaterThan(0);
    });

    it("executes operations in dependency order (atomic group before lead before participation)", async () => {
        const store = new Store();
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store),
        );
        const committed = att.operations.filter((o) => o.status === "committed").map((o) => o.opId);
        expect(committed.indexOf("p1")).toBeLessThan(committed.indexOf("lead1"));
        expect(committed.indexOf("lead1")).toBeLessThan(committed.indexOf("part1"));
    });

    it("rolls back the whole atomic group on failure (nothing persisted)", async () => {
        const store = new Store();
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store, { failOpId: "c1" }),
        );
        expect(att.outcome).toBe("failed");
        expect(store.count("persons")).toBe(0);
        expect(store.count("customers")).toBe(0);
        expect(att.operations.filter((o) => o.status === "failed").length).toBeGreaterThan(0);
    });

    it("partial-fails on a dependent op and compensates committed reversible dependents", async () => {
        const store = new Store();
        const comp: string[] = [];
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store, { failKeys: [IDENTITY_COMMAND_KEYS.createProcessParticipation], comp }),
        );
        expect(att.outcome).toBe("partially_committed");
        // identity group + lead stand; participation failed
        expect(store.count("persons")).toBe(1);
        expect(store.count("opportunities")).toBe(1);
        expect(att.compensation.map((c) => c.opId)).toContain("lead1");
        expect(comp).toContain("lead1");
    });

    it("communication/async failure does not roll back identity", async () => {
        const store = new Store();
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const att = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store, { failKeys: [IDENTITY_COMMAND_KEYS.attachDocument] }),
        );
        expect(att.outcome).toBe("partially_committed");
        expect(att.operations.find((o) => o.opId === "doc1")!.status).toBe("async_failed");
        // identity + lead + participation all stand
        expect(store.count("persons")).toBe(1);
        expect(store.count("opportunities")).toBe(1);
        expect(store.count("process_instances")).toBe(1);
    });

    it("is idempotent: a prior committed attempt with the same key is returned as-is", async () => {
        const store = new Store();
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        const first = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store),
        );
        const before = { p: store.count("persons"), o: store.count("opportunities") };
        const second = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", priorAttempt: first, now: clock },
            ports(store),
        );
        expect(second.attemptNo).toBe(first.attemptNo);
        expect(store.count("persons")).toBe(before.p);
        expect(store.count("opportunities")).toBe(before.o);
    });

    it("resumes a prior partial attempt without re-executing committed ops", async () => {
        const store = new Store();
        const plan = newFamilyPlan();
        const approval = bindApproval({ plan, approvingActor: "user-1" });
        // first attempt: participation fails
        const first = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", now: clock },
            ports(store, { failKeys: [IDENTITY_COMMAND_KEYS.createProcessParticipation] }),
        );
        expect(first.outcome).toBe("partially_committed");
        const personsAfterFirst = store.count("persons");
        // retry: participation now succeeds; identity group + lead are NOT recreated
        const retry = await executeApprovedPlan(
            { plan, approval, context: CTX, executionIdempotencyKey: "k1", priorAttempt: first, now: clock },
            ports(store),
        );
        expect(retry.attemptNo).toBe(2);
        expect(store.count("persons")).toBe(personsAfterFirst); // no duplicate identity
        expect(store.count("process_instances")).toBe(1);
        expect(retry.operations.filter((o) => o.status === "skipped").length).toBeGreaterThan(0);
    });
});

describe("D2 executor migration", () => {
    const sql = readFileSync(
        resolve(__dirname, "../../../supabase/migrations/20260717130000_processing_identity_d2_executor.sql"),
        "utf8",
    );
    it("creates append-only attempts, exceptions, and the atomic-group RPC", () => {
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_commit_attempts");
        expect(sql).toContain("processing_commit_attempts_append_only_guard");
        expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.processing_exceptions");
        expect(sql).toContain("FUNCTION public.execute_processing_identity_group");
        expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.execute_processing_identity_group");
        expect(sql).toContain("REVOKE ALL ON FUNCTION public.execute_processing_identity_group");
    });
});
