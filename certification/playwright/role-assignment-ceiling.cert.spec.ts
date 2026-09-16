/**
 * THE USER ADMINISTRATOR, MOUNTED — useful, and bounded.
 *
 * `admin.users.write` is the key the Access Administration Split created so that someone could run
 * the member directory without being handed the whole organization. For one promoted release it was
 * the opposite of narrow: assigning a role conferred that role's ENTIRE package, so the narrowest
 * administrator in the product could mint a colleague holding eighty capabilities it did not have.
 *
 * This drives the real routes as a real signed-in user administrator and proves both halves, because
 * only one of them is interesting on its own:
 *
 *   - they CAN delegate authority they hold — a ceiling that refuses everything would be "safe" and
 *     would make `admin.users.write` worthless;
 *   - they CANNOT delegate authority they lack, and the refusal leaves the target untouched.
 *
 * Personas come from `fixtures/access-personas.mjs`; run its `setup` from `web/` first.
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

const PASSWORD = "alloy-local-cert";

/** Holds exactly portal.access + admin.users.read + admin.users.write. Nothing else. */
const USER_ADMIN = "cert.axuser@northwind.invalid";

/** The person being administered: holds only `portal.access` through a role labelled "Admin". */
const TARGET_ID = "c0000000-0000-4000-8000-00000000d027";

/** Its package is a subset of the user administrator's own, so it confers nothing beyond them. */
const ROLE_WITHIN = "mcert_ax_user_admin";
/** Carries fin.read + fin.write, which the user administrator does not hold. */
const ROLE_BEYOND = "mcert_sj_finwrite";

async function signIn(browser: Browser, email: string) {
    const context = await browser.newContext({ storageState: undefined });
    const page: Page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    await page.waitForURL("**/workspace**", { timeout: 90_000 });
    return { page, request: page.request, close: () => context.close() };
}

/** The roles this member holds, read back through the route the operator's own screen reads. */
async function heldRoles(r: APIRequestContext): Promise<string[]> {
    const res = await r.get("/api/admin/settings/users-roles/members");
    const json = (await res.json()) as { members?: { user_id: string; role_keys?: string[] }[] };
    return ((json.members ?? []).find((m) => m.user_id === TARGET_ID)?.role_keys ?? []).sort();
}

test.describe.configure({ mode: "serial" });

test.describe("Role assignment is delegation — the user administrator's ceiling", () => {
    test("the persona is genuinely narrow, and the workspace opens for them", async ({ browser }) => {
        // Non-vacuity: if this persona were an administrator, every refusal below would be trivial.
        const s = await signIn(browser, USER_ADMIN);
        const grants = await s.request.get("/api/admin/rbac/grants?role_key=mcert_ax_user_admin");
        expect(grants.status(), "a user administrator must not read role packages").toBe(403);

        const members = await s.request.get("/api/admin/settings/users-roles/members");
        expect(members.status(), "but they must be able to run the member directory").toBe(200);
        await s.close();
    });

    test("CAN delegate authority they themselves hold", async ({ browser }) => {
        const s = await signIn(browser, USER_ADMIN);
        await s.request.delete(`/api/admin/users/${TARGET_ID}/roles/${ROLE_WITHIN}`);

        const res = await s.request.post(`/api/admin/users/${TARGET_ID}/roles`, {
            data: { role: ROLE_WITHIN },
        });
        expect(res.status(), await res.text()).toBeLessThan(400);
        expect(await heldRoles(s.request)).toContain(ROLE_WITHIN);
        await s.close();
    });

    test("CANNOT delegate authority they do not hold, and the target is untouched", async ({ browser }) => {
        const s = await signIn(browser, USER_ADMIN);
        const before = await heldRoles(s.request);

        const res = await s.request.post(`/api/admin/users/${TARGET_ID}/roles`, {
            data: { role: ROLE_BEYOND },
        });
        const body = await res.text();
        expect(res.status(), body).toBe(403);
        expect(body, "the refusal should name the authority that exceeded the ceiling").toContain("fin.");

        // The property that matters more than the status: nothing moved.
        expect(await heldRoles(s.request)).toEqual(before);
        await s.close();
    });

    test("the refusal survives a cold reload — it was a write that never happened", async ({ browser }) => {
        const s = await signIn(browser, USER_ADMIN);
        await s.page.goto("/organization/access?section=users", { waitUntil: "domcontentloaded" });
        expect(await heldRoles(s.request)).not.toContain(ROLE_BEYOND);
        await s.close();
    });

    test("and they still cannot rewrite the role package to get around it", async ({ browser }) => {
        /*
         * The obvious way around an assignment ceiling is to edit the role instead. That is the
         * Access Administration Split doing its job: `admin.roles.write` is a different key, and this
         * persona does not hold it — so neither door opens.
         */
        const s = await signIn(browser, USER_ADMIN);
        const res = await s.request.put("/api/admin/rbac/grants?role_key=" + ROLE_BEYOND, {
            data: { role_key: ROLE_BEYOND, permission_keys: ["portal.access"] },
        });
        expect(res.status()).toBe(403);
        await s.close();
    });
});
