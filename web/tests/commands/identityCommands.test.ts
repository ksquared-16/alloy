import { describe, expect, it } from "vitest";
import {
    CommandRegistryError,
    type CommandContext,
    type IdentityCommandPorts,
    IDENTITY_COMMAND_KEYS,
    IDENTITY_COMMANDS,
    executeIdentityCommand,
    getCommandMetadata,
    getIdentityCommand,
    previewIdentityCommand,
    registeredIdentityCommandKeys,
    validateIdentityCommand,
} from "@/lib/pos/processingIdentity/commands";

// ---------------------------------------------------------------------------
// In-memory fake ports: a real store proving handlers perform repository work
// through the semantic seam (no physical table names leak past the port).
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { id: string; org_id: string };

class FakeStore {
    persons: Row[] = [];
    customers: Row[] = [];
    customer_persons: Row[] = [];
    customer_members: Row[] = [];
    opportunities: Row[] = [];
    opportunity_persons: Row[] = [];
    process_instances: Row[] = [];
    documents: Row[] = [];
    communication_preferences: Row[] = [];
    private seq = 0;
    writeCalls = 0;
    id(prefix: string): string {
        this.seq += 1;
        return `${prefix}-${this.seq}`;
    }
}

function fakePorts(store: FakeStore, opts: { seedForeignOrgDoc?: boolean } = {}): IdentityCommandPorts {
    if (opts.seedForeignOrgDoc) {
        store.documents.push({ id: "doc-foreign", org_id: "org-OTHER" });
    }
    const table = (t: string): Row[] => (store as unknown as Record<string, Row[]>)[t];
    return {
        async createPerson(ctx, input) {
            const existing = store.persons.find(
                (p) => p.org_id === ctx.orgId && input.email && p.email === input.email,
            );
            if (existing) return { id: existing.id, created: false };
            store.writeCalls += 1;
            const row: Row = { id: store.id("person"), org_id: ctx.orgId, ...input };
            store.persons.push(row);
            return { id: row.id, created: true };
        },
        async updatePerson(ctx, input) {
            const row = store.persons.find((p) => p.id === input.person_id && p.org_id === ctx.orgId);
            if (!row) return { ok: false, error: "not_found", code: "not_found" };
            if (input.expected_version && row.updated_at !== input.expected_version) {
                return { ok: false, error: "record_not_found_or_stale", code: "stale" };
            }
            store.writeCalls += 1;
            Object.assign(row, input.patch);
            return { ok: true };
        },
        async createHousehold(ctx, input) {
            store.writeCalls += 1;
            const row: Row = { id: store.id("cust"), org_id: ctx.orgId, name: input.household_name };
            store.customers.push(row);
            return { id: row.id, created: true };
        },
        async linkPersonToHousehold(ctx, input) {
            const existing = store.customer_persons.find(
                (r) => r.customer_id === input.household_id && r.person_id === input.person_id,
            );
            if (existing) return { id: existing.id, created: false };
            store.writeCalls += 1;
            const row: Row = { id: store.id("cp"), org_id: ctx.orgId, ...input };
            store.customer_persons.push(row);
            return { id: row.id, created: true };
        },
        async createChild(ctx, input) {
            store.writeCalls += 1;
            const row: Row = { id: store.id("cm"), org_id: ctx.orgId, ...input };
            store.customer_members.push(row);
            return { id: row.id, created: true };
        },
        async updateChild(ctx, input) {
            const row = store.customer_members.find((r) => r.id === input.child_id && r.org_id === ctx.orgId);
            if (!row) return { ok: false, error: "not_found" };
            if (input.expected_version && row.updated_at !== input.expected_version) {
                return { ok: false, error: "stale", code: "stale" };
            }
            store.writeCalls += 1;
            Object.assign(row, input.patch);
            return { ok: true };
        },
        async createLead(ctx, input) {
            store.writeCalls += 1;
            const row: Row = { id: store.id("opp"), org_id: ctx.orgId, ...input };
            store.opportunities.push(row);
            return { id: row.id, created: true };
        },
        async updateLead(ctx, input) {
            const row = store.opportunities.find((r) => r.id === input.lead_id && r.org_id === ctx.orgId);
            if (!row) return { ok: false, error: "not_found" };
            if (input.expected_version && row.updated_at !== input.expected_version) {
                return { ok: false, error: "stale", code: "stale" };
            }
            store.writeCalls += 1;
            Object.assign(row, input.patch);
            return { ok: true };
        },
        async linkPersonToLead(ctx, input) {
            store.writeCalls += 1;
            const row: Row = { id: store.id("op"), org_id: ctx.orgId, ...input };
            store.opportunity_persons.push(row);
            return { id: row.id, created: true };
        },
        async createProcessParticipation(ctx, input) {
            const existing = store.process_instances.find(
                (r) => r.subject_id === input.child_id && r.context_id === input.lead_id,
            );
            if (existing) return { id: existing.id };
            store.writeCalls += 1;
            const row: Row = {
                id: store.id("pi"),
                org_id: ctx.orgId,
                subject_id: input.child_id,
                context_id: input.lead_id,
                stage_key: input.stage_key,
                state: input.state,
            };
            store.process_instances.push(row);
            return { id: row.id };
        },
        async updateProcessParticipation(ctx, input) {
            const row = store.process_instances.find((r) => r.id === input.participation_id && r.org_id === ctx.orgId);
            if (!row) return { ok: false, error: "not_found" };
            store.writeCalls += 1;
            Object.assign(row, input.patch);
            return { ok: true };
        },
        async readRecordOrg(_ctx, input) {
            const row = table(input.table)?.find((r) => r.id === input.id);
            return row ? String(row.org_id) : null;
        },
        async attachDocument(ctx, input) {
            const row = store.documents.find((r) => r.id === input.document_id && r.org_id === ctx.orgId);
            if (!row) return { ok: false, error: "document_not_found" };
            store.writeCalls += 1;
            row.entity_type = input.target_entity_type;
            row.entity_id = input.target_entity_id;
            return { ok: true };
        },
        async updateCommunicationPreferences(ctx, input) {
            store.writeCalls += 1;
            store.communication_preferences.push({ id: store.id("pref"), org_id: ctx.orgId, ...input });
            return { ok: true };
        },
    };
}

const ORG = "org-A";
function ctx(store: FakeStore, overrides: Partial<CommandContext> = {}): CommandContext {
    return {
        // supabase is unused when ports are injected
        supabase: {} as never,
        orgId: ORG,
        actorId: "user-1",
        idempotencyKey: "plan-1:op-1",
        ports: fakePorts(store),
        ...overrides,
    };
}

describe("D0 registry resolution", () => {
    it("resolves every supported command", () => {
        for (const key of Object.values(IDENTITY_COMMAND_KEYS)) {
            expect(getIdentityCommand(key), key).not.toBeNull();
        }
        expect(registeredIdentityCommandKeys().sort()).toEqual(Object.values(IDENTITY_COMMAND_KEYS).sort());
    });

    it("rejects an unknown command", () => {
        expect(getIdentityCommand("frobnicate_widget")).toBeNull();
    });

    it("rejects a raw table / physical command", () => {
        for (const bad of [
            "insert_persons_row",
            "update_customers_table",
            "create_ocm",
            "insert_process_instances",
            "generic_mutation_command",
            "execute_sql",
            "update_arbitrary_record",
        ]) {
            expect(getIdentityCommand(bad), bad).toBeNull();
        }
    });

    it("throws typed errors on execute for unknown/forbidden keys", async () => {
        const store = new FakeStore();
        await expect(executeIdentityCommand("execute_sql", {}, ctx(store))).rejects.toBeInstanceOf(CommandRegistryError);
        await expect(executeIdentityCommand("nope", {}, ctx(store))).rejects.toBeInstanceOf(CommandRegistryError);
    });
});

describe("D0 command metadata", () => {
    it("every command has complete metadata", () => {
        for (const key of Object.values(IDENTITY_COMMAND_KEYS)) {
            const md = getCommandMetadata(key)!;
            expect(md.key).toBe(key);
            expect(md.version).toBeTruthy();
            expect(md.requiredPermission).toBeTruthy();
            expect(md.targetType).toBeTruthy();
            expect(["atomic", "dependent", "asynchronous"]).toContain(md.atomicity);
            expect(["reversible", "compensatable", "irreversible"]).toContain(md.reversibility);
            expect(["natural_key", "operation_key"]).toContain(md.idempotency);
            expect(Array.isArray(md.downstreamEvents)).toBe(true);
            expect(Array.isArray(md.sensitiveFields)).toBe(true);
        }
    });

    it("classifies communication side effects as asynchronous", () => {
        expect(getCommandMetadata(IDENTITY_COMMAND_KEYS.updateCommunicationPreferences)!.atomicity).toBe("asynchronous");
        expect(getCommandMetadata(IDENTITY_COMMAND_KEYS.attachDocument)!.atomicity).toBe("asynchronous");
    });

    it("hides the participation storage substrate", () => {
        const md = getCommandMetadata(IDENTITY_COMMAND_KEYS.createProcessParticipation)!;
        expect(md.targetType).toBe("participation");
        const serialized = JSON.stringify(md).toLowerCase();
        expect(serialized).not.toContain("ocm");
        expect(serialized).not.toContain("process_instances");
        expect(serialized).not.toContain("opportunity_customer_members");
    });
});

describe("D0 safety enforcement", () => {
    it("requires an idempotency key to execute", async () => {
        const store = new FakeStore();
        await expect(
            executeIdentityCommand(IDENTITY_COMMAND_KEYS.createHousehold, { household_name: "Smith" }, ctx(store, { idempotencyKey: "" })),
        ).rejects.toMatchObject({ code: "missing_idempotency_key" });
    });

    it("accepts a same-org command", async () => {
        const store = new FakeStore();
        const res = await executeIdentityCommand(IDENTITY_COMMAND_KEYS.createHousehold, { household_name: "Smith" }, ctx(store));
        expect(res.ok).toBe(true);
        expect(store.customers).toHaveLength(1);
    });

    it("rejects a cross-tenant reference", async () => {
        const store = new FakeStore();
        store.persons.push({ id: "person-foreign", org_id: "org-OTHER" });
        store.customers.push({ id: "cust-foreign", org_id: "org-OTHER", name: "Foreign" });
        const res = await executeIdentityCommand(
            IDENTITY_COMMAND_KEYS.linkPersonToHousehold,
            { person_id: "person-foreign", household_id: "cust-foreign" },
            ctx(store),
        );
        expect(res.ok).toBe(false);
        expect(res.error).toContain("cross_tenant_reference");
    });

    it("rejects a version mismatch (stale expected_version)", async () => {
        const store = new FakeStore();
        store.persons.push({ id: "p1", org_id: ORG, updated_at: "v1" });
        const res = await executeIdentityCommand(
            IDENTITY_COMMAND_KEYS.updatePerson,
            { person_id: "p1", expected_version: "STALE", first_name: "New" },
            ctx(store),
        );
        expect(res.ok).toBe(false);
        expect(res.error).toContain("stale");
    });

    it("refuses to execute merge in V1 (escalation only)", async () => {
        const store = new FakeStore();
        const res = await executeIdentityCommand(
            IDENTITY_COMMAND_KEYS.proposeMerge,
            { entity_type: "person", survivor_id: "p1", duplicate_id: "p2", reason: "same email" },
            ctx(store),
        );
        expect(res.ok).toBe(false);
        expect(res.error).toContain("not_executable_in_v1");
        expect(getCommandMetadata(IDENTITY_COMMAND_KEYS.proposeMerge)!.executableInV1).toBe(false);
    });
});

describe("D0 preview is side-effect free", () => {
    it("preview does not mutate the store", async () => {
        const store = new FakeStore();
        await previewIdentityCommand(IDENTITY_COMMAND_KEYS.createPerson, { email: "a@b.com", first_name: "A" }, ctx(store));
        await previewIdentityCommand(IDENTITY_COMMAND_KEYS.createHousehold, { household_name: "Smith" }, ctx(store));
        expect(store.writeCalls).toBe(0);
        expect(store.persons).toHaveLength(0);
        expect(store.customers).toHaveLength(0);
    });
});

describe("D0 handlers execute real repository behavior", () => {
    it("creates a person and is idempotent on natural key", async () => {
        const store = new FakeStore();
        const c = ctx(store);
        const first = await executeIdentityCommand(IDENTITY_COMMAND_KEYS.createPerson, { email: "a@b.com", first_name: "A" }, c);
        expect(first.ok).toBe(true);
        expect(first.idempotentReplay).toBe(false);
        expect(first.refs[0].created).toBe(true);
        const personId = first.refs[0].recordId;

        // duplicate execution returns the prior record (safe equivalent)
        const second = await executeIdentityCommand(IDENTITY_COMMAND_KEYS.createPerson, { email: "a@b.com", first_name: "A" }, c);
        expect(second.ok).toBe(true);
        expect(second.idempotentReplay).toBe(true);
        expect(second.refs[0].recordId).toBe(personId);
        expect(store.persons).toHaveLength(1);
    });

    it("validates create_person requires a full name or an email/phone signal", async () => {
        const v = await validateIdentityCommand(IDENTITY_COMMAND_KEYS.createPerson, { first_name: "A" }, ctx(new FakeStore()));
        expect(v.ok).toBe(false);
        expect(v.issues[0].code).toBe("insufficient_identity");

        const nameOnly = await validateIdentityCommand(
            IDENTITY_COMMAND_KEYS.createPerson,
            { first_name: "Jason", last_name: "Lyons" },
            ctx(new FakeStore()),
        );
        expect(nameOnly.ok).toBe(true);
    });

    it("runs a non-enrollment fixture: person + household + link + document attach", async () => {
        const store = new FakeStore();
        const c = ctx(store);

        const person = await executeIdentityCommand(IDENTITY_COMMAND_KEYS.createPerson, { email: "p@x.com", first_name: "Pat" }, c);
        const household = await executeIdentityCommand(IDENTITY_COMMAND_KEYS.createHousehold, { household_name: "Pat Household" }, c);
        const link = await executeIdentityCommand(
            IDENTITY_COMMAND_KEYS.linkPersonToHousehold,
            { person_id: person.refs[0].recordId, household_id: household.refs[0].recordId },
            c,
        );
        expect(person.ok && household.ok && link.ok).toBe(true);

        store.documents.push({ id: "doc-1", org_id: ORG });
        const attach = await executeIdentityCommand(
            IDENTITY_COMMAND_KEYS.attachDocument,
            { document_id: "doc-1", target_entity_type: "person", target_entity_id: person.refs[0].recordId },
            c,
        );
        expect(attach.ok).toBe(true);
        expect(store.documents[0].entity_id).toBe(person.refs[0].recordId);
        // No enrollment participation was created — non-enrollment path works.
        expect(store.process_instances).toHaveLength(0);
    });

    it("creates an enrollment participation without exposing physical storage in the payload", async () => {
        const store = new FakeStore();
        const c = ctx(store);
        store.customer_members.push({ id: "cm-1", org_id: ORG });
        store.opportunities.push({ id: "opp-1", org_id: ORG });
        const res = await executeIdentityCommand(
            IDENTITY_COMMAND_KEYS.createProcessParticipation,
            { child_id: "cm-1", lead_id: "opp-1", participation: { start_date: "2026-09-01" } },
            c,
        );
        expect(res.ok).toBe(true);
        expect(res.refs[0].targetType).toBe("participation");
        expect(store.process_instances).toHaveLength(1);
    });
});
