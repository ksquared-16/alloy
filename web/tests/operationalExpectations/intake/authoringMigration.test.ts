/**
 * P1 · Wave B — static migration validation (no live Postgres in CI). Proves the
 * Wave B migration is additive, idempotent, tenant-safe, preserves the Wave A
 * write boundary, and delivers the atomic authoring RPC (row + Authoring Act in one
 * transaction) as service-role-only infrastructure.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    grantsPrivilegeTo,
    insertPolicyForRolePresent,
    readMigrationsOrderedTouching,
    stripSqlComments,
} from "../../operationalLedger/ledgerSchemaScan";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");
const WAVE_B = "20260719000000_operational_expectations_authoring_intake_p1_wave_b.sql";
const WAVE_B_CLOSE = "20260720000000_operational_expectations_author_permission_and_idempotency.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, WAVE_B), "utf8");
// The EFFECTIVE (last-defined) authoring RPC + the dedicated permission seed.
const closeSql = readFileSync(join(MIGRATIONS_DIR, WAVE_B_CLOSE), "utf8");
// Comment-stripped executable DDL — for ABSENCE assertions (a phrase in a comment
// must not read as executable SQL).
const closeExec = stripSqlComments(closeSql);

describe("Wave B migration — additive idempotency substrate", () => {
    it("adds idempotency_key + payload_fingerprint with ADD COLUMN IF NOT EXISTS (additive)", () => {
        expect(/ADD COLUMN IF NOT EXISTS idempotency_key text/i.test(sql)).toBe(true);
        expect(/ADD COLUMN IF NOT EXISTS payload_fingerprint text/i.test(sql)).toBe(true);
    });

    it("creates a PARTIAL unique index on (org_id, idempotency_key)", () => {
        expect(/CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_expectations_org_idempotency[\s\S]*?\(org_id, idempotency_key\)[\s\S]*?WHERE idempotency_key IS NOT NULL/i.test(sql)).toBe(true);
    });

    it("does NOT drop or alter any Wave A column/constraint/data", () => {
        expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT|TRIGGER|POLICY)/i.test(sql)).toBe(false);
        expect(/UPDATE\s+public\.operational_expectations/i.test(sql)).toBe(false);
        expect(/DELETE\s+FROM\s+public\.operational_expectations/i.test(sql)).toBe(false);
    });
});

describe("Wave B migration — atomic authoring RPC (row + Authoring Act, one txn)", () => {
    it("defines author_operational_expectation as SECURITY DEFINER", () => {
        expect(/CREATE OR REPLACE FUNCTION public\.author_operational_expectation/i.test(sql)).toBe(true);
        expect(/SECURITY DEFINER/i.test(sql)).toBe(true);
    });

    it("inserts BOTH the ledger row AND the mutation_events Authoring Act inside the function", () => {
        expect(/INSERT INTO public\.operational_expectations/i.test(sql)).toBe(true);
        expect(/INSERT INTO public\.mutation_events/i.test(sql)).toBe(true);
        // The Authoring Act is domain=operational_expectations, command_key=author_expectation.
        expect(/'author_expectation', 'operational_expectations'/i.test(sql)).toBe(true);
    });

    it("is idempotent per (org_id, idempotency_key) and conflicts on divergent payload", () => {
        expect(/WHERE org_id = p_org_id AND idempotency_key = v_key/i.test(sql)).toBe(true);
        expect(/oe_idempotency_conflict/i.test(sql)).toBe(true);
    });

    it("is service-role-only infrastructure (REVOKE PUBLIC, GRANT service_role)", () => {
        expect(/REVOKE ALL ON FUNCTION public\.author_operational_expectation[\s\S]*?FROM PUBLIC/i.test(sql)).toBe(true);
        expect(/GRANT EXECUTE ON FUNCTION public\.author_operational_expectation[\s\S]*?TO service_role/i.test(sql)).toBe(true);
        expect(/TO authenticated/i.test(sql)).toBe(false);
    });

    it("does not insert a client recorded time OR lineage root (both left to the Wave A trigger)", () => {
        // The INSERT column list into operational_expectations must NOT include
        // authored_at (recorded time) or lineage_root_id — both are server-set by
        // the Wave A trigger; a caller cannot forge them.
        const insertBlock = sql.match(/INSERT INTO public\.operational_expectations\s*\(([\s\S]*?)\)\s*VALUES/i);
        expect(insertBlock, "INSERT column list found").not.toBeNull();
        expect(/\bauthored_at\b/i.test(insertBlock![1])).toBe(false);
        expect(/\blineage_root_id\b/i.test(insertBlock![1])).toBe(false);
    });

    it("the initial RPC is hardened: SET search_path, no dynamic SQL, no client recorded time", () => {
        expect(/SET search_path = public/i.test(sql)).toBe(true);
        expect(/EXECUTE\s+format\s*\(|EXECUTE\s+['"]/i.test(sql)).toBe(false);
    });
});

describe("Wave B closure — dedicated authoring capability (RBAC)", () => {
    it("seeds operational_expectations.author into the permission catalog", () => {
        expect(/INSERT INTO public\.permissions[\s\S]*?'operational_expectations\.author'/i.test(closeSql)).toBe(true);
        expect(/INSERT INTO public\.permission_keys[\s\S]*?'operational_expectations\.author'/i.test(closeSql)).toBe(true);
        expect(/INSERT INTO public\.permission_definitions[\s\S]*?'operational_expectations\.author'/i.test(closeSql)).toBe(true);
    });

    it("grants it by default ONLY to the org admin role (idempotent, per-org)", () => {
        expect(/INSERT INTO public\.role_permission_grants[\s\S]*?'admin', 'operational_expectations\.author'[\s\S]*?FROM public\.orgs/i.test(closeSql)).toBe(true);
        expect(/WHERE NOT EXISTS/i.test(closeSql)).toBe(true);
        // Not granted to workflows.write holders or every role (executable DDL only).
        expect(/workflows\.write/i.test(closeExec)).toBe(false);
    });
});

describe("Wave B closure — concurrent-idempotency hardened RPC (effective definition)", () => {
    it("CREATE OR REPLACE keeps SECURITY DEFINER + SET search_path + service_role-only", () => {
        expect(/CREATE OR REPLACE FUNCTION public\.author_operational_expectation/i.test(closeSql)).toBe(true);
        expect(/SECURITY DEFINER/i.test(closeSql)).toBe(true);
        expect(/SET search_path = public/i.test(closeSql)).toBe(true);
        expect(/REVOKE ALL ON FUNCTION public\.author_operational_expectation[\s\S]*?FROM PUBLIC/i.test(closeSql)).toBe(true);
        expect(/GRANT EXECUTE ON FUNCTION public\.author_operational_expectation[\s\S]*?TO service_role/i.test(closeSql)).toBe(true);
        expect(/TO authenticated/i.test(closeSql)).toBe(false);
    });

    it("uses insert-with-conflict-catch (unique_violation → reload winner), not FOR UPDATE on an absent key", () => {
        expect(/EXCEPTION WHEN unique_violation THEN/i.test(closeSql)).toBe(true);
        // On conflict it reloads the winner by (org_id, idempotency_key).
        expect(/SELECT \* INTO v_existing[\s\S]*?WHERE org_id = p_org_id AND idempotency_key = v_key/i.test(closeSql)).toBe(true);
        // No FOR UPDATE over the not-yet-existing key (executable DDL only).
        expect(/FOR UPDATE/i.test(closeExec)).toBe(false);
    });

    it("distinguishes identical retry (disposition existing) from conflicting reuse (typed conflict)", () => {
        expect(/'disposition', 'created'/i.test(closeSql)).toBe(true);
        expect(/'disposition', 'existing'/i.test(closeSql)).toBe(true);
        // Divergent fingerprint → typed conflict; identical → return existing.
        expect(/payload_fingerprint IS DISTINCT FROM v_fingerprint[\s\S]*?oe_idempotency_conflict/i.test(closeSql)).toBe(true);
    });

    it("inserts the ledger row AND exactly one Authoring Act; the conflict path inserts NEITHER a second row nor a second event", () => {
        // Exactly one INSERT INTO mutation_events (the created path).
        const outboxInserts = (closeSql.match(/INSERT INTO public\.mutation_events/gi) ?? []).length;
        expect(outboxInserts).toBe(1);
        const ledgerInserts = (closeSql.match(/INSERT INTO public\.operational_expectations/gi) ?? []).length;
        expect(ledgerInserts).toBe(1);
        // The conflict path only SELECTs the existing outbox event (no re-insert).
        expect(/SELECT mutation_id INTO v_event_id[\s\S]*?FROM public\.mutation_events/i.test(closeSql)).toBe(true);
    });

    it("still leaves recorded time + lineage root to the Wave A trigger (not caller-suppliable)", () => {
        const insertBlock = closeSql.match(/INSERT INTO public\.operational_expectations\s*\(([\s\S]*?)\)\s*VALUES/i);
        expect(insertBlock).not.toBeNull();
        expect(/\bauthored_at\b/i.test(insertBlock![1])).toBe(false);
        expect(/\blineage_root_id\b/i.test(insertBlock![1])).toBe(false);
    });

    it("has no dynamic SQL", () => {
        expect(/EXECUTE\s+format\s*\(|EXECUTE\s+['"]/i.test(closeSql)).toBe(false);
    });
});

describe("Wave B migration — write boundary preserved (no new client write path)", () => {
    it("introduces no authenticated/anon INSERT grant on the ledger", () => {
        const cumulative = readMigrationsOrderedTouching("operational_expectations").concatenated;
        expect(grantsPrivilegeTo(cumulative, "operational_expectations", "insert", "authenticated")).toBe(false);
        expect(grantsPrivilegeTo(cumulative, "operational_expectations", "insert", "anon")).toBe(false);
    });

    it("introduces no authenticated/anon INSERT policy on the ledger", () => {
        const cumulative = readMigrationsOrderedTouching("operational_expectations").concatenated;
        expect(insertPolicyForRolePresent(cumulative, "operational_expectations", "authenticated")).toBe(false);
        expect(insertPolicyForRolePresent(cumulative, "operational_expectations", "anon")).toBe(false);
    });

    it("documents a data-preserving rollback (disable flag; never delete rows)", () => {
        expect(/Rollback/i.test(sql)).toBe(true);
        expect(/append-only, never deleted|No Wave A row is\s*altered or dropped/i.test(sql)).toBe(true);
    });
});
