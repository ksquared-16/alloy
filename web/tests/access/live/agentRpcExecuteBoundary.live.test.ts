/**
 * THE AGENT COMMIT FUNCTIONS WERE OPEN TO EVERY SIGNED-IN SESSION.
 *
 * `20260915160000` closed this defect class for the Access RPCs. Its sweep selected functions taking
 * `p_actor_user_id`, and later the writers of `role_permission_grants` / `user_roles`. The three
 * agent commit functions take `p_user_id` and write neither table, so they fell through every pass
 * and kept exactly the shape that sweep removed.
 *
 * MEASURED ON THIS DATABASE before `20260915210000`. Executed as the bare `authenticated` role —
 * what every signed-in browser session carries, holding no capability at all — against a real field
 * definition: the call succeeded, `field_definitions.is_visible_in_form` flipped false to true, and
 * the apply-audit row recorded a forged actor id the caller chose. The route gate on that handler is
 * `ctx.role !== "admin"`, and calling the function directly skipped it entirely. Any authenticated
 * principal of ANY organization could pass another organization's id and rewrite its configuration,
 * attributing the change to somebody else.
 *
 * This is a lock rather than a one-time repair for the reason the Access boundary gives: PostgreSQL
 * grants PUBLIC EXECUTE on new functions and Supabase exposes `public` through PostgREST, so the
 * next `agent_v3_commit_*` ships reachable on the day it is created. The sweep is pattern-scoped so
 * that one is closed too; this asserts the sweep still holds.
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
const d = env ? describe : describe.skip;

d("the agent commit RPCs are closed to client roles — live", () => {
    const sb: SupabaseClient = createClient(env!.url, env!.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    it("covers a real set of functions, so a green report means something", async () => {
        /*
         * NON-VACUITY FIRST. A boundary report over an empty set passes every assertion below it
         * while proving nothing — and an empty set is exactly what a rename would produce.
         */
        const { data, error } = await sb.rpc("agent_rpc_boundary_report");
        expect(error, error?.message).toBeNull();
        const rows = (data ?? []) as Row[];
        expect(rows.length, "the sweep matched no agent commit function").toBeGreaterThanOrEqual(3);
        for (const name of [
            "agent_v0_commit_queue_definition_apply",
            "agent_v1_commit_record_overview_layout_apply",
            "agent_v2_commit_field_visibility_apply",
        ]) {
            expect(rows.map((r) => r.proname), `${name} is not covered by the boundary`).toContain(name);
        }
    });

    it("leaves none of them executable by authenticated or anon", async () => {
        const { data } = await sb.rpc("agent_rpc_boundary_report");
        const open = ((data ?? []) as Row[]).filter((r) => r.open_to_clients).map((r) => r.proname);
        expect(open, "these can be called straight from a browser session, skipping the route gate").toEqual([]);
    });

    it("keeps service_role, because the routes are the legitimate caller", async () => {
        /*
         * The other half of the repair, and the one that would break the product if it were wrong.
         * The Next.js routes resolve the caller, derive the organization server-side and apply their
         * own authority check before reaching these functions; revoking service_role would take the
         * feature away rather than securing it.
         */
        const { data } = await sb.rpc("agent_rpc_boundary_report");
        const rows = (data ?? []) as Row[];
        const missing = rows.filter((r) => !r.has_service_role).map((r) => r.proname);
        expect(missing, "the server routes could no longer commit").toEqual([]);
    });

    it("does not quietly widen the Access boundary to cover them", async () => {
        /*
         * Two reports, deliberately. `access_rpc_boundary_report()` answers a question about Access
         * mutation RPCs; folding "every privileged function anywhere" into it would make a passing
         * Access report say less than it says today.
         */
        const { data: access } = await sb.rpc("access_rpc_boundary_report");
        const names = ((access ?? []) as Row[]).map((r) => r.proname);
        expect(names.some((n) => n.startsWith("agent_v")), "the Access report should stay scoped").toBe(false);
        expect(((access ?? []) as Row[]).filter((r) => r.open_to_clients)).toEqual([]);
    });
});
