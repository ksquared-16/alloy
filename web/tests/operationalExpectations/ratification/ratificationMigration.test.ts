/**
 * P1 · Wave C · C2 — static migration validation (no live Postgres in CI). Proves
 * the ratification migration is additive, delivers a DEDICATED ratify capability,
 * an append-only immutable ratification history, and an atomic ratify RPC as
 * service-role-only infrastructure with no client write path.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
    grantsPrivilegeTo,
    insertPolicyForRolePresent,
    stripSqlComments,
} from "../../operationalLedger/ledgerSchemaScan";

const MIGRATIONS_DIR = join(__dirname, "../../../../supabase/migrations");
const WAVE_C = "20260721000000_operational_expectations_ratification_p1_wave_c.sql";
const sql = readFileSync(join(MIGRATIONS_DIR, WAVE_C), "utf8");
const exec = stripSqlComments(sql);

describe("Wave C migration — dedicated ratify capability (distinct from author)", () => {
    it("seeds operational_expectations.ratify into the RBAC catalog", () => {
        expect(/INSERT INTO public\.permissions[\s\S]*?'operational_expectations\.ratify'/i.test(sql)).toBe(true);
        expect(/INSERT INTO public\.permission_keys[\s\S]*?'operational_expectations\.ratify'/i.test(sql)).toBe(true);
        expect(/INSERT INTO public\.permission_definitions[\s\S]*?'operational_expectations\.ratify'/i.test(sql)).toBe(true);
    });
    it("grants it by default ONLY to the org admin role (idempotent per org)", () => {
        expect(/INSERT INTO public\.role_permission_grants[\s\S]*?'admin', 'operational_expectations\.ratify'[\s\S]*?FROM public\.orgs/i.test(sql)).toBe(true);
        expect(/WHERE NOT EXISTS/i.test(sql)).toBe(true);
    });
    it("does NOT reuse authoring / workflows permissions as ratification authority", () => {
        // No grant of ratify to author/workflows holders (executable DDL only).
        expect(/GRANT[\s\S]*?operational_expectations\.author/i.test(exec)).toBe(false);
        expect(/workflows\.write/i.test(exec)).toBe(false);
    });
});

describe("Wave C migration — append-only immutable ratification history", () => {
    it("creates operational_expectation_ratifications with a prevent-mutation trigger and no updated_at", () => {
        expect(/CREATE TABLE IF NOT EXISTS public\.operational_expectation_ratifications/i.test(sql)).toBe(true);
        expect(/CREATE TRIGGER trg_prevent_oe_ratifications_mutation[\s\S]*?BEFORE UPDATE OR DELETE/i.test(sql)).toBe(true);
        const block = sql.match(/CREATE TABLE IF NOT EXISTS public\.operational_expectation_ratifications\s*\(([\s\S]*?)\n\)\s*;/i);
        expect(block).not.toBeNull();
        expect(/\bupdated_at\b/i.test(block![1])).toBe(false);
    });
    it("enforces ONE ratification per expectation + new_standing must be binding", () => {
        expect(/CREATE UNIQUE INDEX IF NOT EXISTS uq_oe_ratifications_org_expectation[\s\S]*?\(org_id, expectation_id\)/i.test(sql)).toBe(true);
        expect(/CHECK \(new_standing = 'binding'\)/i.test(sql)).toBe(true);
    });
    it("lineage-links to the ratified expectation and server-assigns ratified_at", () => {
        expect(/expectation_id uuid NOT NULL\s*REFERENCES public\.operational_expectations/i.test(sql)).toBe(true);
        expect(/NEW\.ratified_at := now\(\)/i.test(sql)).toBe(true);
    });
    it("only a same-org, PROPOSED, DEONTIC expectation is ratifiable (trigger guard)", () => {
        expect(/only deontic\/commissive expectations are ratifiable/i.test(sql)).toBe(true);
        expect(/only a proposed expectation may be ratified/i.test(sql)).toBe(true);
        expect(/cross-org ratification is forbidden/i.test(sql)).toBe(true);
    });
    it("gives no client (anon/authenticated) INSERT path", () => {
        expect(grantsPrivilegeTo(sql, "operational_expectation_ratifications", "insert", "authenticated")).toBe(false);
        expect(grantsPrivilegeTo(sql, "operational_expectation_ratifications", "insert", "anon")).toBe(false);
        expect(insertPolicyForRolePresent(sql, "operational_expectation_ratifications", "authenticated")).toBe(false);
    });
});

describe("Wave C migration — atomic ratify RPC (record + Ratification Act, one txn)", () => {
    it("is SECURITY DEFINER + hardened search_path + service-role-only", () => {
        expect(/CREATE OR REPLACE FUNCTION public\.ratify_operational_expectation/i.test(sql)).toBe(true);
        expect(/SECURITY DEFINER/i.test(sql)).toBe(true);
        expect(/SET search_path = public/i.test(sql)).toBe(true);
        expect(/REVOKE ALL ON FUNCTION public\.ratify_operational_expectation[\s\S]*?FROM PUBLIC/i.test(sql)).toBe(true);
        expect(/GRANT EXECUTE ON FUNCTION public\.ratify_operational_expectation[\s\S]*?TO service_role/i.test(sql)).toBe(true);
        // The RPC is NOT granted EXECUTE to authenticated (table SELECT-to-authenticated is fine).
        expect(/GRANT EXECUTE ON FUNCTION public\.ratify_operational_expectation[\s\S]*?TO authenticated/i.test(exec)).toBe(false);
    });
    it("inserts the ratification record AND the mutation_events Ratification Act in one function", () => {
        expect(/INSERT INTO public\.operational_expectation_ratifications/i.test(sql)).toBe(true);
        expect(/INSERT INTO public\.mutation_events/i.test(sql)).toBe(true);
        expect(/'ratify_expectation', 'operational_expectations'/i.test(sql)).toBe(true);
    });
    it("uses insert-with-conflict-catch so a re-ratify is idempotent (no second act)", () => {
        expect(/EXCEPTION WHEN unique_violation THEN/i.test(sql)).toBe(true);
        expect(/'disposition', 'created'/i.test(sql)).toBe(true);
        expect(/'disposition', 'existing'/i.test(sql)).toBe(true);
        const outbox = (sql.match(/INSERT INTO public\.mutation_events/gi) ?? []).length;
        expect(outbox).toBe(1);
    });
    it("has no dynamic SQL", () => {
        expect(/EXECUTE\s+format\s*\(|EXECUTE\s+['"]/i.test(sql)).toBe(false);
    });
});
