/**
 * WHO MAY CALL THE FUNCTION THAT ENFORCES THE CEILING.
 *
 * W-18 and the assignment ceiling both read `p_actor_user_id` — a parameter the CALLER supplies.
 * That is sound only while the callers are server routes that derive the actor from the
 * authenticated session. It was not.
 *
 * Measured on this database before `20260915160000`: a user holding exactly `portal.access` signed
 * in, used the browser's own anon key with their own JWT, POSTed to
 * `/rest/v1/rpc/assign_member_role_audited` naming the seeded administrator as the actor, and the
 * `admin` role landed on another member. The capability gate lives in the ROUTE, so calling the
 * function directly skipped it; the ceiling trusted an actor the caller chose; and D2 recorded the
 * change against the person they chose to blame.
 *
 * Nobody granted that. PostgreSQL gives PUBLIC EXECUTE on new functions and Supabase exposes
 * `public` through PostgREST, so every SECURITY DEFINER function is reachable the moment it exists
 * unless someone says otherwise — which makes this a lock rather than a one-time repair. The next
 * actor-taking function will ship exposed by default, and this is what notices.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) =>
            file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

type Row = { proname: string; open_to_clients: boolean; has_service_role: boolean };

const env = certEnv();
const describeLive = env ? describe : describe.skip;

describeLive("Access RPC execute boundary — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    it("no function taking a caller-supplied actor is reachable by an ordinary client", async () => {
        const { data, error } = await supabase.rpc("access_rpc_boundary_report");
        expect(error, error?.message).toBeNull();

        const open = ((data as Row[]) ?? []).filter((r) => r.open_to_clients).map((r) => r.proname).sort();
        expect(
            open,
            "these functions accept a caller-supplied actor AND may be executed by anon/authenticated/PUBLIC. "
                + "The delegation ceilings read that actor, so anyone who can call them directly can name "
                + "whoever they like and skip the capability gate in the route entirely.",
        ).toEqual([]);
    });

    it("is not vacuous — the scan sees the functions it is supposed to be guarding", async () => {
        // A scan that matched nothing would pass the assertion above for the worst possible reason.
        const { data } = await supabase.rpc("access_rpc_boundary_report");
        const all = ((data as Row[]) ?? []).map((r) => r.proname);
        expect(all.length, "the scan found no actor-taking functions at all").toBeGreaterThan(10);
        for (const owner of [
            "replace_role_permission_grants",
            "assign_member_role_audited",
            "create_membership_with_access_profile",
            "replace_member_access_scope_audited",
        ]) {
            expect(all, `${owner} is no longer in the guarded set`).toContain(owner);
        }
    });

    it("the service role can still do the work — the boundary is not a wall", async () => {
        // Revoking from everyone would also "pass" the first assertion, and would break every Access
        // route in the product. The one legitimate caller class must keep its grant.
        const { data } = await supabase.rpc("access_rpc_boundary_report");
        expect(
            ((data as Row[]) ?? []).filter((r) => !r.has_service_role).map((r) => r.proname),
            "these lost service_role EXECUTE, so the server routes that own them cannot run",
        ).toEqual([]);
    });
});
