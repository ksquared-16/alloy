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
} from "../../operationalLedger/ledgerSchemaScan";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");
const WAVE_B = "20260719000000_operational_expectations_authoring_intake_p1_wave_b.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, WAVE_B), "utf8");

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

    it("is hardened: SET search_path, FOR UPDATE concurrency, no dynamic SQL", () => {
        expect(/SET search_path = public/i.test(sql)).toBe(true);
        expect(/FOR UPDATE/i.test(sql)).toBe(true); // idempotency lock → concurrent retries converge
        // No dynamic SQL construction (EXECUTE format/quote_*).
        expect(/EXECUTE\s+format\s*\(|EXECUTE\s+['"]/i.test(sql)).toBe(false);
        // Conflict is raised BEFORE the row INSERT (index of conflict < index of insert).
        const conflictAt = sql.search(/oe_idempotency_conflict/i);
        const insertAt = sql.search(/INSERT INTO public\.operational_expectations/i);
        expect(conflictAt).toBeGreaterThan(-1);
        expect(insertAt).toBeGreaterThan(-1);
        expect(conflictAt).toBeLessThan(insertAt);
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
