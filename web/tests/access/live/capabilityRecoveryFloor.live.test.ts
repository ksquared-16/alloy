/**
 * THE RECOVERY FLOOR — the exception that exists because the rules are right.
 *
 * W-18 refuses a grant of authority the actor does not hold; the assignment ceiling refuses a
 * membership change that would newly confer it. Both are correct, and together they mean an
 * organization whose last holder of capability C is gone cannot restore it through the product at
 * all. Measured, not theorised: with an allowed grant still sitting on an unassigned role, both
 * paths refused `fin.post`.
 *
 * So the condition is about EFFECTIVE HOLDERS, not about rows — the narrower "no allowed grant
 * exists" formulation was tested and disproved — and the target role must already have members, or
 * recovery recreates the very lockout it was called to repair.
 *
 * Every case below reads RESOURCE STATE. A refusal that still wrote a grant, or a success that left
 * nobody holding anything, is the failure worth catching.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

function certEnv(): { url: string; serviceKey: string; anonKey: string } | null {
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) =>
            file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        const anonKey = read("NEXT_PUBLIC_SUPABASE_ANON_KEY") || read("SUPABASE_ANON_KEY");
        return url && serviceKey ? { url, serviceKey, anonKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG = "fee10000-0000-4000-8000-0000000fee10";
const OTHER_ORG = "fee20000-0000-4000-8000-0000000fee20";
const CAP = "fin.post";
const RETIRED = "settings.users_roles";

describeLive("Governed capability recovery floor — live", () => {
    const sb = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let memberA = "";
    let memberB = "";

    /*
     * A CORRELATION UNIQUE TO THIS RUN.
     *
     * `mutation_events` is append-only — D2 refuses DELETE, which is the point of an audit — so this
     * file's own history survives its cleanup and accumulates across runs. Asserting "one event in
     * this organization" would therefore pass once and fail forever after. The honest claim is one
     * event for THIS recovery, so the governed action id is the thing that identifies it.
     */
    const RUN_ID = `gar_cert_recovery_${crypto.randomUUID().slice(0, 8)}`;

    const recover = (role: string, cap = CAP, org = ORG, reason = "certification recovery") =>
        sb.rpc("restore_capability_to_role", {
            p_org_id: org, p_permission_key: cap, p_target_role_key: role,
            p_reason: reason, p_governed_action_id: RUN_ID,
        });

    async function holders(cap = CAP, org = ORG): Promise<number> {
        // Read it the way the product resolves authority: membership joined to allowed grants.
        const { data: rows } = await sb
            .from("user_roles").select("user_id, role").eq("org_id", org);
        const { data: grants } = await sb
            .from("role_permission_grants").select("role_key").eq("org_id", org)
            .eq("permission_key", cap).eq("allowed", true);
        const carrying = new Set(((grants ?? []) as { role_key: string }[]).map((g) => g.role_key));
        return new Set(((rows ?? []) as { user_id: string; role: string }[])
            .filter((r) => carrying.has(r.role)).map((r) => r.user_id)).size;
    }

    async function grantRows(role: string, cap = CAP, org = ORG) {
        const { data } = await sb.from("role_permission_grants")
            .select("permission_key, allowed").eq("org_id", org).eq("role_key", role).eq("permission_key", cap);
        return (data ?? []) as { permission_key: string; allowed: boolean }[];
    }

    async function recoveryEvents(org = ORG) {
        const { data } = await sb.from("mutation_events")
            .select("command_key, origin, operator_id, context_payload, previous_state, new_state")
            .eq("org_id", org).eq("command_key", "access.capability.recovered")
            .contains("context_payload", { governed_action_id: RUN_ID });
        return (data ?? []) as Record<string, unknown>[];
    }

    beforeAll(async () => {
        const { data: users } = await sb.auth.admin.listUsers();
        const ids = (users?.users ?? []).map((u) => u.id);
        [memberA, memberB] = [ids[0]!, ids[1]!];

        for (const org of [ORG, OTHER_ORG]) {
            await sb.from("user_roles").delete().eq("org_id", org);
            await sb.from("role_permission_grants").delete().eq("org_id", org);
            await sb.from("role_definitions").delete().eq("org_id", org);
            await sb.from("orgs").delete().eq("id", org);
            await sb.from("orgs").insert({
                id: org, name: `Recovery ${org.slice(-4)}`, slug: `recovery-${org.slice(-4)}`, status: "active",
            });
            await sb.from("role_permission_grants").delete().eq("org_id", org);
            await sb.from("role_definitions").delete().eq("org_id", org);
        }
        await sb.from("role_definitions").insert([
            { org_id: ORG, role_key: "rf_two_members", role_label: "Two members", is_system: false, is_active: true },
            { org_id: ORG, role_key: "rf_empty", role_label: "No members", is_system: false, is_active: true },
            { org_id: ORG, role_key: "rf_inactive", role_label: "Deactivated", is_system: false, is_active: false },
            { org_id: OTHER_ORG, role_key: "rf_foreign", role_label: "Other tenant", is_system: false, is_active: true },
        ]);
        await sb.from("user_roles").insert([
            { org_id: ORG, user_id: memberA, role: "rf_two_members" },
            { org_id: ORG, user_id: memberB, role: "rf_two_members" },
        ]);
    }, 120_000);

    afterAll(async () => {
        for (const org of [ORG, OTHER_ORG]) {
            await sb.from("user_roles").delete().eq("org_id", org);
            await sb.from("role_permission_grants").delete().eq("org_id", org);
            await sb.from("role_definitions").delete().eq("org_id", org);
            await sb.from("orgs").delete().eq("id", org);
        }
    }, 120_000);

    it("the starting state is a genuine lockout", async () => {
        // Non-vacuity: if anyone already held it, case A would pass for the wrong reason.
        expect(await holders()).toBe(0);
    });

    it("B/R — an inactive capability is never resurrected", async () => {
        const { error } = await recover("rf_two_members", RETIRED);
        expect(error?.message).toMatch(/capability_not_active/);
        expect(await grantRows("rf_two_members", RETIRED)).toEqual([]);
    });

    it("D — a memberless target is refused: it would recreate the lockout", async () => {
        const { error } = await recover("rf_empty");
        expect(error?.message).toMatch(/target_role_has_no_members/);
        expect(await grantRows("rf_empty")).toEqual([]);
    });

    it("F — a deactivated role is not a valid target", async () => {
        const { error } = await recover("rf_inactive");
        expect(error?.message).toMatch(/unknown_role_key/);
    });

    it("E — a role belonging to another tenant is unreachable", async () => {
        const { error } = await recover("rf_foreign");
        expect(error?.message).toMatch(/unknown_role_key/);
        expect(await grantRows("rf_foreign", CAP, OTHER_ORG)).toEqual([]);
    });

    it("A/L/P/Q — recovery restores a real holder, and the blast radius is the measured one", async () => {
        const { data, error } = await recover("rf_two_members");
        expect(error, error?.message).toBeNull();

        const row = (Array.isArray(data) ? data[0] : data) as
            { restored: boolean; member_count: number; effective_holders: number };
        expect(row.restored).toBe(true);
        // P: the role has two members, so recovery confers the capability on BOTH. The number is
        // part of the decision, which is why the owner returns it rather than hiding it.
        expect(row.member_count).toBe(2);
        expect(row.effective_holders).toBe(2);

        // The claim that matters: a real principal can now exercise it.
        expect(await holders()).toBe(2);
        // L: exactly one grant, and it is allowed.
        expect(await grantRows("rf_two_members")).toEqual([{ permission_key: CAP, allowed: true }]);
    });

    it("M/N — exactly one D2 event, and it carries the governed decision", async () => {
        const events = await recoveryEvents();
        expect(events.length).toBe(1);
        const e = events[0]!;
        // The audit must not pretend a human ran this SQL, but must still reach the approval.
        expect(e.origin).toBe("system");
        expect(e.operator_id).toBeNull();
        const payload = e.context_payload as Record<string, unknown>;
        expect(payload.capability).toBe(CAP);
        expect(payload.governed_action_id).toBe(RUN_ID);
        expect(payload.member_count).toBe(2);
        expect(e.previous_state).toContain("effective_holders=0");
        expect(e.new_state).toContain("effective_holders=2");
    });

    it("C/G/O — once a holder exists the exception lapses, and a retry duplicates nothing", async () => {
        // This is both the stale-approval case and idempotency: the owner re-measures at execution,
        // so an approval granted against a zero-holder state cannot spend itself later.
        const { error } = await recover("rf_two_members");
        expect(error?.message).toMatch(/recovery_no_longer_required/);
        expect(await grantRows("rf_two_members")).toHaveLength(1);
        expect(await recoveryEvents()).toHaveLength(1);
    });

    it("J — the recovery owner is not reachable from a browser", async () => {
        // The defect PR #990 closed must not be recreated by the most powerful function in the model.
        const anon = createClient(env!.url, env!.anonKey, { auth: { persistSession: false } });
        const { error } = await anon.rpc("restore_capability_to_role", {
            p_org_id: ORG, p_permission_key: CAP, p_target_role_key: "rf_two_members",
            p_reason: "attack", p_governed_action_id: "x",
        });
        expect(error?.message).toMatch(/permission denied|Could not find/);
    });

    it("a recovery with no stated reason is refused", async () => {
        await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("permission_key", CAP);
        const { error } = await sb.rpc("restore_capability_to_role", {
            p_org_id: ORG, p_permission_key: CAP, p_target_role_key: "rf_two_members",
            p_reason: "  ", p_governed_action_id: "gar_x",
        });
        expect(error?.message).toMatch(/recovery_reason_required/);
    });
});
