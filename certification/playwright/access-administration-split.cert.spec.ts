/**
 * ACCESS ADMINISTRATION SPLIT V1.
 *
 * `settings.users_roles` authorized creating users, assigning roles, defining roles, granting ANY
 * capability, changing where a person may operate, and registering attendance kiosks. Six powers,
 * one grant. This proves the four that replaced it are genuinely separate.
 *
 * ── THE ASSERTION THAT MATTERS IS THE DENIAL ──
 *
 * Any split looks fine if you only check that each holder can do its own job; the question is what
 * each holder CANNOT do. A user administrator who can still rewrite a role's package, or a device
 * administrator who can still create users, would mean the split exists only in the catalog. So the
 * matrix is square: every persona is pointed at every family, and the diagonal is the claim.
 *
 * Personas come from `fixtures/access-personas.mjs`; run its `setup` from `web/` first.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const EVIDENCE = path.join(__dirname, "..", "evidence", "access-administration-split");
const PASSWORD = "alloy-local-cert";
const NO_ID = "99999999-0000-4000-8000-000000000601";
const NO_ROLE = "mcert_no_such_role_601";

const PERSONAS = {
    userAdmin: { email: "cert.axuser@northwind.invalid" },
    roleAdmin: { email: "cert.axrole@northwind.invalid" },
    scopeAdmin: { email: "cert.axscope@northwind.invalid" },
    deviceAdmin: { email: "cert.axdevice@northwind.invalid" },
    auditor: { email: "cert.axaudit@northwind.invalid" },
    portalOnly: { email: "cert.portalonly@northwind.invalid" },
    titular: { email: "cert.cfgtitular@northwind.invalid" },
} as const;
const OPS = { email: "cert.ops@northwind.invalid" };

type Door = "userCreate" | "userRemove" | "roleAssign" | "roleUnassign" | "scopeChange"
    | "roleCreate" | "roleEdit" | "grantsReplace" | "deviceRegister" | "deviceRevoke";

const no = { data: {}, failOnStatusCode: false } as const;
async function knock(r: APIRequestContext, door: Door): Promise<number> {
    switch (door) {
        // ── admin.users.write: who is a member, and which roles they hold ──
        case "userCreate": return (await r.post("/api/admin/users", no)).status();
        case "userRemove": return (await r.post(`/api/admin/users/${NO_ID}/remove`, no)).status();
        case "roleAssign": return (await r.post(`/api/admin/users/${NO_ID}/roles`, no)).status();
        case "roleUnassign": return (await r.delete(`/api/admin/users/${NO_ID}/roles/${NO_ROLE}`, no)).status();
        // ── admin.access_scope.write: where they may operate ──
        case "scopeChange": return (await r.patch(`/api/admin/users/${NO_ID}/access-scope`, no)).status();
        // ── admin.roles.write: what a role MEANS, and what it may delegate ──
        case "roleCreate": return (await r.post("/api/admin/rbac/roles", no)).status();
        case "roleEdit": return (await r.patch(`/api/admin/rbac/roles/${NO_ROLE}`, no)).status();
        case "grantsReplace": return (await r.put(`/api/admin/rbac/grants?role_key=${NO_ROLE}`, { data: { permission_keys: [] }, failOnStatusCode: false })).status();
        // ── attendance.devices.manage: kiosks ──
        case "deviceRegister": return (await r.post("/api/admin/attendance/kiosk-devices", no)).status();
        case "deviceRevoke": return (await r.delete(`/api/admin/attendance/kiosk-devices/${NO_ID}`, no)).status();
    }
}

const USERS: Door[] = ["userCreate", "userRemove", "roleAssign", "roleUnassign"];
const SCOPE: Door[] = ["scopeChange"];
const ROLES: Door[] = ["roleCreate", "roleEdit", "grantsReplace"];
const DEVICES: Door[] = ["deviceRegister", "deviceRevoke"];
const ALL: Door[] = [...USERS, ...SCOPE, ...ROLES, ...DEVICES];
const admitted = (s: number) => s !== 403;

const MATRIX: Record<string, Record<string, number>> = {};
function record(who: string, door: string, status: number) {
    MATRIX[who] = MATRIX[who] ?? {};
    MATRIX[who][door] = status;
}

async function signIn(browser: Browser, email: string) {
    const context = await browser.newContext({ storageState: undefined });
    const page: Page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try { await page.waitForURL("**/workspace**", { timeout: 90_000 }); } catch { signedIn = false; }
    return { page, request: page.request, signedIn, close: () => context.close() };
}

test.describe.configure({ mode: "serial" });

test.describe("Access administration split — four authorities, not one", () => {
    test.afterAll(() => {
        fs.mkdirSync(EVIDENCE, { recursive: true });
        fs.writeFileSync(path.join(EVIDENCE, "authority-matrix.json"), `${JSON.stringify(MATRIX, null, 2)}\n`);
    });

    test("PHASE 1 — each authority opens its own family and no other", async ({ browser }) => {
        const owns: Record<keyof typeof PERSONAS, Door[]> = {
            userAdmin: USERS,
            roleAdmin: ROLES,
            scopeAdmin: SCOPE,
            deviceAdmin: DEVICES,
            // Reads only: the auditor exists to prove reading is not administering.
            auditor: [],
            portalOnly: [],
            titular: [],
        };
        for (const [who, persona] of Object.entries(PERSONAS)) {
            const s = await signIn(browser, persona.email);
            expect(s.signedIn, `${who} could not sign in; an unauthenticated 403 would fake a pass`).toBe(true);
            const allowed = new Set(owns[who as keyof typeof PERSONAS]);
            for (const door of ALL) {
                const status = await knock(s.request, door);
                record(who, door, status);
                expect(
                    admitted(status),
                    `${who} at ${door}: expected ${allowed.has(door) ? "ADMITTED" : "REFUSED"}, got ${status}`,
                ).toBe(allowed.has(door));
            }
            await s.close();
        }
    });

    test("PHASE 2 — the four denials this split exists for", async () => {
        /*
         * PHASE 1 measured every cell. These four are restated as their own claims so a regression
         * names the boundary it crossed rather than reddening a grid: each is a power that used to
         * travel with a power it has nothing to do with.
         */
        expect(MATRIX.userAdmin.grantsReplace, "a user administrator must not rewrite what a role may do").toBe(403);
        expect(MATRIX.roleAdmin.roleAssign, "a role administrator must not decide who holds a role").toBe(403);
        expect(MATRIX.scopeAdmin.roleAssign, "a scope administrator must not assign roles").toBe(403);
        expect(MATRIX.deviceAdmin.userCreate, "registering a kiosk must not create users").toBe(403);
        for (const door of ALL) {
            expect(MATRIX.deviceAdmin[door] === 403 || DEVICES.includes(door as Door), `device admin reached ${door}`).toBe(true);
        }
    });

    test("PHASE 3 — reading is not administering", async () => {
        for (const door of ALL) {
            expect(MATRIX.auditor[door], `a read-only auditor mutated at ${door}`).toBe(403);
        }
    });

    test("PHASE 4 — a role LABELLED Admin, and portal admission alone, carry nothing", async () => {
        for (const door of ALL) {
            expect(MATRIX.titular[door], `a role named Admin opened ${door}`).toBe(403);
            expect(MATRIX.portalOnly[door], `portal-only opened ${door}`).toBe(403);
        }
    });

    test("PHASE 5 — OPS IS NARROWED, deliberately, and keeps its reads", async ({ browser }) => {
        /*
         * THE INTENTIONAL BEHAVIOUR CHANGE.
         *
         * Ops held the umbrella and could therefore create users, assign roles, rewrite role
         * packages and register kiosks. The catalog never said it should: `admin.users.write` and
         * `admin.roles.write` have been admin-only since the permission grid, while the read halves
         * went to ops. Ops loses the write half it was never granted on purpose, and keeps the reads.
         */
        const s = await signIn(browser, OPS.email);
        expect(s.signedIn, "ops must still reach the portal").toBe(true);
        for (const door of ALL) {
            const status = await knock(s.request, door);
            record("defaultOps", door, status);
            expect(status, `ops still administers access at ${door} (${status})`).toBe(403);
        }
        const users = await s.request.get("/api/admin/users", { failOnStatusCode: false });
        const roles = await s.request.get("/api/admin/rbac/roles", { failOnStatusCode: false });
        record("defaultOps", "usersRead", users.status());
        record("defaultOps", "rolesRead", roles.status());
        await s.close();
        expect(users.ok(), "ops keeps admin.users.read").toBe(true);
        expect(roles.ok(), "ops keeps admin.roles.read").toBe(true);
    });

    test("PHASE 6 — the default admin keeps every one of them", async ({ request }) => {
        for (const door of ALL) {
            const status = await knock(request, door);
            record("seededOperatorAdmin", door, status);
            expect(admitted(status), `the default admin lost ${door} (${status})`).toBe(true);
        }
    });

    test("PHASE 7 — W-18 still bounds the role administrator", async ({ browser }) => {
        /*
         * The split hands `admin.roles.write` to a principal who is NOT a full administrator, which
         * is precisely the shape the delegation ceiling exists for. A role administrator may define
         * roles; it may not use that to mint authority it does not hold.
         */
        const s = await signIn(browser, PERSONAS.roleAdmin.email);
        expect(s.signedIn).toBe(true);
        const target = "mcert_ceiling_supply";
        const before = await s.request.get(`/api/admin/rbac/grants?role_key=${target}`, { failOnStatusCode: false });
        const beforeKeys = before.ok() ? (((await before.json()) as { permission_keys?: string[] }).permission_keys ?? []) : [];

        const res = await s.request.put(`/api/admin/rbac/grants?role_key=${target}`, {
            data: { permission_keys: [...beforeKeys, "fin.post"] }, failOnStatusCode: false,
        });
        const after = await s.request.get(`/api/admin/rbac/grants?role_key=${target}`, { failOnStatusCode: false });
        const afterKeys = after.ok() ? (((await after.json()) as { permission_keys?: string[] }).permission_keys ?? []) : [];
        await s.close();

        record("roleAdmin", "w18UnheldGrant", res.status());
        expect(res.status(), "a role administrator must not delegate authority it does not hold").toBe(403);
        expect(afterKeys, "the refusal must not have written").not.toContain("fin.post");
        expect(afterKeys.sort()).toEqual(beforeKeys.sort());
    });
});
