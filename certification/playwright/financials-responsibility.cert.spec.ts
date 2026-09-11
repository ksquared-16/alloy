/**
 * MANAGE RESPONSIBILITY, FROM NOTHING — the round trip that did not exist.
 *
 * ── THE DEFECT UNDER CERTIFICATION ──
 *
 * `billing.configure_responsibility` has been registered, previewed and enforced since Thread 6.
 * No operator could reach it. The panel that offers it read its list of people from
 * `/api/admin/contact-options`, over the `contacts` table — a table holding ZERO rows across the
 * whole tenant — so every household in the product opened the panel, showed no candidates, and said
 * "nobody on this account can be made responsible yet". The capability existed and the workflow did
 * not. Registration is not productization.
 *
 * So the case that matters is CREATION FROM ZERO, on an account with no arrangement: the state
 * every household in a new tenant is in. Editing an arrangement that somebody else seeded would
 * have proved the half that already worked.
 *
 * ── HOW THIS IS READ ──
 *
 * The whole panel's text is captured untruncated and logged. A probe that cuts its own output short
 * reports absence it never observed — that mistake was made once in this thread and produced a
 * defect report about a figure that was on the screen.
 */
import { test, expect, type Locator, type Page } from "@playwright/test";

const HOME = "/workspace";
const OUT = "evidence/screens";

/** The demo fixture's Alvarez household: real money, two adults on the canonical edge, no arrangement. */
const HOUSEHOLD = "Alvarez";
const ADULTS = ["Dana Alvarez", "Rosa Alvarez"] as const;
/** Ana carries the `child` role AND a person identity, so excluding her is a decision, not an accident. */
const CHILD = "Ana Alvarez";

async function openFinancials(page: Page): Promise<Locator> {
    await page.goto(HOME);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
    const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
    await expect(nav, "Financials must appear in the left navigation").toBeVisible({ timeout: 60_000 });
    await nav.click();
    const shell = page.locator('[data-testid="financials-workspace-shell"]');
    await expect(shell, "the canonical workspace shell opens").toBeVisible({ timeout: 60_000 });
    return shell;
}

/**
 * Open the household's own obligation. Named rather than "any charge": the claim is about an
 * account whose people are known, and a charge belonging to some other family cannot carry it.
 */
async function openHouseholdCharge(page: Page, shell: Locator): Promise<Locator> {
    await shell.locator('[data-workspace-section-tab="charges"]').click();
    await page.waitForTimeout(8_000);
    await page.locator('[data-financials-charges-view="posted"]').click();
    await page.waitForTimeout(10_000);

    const row = page.locator("[data-financials-posted-row]").filter({ hasText: HOUSEHOLD }).first();
    await expect(row, `the ${HOUSEHOLD} household has no posted charge to decide responsibility for`).toBeVisible({
        timeout: 60_000,
    });
    await row.click();
    await page.waitForTimeout(10_000);

    const detail = page.locator("[data-financials-charge-detail]");
    await expect(detail, "selecting the charge opens its own detail").toBeVisible({ timeout: 60_000 });
    return detail;
}

async function logPanel(page: Page, label: string) {
    const panel = page.locator('[data-financials-manage-responsibility="open-panel"]');
    const text = await panel.innerText();
    // eslint-disable-next-line no-console
    console.log(`[responsibility:${label}] full panel text:\n${text}`);
    return text;
}

/** Enter a dollar amount against a named person's own input. */
async function assign(page: Page, name: string, dollars: string) {
    const field = page.locator("label", { hasText: name }).locator("input[type=number]").first();
    await expect(field, `${name} is not offered as a responsible party`).toBeVisible({ timeout: 30_000 });
    await field.fill(dollars);
}

test.describe("responsibility can be configured from an account that has none", () => {
    /*
     * ── THE ROUND TRIP ──
     *
     * no arrangement -> panel opens -> the household's real adults are offered -> an amount is
     * entered -> the action's own preview succeeds -> Confirm becomes available -> execute commits
     * -> the surface re-reads it -> a cold reload reproduces it.
     */
    test("an account with no arrangement can be given one, and it survives a reload", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);
        const shell = await openFinancials(page);
        const detail = await openHouseholdCharge(page, shell);

        // 1 · THE STARTING STATE IS STATED, and it is an invitation rather than a refusal.
        const opener = page.locator('[data-financials-manage-responsibility="open"]');
        await expect(opener, "Manage responsibility must be offered on the obligation").toBeVisible({
            timeout: 60_000,
        });
        await expect(
            page.locator('[data-financials-responsibility-empty="true"]'),
            "an account with no arrangement says so",
        ).toBeVisible();

        // 2 · THE PANEL OPENS.
        await opener.click();
        await page.waitForTimeout(6_000);
        await expect(page.locator('[data-financials-manage-responsibility="open-panel"]')).toBeVisible({
            timeout: 30_000,
        });
        const opened = await logPanel(page, "opened");

        // 3 · THE PICKER IS NOT EMPTY — this is the defect, said directly.
        await expect(
            page.locator('[data-financials-responsibility-no-parties="true"]'),
            "the household's adults exist on the canonical edge; an empty picker is the original defect",
        ).toHaveCount(0);
        await expect(
            page.locator('[data-financials-responsibility-error="true"]'),
            "the candidate read failed",
        ).toHaveCount(0);

        // 4 · IT OFFERS THE REAL PEOPLE, INCLUDING THE ONE WHOSE STATUS WAS NEVER SET.
        for (const adult of ADULTS) {
            expect(opened, `${adult} is on this household and must be offered`).toContain(adult);
        }
        // 5 · AND NEVER THE CHILD.
        expect(opened, "a child may not be offered their own tuition").not.toContain(CHILD);

        // 6 · ROLES ARE SAID IN ENGLISH, so the operator knows which person they are picking.
        expect(opened).toContain("Parent");
        expect(opened).toContain("Guardian");

        await page.screenshot({ path: `${OUT}/responsibility-01-picker.png`, fullPage: false });

        // 7 · NOTHING MAY BE CONFIRMED THAT HAS NOT BEEN PREVIEWED.
        const confirm = page.locator('[data-financials-responsibility-confirm="true"]');
        await expect(confirm, "Confirm is unavailable until the action has said what it will do").toBeDisabled();

        // 8 · THE OPERATOR STATES AN AMOUNT.
        await assign(page, ADULTS[0], "60");

        // 9 · THE ACTION'S OWN PREVIEW.
        await page.locator('[data-financials-responsibility-preview-btn="true"]').click();
        await page.waitForTimeout(8_000);
        await expect(
            page.locator('[data-financials-responsibility-error="true"]'),
            "the arrangement was refused at preview",
        ).toHaveCount(0);
        await expect(
            page.locator('[data-financials-responsibility-preview="true"]'),
            "the registered action must say what will change before anything changes",
        ).toBeVisible({ timeout: 60_000 });
        await logPanel(page, "previewed");
        await page.screenshot({ path: `${OUT}/responsibility-02-preview.png`, fullPage: false });

        // 10 · ONLY NOW IS CONFIRM AVAILABLE.
        await expect(confirm, "a successful preview is what unlocks the commit").toBeEnabled();

        // 11 · COMMIT.
        await confirm.click();
        await page.waitForTimeout(12_000);
        await expect(
            page.locator('[data-financials-responsibility-error="true"]'),
            "the arrangement was refused at execute",
        ).toHaveCount(0);
        await expect(
            page.locator('[data-financials-responsibility-done="true"]'),
            "the panel reports committed persistence, never optimism",
        ).toBeVisible({ timeout: 60_000 });

        // 12 · THE SURFACE RE-READ IT. Success is what the resolver says, not what the panel said.
        const afterCommit = await detail.innerText();
        // eslint-disable-next-line no-console
        console.log("[responsibility:after-commit] full detail text:\n" + afterCommit);
        expect(afterCommit, "the obligation now names who bears it").toContain(ADULTS[0]);
        await expect(
            page.locator('[data-financials-charge-line="responsibility-party"]').first(),
            "a responsibility line must appear on the obligation",
        ).toBeVisible({ timeout: 60_000 });
        await page.screenshot({ path: `${OUT}/responsibility-03-committed.png`, fullPage: false });

        // 13 · AND THE REST OF THE OBLIGATION IS STILL UNASSIGNED, said rather than implied.
        await expect(
            page.locator('[data-financials-charge-line="responsibility-unassigned"]'),
            "money nobody has been made responsible for is named, not silently absorbed",
        ).toBeVisible();

        // 14 · A COLD RELOAD REPRODUCES IT. Anything less is a rendering, not a record.
        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);
        const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
        if (await nav.isVisible().catch(() => false)) await nav.click();
        const shellAfter = page.locator('[data-testid="financials-workspace-shell"]');
        await expect(shellAfter).toBeVisible({ timeout: 60_000 });
        const detailAfter = await openHouseholdCharge(page, shellAfter);
        const reloaded = await detailAfter.innerText();
        // eslint-disable-next-line no-console
        console.log("[responsibility:after-reload] full detail text:\n" + reloaded);
        expect(reloaded, "the arrangement did not persist past a reload").toContain(ADULTS[0]);
        await page.screenshot({ path: `${OUT}/responsibility-04-reloaded.png`, fullPage: false });
    });

    /*
     * ── DIVIDING IT, AND CHANGING ONE'S MIND ──
     *
     * An arrangement that cannot be corrected is a trap, and the account this runs against now HAS
     * one — so this is the edit case, deliberately following the creation case rather than replacing
     * it. Two parties also prove the panel is not quietly single-party.
     */
    test("an obligation can be divided between two people, and reconfigured afterwards", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);
        const shell = await openFinancials(page);
        const detail = await openHouseholdCharge(page, shell);

        await page.locator('[data-financials-manage-responsibility="open"]').click();
        await page.waitForTimeout(8_000);
        const opened = await logPanel(page, "reconfigure-opened");

        /*
         * THE PARTY ALREADY BEARING THE MONEY LEADS THE LIST. An arrangement whose holder had
         * dropped off the picker could never be corrected.
         */
        for (const adult of ADULTS) expect(opened, `${adult} must still be offered`).toContain(adult);

        await assign(page, ADULTS[0], "40");
        await assign(page, ADULTS[1], "35");

        await page.locator('[data-financials-responsibility-preview-btn="true"]').click();
        await page.waitForTimeout(8_000);
        await expect(page.locator('[data-financials-responsibility-error="true"]')).toHaveCount(0);
        await expect(page.locator('[data-financials-responsibility-preview="true"]')).toBeVisible({ timeout: 60_000 });
        await logPanel(page, "reconfigure-previewed");

        await page.locator('[data-financials-responsibility-confirm="true"]').click();
        await page.waitForTimeout(12_000);
        await expect(page.locator('[data-financials-responsibility-error="true"]')).toHaveCount(0);
        await expect(page.locator('[data-financials-responsibility-done="true"]')).toBeVisible({ timeout: 60_000 });

        const after = await detail.innerText();
        // eslint-disable-next-line no-console
        console.log("[responsibility:divided] full detail text:\n" + after);
        for (const adult of ADULTS) expect(after, `${adult} bears part of this obligation`).toContain(adult);
        expect(
            await page.locator('[data-financials-charge-line="responsibility-party"]').count(),
            "two people were made responsible and the surface shows two",
        ).toBeGreaterThanOrEqual(2);
        await page.screenshot({ path: `${OUT}/responsibility-05-divided.png`, fullPage: false });
    });

    /*
     * ── THE LIST IS NOT THE AUTHORIZATION ──
     *
     * Hiding a name protects nothing and showing one grants nothing: `arrangementService` refuses
     * any party that is not a `persons` row in the caller's org, whatever the picker said. What the
     * READ must guarantee is tenancy — the org comes from the resolved gate, never from the request,
     * so an account id the caller does not own resolves to nobody rather than to somebody else's
     * household.
     */
    test("a forged account id cannot read another household's people", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(600_000);
        await openFinancials(page);

        const forged = await page.evaluate(async () => {
            const res = await fetch(
                "/api/admin/financials/responsibility-candidates?customer_id=fd000000-0000-4000-8000-00000000dead",
                { credentials: "include", cache: "no-store" },
            );
            return { status: res.status, body: await res.text() };
        });
        // eslint-disable-next-line no-console
        console.log("[responsibility:forged] " + JSON.stringify(forged));
        expect(forged.status, "a well-formed read of an id that names nothing is answered, not errored").toBe(200);
        expect(JSON.parse(forged.body).candidates, "an unowned account resolves to nobody").toEqual([]);
    });

    /*
     * WITHOUT `fin.read` THERE IS NO LIST. The unauthorized phase drives this one and only this one:
     * the surface is unreachable, so the proof has to be made against the route itself.
     */
    test("the candidate read refuses a caller without financial read", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "this is the unauthorized phase's case");
        test.setTimeout(600_000);
        await page.goto(HOME);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(20_000);

        const refused = await page.evaluate(async () => {
            const res = await fetch(
                "/api/admin/financials/responsibility-candidates?customer_id=fd000000-0000-4000-8000-0000000c0001",
                { credentials: "include", cache: "no-store" },
            );
            return { status: res.status, body: await res.text() };
        });
        // eslint-disable-next-line no-console
        console.log("[responsibility:unauthorized] " + JSON.stringify(refused));
        expect([401, 403], "reading who could owe money is a permitted read, not a public one").toContain(
            refused.status,
        );
        // The grant key travels as diagnostics and never as the sentence a person reads.
        if (refused.status === 403) {
            const body = JSON.parse(refused.body) as { error?: string; required_permission?: string };
            expect(body.required_permission).toBe("fin.read");
            expect(body.error ?? "", "operator copy must not name the grant").not.toContain("fin.read");
        }
    });
});
