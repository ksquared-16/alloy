/**
 * FORMS AUTHORITY — THE NAME ON THE ROLE STOPS MATTERING.
 *
 * Twenty-five Forms gates asked `ctx.role !== "admin"`. This proves what replaced them: the same
 * authority now follows capability grants, so an organization can call a role anything it likes and
 * still decide exactly what that role may do with Forms.
 *
 * Every persona here is a CUSTOM role with an arbitrary name. If any assertion below started passing
 * because of what a role is CALLED rather than what it was GRANTED, the migration failed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveActorPermissionGrants } from "@/lib/access/actorPermissionGrants";
import {
    FORMS_AUTHOR,
    FORMS_SUBMISSIONS,
    FORMS_SUBMISSIONS_CONFIRM,
    hasFormsCapability,
} from "@/lib/access/formsAuthority";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = { url: process.env.CERT_SUPABASE_URL ?? "", serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "" };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
    try {
        const file = readFileSync(resolve(__dirname, "../../../.env.certification.local"), "utf8");
        const read = (k: string) => file.split("\n").find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
        const url = read("SUPABASE_URL") || read("NEXT_PUBLIC_SUPABASE_URL");
        const serviceKey = read("SUPABASE_SERVICE_ROLE_KEY");
        return url && serviceKey ? { url, serviceKey } : null;
    } catch {
        return null;
    }
}

const env = certEnv();
const describeLive = env ? describe : describe.skip;

/** Its own tenant — see `w17MultiRoleAssignment.live.test.ts` for why sharing one was wrong. */
const ORG = "66660000-0000-4000-8000-000000006601";
const OTHER_ORG = "66660000-0000-4000-8000-000000006602";

/** Deliberately arbitrary names. None of them is "admin", and one of them IS. */
const ROLE = {
    author: "cert_forms_lead_teacher",
    submissions: "cert_forms_front_desk",
    confirm: "cert_forms_checker",
    portalOnly: "cert_forms_visitor",
    namedAdmin: "cert_forms_admin_in_name_only",
    arbitrary: "cert_forms_wombat",
} as const;

const USER = {
    author: "66660000-0000-4000-8000-0000000000a1",
    submissions: "66660000-0000-4000-8000-0000000000b1",
    confirm: "66660000-0000-4000-8000-0000000000c1",
    portalOnly: "66660000-0000-4000-8000-0000000000d1",
    namedAdmin: "66660000-0000-4000-8000-0000000000e1",
    arbitrary: "66660000-0000-4000-8000-0000000000f1",
} as const;

describeLive("Forms authority is a capability, not a job title — live", () => {
    let sb: SupabaseClient;

    /** The capabilities a principal actually resolves, through the canonical resolver. */
    const capsOf = async (userId: string, org = ORG) =>
        (await resolveActorPermissionGrants(sb, org, userId)).permissionKeys ?? [];

    const ctxFor = async (userId: string, org = ORG) => ({ permissionKeys: await capsOf(userId, org) });

    beforeAll(async () => {
        sb = createClient(env!.url, env!.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
        for (const [id, slug] of [[ORG, "forms-cert-a"], [OTHER_ORG, "forms-cert-b"]] as const) {
            await sb.from("orgs").upsert({ id, name: `Forms cert ${slug}`, slug }, { onConflict: "id" });
        }
        for (const [k, id] of Object.entries(USER)) {
            await sb.auth.admin.deleteUser(id).catch(() => undefined);
            await sb.auth.admin.createUser({ id, email: `cert.forms.${k}@northwind.invalid`, password: "alloy-local-cert", email_confirm: true });
        }

        // Every role is custom, org-defined, and arbitrarily named.
        for (const key of Object.values(ROLE)) {
            await sb.from("role_definitions").upsert(
                { org_id: ORG, role_key: key, role_label: key, is_active: true },
                { onConflict: "org_id,role_key" },
            );
            await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", key);
        }
        const grant = (role: string, permission_key: string) => ({ org_id: ORG, role_key: role, permission_key, allowed: true });
        await sb.from("role_permission_grants").insert([
            grant(ROLE.author, "portal.access"), grant(ROLE.author, FORMS_AUTHOR),
            grant(ROLE.submissions, "portal.access"), grant(ROLE.submissions, FORMS_SUBMISSIONS),
            grant(ROLE.confirm, "portal.access"), grant(ROLE.confirm, FORMS_SUBMISSIONS_CONFIRM),
            grant(ROLE.portalOnly, "portal.access"),
            // Named like an administrator, granted nothing. This is the whole point.
            grant(ROLE.namedAdmin, "portal.access"),
            grant(ROLE.arbitrary, "portal.access"), grant(ROLE.arbitrary, FORMS_AUTHOR),
        ]);

        await sb.from("user_roles").delete().in("user_id", Object.values(USER));
        await sb.from("user_roles").insert([
            { org_id: ORG, user_id: USER.author, role: ROLE.author },
            { org_id: ORG, user_id: USER.submissions, role: ROLE.submissions },
            { org_id: ORG, user_id: USER.confirm, role: ROLE.confirm },
            { org_id: ORG, user_id: USER.portalOnly, role: ROLE.portalOnly },
            { org_id: ORG, user_id: USER.namedAdmin, role: ROLE.namedAdmin },
            { org_id: ORG, user_id: USER.arbitrary, role: ROLE.arbitrary },
        ]);
    });

    afterAll(async () => {
        await sb.from("user_roles").delete().in("user_id", Object.values(USER));
        for (const key of Object.values(ROLE)) {
            await sb.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", key);
            await sb.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", key);
        }
        for (const id of Object.values(USER)) await sb.auth.admin.deleteUser(id).catch(() => undefined);
    });

    it("defines the three Forms capabilities in the catalog, active and grouped", async () => {
        const { data } = await sb.from("permission_definitions")
            .select("key, group_key, label, is_active")
            .in("key", [FORMS_AUTHOR, FORMS_SUBMISSIONS, FORMS_SUBMISSIONS_CONFIRM]);
        const rows = (data ?? []) as { key: string; group_key: string; label: string; is_active: boolean }[];
        expect(rows).toHaveLength(3);
        for (const r of rows) {
            expect(r.is_active).toBe(true);
            expect(r.group_key, "the role editor groups Forms as its own area").toBe("forms");
            expect(r.label, "an operator reads a label, never a dotted key").not.toContain(".");
        }
    });

    it("gives a role called 'Lead Teacher' form-authoring authority", async () => {
        const ctx = await ctxFor(USER.author);
        expect(hasFormsCapability(ctx, FORMS_AUTHOR)).toBe(true);
        // …and nothing else in Forms. Authoring is not a licence to handle submissions.
        expect(hasFormsCapability(ctx, FORMS_SUBMISSIONS)).toBe(false);
        expect(hasFormsCapability(ctx, FORMS_SUBMISSIONS_CONFIRM)).toBe(false);
    });

    it("gives a role called 'Front Desk' submission handling, and no design authority", async () => {
        const ctx = await ctxFor(USER.submissions);
        expect(hasFormsCapability(ctx, FORMS_SUBMISSIONS)).toBe(true);
        expect(hasFormsCapability(ctx, FORMS_AUTHOR)).toBe(false);
        /*
         * The distinction the third key exists for: handling submissions does NOT imply confirming a
         * linkage, because the catalog has no implication and inventing one here would be the
         * silent widening this migration was written to avoid.
         */
        expect(hasFormsCapability(ctx, FORMS_SUBMISSIONS_CONFIRM)).toBe(false);
    });

    it("lets a confirm-only role confirm a linkage and nothing more", async () => {
        const ctx = await ctxFor(USER.confirm);
        expect(hasFormsCapability(ctx, FORMS_SUBMISSIONS_CONFIRM)).toBe(true);
        // Confirming a match the system proposed is not setting one by hand.
        expect(hasFormsCapability(ctx, FORMS_SUBMISSIONS)).toBe(false);
        expect(hasFormsCapability(ctx, FORMS_AUTHOR)).toBe(false);
    });

    it("denies every Forms authority to a role that is merely CALLED admin", async () => {
        const ctx = await ctxFor(USER.namedAdmin);
        expect(ctx.permissionKeys).toContain("portal.access");
        for (const cap of [FORMS_AUTHOR, FORMS_SUBMISSIONS, FORMS_SUBMISSIONS_CONFIRM] as const) {
            expect(hasFormsCapability(ctx, cap), `the name "admin" must grant nothing: ${cap}`).toBe(false);
        }
    });

    it("allows an arbitrarily named role that holds the capability", async () => {
        // `cert_forms_wombat`. Nothing about the name suggests authority; the grant is the authority.
        expect(hasFormsCapability(await ctxFor(USER.arbitrary), FORMS_AUTHOR)).toBe(true);
    });

    it("admits a portal-only role while denying every Forms write", async () => {
        const ctx = await ctxFor(USER.portalOnly);
        expect(ctx.permissionKeys, "reads stay reachable because admission is unchanged").toContain("portal.access");
        for (const cap of [FORMS_AUTHOR, FORMS_SUBMISSIONS, FORMS_SUBMISSIONS_CONFIRM] as const) {
            expect(hasFormsCapability(ctx, cap)).toBe(false);
        }
    });

    it("composes Forms authority across two roles, and loses it when one is removed", async () => {
        // W-17: the capability may arrive through any role the person holds.
        await sb.from("user_roles").delete().eq("org_id", ORG).eq("user_id", USER.portalOnly);
        await sb.from("user_roles").insert([
            { org_id: ORG, user_id: USER.portalOnly, role: ROLE.portalOnly },
            { org_id: ORG, user_id: USER.portalOnly, role: ROLE.author },
        ]);
        expect(hasFormsCapability(await ctxFor(USER.portalOnly), FORMS_AUTHOR)).toBe(true);

        await sb.from("user_roles").delete().eq("org_id", ORG).eq("user_id", USER.portalOnly).eq("role", ROLE.author);
        expect(hasFormsCapability(await ctxFor(USER.portalOnly), FORMS_AUTHOR)).toBe(false);
    });

    it("never resolves Forms authority across an organization boundary", async () => {
        // The author's grants belong to their org. Asked about another, they hold nothing.
        expect(await capsOf(USER.author, OTHER_ORG)).toEqual([]);
    });

    it("preserves exactly what admin and ops could already do", async () => {
        const { data } = await sb.from("role_permission_grants")
            .select("role_key, permission_key")
            .eq("org_id", "00000000-0000-4000-8000-000000000001")
            .in("role_key", ["admin", "ops", "school_director", "regional_lead"])
            .like("permission_key", "forms.%");
        const rows = (data ?? []) as { role_key: string; permission_key: string }[];
        const of = (r: string) => rows.filter((x) => x.role_key === r).map((x) => x.permission_key).sort();

        // admin could perform every Forms write, and still can.
        expect(of("admin")).toEqual([FORMS_AUTHOR, FORMS_SUBMISSIONS_CONFIRM, FORMS_SUBMISSIONS].sort());
        // ops could confirm a linkage and nothing else. Still exactly that — not one operation more.
        expect(of("ops")).toEqual([FORMS_SUBMISSIONS_CONFIRM]);
        // And no job title acquired Forms authority it never had.
        expect(of("school_director")).toEqual([]);
        expect(of("regional_lead")).toEqual([]);
    });
});
