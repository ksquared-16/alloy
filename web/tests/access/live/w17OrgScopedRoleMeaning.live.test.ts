/**
 * W-17 COURSE CORRECTION — A ROLE NAME IS NOT AUTHORITY.
 *
 * Alloy does not decide what a "Director" may do. The organization does. Two tenants may both call a
 * role Director and mean entirely different things by it, and the platform must resolve each one's
 * package without the label carrying a single capability of its own.
 *
 * This is the regression that stops the program drifting back toward job-title policy: if anyone
 * later makes authority follow a display name — or a role key — one of these assertions fails.
 *
 * Both roles are created with the SAME label and DIFFERENT grants, in different organizations, and
 * each org's principal is resolved through the canonical resolver the product uses.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (key: string) => file.split("\n").find((l) => l.startsWith(`${key}=`))?.slice(key.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "aaaa1111-0000-4000-8000-000000000001";

/** The SAME key in both organizations, deliberately: org scoping must not depend on distinct keys. */
const SHARED_KEY = "cert_w17_director";
/** The SAME operator-facing label in both organizations, which is the point of the regression. */
const SHARED_LABEL = "Director";

const USER_A = "77770000-0000-4000-8000-00000000a001";
const USER_B = "77770000-0000-4000-8000-00000000b001";

describeLive("W-17 — the same role label means what each organization configured, live", () => {
    let sb: SupabaseClient;

    beforeAll(async () => {
        sb = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

        for (const [id, email] of [[USER_A, "cert.w17.dir.a@northwind.invalid"], [USER_B, "cert.w17.dir.b@adapter.invalid"]] as const) {
            await sb.auth.admin.deleteUser(id).catch(() => undefined);
            await sb.auth.admin.createUser({ id, email, password: "alloy-local-cert", email_confirm: true });
        }

        // One label, one key, two organizations, two different packages.
        for (const org of [ORG_A, ORG_B]) {
            await sb.from("role_definitions").upsert(
                { org_id: org, role_key: SHARED_KEY, role_label: SHARED_LABEL, is_active: true },
                { onConflict: "org_id,role_key" },
            );
            await sb.from("role_permission_grants").delete().eq("org_id", org).eq("role_key", SHARED_KEY);
        }
        await sb.from("role_permission_grants").insert([
            { org_id: ORG_A, role_key: SHARED_KEY, permission_key: "portal.access", allowed: true },
            { org_id: ORG_A, role_key: SHARED_KEY, permission_key: "fin.read", allowed: true },
            { org_id: ORG_B, role_key: SHARED_KEY, permission_key: "portal.access", allowed: true },
            { org_id: ORG_B, role_key: SHARED_KEY, permission_key: "settings.read", allowed: true },
        ]);

        await sb.from("user_roles").delete().in("user_id", [USER_A, USER_B]);
        await sb.from("user_roles").insert([
            { org_id: ORG_A, user_id: USER_A, role: SHARED_KEY },
            { org_id: ORG_B, user_id: USER_B, role: SHARED_KEY },
        ]);
    });

    afterAll(async () => {
        await sb.from("user_roles").delete().in("user_id", [USER_A, USER_B]);
        for (const org of [ORG_A, ORG_B]) {
            await sb.from("role_permission_grants").delete().eq("org_id", org).eq("role_key", SHARED_KEY);
            await sb.from("role_definitions").delete().eq("org_id", org).eq("role_key", SHARED_KEY);
        }
        for (const id of [USER_A, USER_B]) await sb.auth.admin.deleteUser(id).catch(() => undefined);
    });

    it("lets two organizations use the same label without sharing a package", async () => {
        const { data } = await sb.from("role_definitions").select("org_id, role_label").eq("role_key", SHARED_KEY);
        const labels = ((data ?? []) as { org_id: string; role_label: string }[]);
        expect(labels).toHaveLength(2);
        expect(new Set(labels.map((r) => r.role_label))).toEqual(new Set([SHARED_LABEL]));
    });

    it("resolves each organization's Director to its OWN capabilities", async () => {
        const a = await resolveActorPermissionGrants(sb, ORG_A, USER_A);
        const b = await resolveActorPermissionGrants(sb, ORG_B, USER_B);

        expect(a.permissionKeys).not.toBeNull();
        expect(b.permissionKeys).not.toBeNull();
        expect([...(a.permissionKeys ?? [])].sort()).toEqual(["fin.read", "portal.access"]);
        expect([...(b.permissionKeys ?? [])].sort()).toEqual(["portal.access", "settings.read"]);
    });

    it("never leaks one organization's package into the other", async () => {
        const a = await resolveActorPermissionGrants(sb, ORG_A, USER_A);
        const b = await resolveActorPermissionGrants(sb, ORG_B, USER_B);
        // Org A's Director may read money; Org B's Director, holding the identically named and
        // identically keyed role, may not — because the grants, not the name, are the authority.
        expect(a.permissionKeys).toContain("fin.read");
        expect(b.permissionKeys).not.toContain("fin.read");
        expect(b.permissionKeys).toContain("settings.read");
        expect(a.permissionKeys).not.toContain("settings.read");
    });

    it("gives the label itself no authority at all", async () => {
        // Strip every grant from Org B's Director. The label and the key are untouched; if either
        // carried authority, something would survive this.
        await sb.from("role_permission_grants").delete().eq("org_id", ORG_B).eq("role_key", SHARED_KEY);
        const stripped = await resolveActorPermissionGrants(sb, ORG_B, USER_B);
        expect(stripped.permissionKeys).toEqual([]);

        // And Org A is entirely unaffected by what Org B did to its own Director.
        const a = await resolveActorPermissionGrants(sb, ORG_A, USER_A);
        expect([...(a.permissionKeys ?? [])].sort()).toEqual(["fin.read", "portal.access"]);
    });
});
