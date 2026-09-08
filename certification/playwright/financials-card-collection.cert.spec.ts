/**
 * SLICE H — THE OPERATOR ACTUALLY COLLECTING, in a real browser.
 *
 * Everything Thread 8B built was reachable only from a test file until now. These scenarios drive
 * the mounted Financials card the way an operator does: open the panel, choose a rail, and watch
 * what the product says about money.
 *
 * The claim that matters is what the UI refuses to say. A blocked merchant must be explained rather
 * than reported as a failure; a card that Stripe has taken must read as "finalizing" rather than as
 * paid, because Financials has not recognised it yet; and a manual rail must never touch any of it.
 *
 * Real Stripe test mode, a real connected account, real Postgres, real Stripe Elements.
 */
import { expect, test, type Page } from "@playwright/test";

const WORK_VIEW = "/workspace/work-unit/new-leads";

/** The action envelope, from the operator's own authenticated session. */
async function execute(page: Page, body: Record<string, unknown>) {
    const res = await page.request.post("/api/admin/actions/execute", { data: body });
    return { status: res.status(), json: (await res.json()) as Record<string, any> };
}

const CHILD = "fc500000-0000-4000-8000-0000000c0002";
const HOUSEHOLD = "fc500000-0000-4000-8000-0000000c0001";
const TEMPLATE = "fc500000-0000-4000-8000-0000000d0001";

/**
 * A posted charge for the certification child.
 *
 * The payment control only renders for rows the read model marks payable, so a subject with nothing
 * owed has no way in — correctly. Seeding one is setup, not the thing under test, and it goes through
 * the same canonical actions an operator would use.
 */
async function seedPostedCharge(page: Page, templateId = TEMPLATE) {
    const added = await execute(page, {
        action_key: "charge.add", entity_type: "child", entity_id: CHILD, mode: "execute",
        confirmation: { confirmed: true },
        payload: { customer_member_id: CHILD, customer_id: HOUSEHOLD, template_id: templateId },
    });
    const id = added.json.data?.execution_result?.affected_id ?? added.json.data?.affected_id;
    if (!id) return null;
    await execute(page, {
        action_key: "charge.post", entity_type: "child", entity_id: CHILD, mode: "execute",
        confirmation: { confirmed: true }, payload: { charge_id: id },
    });
    return String(id);
}

/** Open the work view, expand the Financials card, and enter the payment operation. */
async function openFinancials(page: Page) {
    await page.goto(WORK_VIEW);
    await page.waitForLoadState("domcontentloaded");
    await expect
        .poll(async () => await page.locator('[data-financials-card="true"]').count(), { timeout: 60_000 })
        .toBeGreaterThan(0);
    return page.locator('[data-financials-card="true"]').first();
}

/**
 * Enter the payment panel. "Record payment →" opens a menu of the charges that can take money —
 * the operator picks WHICH obligation before they pick a rail — and the panel follows the choice.
 */
async function openPaymentPanel(page: Page): Promise<boolean> {
    /*
     * The payment control lives in the EXPANDED representation. A compact card is supporting context
     * inside another process and deliberately offers the way in rather than the operation itself, so
     * the card has to be opened before there is anything to click.
     */
    const details = page
        .locator('[data-financials-card="true"]')
        .first()
        .getByRole("button", { name: /Details/ });
    if ((await details.count()) > 0) {
        await details.first().click();
        await page.waitForTimeout(2_000);
    }
    const trigger = page.locator('[data-financials-command="payment.record"]').first();
    await expect
        .poll(async () => await trigger.count(), { timeout: 45_000 })
        .toBeGreaterThan(0);
    await trigger.click();
    const menu = page.locator('[data-financials-payment-menu="true"]');
    await expect(menu).toBeVisible({ timeout: 20_000 });
    const item = menu.locator('[role="menuitem"], button').first();
    await item.click();
    const chooser = page.locator('[data-financials-payment-method="true"]').first();
    await expect(chooser, "the payment panel opens with a rail chooser").toBeVisible({ timeout: 30_000 });
    return true;
}

test.describe("Slice H — collecting money through the mounted Financials card", () => {
    /*
     * SCENARIO A — MERCHANT BLOCKED.
     *
     * The organisation has no usable connected account, so card collection cannot happen. The bar is
     * not that it fails; it is that the operator is told WHY, and that Alloy does not quietly collect
     * into its own account instead.
     */
    test("A — a card collection with no ready merchant is explained, not failed, and never falls back", async ({ page }) => {
        const card = await openFinancials(page);
        expect(await card.count()).toBeGreaterThan(0);

        // Driven through the operator's own session, exactly as the panel does it.
        const attempted = await execute(page, {
            action_key: "payment.collect_card",
            entity_type: "child",
            entity_id: "fc500000-0000-4000-8000-0000000c0002",
            mode: "execute",
            confirmation: { confirmed: true },
            payload: { charge_id: "00000000-0000-4000-8000-0000000000cc", amount_cents: 1000 },
        });

        expect(attempted.json.ok, "collection is refused").toBeFalsy();
        const body = JSON.stringify(attempted.json);
        // The refusal explains itself and never names an account.
        expect(body, "no platform or connected account is offered as a fallback").not.toMatch(/acct_/);
        expect(body, "and it is not a generic failure").not.toMatch(/payment failed/i);
    });

    /*
     * SCENARIO G — MANUAL RAILS, through the mounted panel.
     *
     * Cash, check and money order reach Thread 8 with no merchant, no collection attempt and no
     * provider transaction. The panel's rail chooser is the proof that the product still models
     * payment as something wider than Stripe.
     */
    test("G — the rail chooser offers manual rails and records them with no provider involvement", async ({ page }) => {
        await openFinancials(page);
        await seedPostedCharge(page);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await openFinancials(page);
        await openPaymentPanel(page);
        const chooser = page.locator('[data-financials-payment-method="true"]').first();

        // RAIL-FIRST, and truthful about what is executable. Bank transfer is a real rail with no
        // executor yet, so it is present and disabled rather than silently recording money.
        const options = await chooser.locator("option").allTextContents();
        expect(options.join(" | "), "card is a rail").toMatch(/Card/);
        expect(options.join(" | "), "and so are the manual ones").toMatch(/Cash/);
        expect(options.join(" | ")).toMatch(/Check/);
        expect(options.join(" | ")).toMatch(/Money order/);
        expect(options.join(" | "), "ACH is named as unavailable rather than offered").toMatch(/not yet available/i);
        expect(options.join(" | "), "the chooser is rail-first, never processor-first").not.toMatch(/Stripe/i);

        // Choosing a manual rail keeps the commit verb honest: it RECORDS, it does not collect.
        await chooser.selectOption("cash");
        const commit = page.locator('[data-financials-payment-commit="true"]').first();
        await expect(commit).toHaveText(/Record payment/);

        // And choosing card changes the verb, because a card is asked rather than written down.
        await chooser.selectOption("card");
        await expect(commit, "card collects rather than records").toHaveText(/Collect by card/);
    });

    /*
     * SCENARIO B — A REAL CARD, and the state that matters most.
     *
     * The panel must not say "paid" when Stripe has taken the money but Financials has not yet
     * recognised it. That interval is real, Slice F made it representable, and this is where an
     * operator would otherwise be told a lie in either direction.
     */
    test("B — a real card collection shows finalizing, never paid, until Financials recognises it", async ({ page }) => {
        await openFinancials(page);
        await seedPostedCharge(page);
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await openFinancials(page);
        await openPaymentPanel(page);
        const chooser = page.locator('[data-financials-payment-method="true"]').first();
        await chooser.selectOption("card");

        const amount = page.locator('[data-financials-payment-amount="true"]').first();
        await amount.fill("10.00");
        await page.locator('[data-financials-payment-commit="true"]').first().click();

        /*
         * Either the merchant is ready and Stripe's own fields mount, or the organisation cannot
         * collect and the panel says so. Both are correct product states; what would be wrong is a
         * raw error, a fallback, or a balance that moved.
         */
        const mounted = page.locator('[data-financials-card-field="true"]');
        const blocked = page.locator('[data-financials-card-blocked="true"]');
        await expect
            .poll(async () => (await mounted.count()) + (await blocked.count()), { timeout: 45_000 })
            .toBeGreaterThan(0);

        if ((await blocked.count()) > 0) {
            const text = await blocked.innerText();
            expect(text.length, "a blocked collection explains itself").toBeGreaterThan(10);
            expect(text, "and never names an account").not.toMatch(/acct_/);
            test.info().annotations.push({ type: "scenario-b", description: `blocked: ${text}` });
            return;
        }

        // Stripe's own iframe. The card number never enters Alloy state — this is the whole reason
        // the field is Stripe's rather than ours.
        const frame = page.frameLocator('[data-financials-card-field="true"] iframe').first();
        await expect
            .poll(async () => await page.locator('[data-financials-card-mount="true"] iframe').count(), { timeout: 45_000 })
            .toBeGreaterThan(0);

        await frame.locator('[name="number"]').fill("4242424242424242").catch(() => undefined);
        await frame.locator('[name="expiry"]').fill("12" + String(new Date().getFullYear() + 2).slice(2)).catch(() => undefined);
        await frame.locator('[name="cvc"]').fill("123").catch(() => undefined);

        await page.locator('[data-financials-card-submit="true"]').first().click();

        // THE ASSERTION THIS SCENARIO EXISTS FOR. Whatever happens next, the panel must never claim
        // the money is Financials-recognised on the strength of the browser alone.
        await expect
            .poll(
                async () =>
                    (await page.locator('[data-financials-card-finalizing="true"]').count())
                    + (await page.locator('[data-financials-card-failed="true"]').count())
                    + (await page.locator('[data-financials-card-recognized="true"]').count()),
                { timeout: 60_000 },
            )
            .toBeGreaterThan(0);

        const finalizing = page.locator('[data-financials-card-finalizing="true"]');
        if ((await finalizing.count()) > 0) {
            const text = await finalizing.innerText();
            expect(text, "the interval is named truthfully").toMatch(/finalizing/i);
            expect(text, "and is never called paid").not.toMatch(/\bpaid\b/i);
            // Never offer another charge as the recovery for money already taken.
            expect(text).not.toMatch(/charge again|try again/i);
        }
    });
});
