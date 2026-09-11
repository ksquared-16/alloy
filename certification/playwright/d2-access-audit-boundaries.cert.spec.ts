/**
 * D2 — WHO MAY CHANGE ACCESS, WHO MAY READ THAT IT CHANGED, AND WHO THE RECORD SAYS DID IT.
 *
 * The mounted vertical proves the product tells the truth to someone entitled to hear it. This file
 * asks the adversarial half of the same question, through real HTTP against the running application:
 * a principal who may not manage access, a principal from another tenant, a principal trying to
 * promote themselves, and a caller trying to sign someone else's name to their own change.
 *
 * ── WHY THESE GO THROUGH `request`, NOT THROUGH THE PAGE ──
 *
 * A refusal proven by a hidden button is a claim about CSS. Every attempt here is an HTTP request
 * carrying a real authenticated session, because that is what an attacker has and what a support
 * script has. The UI is not the audit owner and it is not the gate; both claims are only worth
 * anything when the server is asked directly.
 *
 * Events are then read from the database rather than from the API that just refused, so a denial
 * cannot be confused with a write that happened and was hidden.
 */
import { test, expect, type APIRequestContext, type Browser } from "@playwright/test";
import { createRequire } from "node:module";

const require_ = createRequire(`${process.cwd()}/web/package.json`);
const { createClient } = require_("@supabase/supabase-js");
const { readFileSync } = require_("node:fs");

const envText = readFileSync(`${process.cwd()}/web/.env.certification.local`, "utf8");
const readEnv = (k: string) =>
    envText.split("\n").find((l: string) => l.startsWith(`${k}=`))?.slice(k.length + 1).trim() ?? "";
const sb = createClient(
    readEnv("SUPABASE_URL") || readEnv("NEXT_PUBLIC_SUPABASE_URL"),
    readEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
);

const ORG = "00000000-0000-4000-8000-000000000001";
const OTHER_ORG = "aaaa1111-0000-4000-8000-000000000001";
const PASSWORD = "alloy-local-cert";

const OPERATOR = "qa.operator@northwind.invalid";
/** Admitted to the portal, holds NO `settings.users_roles`. The unauthorized reader. */
const NO_ACCESS_ADMIN = "cert.portalonly@northwind.invalid";
/** Reads Financials, manages nothing. The self-escalation attempt. */
const FIN_VIEWER = "cert.finviewer@northwind.invalid";
/** An administrator of a DIFFERENT tenant. */
const OTHER_ORG_ADMIN = "cert.otherorg@adapter.invalid";

/** The role this file mutates through the API. Restored at the end. */
const ROLE_KEY = "mcert_fin_viewer";

type Session = { request: APIRequestContext; close: () => Promise<void> };

/** A real signed-in session's request context — cookies and all. */
async function sessionFor(browser: Browser, email: string): Promise<Session> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForTimeout(2_000); // let the login form commit the session cookies
    return { request: context.request, close: () => context.close() };
}

async function userIdFor(email: string): Promise<string> {
    const { data } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const user = (data?.users ?? []).find((u: { email?: string }) => u.email === email);
    if (!user) throw new Error(`no certification principal ${email}`);
    return user.id as string;
}

async function eventsFor(correlationLike: string) {
    const { data } = await sb
        .from("mutation_events")
        .select("id, command_key, operator_id, origin, context_payload, committed_at, previous_state, new_state")
        .eq("org_id", ORG)
        .eq("domain", "access")
        .eq("context_payload->>role_key", correlationLike)
        .order("committed_at", { ascending: false });
    return (data ?? []) as { id: string; command_key: string; operator_id: string; origin: string; context_payload: Record<string, unknown> }[];
}

async function countAccessEvents(orgId: string): Promise<number> {
    const { count } = await sb
        .from("mutation_events")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("domain", "access");
    return count ?? 0;
}

test.describe.configure({ mode: "serial" });

test.describe("D2 — access audit boundaries", () => {
    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 9 + 11 — the API is the audit owner, and the origin is honest.
    // ─────────────────────────────────────────────────────────────────────────
    test("a grant made directly through the API produces the same event the UI does", async ({ browser }) => {
        const operator = await sessionFor(browser, OPERATOR);
        const operatorId = await userIdFor(OPERATOR);
        const before = await eventsFor(ROLE_KEY);

        const res = await operator.request.post(`/api/admin/rbac/roles/${ROLE_KEY}`, {
            data: { permission_keys: ["fin.read", "fin.write"] },
        });
        expect(res.status(), await res.text()).toBeLessThan(400);

        const after = await eventsFor(ROLE_KEY);
        expect(after.length, "a direct API grant is an access change and must be recorded").toBeGreaterThan(before.length);

        const newest = after[0]!;
        expect(newest.command_key).toBe("access.role.grants_changed");
        // SERVER-DERIVED, both of them.
        expect(newest.operator_id, "the actor is the authenticated principal").toBe(operatorId);
        expect(newest.context_payload.correlation_id, "the server mints the correlation id").toBeTruthy();
        /*
         * PHASE 11 — the SAME origin as the mounted product, on purpose. These routes serve the
         * browser and `curl` with one handler and one authorization; nothing distinguishes them but
         * headers the caller controls, so branching on those would put a caller-chosen value in
         * permanent history. `operator` describes both honestly: a human-authorised access change.
         */
        expect(newest.origin).toBe("operator");

        await operator.close();
    });

    test("a caller cannot change the recorded origin by claiming one", async ({ browser }) => {
        const operator = await sessionFor(browser, OPERATOR);
        const operatorId = await userIdFor(OPERATOR);

        const res = await operator.request.post(`/api/admin/rbac/roles/${ROLE_KEY}`, {
            headers: { "x-alloy-origin": "system", "user-agent": "automation/1.0" },
            data: { permission_keys: ["fin.read"], origin: "system", audit_origin: "automation" },
        });
        expect(res.status()).toBeLessThan(400);

        const newest = (await eventsFor(ROLE_KEY))[0]!;
        expect(newest.origin, "origin is a property of the route, not of what the caller asserts").toBe("operator");
        expect(newest.operator_id).toBe(operatorId);

        await operator.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 10 — a request cannot sign someone else's name to its own change.
    // ─────────────────────────────────────────────────────────────────────────
    test("a forged actor in the request body has no bearing on attribution", async ({ browser }) => {
        const operator = await sessionFor(browser, OPERATOR);
        const operatorId = await userIdFor(OPERATOR);
        const victimId = await userIdFor(FIN_VIEWER);

        const res = await operator.request.post(`/api/admin/rbac/roles/${ROLE_KEY}`, {
            data: {
                permission_keys: ["fin.read", "fin.adjust"],
                // Every shape a client might try to name its own author.
                operator_id: victimId,
                actor: victimId,
                actor_user_id: victimId,
                userId: victimId,
                user_id: victimId,
                correlation_id: "forged-correlation-id",
            },
        });
        expect(res.status()).toBeLessThan(400);

        const newest = (await eventsFor(ROLE_KEY))[0]!;
        expect(newest.operator_id, "the client cannot name its own audit author").toBe(operatorId);
        expect(newest.operator_id).not.toBe(victimId);
        expect(
            newest.context_payload.correlation_id,
            "the correlation id is minted by the server, not accepted from the caller"
        ).not.toBe("forged-correlation-id");

        await operator.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 13 — reading history requires the authority to change access.
    // ─────────────────────────────────────────────────────────────────────────
    test("a principal without access administration cannot read access history", async ({ browser }) => {
        const outsider = await sessionFor(browser, NO_ACCESS_ADMIN);
        const subject = await userIdFor(OPERATOR);

        for (const url of [
            "/api/admin/access/history",
            `/api/admin/access/history?subject=${subject}`,
            `/api/admin/access/history?role=${ROLE_KEY}`,
        ]) {
            const res = await outsider.request.get(url);
            expect(res.status(), `${url} must be refused`).toBeGreaterThanOrEqual(400);

            const body = await res.text();
            // Not one actor, role, capability or scope may leak through the refusal itself.
            expect(body).not.toContain(subject);
            expect(body).not.toContain(ROLE_KEY);
            expect(body).not.toMatch(/fin\.|portal\.access|access\.role\./);
        }

        // And the chapter itself is refused rather than rendered with an apology inside it.
        const page = await (await browser.newContext({ storageState: undefined })).newPage();
        await page.goto("/login");
        await page.locator('input[type="email"]').first().fill(NO_ACCESS_ADMIN);
        const pw = page.locator('input[type="password"]').first();
        await pw.fill(PASSWORD);
        await pw.press("Enter");
        await page.waitForTimeout(2_000);
        await page.goto("/organization/access?section=security", { waitUntil: "domcontentloaded" });
        expect(page.url(), "a hidden surface must not be reachable by URL").not.toContain("section=security");
        await page.context().close();

        await outsider.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 14 — the org boundary is the session's, never the query's.
    // ─────────────────────────────────────────────────────────────────────────
    test("a forged filter narrows inside the caller's organization and never reaches another", async ({ browser }) => {
        const operator = await sessionFor(browser, OPERATOR);
        const foreignSubject = await userIdFor(OTHER_ORG_ADMIN);

        // The API has no org_id input at all — this is the only handle a caller has.
        const forged = await operator.request.get(`/api/admin/access/history?subject=${foreignSubject}`);
        expect(forged.status()).toBeLessThan(400);
        const body = (await forged.json()) as { entries: { technical: { subjectId: string } }[] };
        expect(body.entries, "a foreign subject narrows to nothing, it does not widen the scope").toHaveLength(0);

        // Non-vacuity: the same session CAN read its own organization's history.
        const own = await operator.request.get("/api/admin/access/history");
        const ownBody = (await own.json()) as { entries: unknown[] };
        expect(ownBody.entries.length, "this proves nothing unless the org's own history is readable").toBeGreaterThan(0);

        // Even an explicit org parameter is not a parameter.
        const smuggled = await operator.request.get(`/api/admin/access/history?org_id=${OTHER_ORG}&orgId=${OTHER_ORG}`);
        const smuggledBody = (await smuggled.json()) as { entries: { technical: { subjectId: string } }[] };
        for (const entry of smuggledBody.entries) {
            expect(entry.technical.subjectId).not.toBe(foreignSubject);
        }

        await operator.close();
    });

    test("an administrator of one tenant cannot change access in another", async ({ browser }) => {
        const operator = await sessionFor(browser, OPERATOR);
        const before = await countAccessEvents(OTHER_ORG);

        // A role key that exists only in the other tenant, addressed by this tenant's administrator.
        const res = await operator.request.post("/api/admin/rbac/roles/admin", {
            data: { permission_keys: ["fin.read"], org_id: OTHER_ORG, orgId: OTHER_ORG },
        });

        // Whatever the answer, it must not have been applied to the other tenant.
        expect(await countAccessEvents(OTHER_ORG), "no event may be written in a tenant the caller does not administer").toBe(before);
        if (res.status() < 400) {
            const { data: foreignGrants } = await sb
                .from("role_permission_grants")
                .select("permission_key")
                .eq("org_id", OTHER_ORG)
                .eq("role_key", "admin")
                .eq("permission_key", "fin.read");
            // If the request succeeded it acted on the CALLER's org, never on the named one.
            expect((foreignGrants ?? []).length === 0 || res.status() >= 400).toBeTruthy();
        }

        await operator.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PHASE 15 — nobody promotes themselves.
    // ─────────────────────────────────────────────────────────────────────────
    test("a principal without access administration cannot grant themselves anything", async ({ browser }) => {
        const climber = await sessionFor(browser, FIN_VIEWER);
        const climberId = await userIdFor(FIN_VIEWER);
        const before = await countAccessEvents(ORG);

        const attempts: [string, Record<string, unknown>][] = [
            [`/api/admin/rbac/roles/${ROLE_KEY}`, { permission_keys: ["fin.read", "portal.access", "settings.users_roles"] }],
            ["/api/admin/rbac/grants", { role_key: ROLE_KEY, permission_keys: ["portal.access"] }],
            [`/api/admin/users/${climberId}/role`, { role: "admin" }],
        ];

        for (const [url, data] of attempts) {
            const res = await climber.request.post(url, { data });
            expect(res.status(), `${url} must refuse a principal who cannot administer access`).toBeGreaterThanOrEqual(400);
        }

        // No grant, and — just as important — no SUCCESS event for a change that did not happen.
        const { data: grants } = await sb
            .from("role_permission_grants")
            .select("permission_key")
            .eq("org_id", ORG)
            .eq("role_key", ROLE_KEY)
            .eq("allowed", true);
        const keys = (grants ?? []).map((g: { permission_key: string }) => g.permission_key);
        expect(keys, "self-escalation must not have granted portal admission").not.toContain("portal.access");
        expect(keys).not.toContain("settings.users_roles");
        expect(await countAccessEvents(ORG), "a refused mutation writes no event").toBe(before);

        await climber.close();
    });

    // ─────────────────────────────────────────────────────────────────────────
    // RESTORE — the role goes back to the package the fixture gave it.
    // ─────────────────────────────────────────────────────────────────────────
    test("puts the controlled role back", async ({ browser }) => {
        const operator = await sessionFor(browser, OPERATOR);
        const res = await operator.request.post(`/api/admin/rbac/roles/${ROLE_KEY}`, {
            data: { permission_keys: ["fin.read"] },
        });
        expect(res.status()).toBeLessThan(400);
        await operator.close();

        const { data: grants } = await sb
            .from("role_permission_grants").select("permission_key")
            .eq("org_id", ORG).eq("role_key", ROLE_KEY).eq("allowed", true);
        expect((grants ?? []).map((g: { permission_key: string }) => g.permission_key)).toEqual(["fin.read"]);
    });
});
