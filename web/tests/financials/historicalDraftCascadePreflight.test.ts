/**
 * THE HISTORICAL-DRAFT RESET'S CASCADE PREFLIGHT, AGAINST THE MIGRATION SCHEMA.
 *
 * The live reset of certenv-f9bf38cbf3 (qar_ed2cd1c477c4, 2026-11-02) refused in its preflight with
 * `read_failed table=customer_tags sqlstate=42703`: the cascade probe selected `id` from every
 * dependent, and the join tables customer_tags and location_tags have no `id`. The in-memory mock
 * ignores projections, so no local test could see it. Here every request goes through a client that
 * answers from the schema replayed out of `supabase/migrations` — the DDL the certification
 * environment is built from — so an unknown column fails as it does on Postgres (42703).
 *
 * Nothing here connects anywhere.
 */
import { fileURLToPath } from "node:url";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const SENTINEL = vi.hoisted(() => "sk_synthetic_never_print_cascade_0123456789");
const clients = vi.hoisted(() => ({ impl: null as null | (() => unknown) }));
vi.mock("node:child_process", async (orig) => ({
    ...(await orig<typeof import("node:child_process")>()),
    spawn: vi.fn(() => {
        throw new Error(`spawn refused in this suite: ${SENTINEL}`);
    }),
}));
vi.mock("@supabase/supabase-js", async (orig) => ({
    ...(await orig<typeof import("@supabase/supabase-js")>()),
    createClient: vi.fn(() => {
        if (clients.impl) return clients.impl();
        throw new Error(`no client may be created in this suite: ${SENTINEL}`);
    }),
}));

import { main as historicalMain } from "../../scripts/qa/financialsHistoricalDraftFixture";
import {
    CASCADE_DEPENDENTS,
    censusHistoricalDraft,
    ensureHistoricalDraft,
    IDS,
    NAMESPACE,
    plannedRows,
    RESET_LIMIT,
    resetHistoricalDraft,
} from "../../scripts/qa/financialsHistoricalDraftFixtureCore";
import { FINANCIALS_HISTORICAL_DRAFT_PROGRAM } from "../../scripts/qa/financialsFixtureAuthority.mjs";
import { createOperationalEnrollmentMockStore, createOperationalEnrollmentMockSupabase } from "../childcareOperational/mockOperationalEnrollmentSupabase";
import { loadMigrationSchema, type MigrationSchema } from "../harness/migrationSchema";
import { schemaAwareSupabase, type PlantedFailure } from "../harness/schemaAwareSupabase";
import { SYNTHETIC_PERSONA_ORG, syntheticExecutorStore } from "../harness/syntheticFixtureAuthority";

const ORG = SYNTHETIC_PERSONA_ORG;
const NEIGHBOUR = "11111111-0000-4000-8000-000000000001";
const SCHEMA = loadMigrationSchema(fileURLToPath(new URL("../../../supabase/migrations", import.meta.url)));
/* The parent each CASCADE_DEPENDENTS entry hangs off. */
const PARENT_TABLE: Record<string, string> = {
    draft: "charges", customer: "customers", person: "persons", member: "customer_members", agreement: "child_enrollment_agreements", site: "locations",
};
/* Children of the household the fixture itself creates, checked as foreign siblings rather than as cascade dependents. */
const SIBLING_TABLES = ["locations", "customer_members", "financial_policies", "child_enrollment_agreements"];

type Store = Record<string, Array<Record<string, unknown>>>;

function setup(schema: MigrationSchema = SCHEMA, fail: PlantedFailure[] = []) {
    const store = createOperationalEnrollmentMockStore({ child_enrollment_agreements: [], customer_members: [], financial_policies: [] }) as unknown as Store;
    Object.assign(store, {
        orgs: [{ id: ORG }],
        customers: [{ id: NEIGHBOUR, org_id: ORG, name: "Neighbour household", external_source: null, external_id: null, metadata: {} }],
        gl_account_mappings: [],
        financial_journal_entries: [],
        customer_tags: [],
        location_tags: [],
    });
    const raw = createOperationalEnrollmentMockSupabase(store as never);
    const checked = schemaAwareSupabase(raw, schema, { fail });
    return { store, db: checked.db, ops: checked.ops };
}

async function ensured(schema: MigrationSchema = SCHEMA, fail: PlantedFailure[] = []) {
    const env = setup(schema, fail);
    /* Seeded through the schema too: every insert the fixture and the product's draft writer make is a real column. */
    const e = await ensureHistoricalDraft(env.db as never, ORG);
    expect(e.exitCode).toBe(0);
    expect(env.ops.filter((o) => o.refused)).toEqual([]);
    env.ops.length = 0;
    return env;
}

const deletes = (ops: ReturnType<typeof setup>["ops"]) => ops.filter((o) => o.kind === "delete");

/** A copy of the schema with one change, for drift that the migrations do not contain. */
function drifted(edit: (tables: Map<string, Set<string>>) => void): MigrationSchema {
    const tables = new Map([...SCHEMA.tables].map(([t, c]) => [t, new Set(c)]));
    edit(tables);
    return { ...SCHEMA, tables };
}

/* ── the schema the certification environment is built from ───────────────────────────────────── */

describe("the migration schema, as the reset's contract", () => {
    it("is the certified migration set, and models the join tables the live reset failed on", () => {
        expect(SCHEMA.head).toBe("20261214090000");
        expect([...SCHEMA.tables.get("customer_tags")!].sort()).toEqual(["created_at", "customer_id", "tag_id"]);
        expect([...SCHEMA.tables.get("location_tags")!].sort()).toEqual(["created_at", "location_id", "tag_id"]);
        expect(SCHEMA.foreignKeys).toContainEqual(expect.objectContaining({ table: "customer_tags", columns: ["customer_id"], refTable: "customers", onDelete: "CASCADE" }));
    });

    it("every CASCADE_DEPENDENTS entry is an existing column with an ON DELETE CASCADE key to its parent", () => {
        const bad = CASCADE_DEPENDENTS.filter((d) => {
            const cols = SCHEMA.tables.get(d.table);
            const fk = SCHEMA.foreignKeys.some((f) => f.table === d.table && f.columns.length === 1 && f.columns[0] === d.column
                && f.refTable === PARENT_TABLE[d.parent] && f.onDelete === "CASCADE");
            return !cols?.has(d.column) || !fk;
        });
        expect(bad).toEqual([]);
    });

    it("no ON DELETE CASCADE key into a table the reset deletes from is missing from the preflight", () => {
        const deleted = new Set([...plannedRows().map((p) => p.table), "charges", "financial_billing_periods"]);
        const listed = new Set(CASCADE_DEPENDENTS.map((d) => `${d.table}.${d.column}`));
        const unchecked = SCHEMA.foreignKeys
            .filter((f) => f.onDelete === "CASCADE" && deleted.has(f.refTable))
            .map((f) => `${f.table}.${f.columns.join(",")}`)
            .filter((k) => !listed.has(k) && !SIBLING_TABLES.some((t) => k === `${t}.customer_id`));
        expect(unchecked).toEqual([]);
    });

    it("the dependents without an `id` include both join tables — a probe may not assume one", () => {
        const idless = CASCADE_DEPENDENTS.filter((d) => !SCHEMA.tables.get(d.table)!.has("id")).map((d) => d.table);
        expect(idless).toEqual(expect.arrayContaining(["customer_tags", "location_tags"]));
    });
});

/* ── the reset over the schema-aware client ────────────────────────────────────────────────────── */

describe("reset preflight against the migration schema", () => {
    it("with the join tables empty, the reset is bounded and complete, every read is valid, and census reads zero", async () => {
        const { db, ops, store } = await ensured();
        const before = await censusHistoricalDraft(db as never, ORG);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r.checks).toEqual([{ ok: true, check: `reset complete: removed ${before.count} of ${before.count} fixture row(s); no ledger touched` }]);
        expect(r).toMatchObject({ exitCode: 0, removed: before.count, complete: true });
        expect(await censusHistoricalDraft(db as never, ORG)).toMatchObject({ exitCode: 0, count: 0 });
        expect(ops.filter((o) => o.refused)).toEqual([]);
        /* The join tables were probed by their key, not skipped. */
        expect(ops).toContainEqual(expect.objectContaining({ kind: "select", table: "customer_tags", columns: ["customer_id"], refused: null }));
        expect(ops).toContainEqual(expect.objectContaining({ kind: "select", table: "location_tags", columns: ["location_id"], refused: null }));
        expect(store.customers.map((c) => c.id)).toEqual([NEIGHBOUR]);
    });

    it("every cascade and sibling probe precedes the first delete", async () => {
        const { db, ops } = await ensured();
        await resetHistoricalDraft(db as never, ORG);
        const firstDelete = ops.findIndex((o) => o.kind === "delete");
        expect(firstDelete).toBeGreaterThan(0);
        const probed = (o: (typeof ops)[number], table: string, column: string) => o.kind === "select" && o.table === table && o.filters.includes(`in:${column}`);
        const preflight = ops.slice(0, firstDelete);
        /* Every dependent (draft dependents included — the fixture has its draft) was probed before anything was deleted… */
        expect(CASCADE_DEPENDENTS.filter((d) => !preflight.some((o) => probed(o, d.table, d.column)))).toEqual([]);
        expect(SIBLING_TABLES.filter((t) => !preflight.some((o) => o.kind === "select" && o.table === t && o.filters.includes("eq:customer_id")))).toEqual([]);
        /* …and no dependent is probed once deletes have begun. */
        expect(ops.slice(firstDelete).some((o) => CASCADE_DEPENDENTS.some((d) => probed(o, d.table, d.column)))).toBe(false);
    });

    it.each([
        ["customer_tags", (s: Store) => s.customer_tags.push({ customer_id: IDS.customer, tag_id: "7a000000-0000-4000-8000-000000000001" }), /^reset refused, nothing removed: 1 customer_tags row\(s\) depend on the fixture by customer_id \(ON DELETE CASCADE\)$/],
        ["location_tags", (s: Store) => s.location_tags.push({ location_id: IDS.site, tag_id: "7a000000-0000-4000-8000-000000000002" }), /^reset refused, nothing removed: 1 location_tags row\(s\) depend on the fixture by location_id \(ON DELETE CASCADE\)$/],
        ["customer_persons (has an id)", (s: Store) => (s.customer_persons ??= []).push({ id: "7b000000-0000-4000-8000-000000000001", customer_id: IDS.customer }), /1 customer_persons row\(s\) depend on the fixture by customer_id/],
    ])("a dependent row in %s refuses the WHOLE reset: nothing deleted, store unchanged", async (_t, plant, why) => {
        const { db, ops, store } = await ensured();
        plant(store);
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r).toMatchObject({ exitCode: 1, removed: 0, complete: false, lines: [`reset namespace=${NAMESPACE} removed=0`] });
        expect(r.checks[0].check).toMatch(why);
        expect(deletes(ops)).toEqual([]);
        expect(JSON.stringify(store)).toBe(before);
    });

    it.each([
        ["a dependent's foreign-key column is missing (schema drift)", drifted((t) => t.get("customer_tags")!.delete("customer_id")), [], "customer_tags", "42703"],
        ["a dependent table is missing (schema drift)", drifted((t) => t.delete("location_tags")), [], "location_tags", "42P01"],
        ["a dependent probe fails on the server", SCHEMA, [{ table: "customer_tags", kind: "select", code: "08006" }] as PlantedFailure[], "customer_tags", "08006"],
    ])("%s → the reset fails closed before any delete", async (_l, schema, fail, table, sqlstate) => {
        const { db, ops, store } = await ensured(schema, fail);
        const before = JSON.stringify(store);
        await expect(resetHistoricalDraft(db as never, ORG)).rejects.toMatchObject({ code: "read_failed", table, sqlstate });
        expect(deletes(ops)).toEqual([]);
        expect(JSON.stringify(store)).toBe(before);
    });

    it.each([
        ["a posted charge on the fixture agreement", (s: Store) => s.charges.push({ id: "c0000000-0000-4000-8000-000000000001", org_id: ORG, billable_source_id: IDS.agreement, status: "posted", metadata: {} }), /posted\/void charge/],
        ["a charge elsewhere from the fixture template", (s: Store) => s.charges.push({ id: "c0000000-0000-4000-8000-000000000002", org_id: ORG, billable_source_id: NEIGHBOUR, charge_template_id: IDS.template, status: "draft", metadata: {} }), /outside the fixture use the fixture template/],
        ["a payment on the household", (s: Store) => s.payments.push({ id: "c0000000-0000-4000-8000-000000000003", org_id: ORG, customer_id: IDS.customer }), /payments row/],
        ["a journal entry on the household", (s: Store) => s.financial_journal_entries.push({ id: "c0000000-0000-4000-8000-000000000004", org_id: ORG, customer_id: IDS.customer }), /financial_journal_entries row/],
        ["a closed billing period", (s: Store) => s.financial_billing_periods.push({ id: "c0000000-0000-4000-8000-000000000005", org_id: ORG, customer_id: IDS.customer, status: "closed" }), /closed billing period/],
        ["a foreign member under the household", (s: Store) => s.customer_members.push({ id: "c0000000-0000-4000-8000-000000000006", org_id: ORG, customer_id: IDS.customer }), /customer_members row\(s\) under the fixture household are not the fixture's/],
    ])("ledger and foreign refusals still hold over the schema: %s → nothing removed", async (_l, plant, why) => {
        const { db, ops, store } = await ensured();
        plant(store);
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r).toMatchObject({ exitCode: 1, removed: 0 });
        expect(r.checks[0].check).toMatch(why);
        expect(ops.filter((o) => o.refused)).toEqual([]);
        expect(deletes(ops)).toEqual([]);
        expect(JSON.stringify(store)).toBe(before);
    });

    async function atTotal(total: number) {
        const env = await ensured();
        const count = (await censusHistoricalDraft(env.db as never, ORG)).count!;
        for (let i = 0; i < total - count; i++) {
            env.store.charges.push({ id: `d0000000-0000-4000-8000-${String(i).padStart(12, "0")}`, org_id: ORG, billable_source_id: IDS.agreement, charge_template_id: IDS.template, status: "draft", metadata: {} });
        }
        expect((await censusHistoricalDraft(env.db as never, ORG)).count).toBe(total);
        env.ops.length = 0;
        return env;
    }

    it(`exactly ${RESET_LIMIT} rows is within the cap: all removed`, async () => {
        const { db } = await atTotal(RESET_LIMIT);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r).toMatchObject({ exitCode: 0, removed: RESET_LIMIT, complete: true });
        expect(await censusHistoricalDraft(db as never, ORG)).toMatchObject({ count: 0 });
    });

    it(`${RESET_LIMIT + 1} rows refuses before the first delete: no partial delete`, async () => {
        const { db, ops, store } = await atTotal(RESET_LIMIT + 1);
        const before = JSON.stringify(store);
        const r = await resetHistoricalDraft(db as never, ORG);
        expect(r).toMatchObject({ exitCode: 1, removed: 0 });
        expect(r.checks[0].check).toBe(`reset refused, nothing removed: ${RESET_LIMIT + 1} rows exceed the limit of ${RESET_LIMIT}`);
        expect(deletes(ops)).toEqual([]);
        expect(JSON.stringify(store)).toBe(before);
    });
});

/* ── the executor-facing entry: the exact lines the live receipt carried ───────────────────────── */

describe("reset through the entry, over the schema", () => {
    const stores: Array<{ cleanup: () => void }> = [];
    afterAll(() => stores.forEach((s) => s.cleanup()));
    beforeEach(() => {
        clients.impl = null;
    });
    async function runReset(db: unknown) {
        const s = syntheticExecutorStore({ program: FINANCIALS_HISTORICAL_DRAFT_PROGRAM, operation: "reset" });
        stores.push(s);
        clients.impl = () => db;
        const out: string[] = [];
        const code = await historicalMain({ ...s.env(), SUPABASE_SERVICE_ROLE_KEY: SENTINEL } as never, ["--reset"], (l) => out.push(l), s.options());
        return { code, out };
    }

    it("the certified schema: the reset completes and reports its exact count", async () => {
        const { db } = await ensured();
        const count = (await censusHistoricalDraft(db as never, ORG)).count!;
        const { code, out } = await runReset(db);
        expect(code).toBe(0);
        expect(out.at(-1)).toBe(`reset namespace=${NAMESPACE} removed=${count}`);
        expect(out.join("\n")).not.toContain(SENTINEL);
    });

    it("a dependent column the schema lacks: the live receipt's shape — read_failed, SQLSTATE, removed=0", async () => {
        const { db, ops } = await ensured(drifted((t) => t.get("customer_tags")!.delete("customer_id")));
        const { code, out } = await runReset(db);
        expect(code).toBe(1);
        expect(out.slice(-2)).toEqual(["✗ reset failed: read_failed table=customer_tags sqlstate=42703", `reset namespace=${NAMESPACE} removed=0`]);
        expect(deletes(ops)).toEqual([]);
        expect(out.join("\n")).not.toContain(SENTINEL);
    });
});
