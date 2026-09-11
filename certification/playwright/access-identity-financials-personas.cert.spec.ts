/**
 * ACCESS & IDENTITY V2 — the mounted personas, on the promoted tree.
 *
 * The slice began with an operator who was an administrator and could not open Financials. Every
 * other proof this initiative produced runs below the product: resolvers, registered actions, route
 * handlers, Postgres. This file is the one that asks the operator's own question — *can I sign in
 * and do my job* — through a production build, a real login, and a real browser.
 *
 * ── WHY EACH PERSONA SIGNS IN FOR ITSELF ──
 *
 * The shared `auth.setup.ts` session belongs to the seeded administrator. Reusing it for a director
 * would prove nothing about a director: the whole claim is that WHO YOU ARE changes what the product
 * gives you, so each context authenticates as its own principal through `/login`.
 *
 * ── WHAT IS WRITTEN, AND WHAT IS PUT BACK ──
 *
 * The certification stack is shared. The writes here are bounded to this file's own probe personas
 * and one charge that is corrected again in the same test, so the tenant is left at the balance it
 * started with. Nothing touches another worktree's fixtures.
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";

const PASSWORD = "alloy-local-cert";

const PERSONA = {
    admin: "qa.operator@northwind.invalid",
    director: "cert.director@northwind.invalid",
    regional: "cert.regional@northwind.invalid",
    ops: "cert.ops@northwind.invalid",
    viewer: "cert.finviewer@northwind.invalid",
    noaccess: "cert.frontdesk@northwind.invalid",
} as const;

/** The refusal the slice exists to remove. Asserted by absence, never by a screenshot's goodwill. */
const DENIAL = "You don't have access to view financial information";

type SignIn = { page: Page; context: BrowserContext; landedOnWorkspace: boolean };

/**
 * Sign a persona in through the product's own login form.
 *
 * Returns whether the shell admitted them rather than asserting it, because admission is exactly
 * what is in question for a custom role: `W-13` keeps portal admission a role literal, so a
 * capability-bearing custom role can be refused here. A helper that asserted admission would make
 * that finding unreportable.
 */
async function signIn(browser: import("@playwright/test").Browser, email: string): Promise<SignIn> {
    const context = await browser.newContext({ storageState: undefined });
    const page = await context.newPage();
    await page.goto("/login");
    await page.locator('input[type="email"]').first().fill(email);
    const pw = page.locator('input[type="password"]').first();
    await pw.fill(PASSWORD);
    await pw.press("Enter");
    let landedOnWorkspace = true;
    try {
        await page.waitForURL("**/workspace**", { timeout: 60_000 });
    } catch {
        landedOnWorkspace = false;
    }
    await page.waitForLoadState("domcontentloaded");
    return { page, context, landedOnWorkspace };
}

const NAV = '[data-adminv2-sidebar-modal-nav="financials"]';
const WORKSPACE = "[data-adminv2-financials-workspace]";

/** Open Financials from the navigation the operator actually uses. */
async function openFinancials(page: Page): Promise<void> {
    await page.locator(NAV).first().click();
    await expect(page.locator(WORKSPACE).first()).toBeVisible({ timeout: 60_000 });
}

test.describe("mounted personas on the promoted tree", () => {
    test("Organization Administrator signs in, reaches Financials, and sees money", async ({ browser }) => {
        const { page, context, landedOnWorkspace } = await signIn(browser, PERSONA.admin);
        expect(landedOnWorkspace, "the administrator is admitted to the shell").toBe(true);

        // The nav answers to effective access, so its presence is itself a capability statement.
        await expect(page.locator(NAV).first(), "Financials is offered to the administrator").toBeVisible({
            timeout: 30_000,
        });
        await openFinancials(page);

        const body = (await page.locator("body").innerText()).slice(0, 20_000);
        expect(body, "the refusal this slice exists to remove must not appear").not.toContain(DENIAL);

        // POPULATED, not merely rendered. An empty workspace is the same defect without the sentence.
        await expect(page.locator(WORKSPACE).first()).toContainText(/\$|\d/, { timeout: 60_000 });

        await page.screenshot({ path: "certification/evidence/access-admin-financials.png", fullPage: false });
        await context.close();
    });

    /*
     * ── THE MUTATION, THROUGH THE MOUNTED PRODUCT ──
     *
     * The registered action is invoked over `/api/admin/actions/execute` carrying the operator's own
     * signed-in session — the same route the Financials surface posts to, with the same cookie the
     * browser holds. That is what makes this a mounted proof rather than a service-level one: the
     * production server resolves the session, the route resolves the org and the actor, and the
     * action's own `fin.write` gate decides. Nothing here supplies a key or a role.
     *
     * It bills a real family and then corrects the charge in the same test, so the tenant is left at
     * the balance it started with — `charge.add` is idempotent by resolution key, so a re-run
     * returns the same charge rather than billing twice, and the correction is what moves
     * deterministically.
     */
    test("Add Charge executes for the administrator and persists", async ({ browser }) => {
        const { page, context, landedOnWorkspace } = await signIn(browser, PERSONA.admin);
        expect(landedOnWorkspace).toBe(true);
        await openFinancials(page);

        const today = new Date().toISOString().slice(0, 10);
        /** The subject the Financials surface itself sends: a child with an active agreement. */
        const SUBJECT = "00000000-0000-4000-8000-00005000006b";
        const run = async (actionKey: string, payload: Record<string, unknown>) =>
            page.evaluate(
                async ([key, subject, body]) => {
                    const res = await fetch("/api/admin/actions/execute", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            action_key: key,
                            entity_type: "opportunity_customer_member",
                            entity_id: subject,
                            payload: body,
                        }),
                    });
                    return { status: res.status, json: await res.json().catch(() => null) };
                },
                [actionKey, SUBJECT, payload] as const,
            );

        const added = await run("charge.add", {
            template_id: "00000000-0000-4000-8000-0000000f0001",
            customer_id: "00000000-0000-4000-8000-000050000001",
            today,
        });
        console.log(`[add-charge] status=${added.status} body=${JSON.stringify(added.json).slice(0, 400)}`);
        expect(added.status, "authority does not stop the administrator").not.toBe(403);
        expect(added.status).toBeLessThan(400);

        // The execute envelope answers `data.affected_id`; the action's own result object is nested
        // inside it. Reading the wrong one is how a green mutation reads as a failed test.
        const chargeId =
            added.json?.data?.affected_id
            ?? added.json?.data?.result?.affectedId
            ?? added.json?.result?.affectedId
            ?? null;
        expect(chargeId, "the action names the row it wrote").toBeTruthy();

        const posted = await run("charge.post", { charge_id: chargeId });
        console.log(`[add-charge] post status=${posted.status}`);
        expect(posted.status).toBeLessThan(400);

        /*
         * `charge.add` is IDEMPOTENT on `(template, service date, subject)`, and on a second run in
         * the same calendar day it answers `write_status: "skipped_posted"` with the id of the
         * charge the FIRST run already posted and reversed. Reversing that one is correctly refused
         * with 409 — an already-corrected charge is not correctable twice.
         *
         * So the reversal claim is asserted only when this run actually wrote the row. It was not,
         * and the spec read the product's correct refusal as a failure: a test that cannot run twice
         * in a day reports the calendar as a regression. The AUTHORITY claim — that nothing in the
         * capability stack stops the administrator — is asserted above on every path, because that
         * is what this file is about.
         */
        const writeStatus = added.json?.data?.execution_result?.write_status ?? null;
        if (writeStatus === "skipped_posted") {
            console.log("[add-charge] reversal skipped: this charge was written and corrected by an earlier run today");
        } else {
            // Put the tenant back through the product's own correction path.
            const reversed = await run("charge.reverse", { charge_id: chargeId });
            console.log(`[add-charge] reverse status=${reversed.status}`);
            expect(reversed.status, "the administrator may also correct posted money").toBeLessThan(400);
        }

        await page.screenshot({ path: "certification/evidence/access-admin-add-charge.png" });
        await context.close();
    });

    /*
     * ── W-13 IS WHAT STOPS THE OTHER PERSONAS, AND IT IS MEASURED HERE ──
     *
     * `school_director`, `regional_lead` and any custom role hold real capabilities —
     * 28 live assertions against Postgres prove `fin.read` resolves for them and that every
     * financial mutation refuses them server-side. What they cannot do is GET IN: portal admission
     * is still a role literal over `{admin, ops}`, so the shell refuses them and the middleware
     * returns them to `/login`.
     *
     * This is the known, documented debt, not a defect of this slice, and the instruction is
     * explicit that it must not be bypassed by swapping in a system role and calling it a
     * custom-role proof. So the test asserts the refusal, which is what the product actually does
     * today, and the handoff reports the capability half as proven below the product rather than
     * claiming a mounted proof that does not exist.
     */
    for (const [label, email] of [
        ["School Director", PERSONA.director],
        ["Regional Lead", PERSONA.regional],
        ["custom Financials viewer", PERSONA.viewer],
        ["custom no-Financials role", PERSONA.noaccess],
    ] as const) {
        test(`${label} is refused the shell by W-13, holding capabilities it cannot reach`, async ({ browser }) => {
            const { page, context } = await signIn(browser, email);
            await page.goto("/workspace");
            await page.waitForLoadState("domcontentloaded");
            const url = page.url();
            console.log(`[W-13] ${label} (${email}) -> ${url}`);
            expect(url, "a non-portal role is returned to login rather than admitted").toMatch(
                /login|unauthorized/,
            );
            expect(await page.locator(NAV).count(), "and is offered no Financials navigation").toBe(0);
            await context.close();
        });
    }

    /*
     * THE ROLE EDITOR, AS A PRODUCT. The claim is that an administrator can configure Financials
     * from the product — so this reaches it the way an operator does and reads what they read.
     */
    test("the administrator reaches the role editor and sees Financials as a capability group", async ({ browser }) => {
        const { page, context, landedOnWorkspace } = await signIn(browser, PERSONA.admin);
        expect(landedOnWorkspace).toBe(true);
        await page.goto("/organization/access?section=roles");
        await page.waitForLoadState("domcontentloaded");
        // The roles list loads from /api/admin/rbac/roles after hydration; wait for the data, not
        // the document, or the assertion reads an empty shell and blames the product for it.
        await expect(page.getByText("School director", { exact: false }).first()).toBeVisible({ timeout: 60_000 });
        const list = (await page.locator("body").innerText()).slice(0, 40_000);
        expect(list, "the roles chapter is reachable").toMatch(/Permission sets that define what operators may do/i);
        expect(list, "roles are listed in the operator's words").toMatch(/School director/i);

        /*
         * A ROLE IS CHOSEN BEFORE ITS CAPABILITIES ARE SHOWN, which is the product being a product:
         * the landing state says "Choose a role to see what it can do". The first version of this
         * test looked for the Financials group on the list page and failed for that reason — the
         * product was right and the test was reading the wrong screen.
         */
        await page.getByText("School director", { exact: false }).first().click();
        await page.waitForTimeout(3_000);
        const role = (await page.locator("body").innerText()).slice(0, 40_000);
        expect(role, "Financials is an operator-facing capability group").toMatch(/Financials/i);
        expect(role, "and its levels are words, not permission keys").toMatch(/View|Manage|No access/);
        await page.screenshot({ path: "certification/evidence/access-role-editor.png", fullPage: true });
        await context.close();
    });
});
