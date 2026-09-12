/**
 * W-17 — HOLDING TWO ROLES, THROUGH THE OPERATOR'S OWN SCREENS.
 *
 * The live suite proves the transaction: one row per operation, the event inside it, no lost update
 * when two administrators act at once. None of that answers the question this file exists for —
 * *can an administrator give someone a second responsibility without silently taking away the first,
 * and does the product then show the truth?*
 *
 * ── WHAT IS WRITTEN, AND WHAT IS PUT BACK ──
 *
 * Everything happens to `cert.portalonly`, who starts holding exactly `mcert_portal_only`, and to a
 * custom role this file creates through the Roles UI. Both are returned to their starting state in
 * the same file. The `mutation_events` rows are NOT cleaned up and cannot be — they are truthful
 * records of access changes that really happened.
 *
 * Personas come from `fixtures/access-personas.mjs`; run
 * `node ../certification/playwright/fixtures/access-personas.mjs setup` from `web/` first.
 */
import { test, expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from "@playwright/test";
import path from "node:path";

const OPERATOR_STATE = path.join(__dirname, "..", ".auth", "operator.json");

const ACCESS = "/organization/access";
const ROLES = `${ACCESS}?section=roles`;
const USERS = `${ACCESS}?section=users`;
const SECURITY = `${ACCESS}?section=security`;
const PASSWORD = "alloy-local-cert";

/** The subject: holds `portal.access` and nothing else, so Financials is a clean "No access". */
const TARGET_ID = "c0000000-0000-4000-8000-00000000d008";
const TARGET_EMAIL = "cert.portalonly@northwind.invalid";
const ROLE_A = "mcert_portal_only";

/** Created through the Roles UI by this file, and deleted by it. */
const ROLE_B_LABEL = "W17 Certification Money Reader";

const FIN_NAV = '[data-adminv2-sidebar-modal-nav="financials"]';

/** Wait until exactly one copy of a chapter is mounted — a cold server briefly serves two. */
async function gotoSurface(page: Page, url: string, pageTestId: string) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId(pageTestId)).toHaveCount(1);
}

/** The floating operator assistant genuinely covers controls; close it the way an operator does. */
async function closeOperatorAssistant(page: Page) {
    const rail = page.locator("[data-adminv2-bos-rail-overlay]");
    if (!(await rail.count())) return;
    await rail.getByRole("button", { name: "Close" }).first().click();
    await expect(rail).toHaveCount(0);
}

async function openTarget(page: Page) {
    await gotoSurface(page, USERS, "access-users-page");
    await closeOperatorAssistant(page);
    await page.getByTestId(`access-user-${TARGET_ID}`).click();
    await expect(page.getByTestId("access-user-selected-workspace")).toBeVisible();
    /*
     * The role chips live in the access tab; the workspace opens on overview. "Edit User" sits in
     * the header above the tabs, so it reaches the editor from wherever the workspace happens to be.
     */
    if (!(await page.getByTestId("access-user-role-select").count())) {
        await page.getByTestId("access-user-edit").click();
    }
    await expect(page.getByTestId("access-user-roles-held")).toBeVisible();
}

/** The roles this membership holds, as the surface renders them. */
async function heldRoleKeys(page: Page): Promise<string[]> {
    const chips = page.locator('[data-testid^="access-user-role-held-"]');
    const ids = await chips.evaluateAll((els) => els.map((e) => e.getAttribute("data-testid") ?? ""));
    return ids.map((id) => id.replace("access-user-role-held-", "")).sort();
}

/** Does this principal's shell offer Financials, as of a FRESH authoritative request? */
async function offersFinancials(browser: Browser): Promise<{ offers: boolean; admitted: boolean; close: () => Promise<void> }> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(TARGET_EMAIL);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let signedIn = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 60_000 });
    } catch {
        signedIn = false;
    }
    const offers = signedIn && (await page.locator(FIN_NAV).count()) > 0;

    /*
     * ADMISSION IS THE ADMIN PORTAL, NOT THE WORKSPACE.
     *
     * Reaching `/workspace` only proves the person signed in — every member lands there.
     * `portal.access` is what `resolveAdminAccessCore` consults to admit someone to the
     * ORGANIZATION surfaces, so that is what has to be probed. Asserting on the workspace URL would
     * have reported a principal holding no roles at all as "admitted".
     */
    let admitted = false;
    if (signedIn) {
        // The PORTAL root, not an Access-admin chapter: `/organization/access` additionally requires
        // `settings.users_roles`, and probing it would report a principal who legitimately holds
        // `portal.access` as refused.
        await page.goto("/organization", { waitUntil: "domcontentloaded" });
        /*
         * Admitted means they ARRIVED, not merely that one particular refusal did not happen. A
         * principal holding nothing is bounced to `/login` rather than `/unauthorized`, so testing
         * only for `/unauthorized` reported them as admitted.
         */
        admitted = /\/organization/.test(page.url());
    }
    return { offers, admitted, close: () => context.close() };
}

/** The membership's scope, read from the canonical members model rather than from the screen. */
async function scopeOf(request: APIRequestContext): Promise<unknown> {
    const res = await request.get("/api/admin/settings/users-roles/members");
    expect(res.status()).toBeLessThan(400);
    const json = (await res.json()) as { members?: Record<string, unknown>[] };
    const row = (json.members ?? []).find((m) => m.user_id === TARGET_ID) as Record<string, unknown> | undefined;
    expect(row, "the certification subject must be in the members model").toBeTruthy();
    return {
        department_scope: row!.department_scope,
        site_scope: row!.site_scope,
        department_ids: [...((row!.department_ids as string[]) ?? [])].sort(),
        site_location_ids: [...((row!.site_location_ids as string[]) ?? [])].sort(),
    };
}

test.describe.configure({ mode: "serial" });

test.describe("W-17 — multi-role assignment, mounted", () => {
    let roleBKey = "";
    let scopeBefore: unknown = null;

    /*
     * A CERTIFICATION HAS TO BE RE-RUNNABLE. The subject is put back to exactly Role A here rather
     * than only at the end, so a run that aborts mid-file cannot make the next one vacuous.
     */
    test.beforeAll(async ({ browser }) => {
        const context = await browser.newContext({ storageState: OPERATOR_STATE });
        const res = await context.request.get("/api/admin/settings/users-roles/members");
        expect(res.status(), await res.text()).toBeLessThan(400);
        const json = (await res.json()) as { members?: { user_id: string; role_keys?: string[] }[] };
        const held = (json.members ?? []).find((m) => m.user_id === TARGET_ID)?.role_keys ?? [];
        for (const key of held.filter((k) => k !== ROLE_A)) {
            await context.request.delete(`/api/admin/users/${TARGET_ID}/roles/${encodeURIComponent(key)}`);
        }
        /*
         * Assigned unconditionally rather than only when missing. The persona fixture inserts role
         * rows directly and leaves no `user_access_profiles` row, and the producer creates that
         * profile on the way past — so a membership seeded without one would reach the zero-role
         * case with nothing left to represent it. Running the canonical assign, which is a truthful
         * no-op for the role itself, is what makes the fixture resemble a membership the product
         * actually created.
         */
        const seeded = await context.request.post(`/api/admin/users/${TARGET_ID}/roles`, { data: { role: ROLE_A } });
        expect(seeded.status(), await seeded.text()).toBeLessThan(400);
        await context.close();
    });

    // ── A. INITIAL STATE ────────────────────────────────────────────────
    test("the subject starts holding exactly one role, with a known scope", async ({ page }) => {
        await openTarget(page);
        expect(await heldRoleKeys(page)).toEqual([ROLE_A]);
        scopeBefore = await scopeOf(page.request);
        expect(scopeBefore).toBeTruthy();
    });

    // ── B. CREATE A CUSTOM ROLE THROUGH THE EXISTING ROLES UI ───────────
    test("an administrator creates a custom role and configures what it may do", async ({ page }) => {
        await gotoSurface(page, ROLES, "access-roles-page");
        await closeOperatorAssistant(page);
        await page.getByTestId("access-roles-new").click();
        await page.getByTestId("access-new-role-label").fill(ROLE_B_LABEL);
        const [created] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/api/admin/rbac/roles") && r.request().method() === "POST"),
            page.getByTestId("access-new-role-save").click(),
        ]);
        expect(created.status(), await created.text()).toBeLessThan(400);
        await expect(page.getByTestId("access-role-selected-workspace")).toBeVisible();

        // The key the ORGANIZATION's role was given — read from the server's own answer rather than
        // derived from the label, because deriving it here would be a second opinion about identity.
        roleBKey = ((await created.json()) as { role_key?: string }).role_key ?? "";
        expect(roleBKey, "the new role must come back with its own key").toBeTruthy();

        // Financials → View. The organization decides what its role means; this is that decision.
        const view = page.getByTestId("access-role-area-financials-read");
        await expect(view).toBeVisible();
        await view.click();
        const [saved] = await Promise.all([
            page.waitForResponse((r) => r.url().includes("/api/admin/rbac/roles/") && r.request().method() !== "GET"),
            page.getByTestId("access-role-save").click(),
        ]);
        expect(saved.status(), await saved.text()).toBeLessThan(400);
    });

    // ── C. ASSIGN IT AS A SECOND ROLE ───────────────────────────────────
    test("adding the second role keeps the first", async ({ page }) => {
        await openTarget(page);
        await page.getByTestId("access-user-role-select").selectOption(roleBKey);
        const [res] = await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/users\/.+\/roles$/.test(r.url()) && r.request().method() === "POST"),
            page.getByTestId("access-user-role-save").click(),
        ]);
        expect(res.status(), await res.text()).toBeLessThan(400);

        await expect(page.getByTestId(`access-user-role-held-${roleBKey}`)).toBeVisible();
        expect(await heldRoleKeys(page)).toEqual([ROLE_A, roleBKey].sort());
    });

    test("the capabilities compose, and the subject gains Financials on their next request", async ({ browser }) => {
        const shell = await offersFinancials(browser);
        expect(shell.admitted, "portal.access still comes from the first role").toBe(true);
        expect(shell.offers, "fin.read arrives with the second role").toBe(true);
        await shell.close();
    });

    test("assigning a role does not touch where they may work", async ({ page }) => {
        await openTarget(page);
        expect(await scopeOf(page.request), "role assignment changes WHAT, never WHERE").toEqual(scopeBefore);
    });

    test("the organization Security audit log records the assignment", async ({ page }) => {
        await gotoSurface(page, SECURITY, "access-security-page");
        // The feed loads after the chapter mounts; asserting on an unrendered list reads as "the
        // event is missing" when the truth is "the answer has not arrived yet".
        await expect(page.getByTestId("access-security-audit-log-list-event").first()).toBeVisible();
        const summaries = await page.getByTestId("access-security-audit-log-list-summary").allInnerTexts();
        expect(summaries.join(" | ")).toContain(ROLE_B_LABEL);
    });

    test("the person's own history records the assignment", async ({ page }) => {
        await openTarget(page);
        const card = page.getByTestId("access-user-history");
        await card.scrollIntoViewIfNeeded();
        const kinds = await page
            .getByTestId("access-user-history-list-event")
            .evaluateAll((els) => els.map((e) => e.getAttribute("data-command-key") ?? ""));
        expect(kinds, "an assignment is its own operation, not a replaced set").toContain("access.user.role_assigned");
        expect(kinds).not.toContain("access.role.grants_changed");
    });

    test("a cold reload still shows both roles", async ({ browser }) => {
        const fresh = await browser.newContext({ storageState: OPERATOR_STATE });
        const page = await fresh.newPage();
        await openTarget(page);
        expect(await heldRoleKeys(page)).toEqual([ROLE_A, roleBKey].sort());
        await fresh.close();
    });

    // ── D/E. TARGETED REMOVAL ───────────────────────────────────────────
    test("removing the second role removes only it", async ({ page }) => {
        await openTarget(page);
        const [res] = await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/users\/.+\/roles\/.+/.test(r.url()) && r.request().method() === "DELETE"),
            page.getByTestId(`access-user-role-remove-${roleBKey}`).click(),
        ]);
        expect(res.status(), await res.text()).toBeLessThan(400);
        await expect(page.getByTestId(`access-user-role-held-${roleBKey}`)).toHaveCount(0);
        expect(await heldRoleKeys(page)).toEqual([ROLE_A]);
    });

    test("the exclusive capability goes with it, and the retained one stays", async ({ browser }) => {
        const shell = await offersFinancials(browser);
        // `fin.read` came only from the removed role, so Financials goes. `portal.access` came from
        // the role still held, so admission remains — capabilities compose independently.
        expect(shell.admitted, "the first role still admits them to the portal").toBe(true);
        expect(shell.offers, "Financials was the second role's alone").toBe(false);
        await shell.close();
    });

    test("removal leaves scope exactly as it was", async ({ page }) => {
        await openTarget(page);
        expect(await scopeOf(page.request)).toEqual(scopeBefore);
    });

    test("history says the ROLE was removed, not that a capability was revoked", async ({ page }) => {
        await openTarget(page);
        const kinds = await page
            .getByTestId("access-user-history-list-event")
            .evaluateAll((els) => els.map((e) => e.getAttribute("data-command-key") ?? ""));
        expect(kinds).toContain("access.user.role_removed");
    });

    // ── F/G. ZERO ROLES, AND BACK AGAIN ─────────────────────────────────
    test("removing the final role leaves the person, the membership and the scope", async ({ page }) => {
        await openTarget(page);
        await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/users\/.+\/roles\/.+/.test(r.url()) && r.request().method() === "DELETE"),
            page.getByTestId(`access-user-role-remove-${ROLE_A}`).click(),
        ]);
        // The response commits; the surface re-reads after it. Wait for the chip to go rather than
        // racing the reload and calling the stale render a failure.
        await expect(page.getByTestId(`access-user-role-held-${ROLE_A}`)).toHaveCount(0);
        expect(await heldRoleKeys(page)).toEqual([]);

        // Still in the product. Removing the last role is not removing the person.
        await gotoSurface(page, USERS, "access-users-page");
        await expect(page.getByTestId(`access-user-${TARGET_ID}`), "a member with no roles is still a member").toHaveCount(1);
        await openTarget(page);
        expect(await scopeOf(page.request)).toEqual(scopeBefore);
    });

    test("with no roles they hold nothing, and the portal no longer admits them", async ({ browser }) => {
        const shell = await offersFinancials(browser);
        expect(shell.offers).toBe(false);
        expect(shell.admitted, "portal.access came from a role they no longer hold").toBe(false);
        await shell.close();
    });

    test("giving a role back restores access, without recreating the person", async ({ page }) => {
        await openTarget(page);
        await page.getByTestId("access-user-role-select").selectOption(ROLE_A);
        await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/users\/.+\/roles$/.test(r.url()) && r.request().method() === "POST"),
            page.getByTestId("access-user-role-save").click(),
        ]);
        await expect(page.getByTestId(`access-user-role-held-${ROLE_A}`)).toBeVisible();
        expect(await heldRoleKeys(page)).toEqual([ROLE_A]);
    });

    test("and the restored role admits them again", async ({ browser }) => {
        const shell = await offersFinancials(browser);
        expect(shell.admitted).toBe(true);
        await shell.close();
    });

    // ── THE ROLE CATALOG DEACTIVATES; IT DOES NOT DELETE ────────────────
    test("a held role cannot be deleted through the product, and deactivating it is the path offered", async ({ page }) => {
        /*
         * `user_roles` carries ON DELETE RESTRICT, and the live suite proves the database refuses to
         * drop a role someone still holds. What the MOUNTED product adds is that there is no delete
         * to refuse: the roles API exposes no DELETE at all, and a role is retired by being
         * deactivated. That is a stronger position than a guarded delete — the destructive operation
         * does not exist — and it is worth stating, because an earlier draft of this test asserted a
         * refusal and would have accepted a 405 as proof of a guard it never exercised.
         */
        await openTarget(page);
        await page.getByTestId("access-user-role-select").selectOption(roleBKey);
        await Promise.all([
            page.waitForResponse((r) => /\/api\/admin\/users\/.+\/roles$/.test(r.url()) && r.request().method() === "POST"),
            page.getByTestId("access-user-role-save").click(),
        ]);
        await expect(page.getByTestId(`access-user-role-held-${roleBKey}`)).toBeVisible();

        const attempted = await page.request.delete(`/api/admin/rbac/roles/${encodeURIComponent(roleBKey)}`);
        expect(attempted.status(), "the product offers no role deletion").toBe(405);

        await openTarget(page);
        expect(await heldRoleKeys(page), "the assignment is untouched").toEqual([ROLE_A, roleBKey].sort());
    });

    // ── PUT EVERYTHING BACK ─────────────────────────────────────────────
    test("puts the subject and the role catalog back", async ({ page }) => {
        const unassigned = await page.request.delete(`/api/admin/users/${TARGET_ID}/roles/${encodeURIComponent(roleBKey)}`);
        expect(unassigned.status(), await unassigned.text()).toBeLessThan(400);

        // Deactivated rather than deleted, because that is the only retirement the product has.
        const retired = await page.request.patch(`/api/admin/rbac/roles/${encodeURIComponent(roleBKey)}`, {
            data: { is_active: false },
        });
        expect(retired.status(), await retired.text()).toBeLessThan(400);

        await openTarget(page);
        expect(await heldRoleKeys(page)).toEqual([ROLE_A]);
    });
});
