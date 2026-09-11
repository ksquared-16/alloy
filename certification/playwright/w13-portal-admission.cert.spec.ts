/**
 * W-13 — PORTAL ADMISSION, MOUNTED.
 *
 * Every other proof of this repair runs below the product: a resolver, a grant table, a scan over
 * the tree. This file asks the operator's question through a production build, the product's own
 * login form, and a real browser: *who gets in, who does not, and does changing a grant change it.*
 *
 * ── WHY ADMISSION IS OBSERVED RATHER THAN ASSERTED BY THE HELPER ──
 *
 * `signIn` returns whether the shell admitted the principal instead of asserting it, because
 * admission is exactly what is under test and four of these personas are SUPPOSED to be refused. A
 * helper that asserted admission would make the refusals unreportable — and two of them
 * (`school_director`, `regional_lead`) are findings this run has to carry to the operator, not
 * failures.
 *
 * ── WHAT IS WRITTEN, AND WHAT IS PUT BACK ──
 *
 * The grant and revoke tests mutate ONE custom role this file's own fixture created
 * (`mcert_front_desk`), through the product's own role-editor endpoint, and put it back in the same
 * test. Nothing touches a seeded fixture or another worktree's data. Personas come from
 * `fixtures/access-personas.mjs`; run `node ../certification/playwright/fixtures/access-personas.mjs setup`
 * from `web/` first, and `… teardown` when finished.
 */
import { test, expect, type Page, type BrowserContext, type Browser } from "@playwright/test";

const PASSWORD = "alloy-local-cert";

const PERSONA = {
    /** Holds `portal.access` through the seeded `admin` package. */
    admin: "qa.operator@northwind.invalid",
    /** Holds it through the seeded `ops` package. */
    ops: "cert.ops@northwind.invalid",
    /** System roles that do NOT hold it — the D2 package gap, not a defect in this repair. */
    director: "cert.director@northwind.invalid",
    regional: "cert.regional@northwind.invalid",
    /** Custom role: `portal.access` + `fin.read`. Could not exist under the role literal. */
    portalFin: "cert.portalfin@northwind.invalid",
    /** Custom role: `portal.access` and nothing else. */
    portalOnly: "cert.portalonly@northwind.invalid",
    /** Custom role: `fin.read` and NO `portal.access`. A surface capability must not open the door. */
    finViewer: "cert.finviewer@northwind.invalid",
    /** Custom role: neither. */
    noAccess: "cert.frontdesk@northwind.invalid",
} as const;

const NAV = '[data-adminv2-sidebar-modal-nav="financials"]';
const WORKSPACE = "[data-adminv2-financials-workspace]";

type SignIn = { page: Page; context: BrowserContext; admitted: boolean; url: string };

async function signIn(browser: Browser, email: string): Promise<SignIn> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");

    /*
     * AUTHENTICATION SUCCEEDS FOR EVERY PERSONA HERE. Admission is the variable, and the two are
     * different events — so admission is established by a FULL DOCUMENT REQUEST to the shell, not by
     * watching the URL after the login form's client-side push.
     *
     * Reading the URL was tried and is not sound. A refused principal signs in, the login page
     * pushes to /workspace, and the shell answers that navigation with a redirect back to /login,
     * whereupon the login page — holding a valid session — pushes again. Sampling that loop returns
     * whichever side the sample lands on: in one run `cert.frontdesk` sampled /login and
     * `cert.finviewer`, whose grants are just as portal-less, sampled /workspace. Same refusal, two
     * answers, and the wrong one reads as W-13 letting a principal in that it must not.
     *
     * `page.goto` is not part of that loop. The server either renders the shell or answers 307 to
     * /login, and where the browser lands is the server's answer rather than a race between two
     * clients.
     */
    await page.waitForTimeout(2_000); // let the login form commit the session cookies
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    const url = page.url();
    return { page, context, admitted: url.includes("/workspace"), url };
}

/** The role-editor endpoint the Access page itself submits to — not a direct table write. */
async function setRoleCapabilities(page: Page, roleKey: string, keys: string[]) {
    return page.evaluate(
        async ([rk, permissionKeys]) => {
            const res = await fetch(`/api/admin/rbac/roles/${rk}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ permission_keys: permissionKeys }),
            });
            return { status: res.status, body: await res.text() };
        },
        [roleKey, keys] as const,
    );
}

test.describe("W-13 — who the portal admits", () => {
    test("the administrator still enters, and Financials still works", async ({ browser }) => {
        const { page, context, admitted } = await signIn(browser, PERSONA.admin);
        expect(admitted, "the administrator is admitted through portal.access").toBe(true);
        await expect(page.locator(NAV).first()).toBeVisible({ timeout: 60_000 });
        await page.locator(NAV).first().click();
        await expect(page.locator(WORKSPACE).first()).toBeVisible({ timeout: 60_000 });
        await context.close();
    });

    test("ops still enters", async ({ browser }) => {
        // Preservation, not a new grant: `ops` held admission through the role literal and holds it
        // through the seeded package now. A regression here is a lockout, which is why the migration
        // that seeds the key is ordered before the code that stops honouring the name.
        const { page, context, admitted } = await signIn(browser, PERSONA.ops);
        expect(admitted, "ops is admitted through portal.access").toBe(true);
        await context.close();
    });

    test("a custom role holding portal.access + fin.read enters AND reads the money", async ({ browser }) => {
        /*
         * THE DEFINITIVE W-13 REGRESSION. Under `PORTAL_ROLES = {admin, ops}` this principal was
         * redirected to /login however many capabilities the organization had granted it. There was
         * no configuration an administrator could perform that would let it in.
         */
        const { page, context, admitted } = await signIn(browser, PERSONA.portalFin);
        expect(admitted, "a custom role holding portal.access is admitted").toBe(true);
        await expect(page.locator(NAV).first(), "Financials is offered to fin.read").toBeVisible({ timeout: 60_000 });
        await page.locator(NAV).first().click();
        await expect(page.locator(WORKSPACE).first()).toBeVisible({ timeout: 60_000 });
        await expect(page.locator("body")).not.toContainText("You don't have access to view financial information");
        await context.close();
    });

    test("a custom role holding portal.access ALONE enters and is offered no Financials", async ({ browser }) => {
        // The separation the instruction calls mandatory: admission is not authorization. If this
        // persona saw Financials, `portal.access` would have become a blanket token.
        const { page, context, admitted } = await signIn(browser, PERSONA.portalOnly);
        expect(admitted, "portal.access alone admits").toBe(true);
        await expect(page.locator(NAV).first(), "Financials is NOT offered without fin.read").toHaveCount(0);
        await context.close();
    });

    test("fin.read WITHOUT portal.access does not open the door", async ({ browser }) => {
        // The inverse separation. A surface capability must not imply admission, or every capability
        // becomes an admission capability and the front door stops meaning anything.
        const { page, context, admitted, url } = await signIn(browser, PERSONA.finViewer);
        expect(admitted, `fin.read alone must not admit (landed on ${url})`).toBe(false);
        await context.close();
    });

    test("a principal with neither capability is refused", async ({ browser }) => {
        const { page, context, admitted } = await signIn(browser, PERSONA.noAccess);
        expect(admitted).toBe(false);
        await context.close();
    });

    test("school_director and regional_lead are refused — the package gap, reported not patched", async ({ browser }) => {
        /*
         * NOT A DEFECT IN THIS REPAIR, and the reason it is asserted rather than fixed.
         *
         * Neither role held admission under the role literal, so granting it here would make a
         * preservation migration into a widening one. Whether these two belong in the operator
         * portal is decision `D2` — a default-role package decision the operator owns. W-13 changed
         * HOW admission is decided, not WHICH roles deserve it.
         *
         * This test is what makes the gap visible on every run rather than remembered. When D2 is
         * answered YES, this expectation flips, and that flip is the record of the decision.
         */
        for (const email of [PERSONA.director, PERSONA.regional]) {
            const { context, admitted, url } = await signIn(browser, email);
            expect(admitted, `${email} holds no portal.access (landed on ${url})`).toBe(false);
            await context.close();
        }
    });
});

test.describe("W-13 — admission is configurable from the product", () => {
    test("granting portal.access admits on a cold reload, and revoking it refuses again", async ({ browser }) => {
        /*
         * The whole point of making admission a capability, proved end to end through the product:
         * an administrator changes a grant in the role editor's own endpoint, and the next
         * authoritative admission check for a DIFFERENT principal answers differently.
         *
         * A cold context, not a reload of a warm one — the claim is about the next authoritative
         * check, not about terminating a request already in flight.
         */
        const before = await signIn(browser, PERSONA.noAccess);
        expect(before.admitted, "the front-desk role starts outside the portal").toBe(false);
        await before.context.close();

        const admin = await signIn(browser, PERSONA.admin);
        expect(admin.admitted).toBe(true);

        const granted = await setRoleCapabilities(admin.page, "mcert_front_desk", [
            "crm.customers.read",
            "portal.access",
        ]);
        expect(granted.status, `grant failed: ${granted.body}`).toBe(200);

        const after = await signIn(browser, PERSONA.noAccess);
        expect(after.admitted, "the same principal is admitted once the grant exists").toBe(true);
        // Admission alone. The role still holds no fin.read, so Financials must stay unoffered.
        await expect(after.page.locator(NAV).first()).toHaveCount(0);
        await after.context.close();

        const revoked = await setRoleCapabilities(admin.page, "mcert_front_desk", ["crm.customers.read"]);
        expect(revoked.status, `revoke failed: ${revoked.body}`).toBe(200);

        const afterRevoke = await signIn(browser, PERSONA.noAccess);
        expect(afterRevoke.admitted, "revoking the grant closes the door again").toBe(false);
        await afterRevoke.context.close();

        await admin.context.close();
    });

    test("a principal without Access administration cannot grant itself admission", async ({ browser }) => {
        // Self-escalation, through the same endpoint an administrator just used successfully. The
        // refusal comes from `settings.users_roles`, not from a rule about `portal.access` — which
        // is the correct shape: admission is an ordinary capability row, and writing any grant is an
        // authority this principal does not hold.
        const { page, context, admitted } = await signIn(browser, PERSONA.portalOnly);
        expect(admitted).toBe(true);
        const attempt = await setRoleCapabilities(page, "mcert_portal_only", ["portal.access", "fin.read"]);
        expect([401, 403], `self-escalation returned ${attempt.status}: ${attempt.body}`).toContain(attempt.status);
        await context.close();
    });

    test("the role editor shows Portal as an operator-facing capability", async ({ browser }) => {
        /*
         * `portal.access` must be reachable from the product, not only from SQL. The editor shows an
         * area's capability rows only after a role is selected, so the role is opened first — a
         * previous run of this suite reported a false failure by asserting on the unselected page.
         */
        const { page, context, admitted } = await signIn(browser, PERSONA.admin);
        expect(admitted).toBe(true);
        await page.goto("/organization/access?section=roles", { waitUntil: "domcontentloaded" });
        // `.first()`: the page renders the testid on both the shell and the content region.
        await expect(page.getByTestId("access-roles-page").first()).toBeVisible({ timeout: 60_000 });

        const options = page.locator('[role="option"][data-testid^="access-role-"]');
        await expect(options.first()).toBeVisible({ timeout: 60_000 });
        await options.first().click();
        await expect(page.getByTestId("access-role-selected-workspace").first()).toBeVisible({ timeout: 60_000 });

        const area = page.getByTestId("access-role-area-portal").first();
        await expect(area, "the Portal capability area is not in the role editor").toBeVisible({ timeout: 60_000 });
        // Operator language, not a key. `W-57` is the rule: a role reads as responsibilities.
        await expect(area).toContainText("Portal");
        await expect(area).not.toContainText("portal.access");

        await page.getByTestId("access-role-area-portal-disclose").first().click();
        await expect(page.getByText("Access operator portal", { exact: false }).first()).toBeVisible({
            timeout: 60_000,
        });
        await context.close();
    });
});
