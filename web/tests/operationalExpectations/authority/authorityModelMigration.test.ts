/**
 * P1 · Wave C — governed Authority model: static migration certification (no live
 * Postgres). Proves the catalog, effective-dated assignments, the single resolver,
 * management permissions, DB enforcement, and the self-ratifying author + authority-
 * enforcing ratify RPCs. Behavior-through-gateway proofs live in the resolver and
 * ratification tests; these are the SQL-contract proofs.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { grantsPrivilegeTo, insertPolicyForRolePresent, stripSqlComments } from "../../operationalLedger/ledgerSchemaScan";

const DIR = join(__dirname, "../../../../supabase/migrations");
const model = readFileSync(join(DIR, "20260722000000_operational_expectations_authority_model_p1_wave_c.sql"), "utf8");
const enforce = readFileSync(join(DIR, "20260722010000_operational_expectations_authority_enforcement_p1_wave_c.sql"), "utf8");
const modelExec = stripSqlComments(model);
const enforceExec = stripSqlComments(enforce);

describe("governed authority catalog", () => {
    it("creates operational_authorities with unique authority_key per org + effective lifecycle", () => {
        expect(/CREATE TABLE IF NOT EXISTS public\.operational_authorities/i.test(model)).toBe(true);
        expect(/CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_authorities_org_key[\s\S]*?\(org_id, authority_key\)/i.test(model)).toBe(true);
        expect(/is_active boolean NOT NULL/i.test(model)).toBe(true);
        expect(/effective_start timestamptz NOT NULL/i.test(model)).toBe(true);
    });
    it("is descriptive only — no executable behaviour column (no rules/sql jsonb)", () => {
        const block = model.match(/CREATE TABLE IF NOT EXISTS public\.operational_authorities\s*\(([\s\S]*?)\n\)\s*;/i);
        expect(block).not.toBeNull();
        expect(/\b(rules|predicate|expression|sql|handler)\b/i.test(block![1])).toBe(false);
    });
});

describe("effective-dated held-authority assignments (append-only)", () => {
    it("creates operational_authority_assignments append-only (prevent-mutation, no updated_at)", () => {
        expect(/CREATE TABLE IF NOT EXISTS public\.operational_authority_assignments/i.test(model)).toBe(true);
        expect(/CREATE TRIGGER trg_prevent_oe_authority_assignments_mutation[\s\S]*?BEFORE UPDATE OR DELETE/i.test(model)).toBe(true);
        const block = model.match(/CREATE TABLE IF NOT EXISTS public\.operational_authority_assignments\s*\(([\s\S]*?)\n\)\s*;/i);
        expect(/\bupdated_at\b/i.test(block![1])).toBe(false);
    });
    it("AI cannot be a holder (holder_type excludes ai); revocation supersedes a grant", () => {
        expect(/holder_type = ANY \(ARRAY\['human'::text, 'policy'::text, 'process'::text, 'external'::text\]\)/i.test(model)).toBe(true);
        expect(/oe_authority_assignments_revocation_shape/i.test(model)).toBe(true);
    });
    it("assignments are effective-dated + scope-shaped (org has no scope_id; narrower need one)", () => {
        expect(/effective_start timestamptz NOT NULL/i.test(model)).toBe(true);
        expect(/oe_authority_assignments_scope_shape/i.test(model)).toBe(true);
    });
    it("assignment must reference a governed authority in the same org (trigger)", () => {
        expect(/authority % is not governed in this org/i.test(model)).toBe(true);
        expect(/NEW\.recorded_at := now\(\)/i.test(model)).toBe(true);
    });
    it("catalog + assignments have no client write path (SELECT only for authenticated)", () => {
        for (const t of ["operational_authorities", "operational_authority_assignments"]) {
            expect(grantsPrivilegeTo(model, t, "insert", "authenticated")).toBe(false);
            expect(grantsPrivilegeTo(model, t, "insert", "anon")).toBe(false);
            expect(insertPolicyForRolePresent(model, t, "authenticated")).toBe(false);
        }
    });
});

describe("management permissions distinct from holding + author/ratify", () => {
    it("seeds operational_expectations.authority.manage + .assign (admin-default)", () => {
        expect(/operational_expectations\.authority\.manage/i.test(model)).toBe(true);
        expect(/operational_expectations\.authority\.assign/i.test(model)).toBe(true);
        expect(/'admin', k/i.test(model)).toBe(true); // idempotent admin grant loop
    });
});

describe("the single held-authority resolver (fail-closed, exact match)", () => {
    it("resolve_held_operational_authority: SECURITY DEFINER, search_path, service-role only", () => {
        expect(/CREATE OR REPLACE FUNCTION public\.resolve_held_operational_authority/i.test(model)).toBe(true);
        expect(/SET search_path = public/i.test(model)).toBe(true);
        expect(/GRANT EXECUTE ON FUNCTION public\.resolve_held_operational_authority[\s\S]*?TO service_role/i.test(model)).toBe(true);
    });
    it("AI never holds; authority must be governed+active; assignment active+in-scope+not-revoked", () => {
        expect(/IF p_holder_type = 'ai' THEN RETURN NULL/i.test(model)).toBe(true);
        expect(/FROM public\.operational_authorities a[\s\S]*?a\.is_active/i.test(model)).toBe(true);
        expect(/g\.status = 'granted'[\s\S]*?NOT EXISTS[\s\S]*?status = 'revoked'/i.test(model)).toBe(true);
        // exact authority-key match (no invented hierarchy)
        expect(/g\.authority_key = p_authority_key/i.test(model)).toBe(true);
    });
});

describe("authoring self-ratification (server-computed standing)", () => {
    it("the author RPC computes standing from the resolver (caller cannot force binding)", () => {
        expect(/resolve_held_operational_authority\(/i.test(enforce)).toBe(true);
        // predicted → model; ai → proposed; held → binding; else proposed.
        expect(/IF v_modality = 'predicted' THEN[\s\S]*?v_standing := 'model'/i.test(enforce)).toBe(true);
        expect(/ELSIF v_author_class = 'ai' THEN[\s\S]*?v_standing := 'proposed'/i.test(enforce)).toBe(true);
        expect(/v_assignment IS NOT NULL THEN[\s\S]*?v_standing := 'binding'/i.test(enforce)).toBe(true);
    });
    it("a self-ratifying authoring act emits ONE Authoring Act and NO separate Ratification Act", () => {
        const authored = (enforce.match(/'author_expectation', 'operational_expectations'/gi) ?? []).length;
        expect(authored).toBe(1);
        expect(/'ratify_expectation'/i.test(enforceExec.split("ratify_operational_expectation")[0])).toBe(false);
        // records the authority evidence on the row + event.
        expect(/authority_assignment_id/i.test(enforce)).toBe(true);
        expect(/'self_ratified'/i.test(enforce)).toBe(true);
    });
});

describe("ratification authority sufficiency (DB-enforced)", () => {
    it("the ratify RPC resolves the ratifier's held authority and rejects insufficiency", () => {
        expect(/CREATE OR REPLACE FUNCTION public\.ratify_operational_expectation/i.test(enforce)).toBe(true);
        expect(/v_assignment := public\.resolve_held_operational_authority\([\s\S]*?'human', p_actor_user_id::text, v_exp_authority/i.test(enforce)).toBe(true);
        expect(/IF v_assignment IS NULL THEN[\s\S]*?oe_insufficient_authority/i.test(enforce)).toBe(true);
    });
    it("records the ratifier's assignment evidence in the Ratification Act", () => {
        expect(/authority_assignment_id[\s\S]*?matched_scope/i.test(enforce)).toBe(true);
    });
    it("both RPCs remain service-role only + hardened + no dynamic SQL", () => {
        expect(/GRANT EXECUTE ON FUNCTION public\.author_operational_expectation[\s\S]*?TO service_role/i.test(enforce)).toBe(true);
        expect(/GRANT EXECUTE ON FUNCTION public\.ratify_operational_expectation[\s\S]*?TO service_role/i.test(enforce)).toBe(true);
        expect(/EXECUTE\s+format\s*\(|EXECUTE\s+['"]/i.test(enforceExec)).toBe(false);
        expect(/SET search_path = public/i.test(enforce)).toBe(true);
    });
});

describe("compatibility (additive)", () => {
    it("adds nullable evidence columns to operational_expectations; drops nothing", () => {
        expect(/ADD COLUMN IF NOT EXISTS authority_assignment_id uuid/i.test(model)).toBe(true);
        expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i.test(modelExec)).toBe(false);
        expect(/DROP\s+(TABLE|COLUMN|CONSTRAINT)/i.test(enforceExec)).toBe(false);
    });
});
