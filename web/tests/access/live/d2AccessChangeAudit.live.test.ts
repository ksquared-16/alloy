/**
 * D2 — ACCESS CHANGE AUDIT, CERTIFIED AGAINST REAL POSTGRES.
 *
 * The mounted matrix drives the operator's own screens. This file proves the half of D2 a browser
 * cannot reach: that the audit is written INSIDE the transaction that changes access, that a failure
 * partway through leaves neither the access nor a misleading event behind, that history cannot be
 * edited once written, and that one operator action reads back as one action.
 *
 * ── WHY THE ROLLBACK PROOF USES A REAL CONSTRAINT ──
 *
 * `access-scope` was five separate writes before D2. A widening that failed after the delete left the
 * member RESTRICTED with an EMPTY allow-list — scope narrowed to nothing by an operation whose whole
 * intent was to widen it. A mocked failure would prove a mock. This file makes Postgres refuse the
 * allow-list insert through the real `user_site_access.location_id` foreign key, at exactly the step
 * that used to be a separate statement, and then asks what survived.
 *
 * ── WHAT THIS FILE LEAVES BEHIND, AND WHY THAT IS CORRECT ──
 *
 * Its principals and roles are torn down. Its `mutation_events` are NOT, because they cannot be: the
 * append-only trigger refuses a delete, and weakening history to tidy a test is the one thing D2 must
 * never do. The rows it leaves are truthful records of access changes that really happened on this
 * stack, which is what the seven earlier D2 probe rows are too.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readAccessHistory } from "@/lib/access/accessHistoryReadModel";
import { presentAccessEvent, scopeDisplay, type AccessHistoryDisplayNames } from "@/lib/access/accessHistoryPresenter";
import type { PermissionCatalogEntry } from "@/lib/admin/permissionGrid";

function certEnv(): { url: string; serviceKey: string } | null {
    const fromProcess = {
        url: process.env.CERT_SUPABASE_URL ?? "",
        serviceKey: process.env.CERT_SERVICE_ROLE_KEY ?? "",
    };
    if (fromProcess.url && fromProcess.serviceKey) return fromProcess;
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

const env = certEnv();
const describeLive = env ? describe : describe.skip;

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";

/** This file's own principals — `d2…` so a stray row is identifiable as this file's. */
const P = {
    subject: "d2000000-0000-4000-8000-0000000d2001",
    other: "d2000000-0000-4000-8000-0000000d2002",
} as const;

const ROLE = {
    /** Created, granted, updated and finally DELETED, to certify the historical fallback. */
    doomed: "cert_d2_doomed",
    /** The grant/revoke subject. */
    target: "cert_d2_target",
    /** Paged over. */
    paged: "cert_d2_paged",
    /** Held alongside `target` so W-17 replacement has a set to discard. */
    second: "cert_d2_second",
} as const;

const ACTOR = "d2-live-actor";
const ALL_ROLES = Object.values(ROLE);

type EventRow = {
    id: string;
    committed_at: string;
    command_key: string;
    subject_id: string;
    subject_type: string;
    previous_state: string | null;
    new_state: string;
    operator_id: string | null;
    origin: string;
    context_payload: Record<string, unknown> | null;
};

describeLive("D2 access change audit — live", () => {
    const supabase = (env
        ? createClient(env.url, env.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
        : null) as unknown as SupabaseClient;

    let catalog: PermissionCatalogEntry[] = [];
    let siteA = "";
    let siteB = "";

    /** Every event this run caused, newest first, for one correlation id. */
    async function eventsFor(correlationId: string): Promise<EventRow[]> {
        const { data, error } = await supabase
            .from("mutation_events")
            .select("id, committed_at, command_key, subject_id, subject_type, previous_state, new_state, operator_id, origin, context_payload")
            .eq("org_id", ORG)
            .eq("domain", "access")
            .eq("context_payload->>correlation_id", correlationId)
            .order("committed_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as EventRow[];
    }

    async function eventsForRole(roleKey: string): Promise<EventRow[]> {
        const { data, error } = await supabase
            .from("mutation_events")
            .select("id, committed_at, command_key, subject_id, subject_type, previous_state, new_state, operator_id, origin, context_payload")
            .eq("org_id", ORG)
            .eq("domain", "access")
            .eq("context_payload->>role_key", roleKey)
            .order("committed_at", { ascending: false });
        if (error) throw new Error(error.message);
        return (data ?? []) as unknown as EventRow[];
    }

    async function countAccessEvents(): Promise<number> {
        const { count, error } = await supabase
            .from("mutation_events")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("domain", "access");
        if (error) throw new Error(error.message);
        return count ?? 0;
    }

    async function names(): Promise<AccessHistoryDisplayNames> {
        const [roles, locations] = await Promise.all([
            supabase.from("role_definitions").select("role_key, role_label").eq("org_id", ORG),
            supabase.from("locations").select("id, label").eq("org_id", ORG),
        ]);
        const roleMap = new Map<string, string>();
        for (const r of (roles.data ?? []) as { role_key: string; role_label: string | null }[]) {
            if (r.role_label) roleMap.set(r.role_key, r.role_label);
        }
        const locationMap = new Map<string, string>();
        for (const l of (locations.data ?? []) as { id: string; label: string | null }[]) {
            if (l.label) locationMap.set(l.id, l.label);
        }
        return { people: new Map(), roles: roleMap, locations: locationMap };
    }

    async function cleanup() {
        const ids = Object.values(P);
        await supabase.from("user_site_access").delete().in("user_id", ids);
        await supabase.from("user_department_access").delete().in("user_id", ids);
        await supabase.from("user_access_profiles").delete().in("user_id", ids);
        await supabase.from("user_roles").delete().in("user_id", ids);
        for (const rk of ALL_ROLES) {
            await supabase.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", rk);
            await supabase.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", rk);
        }
    }

    beforeAll(async () => {
        await cleanup();

        const { data: perms, error: pErr } = await supabase
            .from("permission_definitions")
            .select("key, group_key, label")
            .eq("is_active", true);
        if (pErr) throw new Error(pErr.message);
        catalog = (perms ?? []) as PermissionCatalogEntry[];

        const { data: locs, error: lErr } = await supabase
            .from("locations")
            .select("id, label")
            .eq("org_id", ORG)
            .eq("location_type", "site")
            .order("label", { ascending: true })
            .limit(2);
        if (lErr) throw new Error(lErr.message);
        const rows = (locs ?? []) as { id: string; label: string | null }[];
        // NON-VACUITY. Scope proofs that silently ran with no locations would certify nothing.
        expect(rows.length, "the certification tenant must define at least two sites").toBeGreaterThanOrEqual(2);
        siteA = rows[0]!.id;
        siteB = rows[1]!.id;

        // Real auth principals: `user_roles.user_id` is a foreign key into `auth.users`, and a
        // membership for someone who does not exist is not a membership.
        for (const id of Object.values(P)) {
            await supabase.auth.admin.deleteUser(id).catch(() => undefined);
            const { error } = await supabase.auth.admin.createUser({
                id, email: `${id}@d2.invalid`, password: "alloy-local-cert", email_confirm: true,
            });
            if (error && !/already/i.test(error.message)) throw new Error(`${id}: ${error.message}`);
        }

        for (const rk of [ROLE.target, ROLE.paged, ROLE.second]) {
            const { error } = await supabase.from("role_definitions").insert({
                org_id: ORG, role_key: rk, role_label: `D2 ${rk}`, description: "D2 certification", is_system: false, is_active: true,
            });
            if (error) throw new Error(`${rk}: ${error.message}`);
        }
        const { error: urErr } = await supabase.from("user_roles").insert([
            { user_id: P.subject, org_id: ORG, role: ROLE.target },
            { user_id: P.subject, org_id: ORG, role: ROLE.second },
            { user_id: P.other, org_id: ORG, role: ROLE.target },
        ]);
        if (urErr) throw new Error(urErr.message);
    }, 120_000);

    afterAll(async () => {
        await cleanup();
        for (const id of Object.values(P)) await supabase.auth.admin.deleteUser(id).catch(() => undefined);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 21 — one callable signature per audited producer.
    // ─────────────────────────────────────────────────────────────────────────
    it("exposes exactly one signature for each audited producer, so no caller meets PGRST203", async () => {
        /*
         * This is the defect that broke every existing caller: `CREATE OR REPLACE` with added
         * DEFAULTed parameters does not replace a function, it creates a SECOND one, and PostgREST
         * then refuses a three-argument call rather than choosing. The migration dropped the narrow
         * forms instead of shimming them — a shim would have been an unaudited path to the same
         * mutation. Here the property is re-proved by CALLING each one the way the routes do.
         */
        const correlation = `d2-overload-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG,
            p_role_key: ROLE.target,
            p_permission_keys: ["fin.read"],
            p_actor_user_id: ACTOR,
            p_origin: "operator",
            p_correlation_id: correlation,
        });
        expect(error?.message ?? "", "the audited grants producer must resolve unambiguously").not.toMatch(/PGRST203|Could not choose/i);
        expect(error).toBeNull();

        /*
         * And the narrow form is genuinely gone rather than merely unused. This asks for a REAL
         * change (`fin.read` → `fin.write`) with three arguments: if an unaudited three-argument
         * function had survived, this would quietly succeed and move access with no event. It must
         * instead resolve to the audited function and be refused for naming no actor.
         */
        const narrow = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG,
            p_role_key: ROLE.target,
            p_permission_keys: ["fin.write"],
        } as never);
        expect(
            narrow.error?.message ?? "",
            "a three-argument call must resolve to the AUDITED function, not to a surviving unaudited one"
        ).toMatch(/audit_actor_required|PGRST202|Could not find/i);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 10 (database half) — an access change must name its actor.
    // ─────────────────────────────────────────────────────────────────────────
    it("refuses to change access without naming the actor that made it", async () => {
        const { error } = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG,
            p_role_key: ROLE.target,
            p_permission_keys: ["fin.read", "fin.write"],
            p_actor_user_id: "   ",
            p_origin: "operator",
            p_correlation_id: "d2-actorless",
        });
        expect(error?.message ?? "").toContain("audit_actor_required");

        // …and the refusal took the GRANT with it. A change that could not be attributed must not
        // have happened either.
        const { data } = await supabase
            .from("role_permission_grants")
            .select("permission_key")
            .eq("org_id", ORG)
            .eq("role_key", ROLE.target)
            .eq("allowed", true);
        expect((data ?? []).map((r) => (r as { permission_key: string }).permission_key).sort()).toEqual(["fin.read"]);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 1 + 2 + 12 — grant, revoke, and one correlation id per action.
    // ─────────────────────────────────────────────────────────────────────────
    it("records a grant and a revoke as two immutable events with different correlation ids", async () => {
        const grantId = `d2-grant-${crypto.randomUUID()}`;
        const revokeId = `d2-revoke-${crypto.randomUUID()}`;

        // Start from No access so the diff is the operator's own change.
        await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG, p_role_key: ROLE.target, p_permission_keys: [],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: `d2-reset-${crypto.randomUUID()}`,
        });

        const grant = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG, p_role_key: ROLE.target, p_permission_keys: ["fin.read"],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: grantId,
        });
        expect(grant.error).toBeNull();

        const revoke = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG, p_role_key: ROLE.target, p_permission_keys: [],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: revokeId,
        });
        expect(revoke.error).toBeNull();

        const [granted] = await eventsFor(grantId);
        const [revoked] = await eventsFor(revokeId);
        expect(granted, "the grant must have committed an event").toBeTruthy();
        expect(revoked, "the revoke must have committed its own event").toBeTruthy();
        expect(granted!.id).not.toBe(revoked!.id);
        expect(granted!.operator_id).toBe(ACTOR);
        expect(revoked!.operator_id).toBe(ACTOR);

        const n = await names();
        const g = presentAccessEvent(granted!, n, catalog);
        const r = presentAccessEvent(revoked!, n, catalog);

        // THE GRID-ROW SENTENCE. The area may truthfully summarise as "Limited · 1 of 4" in the
        // editor; history describes the change the operator made, which is one row moving.
        expect(g.changes).toContainEqual({ area: "Financials", from: "No access", to: "View" });
        expect(r.changes).toContainEqual({ area: "Financials", from: "View", to: "No access" });
        // And the raw key is not the product copy.
        expect(g.summary).not.toContain("fin.read");
        expect(g.summary).toContain("Financials");
        expect(g.technical.newState).toContain("fin.read");
    }, 90_000);

    it("writes no event for a save that changed nothing", async () => {
        await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG, p_role_key: ROLE.target, p_permission_keys: ["fin.read"],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: `d2-settle-${crypto.randomUUID()}`,
        });
        const before = await countAccessEvents();
        const noop = `d2-noop-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG, p_role_key: ROLE.target, p_permission_keys: ["fin.read"],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: noop,
        });
        expect(error).toBeNull();
        expect(await eventsFor(noop), "an idempotent replay must not imply access moved").toHaveLength(0);
        expect(await countAccessEvents()).toBe(before);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 4 + 12 — role create and its initial package are ONE action.
    // ─────────────────────────────────────────────────────────────────────────
    it("correlates a role creation with the package it was created holding", async () => {
        const correlation = `d2-create-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("create_role_definition_audited", {
            p_org_id: ORG,
            p_role_key: ROLE.doomed,
            p_role_label: "D2 doomed role",
            p_permission_keys: ["fin.read"],
            p_actor_user_id: ACTOR,
            p_origin: "operator",
            p_correlation_id: correlation,
        });
        expect(error).toBeNull();

        const events = await eventsFor(correlation);
        const kinds = events.map((e) => e.command_key).sort();
        expect(kinds, "creation and its initial grants are one operator action, two immutable events")
            .toEqual(["access.role.created", "access.role.grants_changed"]);
        // Same correlation id — that is what makes them one action rather than two coincidences.
        expect(new Set(events.map((e) => (e.context_payload as { correlation_id?: string }).correlation_id)).size).toBe(1);
    }, 60_000);

    it("records a role update with truthful before and after", async () => {
        const correlation = `d2-update-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("save_role_definition_and_grants", {
            p_org_id: ORG,
            p_role_key: ROLE.doomed,
            p_role_label: "D2 doomed role (renamed)",
            p_is_active: true,
            p_permission_keys: ["fin.read", "fin.write"],
            p_actor_user_id: ACTOR,
            p_origin: "operator",
            p_correlation_id: correlation,
        });
        expect(error).toBeNull();

        const events = await eventsFor(correlation);
        expect(events.length, "a rename plus a package change is not a silent save").toBeGreaterThanOrEqual(1);
        const grants = events.find((e) => e.command_key === "access.role.grants_changed");
        expect(grants).toBeTruthy();
        const presented = presentAccessEvent(grants!, await names(), catalog);
        expect(presented.changes).toContainEqual({ area: "Financials", from: "View", to: "Manage" });
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 5 — W-17 replacement, stated rather than softened.
    // ─────────────────────────────────────────────────────────────────────────
    it("records a membership write as the role-set REPLACEMENT it actually is", async () => {
        const correlation = `d2-w17-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("replace_membership_with_access_profile", {
            p_user_id: P.subject,
            p_org_id: ORG,
            p_role: ROLE.target,
            p_actor_user_id: ACTOR,
            p_origin: "operator",
            p_correlation_id: correlation,
        });
        expect(error).toBeNull();

        const [event] = await eventsFor(correlation);
        expect(event, "replacing a role set is an access change").toBeTruthy();
        expect(event!.command_key).toBe("access.user.roles_changed");

        const ctx = event!.context_payload as { discarded_roles?: unknown; replacement_semantics?: string };
        // W-17 is RECORDED, not repaired here. The API replaced the set; the history says so.
        expect(ctx.replacement_semantics).toBe("w17_replaces_role_set");
        expect(ctx.discarded_roles, "the roles this write removed must be nameable afterwards").toContain(ROLE.second);

        const presented = presentAccessEvent(event!, await names(), catalog);
        expect(presented.summary).toMatch(/from .* to /);
        expect(presented.summary, "a replacement must never be narrated as an addition").not.toMatch(/\badded\b/i);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 7 — scope widening commits atomically.
    // ─────────────────────────────────────────────────────────────────────────
    it("commits a scope widening and its event together", async () => {
        await supabase.rpc("replace_member_access_scope_audited", {
            p_org_id: ORG, p_user_id: P.subject,
            p_department_scope: "all", p_department_ids: [],
            p_site_scope: "restricted", p_site_location_ids: [siteA],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: `d2-scope-base-${crypto.randomUUID()}`,
        });

        const correlation = `d2-scope-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("replace_member_access_scope_audited", {
            p_org_id: ORG, p_user_id: P.subject,
            p_department_scope: "all", p_department_ids: [],
            p_site_scope: "restricted", p_site_location_ids: [siteA, siteB],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: correlation,
        });
        expect(error).toBeNull();

        const [event] = await eventsFor(correlation);
        expect(event).toBeTruthy();
        expect(event!.command_key).toBe("access.user.scope_changed");

        const { data: sites } = await supabase
            .from("user_site_access").select("location_id").eq("user_id", P.subject).eq("org_id", ORG);
        expect((sites ?? []).map((s) => (s as { location_id: string }).location_id).sort()).toEqual([siteA, siteB].sort());

        // The operator reads location NAMES, not uuids. This is the assertion the `locations.name`
        // column defect would have failed: the lookup errored, the map was empty, and every site
        // rendered as "Deleted location (uuid)" while sitting in the editor one card away.
        const n = await names();
        const presented = presentAccessEvent(event!, n, catalog);
        const after = scopeDisplay(event!.new_state, n.locations);
        expect(after).not.toMatch(/Deleted location/);
        expect(presented.summary).toContain(after);
    }, 90_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 8 — MANDATORY. A failed widening leaves the old scope, not a broken one.
    // ─────────────────────────────────────────────────────────────────────────
    it("leaves scope, allow-lists and history untouched when part of a widening fails", async () => {
        const before = {
            profile: (await supabase.from("user_access_profiles").select("department_scope, site_scope").eq("user_id", P.subject).eq("org_id", ORG).maybeSingle()).data,
            sites: ((await supabase.from("user_site_access").select("location_id").eq("user_id", P.subject).eq("org_id", ORG)).data ?? [])
                .map((s) => (s as { location_id: string }).location_id).sort(),
            departments: ((await supabase.from("user_department_access").select("department_id").eq("user_id", P.subject).eq("org_id", ORG)).data ?? [])
                .map((d) => (d as { department_id: string }).department_id).sort(),
            total: await countAccessEvents(),
        };
        // NON-VACUITY: a rollback proof over an empty allow-list would prove nothing survived
        // because there was nothing to survive.
        expect(before.sites.length, "the subject must hold real site access before the failed widening").toBeGreaterThan(0);

        const correlation = `d2-rollback-${crypto.randomUUID()}`;
        const missingLocation = "00000000-0000-4000-8000-0000dead0001";
        const { error } = await supabase.rpc("replace_member_access_scope_audited", {
            p_org_id: ORG, p_user_id: P.subject,
            p_department_scope: "all", p_department_ids: [],
            // A widening: everything they had, plus a location that does not exist. Postgres refuses
            // at the foreign key — the real constraint, at the real step, in the real transaction.
            p_site_scope: "restricted", p_site_location_ids: [...before.sites, missingLocation],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: correlation,
        });
        expect(error, "the widening must fail").toBeTruthy();

        const after = {
            profile: (await supabase.from("user_access_profiles").select("department_scope, site_scope").eq("user_id", P.subject).eq("org_id", ORG).maybeSingle()).data,
            sites: ((await supabase.from("user_site_access").select("location_id").eq("user_id", P.subject).eq("org_id", ORG)).data ?? [])
                .map((s) => (s as { location_id: string }).location_id).sort(),
            departments: ((await supabase.from("user_department_access").select("department_id").eq("user_id", P.subject).eq("org_id", ORG)).data ?? [])
                .map((d) => (d as { department_id: string }).department_id).sort(),
            total: await countAccessEvents(),
        };

        /*
         * THE ORIGINAL BUG, PINNED. The pre-D2 path deleted the allow-list and then inserted the new
         * one as separate statements, so this exact failure left the member `site_scope=restricted`
         * with ZERO permitted sites — an attempted widening that silently became a total revocation.
         */
        expect(after.sites, "the previous allow-list must survive a failed widening").toEqual(before.sites);
        expect(after.sites.length, "restricted scope with an empty allow-list is the original defect").toBeGreaterThan(0);
        expect(after.departments).toEqual(before.departments);
        expect(after.profile).toEqual(before.profile);
        expect(await eventsFor(correlation), "a change that did not happen must not be recorded as one").toHaveLength(0);
        expect(after.total, "no success event may be written for a failed mutation").toBe(before.total);
    }, 90_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 6 — removal keeps the person and remembers what they held.
    // ─────────────────────────────────────────────────────────────────────────
    it("records what a removed member held, keeps the person, and repeats as a no-op", async () => {
        const priorRoles = ((await supabase.from("user_roles").select("role").eq("user_id", P.subject).eq("org_id", ORG)).data ?? [])
            .map((r) => (r as { role: string }).role).sort();
        expect(priorRoles.length, "the subject must actually hold access before removal").toBeGreaterThan(0);
        const priorSites = ((await supabase.from("user_site_access").select("location_id").eq("user_id", P.subject).eq("org_id", ORG)).data ?? [])
            .map((s) => (s as { location_id: string }).location_id).sort();
        expect(priorSites.length, "the subject must hold real location access before removal").toBeGreaterThan(0);

        const correlation = `d2-remove-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("remove_member_access_audited", {
            p_org_id: ORG, p_user_id: P.subject,
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: correlation,
        });
        expect(error).toBeNull();

        const [event] = await eventsFor(correlation);
        expect(event).toBeTruthy();
        expect(event!.command_key).toBe("access.user.removed");
        for (const role of priorRoles) {
            expect(event!.previous_state ?? "", "history must name what they held").toContain(role);
        }
        const ctx = event!.context_payload as {
            person_deleted?: boolean;
            before_site_scope?: string | null;
            before_site_location_ids?: string[];
            before_department_scope?: string | null;
        };
        // The canonical Person is not a membership. Removing access must not read as deleting them.
        expect(ctx.person_deleted).toBe(false);
        // PRIOR SCOPE, NOT MERELY ITS SHAPE. "restricted" alone says the person was limited to
        // specific locations and throws away which — the one thing the event is kept for.
        expect(ctx.before_site_scope).toBe("restricted");
        expect(ctx.before_site_location_ids, "their location access must be recoverable from history")
            .toEqual(priorSites);

        const { data: stillMember } = await supabase.from("user_roles").select("role").eq("user_id", P.subject).eq("org_id", ORG);
        expect(stillMember ?? []).toHaveLength(0);

        // REPEATING IT IS NOT A SECOND REMOVAL.
        const repeat = `d2-remove-again-${crypto.randomUUID()}`;
        const total = await countAccessEvents();
        const again = await supabase.rpc("remove_member_access_audited", {
            p_org_id: ORG, p_user_id: P.subject,
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: repeat,
        });
        expect(again.error).toBeNull();
        expect(await eventsFor(repeat)).toHaveLength(0);
        expect(await countAccessEvents()).toBe(total);

        // And the event remains legible now that the membership is gone.
        const presented = presentAccessEvent(event!, await names(), catalog);
        expect(presented.summary).toBeTruthy();
        expect(presented.changes[0]?.to).toBe("No access");
    }, 90_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 16 — history outlives the thing it describes.
    // ─────────────────────────────────────────────────────────────────────────
    it("still renders events whose role, member and location are gone", async () => {
        const roleEvents = await eventsForRole(ROLE.doomed);
        expect(roleEvents.length, "the doomed role must have history to outlive it").toBeGreaterThan(0);

        await supabase.from("role_permission_grants").delete().eq("org_id", ORG).eq("role_key", ROLE.doomed);
        const { error: delErr } = await supabase.from("role_definitions").delete().eq("org_id", ORG).eq("role_key", ROLE.doomed);
        expect(delErr).toBeNull();

        const survived = await eventsForRole(ROLE.doomed);
        expect(survived.length, "deleting a role must not delete its history").toBe(roleEvents.length);

        const n = await names();
        for (const row of survived) {
            const presented = presentAccessEvent(row, n, catalog);
            expect(presented.summary).toBeTruthy();
            // Truthful about the absence, and never a fabricated current label.
            expect(presented.roleDisplay).toBe(`Deleted role (${ROLE.doomed})`);
        }

        // A removed member, and a location id the organization does not have.
        const removed = (await eventsFor(`d2-remove-nonexistent`)).length;
        expect(removed).toBe(0); // sanity: the helper filters, it does not invent
        expect(scopeDisplay("dept=all;site=restricted:00000000-0000-4000-8000-0000dead0002", n.locations))
            .toBe("Deleted location (00000000-0000-4000-8000-0000dead0002)");
        expect(presentAccessEvent(
            { ...survived[0]!, subject_type: "user", subject_id: P.other, operator_id: "d2-never-a-member", origin: "operator", context_payload: {} },
            n, catalog
        ).actorDisplay).toBe("Removed user (d2-never-a-member)");
    }, 90_000);

    it("names a system actor as a system, not as a departed colleague", async () => {
        /*
         * The persona fixture provisions roles through the same audited RPC the editor calls — on
         * purpose, because the alternative is an unaudited grant path. It is not a person, and the
         * fallback ladder's "Removed user (id)" would have said it was one.
         */
        const n = await names();
        const base = (await eventsForRole(ROLE.target))[0];
        expect(base).toBeTruthy();
        const asSystem = presentAccessEvent({ ...base!, origin: "system", operator_id: "fixture:access-personas" }, n, catalog);
        expect(asSystem.actorDisplay).toBe("System (fixture:access-personas)");
        expect(asSystem.actorDisplay).not.toMatch(/Removed user/);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 17 — keyset pagination over a controlled set.
    // ─────────────────────────────────────────────────────────────────────────
    it("pages a controlled event set with no duplicate and no omission", async () => {
        // Seven changes on a role nothing else touches, so the boundary is ours rather than the
        // shared stack's.
        const keys = ["fin.read", "fin.write", "fin.adjust", "fin.subsidy", "fin.responsibility"];
        for (let i = 0; i < 7; i += 1) {
            const { error } = await supabase.rpc("replace_role_permission_grants", {
                p_org_id: ORG, p_role_key: ROLE.paged,
                p_permission_keys: keys.slice(0, (i % 5) + 1),
                p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: `d2-page-${i}-${crypto.randomUUID()}`,
            });
            expect(error).toBeNull();
        }

        const n = await names();
        const all = await eventsForRole(ROLE.paged);
        expect(all.length, "the page boundary must be crossed by real events").toBeGreaterThanOrEqual(6);

        const first = await readAccessHistory(supabase, { orgId: ORG, roleKey: ROLE.paged, limit: 4 }, n, catalog);
        expect(first.entries).toHaveLength(4);
        expect(first.nextCursor, "more than one page must announce itself").toBeTruthy();

        const second = await readAccessHistory(
            supabase,
            { orgId: ORG, roleKey: ROLE.paged, limit: 4, cursor: first.nextCursor },
            n, catalog
        );

        const paged = [...first.entries, ...second.entries].map((e) => e.eventId);
        expect(new Set(paged).size, "keyset paging must not repeat a row").toBe(paged.length);
        for (const id of paged) expect(all.map((e) => e.id)).toContain(id);

        // Newest first, stably. `id` breaks a committed_at tie DETERMINISTICALLY — a uuid is not a
        // clock and this never claims it is.
        const times = [...first.entries, ...second.entries].map((e) => Date.parse(e.committedAt));
        for (let i = 1; i < times.length; i += 1) expect(times[i]!).toBeLessThanOrEqual(times[i - 1]!);

        const rerun = await readAccessHistory(supabase, { orgId: ORG, roleKey: ROLE.paged, limit: 4 }, n, catalog);
        expect(rerun.entries.map((e) => e.eventId), "the same query must return the same page").toEqual(first.entries.map((e) => e.eventId));
    }, 180_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 14 (read half) — a forged subject narrows, it never widens.
    // ─────────────────────────────────────────────────────────────────────────
    it("cannot be steered to another organization's events by a forged filter", async () => {
        const n = await names();
        const { data: foreign } = await supabase
            .from("mutation_events").select("subject_id").eq("org_id", OTHER_ORG).eq("domain", "access").limit(1);
        const foreignSubject = (foreign ?? [])[0] as { subject_id: string } | undefined;

        const page = await readAccessHistory(
            supabase,
            { orgId: ORG, subjectUserId: foreignSubject?.subject_id ?? "00000000-0000-4000-8000-0000dead0003", limit: 25 },
            n, catalog
        );
        // Narrowed to nothing INSIDE the caller's org — never a window onto another tenant.
        expect(page.entries).toHaveLength(0);

        const orgWide = await readAccessHistory(supabase, { orgId: ORG, limit: 25 }, n, catalog);
        expect(orgWide.entries.length, "the org's own history must be non-empty for this to mean anything").toBeGreaterThan(0);
    }, 60_000);

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 20 — history cannot be edited or erased.
    // ─────────────────────────────────────────────────────────────────────────
    it("refuses to update or delete a committed access event", async () => {
        const [event] = await eventsForRole(ROLE.paged);
        expect(event).toBeTruthy();

        const update = await supabase
            .from("mutation_events").update({ operator_id: "someone-else" }).eq("id", event!.id).select();
        expect(update.error, "an audit row that can be rewritten is not an audit row").toBeTruthy();

        const del = await supabase.from("mutation_events").delete().eq("id", event!.id).select();
        expect(del.error).toBeTruthy();

        const { data: still } = await supabase
            .from("mutation_events").select("id, operator_id").eq("id", event!.id).maybeSingle();
        expect(still, "the row must survive both attempts").toBeTruthy();
        expect((still as { operator_id: string }).operator_id).toBe(event!.operator_id);

        // The producers can still INSERT — immutability is not a write freeze.
        const correlation = `d2-after-immutability-${crypto.randomUUID()}`;
        const { error } = await supabase.rpc("replace_role_permission_grants", {
            p_org_id: ORG, p_role_key: ROLE.paged, p_permission_keys: ["fin.read", "fin.write", "fin.adjust"],
            p_actor_user_id: ACTOR, p_origin: "operator", p_correlation_id: correlation,
        });
        expect(error).toBeNull();
        expect(await eventsFor(correlation)).toHaveLength(1);
    }, 90_000);

    it("keeps the seven earlier D2 probe rows as legitimate history", async () => {
        const { count, error } = await supabase
            .from("mutation_events")
            .select("id", { count: "exact", head: true })
            .eq("org_id", ORG)
            .eq("domain", "access")
            .eq("operator_id", "live-cert-actor");
        expect(error).toBeNull();
        expect(count ?? 0, "earlier probe events are history, not debris to be cleaned up").toBeGreaterThanOrEqual(7);
    }, 60_000);
});
