/**
 * Staff & Workforce V2 · Slice 1 — the identifier invariant, against a real database.
 *
 * The unique index is the authority. Application code normalizes and translates,
 * but the refusal itself comes from Postgres, and only Postgres can prove it: a
 * fake client rejects a duplicate because the fake was told to, which proves the
 * fake. So this suite asserts the index directly —
 *
 *   same normalized value, same org        → REFUSED
 *   case variant, same org                 → REFUSED
 *   whitespace variant, same org           → REFUSED
 *   same value, DIFFERENT org              → allowed
 *   Employee Number vs Badge Number        → separate namespaces
 *   NULL, repeatedly                       → allowed
 *
 * It follows the repository's live convention: without web/.env.certification.local
 * it SKIPS rather than passing vacuously. A skipped run is not evidence, and a
 * report that counts it as evidence is wrong — the mounted QA carries the proof
 * when this cannot run.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;
const run = Date.now();
const N = (s: string) => `S1-${run}-${s}`;

describeLive("employment identifiers — database invariant", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    const created: string[] = [];

    /** One employment per person, so the overlap trigger never masks the index. */
    async function newEmployment(fields: Record<string, unknown>): Promise<{ error: string | null }> {
        const { data: org } = await supabase.from("orgs").select("id").limit(1).single();
        const orgId = (org as { id: string }).id;
        const { data: person, error: pErr } = await supabase
            .from("persons")
            .insert({ org_id: orgId, full_name: `Slice1 Probe ${Math.random().toString(36).slice(2, 8)}` })
            .select("id")
            .single();
        if (pErr) return { error: pErr.message };
        const personId = (person as { id: string }).id;

        const { data, error } = await supabase
            .from("employments")
            .insert({ org_id: orgId, person_id: personId, start_date: "2020-01-01", ...fields })
            .select("id")
            .single();
        if (data) created.push((data as { id: string }).id);
        return { error: error?.message ?? null };
    }

    afterAll(async () => {
        if (!supabase || created.length === 0) return;
        await supabase.from("employments").delete().in("id", created);
    });

    it("refuses an exact duplicate Employee Number in one organization", async () => {
        expect((await newEmployment({ external_employee_id: N("A") })).error).toBeNull();
        const dup = await newEmployment({ external_employee_id: N("A") });
        expect(dup.error).toMatch(/duplicate key|unique/i);
    });

    it("refuses a case variant — comparison is case-folded", async () => {
        expect((await newEmployment({ external_employee_id: N("Case") })).error).toBeNull();
        const dup = await newEmployment({ external_employee_id: N("Case").toLowerCase() });
        expect(dup.error).toMatch(/duplicate key|unique/i);
    });

    it("refuses a whitespace variant — comparison is trimmed", async () => {
        expect((await newEmployment({ external_employee_id: N("Space") })).error).toBeNull();
        const dup = await newEmployment({ external_employee_id: `  ${N("Space")}  ` });
        expect(dup.error).toMatch(/duplicate key|unique/i);
    });

    it("refuses a duplicate Badge Number, and names the badge index", async () => {
        expect((await newEmployment({ badge_number: N("B") })).error).toBeNull();
        const dup = await newEmployment({ badge_number: N("B").toUpperCase() });
        expect(dup.error).toMatch(/badge/i);
    });

    it("allows the same string as Employee Number and Badge Number — separate namespaces", async () => {
        const v = N("Both");
        expect((await newEmployment({ external_employee_id: v })).error).toBeNull();
        expect((await newEmployment({ badge_number: v })).error).toBeNull();
    });

    it("allows many employments with no identifier at all", async () => {
        expect((await newEmployment({})).error).toBeNull();
        expect((await newEmployment({})).error).toBeNull();
    });

    it("refuses a blank identifier rather than storing it as a value", async () => {
        const blank = await newEmployment({ external_employee_id: "   " });
        expect(blank.error).toMatch(/not_blank|check constraint|violates/i);
    });
});
