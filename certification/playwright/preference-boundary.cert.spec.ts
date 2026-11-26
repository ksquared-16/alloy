/**
 * WS8 — the operator preference boundary, certified in the browser.
 *
 * The defect this closes was a control labelled "Email messages" that edited
 * `email_transactional` — a category the eligibility evaluator exempts from opt-out. An
 * operator could switch it off, watch it save, and the platform would keep sending. The
 * control was not broken; it was untruthful.
 *
 * So the acceptance here is not "the switches work". It is:
 *
 *   · every category the operator can see is one the platform will actually honour;
 *   · every category the platform exempts is shown as exempt, with no switch at all;
 *   · the WHY an operator reads is derived from the evaluator, not restated from a row —
 *     which is the only way it stays true if the eligibility rules change.
 *
 * Nothing is sent. The panel is read, and one preference is written through the operator's
 * own affordance, in the seeded certification tenant.
 */

import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";

function sql(statement: string): string {
    return execFileSync(
        "docker",
        ["exec", "supabase_db_alloy-cert", "psql", "-U", "postgres", "-d", "postgres", "-tAc", statement],
        { encoding: "utf8" },
    ).trim();
}

const touched = new Set<string>();

function seedPreference(personId: string, category: string, state: string): string {
    const orgId = sql(`select org_id from persons where id='${personId}'`);
    expect(orgId, "the recipient on screen must be a real Person in the cert tenant").not.toBe("");
    touched.add(`${orgId}|${personId}`);
    sql(
        `insert into communication_preferences (org_id, person_id, category, state, source, method)
         values ('${orgId}','${personId}','${category}','${state}','operator','cert')
         on conflict (org_id, person_id, category) do update set state=excluded.state`,
    );
    return orgId;
}

const stateOf = (orgId: string, personId: string, category: string) =>
    sql(
        `select coalesce(state,'') from communication_preferences
         where org_id='${orgId}' and person_id='${personId}' and category='${category}'`,
    );

/** Walk the operator's own path to a recipient affordance. Returns the Person on screen. */
async function openRecipientPreferences(page: Page): Promise<string> {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    await page
        .locator("[data-adminv2-inbox-unread-badge]")
        .first()
        .evaluate((el) => (el.closest("button") ?? (el as HTMLElement)).click());
    await page.waitForSelector("[data-cc-conversation]", { timeout: 30_000 });

    await page.locator("[data-cc-conversation]").first().evaluate((el) => (el as HTMLElement).click());
    await page.waitForSelector("[data-cc-reply-expand]", { timeout: 30_000 });

    // The preference affordance is attached to the recipients of a reply, which is the
    // moment it matters: the operator is about to write to these named people.
    await page.locator("[data-cc-reply-expand]").first().evaluate((el) => (el as HTMLElement).click());
    await page.waitForSelector("[data-cc-recipient-preference-trigger]", { timeout: 30_000 });

    const personId = await page
        .locator("[data-cc-recipient-preference-trigger]")
        .first()
        .getAttribute("data-cc-recipient-preference-trigger");
    expect(personId, "the affordance must name the Person it speaks for").toBeTruthy();
    return String(personId);
}

async function openPanel(page: Page, personId: string): Promise<void> {
    await page
        .locator(`[data-cc-recipient-preference-trigger="${personId}"]`)
        .first()
        .evaluate((el) => (el as HTMLElement).click());
    await page.waitForSelector(`[data-cc-recipient-preference-panel="${personId}"]`, { timeout: 15_000 });
}

test.describe("the operator preference boundary", () => {
    test.afterAll(() => {
        for (const pair of touched) {
            const [orgId, personId] = pair.split("|");
            sql(`delete from communication_preference_events where org_id='${orgId}' and person_id='${personId}'`);
            sql(`delete from communication_preferences where org_id='${orgId}' and person_id='${personId}'`);
        }
    });

    test("the panel speaks for ONE named Person, and states both channels", async ({ page }) => {
        const personId = await openRecipientPreferences(page);
        await openPanel(page, personId);

        const panel = page.locator(`[data-cc-recipient-preference-panel="${personId}"]`);
        await expect(panel).toBeVisible();
        // Both channels, always. A panel that reports only the blocked one leaves the
        // operator guessing about the other.
        await expect(panel.locator(`[data-cc-preference-reason="${personId}:email"]`)).toBeVisible();
        await expect(panel.locator(`[data-cc-preference-reason="${personId}:sms"]`)).toBeVisible();
    });

    test("EXEMPT categories are shown as exempt — no switch is offered for them", async ({ page }) => {
        const personId = await openRecipientPreferences(page);
        await openPanel(page, personId);
        const panel = page.locator(`[data-cc-recipient-preference-panel="${personId}"]`);

        // This is the original defect, inverted into an assertion. Essential mail is
        // opt-out exempt in the evaluator, so the only honest control is no control.
        await expect(panel.locator(`[data-cc-preference-always-allowed="${personId}:email_transactional"]`)).toHaveText(
            /always allowed/i,
        );
        await expect(panel.locator(`[data-cc-preference-always-allowed="${personId}:sms_transactional"]`)).toHaveText(
            /always allowed/i,
        );
        // …and no toggle exists for them anywhere in the panel.
        await expect(panel.locator(`[data-cc-preference-toggle="${personId}:email_transactional"]`)).toHaveCount(0);
        await expect(panel.locator(`[data-cc-preference-toggle="${personId}:sms_transactional"]`)).toHaveCount(0);
    });

    test("the three Email categories are all named, so 'email' is never one undifferentiated thing", async ({ page }) => {
        const personId = await openRecipientPreferences(page);
        await openPanel(page, personId);
        const panel = page.locator(`[data-cc-recipient-preference-panel="${personId}"]`);

        await expect(panel).toContainText("Essential email");
        await expect(panel).toContainText("Routine email");
        await expect(panel).toContainText(/marketing/i);
    });

    test("A BLOCK the platform will honour is reported, with the reason the evaluator gives", async ({ page }) => {
        // Learn who is on screen, then make that Person genuinely opted out of routine
        // email and come back. Seeding first would mean guessing the recipient.
        const personId = await openRecipientPreferences(page);
        const orgId = seedPreference(personId, "email_operational", "opted_out");

        await openRecipientPreferences(page);
        await openPanel(page, personId);
        const panel = page.locator(`[data-cc-recipient-preference-panel="${personId}"]`);

        // The consequence, in the operator's terms — and crucially, what STILL sends.
        await expect(panel.locator(`[data-cc-preference-reason="${personId}:email"]`)).toHaveText(
            /routine email is opted out\. only essential email will send\./i,
        );
        // Visible before the click, too: an operator who cannot see the block writes a
        // message that never arrives.
        await expect(page.locator(`[data-cc-recipient-preference-trigger="${personId}"]`)).toContainText(/1 blocked/i);

        expect(stateOf(orgId, personId, "email_operational")).toBe("opted_out");
    });

    test("MARKETING needing an opt-in is stated WITHOUT calling the channel blocked", async ({ page }) => {
        const personId = await openRecipientPreferences(page);
        const orgId = seedPreference(personId, "email_operational", "opted_in");
        seedPreference(personId, "email_marketing", "unset");

        await openRecipientPreferences(page);
        await openPanel(page, personId);
        const panel = page.locator(`[data-cc-recipient-preference-panel="${personId}"]`);

        await expect(panel.locator(`[data-cc-preference-reason="${personId}:email"]`)).toHaveText(
            /marketing email requires opt-in\. essential and routine email will send\./i,
        );
        // The badge stays dark: marketing-needs-opt-in is the resting state of nearly every
        // recipient, and a permanently lit badge is a badge nobody reads.
        await expect(page.locator(`[data-cc-recipient-preference-trigger="${personId}"]`)).not.toContainText(/blocked/i);

        expect(stateOf(orgId, personId, "email_operational")).toBe("opted_in");
    });

    test("an operator's change reaches the canonical store, and the stated reason follows it", async ({ page }) => {
        const personId = await openRecipientPreferences(page);
        const orgId = seedPreference(personId, "email_operational", "opted_in");

        await openRecipientPreferences(page);
        await openPanel(page, personId);

        const toggle = page.locator(`[data-cc-preference-toggle="${personId}:email_operational"]`).first();
        await expect(toggle, "a category the platform honours must be editable here").toHaveText(/allowed/i);
        await toggle.evaluate((el) => (el as HTMLElement).click());

        // The write is the proof, not the button's own label.
        await expect
            .poll(() => stateOf(orgId, personId, "email_operational"), { timeout: 20_000 })
            .toBe("opted_out");

        // …and the reason the operator reads changes with it, in the same panel.
        await expect(
            page.locator(`[data-cc-preference-reason="${personId}:email"]`).first(),
        ).toHaveText(/routine email is opted out\. only essential email will send\./i, { timeout: 20_000 });
    });
});
