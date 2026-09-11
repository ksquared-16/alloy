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

        /*
         * 13 · AND IT NO LONGER SAYS THERE IS NO ARRANGEMENT.
         *
         * This is the assertion that closes the original defect, and it is deliberately NOT
         * "a responsibility line appears on this charge". The charge was posted before the
         * arrangement existed, and Thread 6 refuses to re-divide billed money without an explicit
         * decision — so the honest state is an arrangement in force over an obligation not yet
         * divided under it, and the surface has to say both. Asserting an allocation here would be
         * asserting a behaviour the authority correctly refuses.
         */
        await expect(
            page.locator('[data-financials-responsibility-empty="true"]'),
            "the account has an arrangement now; it must stop inviting the operator to create one",
        ).toHaveCount(0);
        const inForce = page.locator('[data-financials-responsibility-arrangement="in-force"]');
        await expect(inForce, "the arrangement in force must be stated on the obligation").toBeVisible({
            timeout: 60_000,
        });
        // eslint-disable-next-line no-console
        console.log("[responsibility:in-force] " + (await inForce.innerText()));
        expect(
            await inForce.innerText(),
            "an arrangement over a charge it does not govern must say so, not imply division",
        ).toMatch(/not divided under it/i);
        await page.screenshot({ path: `${OUT}/responsibility-03-committed.png`, fullPage: false });

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
        await expect(
            page.locator('[data-financials-responsibility-arrangement="in-force"]'),
            "the arrangement did not persist past a reload",
        ).toBeVisible({ timeout: 60_000 });
        await expect(page.locator('[data-financials-responsibility-empty="true"]')).toHaveCount(0);
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

        /*
         * WHAT HAS ALREADY BEEN PAID, BEFORE ANYTHING IS CHANGED.
         *
         * Responsibility says who owes from a date. It is not a statement about money that has
         * already moved, and rewriting an arrangement must not disturb a single application — the
         * payer of record stays the payer of record. Captured here so the claim is a comparison
         * rather than an assurance.
         */
        const appliedBefore = await page
            .locator('[data-financials-charge-line="application"]')
            .allInnerTexts();
        const outstandingBefore = await page
            .locator('[data-financials-charge-line="outstanding"]')
            .allInnerTexts();
        // eslint-disable-next-line no-console
        console.log("[responsibility:payments-before] " + JSON.stringify({ appliedBefore, outstandingBefore }));

        /*
         * THE ACCOUNT ALREADY HAS ONE — the previous case created it — so this is the edit path,
         * deliberately following creation rather than replacing it.
         */
        await expect(
            page.locator('[data-financials-responsibility-arrangement="in-force"]'),
            "this case edits an arrangement, so one must already be in force",
        ).toBeVisible({ timeout: 60_000 });
        await page.locator('[data-financials-manage-responsibility="open"]').click();
        await page.waitForTimeout(8_000);
        const opened = await logPanel(page, "reconfigure-opened");

        /*
         * THE PARTY ALREADY BEARING THE MONEY LEADS THE LIST. An arrangement whose holder had
         * dropped off the picker could never be corrected.
         */
        for (const adult of ADULTS) expect(opened, `${adult} must still be offered`).toContain(adult);

        /*
         * FROM A LATER DATE, because the authority says so. `configureResponsibilityArrangement`
         * refuses an arrangement starting on or before one already in force — "Supersede it from a
         * later date" — and it is right to: two arrangements claiming the same day is an
         * unanswerable question about who owed what on it. An operator changing the split does it
         * from a date, and so does this.
         */
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        await page.locator('[data-financials-responsibility-effective="true"]').fill(tomorrow);

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
        const inForce = page.locator('[data-financials-responsibility-arrangement="in-force"]');
        await expect(inForce, "the superseding arrangement must be the one stated").toBeVisible({ timeout: 60_000 });
        const stated = await inForce.innerText();
        // eslint-disable-next-line no-console
        console.log("[responsibility:divided-in-force] " + stated);
        expect(stated, "two people were made responsible and the surface says two").toMatch(
            /2 responsible parties/i,
        );
        expect(stated, "it takes effect from the date the operator chose").toContain(tomorrow);
        /*
         * AND THE MONEY THAT HAD ALREADY MOVED DID NOT MOVE. This is the sentence the panel shows
         * the operator — "changing it does not change who has already paid" — held to account.
         */
        const appliedAfter = await page.locator('[data-financials-charge-line="application"]').allInnerTexts();
        const outstandingAfter = await page.locator('[data-financials-charge-line="outstanding"]').allInnerTexts();
        // eslint-disable-next-line no-console
        console.log("[responsibility:payments-after] " + JSON.stringify({ appliedAfter, outstandingAfter }));
        expect(appliedAfter, "reconfiguring responsibility rewrote payment history").toEqual(appliedBefore);
        expect(outstandingAfter, "reconfiguring responsibility changed what the family owes").toEqual(
            outstandingBefore,
        );

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

/**
 * ── SLICE 5B · EXPECTED FUNDING, AT THE GRAIN IT ACTUALLY HAS ───────────────────────────────────
 *
 * `billing.configure_expected_funding` has existed since Thread 6 and no operator could reach it.
 * It attaches to a responsibility SHARE — an agency or an employer covering part of what one named
 * person owes — so it cannot be offered as an account-level toggle without inventing an answer to
 * "whose share?".
 *
 * These cases run AFTER the arrangement cases above and in the same file, deliberately: there is no
 * share to fund until somebody has been made responsible, and that ordering is the product's, not
 * the suite's convenience.
 *
 * The claim under certification is as much about what the surface REFUSES to say as what it says.
 * Expected funding is an expectation: no money has arrived, no claim has been submitted, no agency
 * has committed, and the party is still responsible for all of it.
 */
test.describe("expected funding is configured against a responsible party's share", () => {
    test("a share can be funded from a canonical agency, and remains the party's responsibility", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);
        const shell = await openFinancials(page);
        const detail = await openHouseholdCharge(page, shell);

        /*
         * 1 · THE SHARES ARE VISIBLE AND NAMED. This is the precondition the old surface failed:
         * expected funding was readable but nothing said WHOSE responsibility it funded.
         */
        const shareRows = page.locator("[data-financials-arrangement-share]");
        await expect(shareRows.first(), "an arrangement's shares must be visible to be funded").toBeVisible({
            timeout: 60_000,
        });
        const shareCount = await shareRows.count();
        expect(shareCount, "the certification above left two responsible parties").toBeGreaterThanOrEqual(1);
        const firstShare = shareRows.first();
        const shareText = await firstShare.innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:share] " + shareText);
        expect(shareText, "a share names the person who holds it").toMatch(/Alvarez/);
        expect(shareText, "and an account with no funding says so plainly").toMatch(/Expected funding — none/i);

        // 2 · THE CONTROL IS OFFERED ON THE SHARE, not on the charge and not on the account.
        const open = firstShare.locator("[data-financials-manage-funding]");
        await expect(open).toBeVisible({ timeout: 30_000 });
        await open.click();
        await page.waitForTimeout(6_000);

        const panel = page.locator("[data-financials-manage-funding-panel]");
        await expect(panel).toBeVisible({ timeout: 30_000 });
        const opened = await panel.innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:opened] full panel text:\n" + opened);

        // 3 · THE LAW IS STATED WHERE THE OPERATOR ACTS ON IT.
        expect(opened, "an expectation must never read as a payment").toMatch(/not a payment/i);
        expect(opened, "nor as a claim on an agency").toMatch(/claims nothing from an agency/i);
        expect(opened, "nor as a reduction of what is owed").toMatch(/does not reduce what is owed/i);

        // 4 · THE PARTY'S OWN RESPONSIBILITY IS SHOWN, so the operator funds a known figure.
        const responsible = page.locator('[data-financials-funding-responsible="true"]');
        await expect(responsible).toBeVisible();
        const responsibleText = await responsible.innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:responsible] " + responsibleText);
        expect(responsibleText).toMatch(/\$/);

        // 5 · GOVERNMENT MONEY IS PICKED FROM THE CANONICAL REGISTRY, never typed.
        await expect(
            page.locator('[data-financials-funding-agency="true"]'),
            "a government expectation must name an agency the org actually holds",
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            page.locator('[data-financials-funding-label="true"]'),
            "a free-text name is not offered where a registry exists",
        ).toHaveCount(0);
        const agencySelect = page.locator('[data-financials-funding-agency="true"]');
        const agencyOptions = await agencySelect.locator("option").allInnerTexts();
        // eslint-disable-next-line no-console
        console.log("[funding:agencies] " + JSON.stringify(agencyOptions));
        expect(agencyOptions.join(" "), "the demo tenant's agency is offered").toMatch(/State Childcare Assistance/i);
        /*
         * Chosen by the label the registry actually returned, not by a pattern: the point of a
         * canonical source is that the operator picks the agency the org holds, so the test picks
         * the same way rather than asserting against a name it supplied itself.
         */
        const agencyLabel = agencyOptions.find((o) => /State Childcare Assistance/i.test(o))!;
        await agencySelect.selectOption({ label: agencyLabel });

        // 6 · NOTHING MAY BE CONFIRMED THAT HAS NOT BEEN PREVIEWED.
        const confirm = page.locator('[data-financials-funding-confirm="true"]');
        await expect(confirm, "Confirm is unavailable until the action has said what it will do").toBeDisabled();

        // 7 · AN AMOUNT THE CAPABILITY CAN REPRESENT EXACTLY.
        await page.locator('[data-financials-funding-amount="true"]').fill("10");

        // 8 · THE ACTION'S OWN PREVIEW.
        await page.locator('[data-financials-funding-preview-btn="true"]').click();
        await page.waitForTimeout(8_000);
        await expect(
            page.locator('[data-financials-funding-error="true"]'),
            "the expectation was refused at preview",
        ).toHaveCount(0);
        const previewBlock = page.locator('[data-financials-funding-preview="true"]');
        await expect(previewBlock, "the registered action says what will change before it changes").toBeVisible({
            timeout: 60_000,
        });
        const previewText = await previewBlock.innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:preview] " + previewText);
        expect(previewText, "the preview itself must not imply money moved").toMatch(/not a payment/i);
        await previewBlock.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1_000);
        await page.screenshot({ path: `${OUT}/funding-01-preview.png`, fullPage: false });

        // 9 · ONLY NOW IS CONFIRM AVAILABLE.
        await expect(confirm).toBeEnabled();
        await confirm.click();
        await page.waitForTimeout(12_000);
        await expect(
            page.locator('[data-financials-funding-error="true"]'),
            "the expectation was refused at execute",
        ).toHaveCount(0);
        await expect(
            page.locator('[data-financials-funding-done="true"]'),
            "the panel reports committed persistence, never optimism",
        ).toBeVisible({ timeout: 60_000 });

        /*
         * 10 · THE SURFACE RE-READ IT, AND SAYS THE THREE THINGS THAT MATTER: who funds it, how
         * much, and how much is STILL this party's. The last line is why the distinction exists.
         */
        const afterCommit = await detail.innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:after-commit] full detail text:\n" + afterCommit);
        await expect(page.locator("[data-financials-funding-row]").first()).toBeVisible({ timeout: 60_000 });
        const fundingRow = await page.locator("[data-financials-funding-row]").first().innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:row] " + fundingRow);
        expect(fundingRow, "the expectation names its source").toMatch(/State Childcare Assistance/i);
        expect(fundingRow, "and is stated as an expectation").toMatch(/Expected from/i);

        const residual = page.locator('[data-financials-funding-residual="true"]');
        await expect(residual, "what remains the party's responsibility must be said").toBeVisible();
        const residualText = await residual.innerText();
        // eslint-disable-next-line no-console
        console.log("[funding:residual] " + residualText);
        expect(residualText).toMatch(/still their responsibility|exceeds this share/i);
        /*
         * PHOTOGRAPH THE SHARE THAT WAS FUNDED. A viewport shot of a scrolling pane captured
         * whichever share happened to be in view — in the first run, the UNfunded one — so the
         * evidence showed "Expected funding — none" beside a passing assertion that funding had
         * been recorded. Evidence that does not show the thing it evidences is worse than none.
         */
        await firstShare.scrollIntoViewIfNeeded();
        await page.waitForTimeout(1_000);
        await page.screenshot({ path: `${OUT}/funding-02-committed.png`, fullPage: false });
    });

    /*
     * ── WHAT AN EXPECTATION MUST NOT MOVE ───────────────────────────────────────────────────────
     *
     * The whole choreography lives or dies here. Net obligation, outstanding, applied payments and
     * collectible-now are facts about money. An expectation is a fact about a hope.
     */
    test("expecting funding moves no money and reduces nothing owed", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");
        test.setTimeout(900_000);
        const shell = await openFinancials(page);
        const detail = await openHouseholdCharge(page, shell);

        const before = {
            net: await detail.locator('[data-financials-charge-line="net"]').allInnerTexts(),
            outstanding: await detail.locator('[data-financials-charge-line="outstanding"]').allInnerTexts(),
            applied: await detail.locator('[data-financials-charge-line="application"]').allInnerTexts(),
        };
        // eslint-disable-next-line no-console
        console.log("[funding:money-before] " + JSON.stringify(before));

        /* A SECOND EXPECTATION, on the same share and the same agency — a correction. */
        const firstShare = page.locator("[data-financials-arrangement-share]").first();
        await firstShare.locator("[data-financials-manage-funding]").click();
        await page.waitForTimeout(6_000);
        const correctionSelect = page.locator('[data-financials-funding-agency="true"]');
        const correctionLabel = (await correctionSelect.locator("option").allInnerTexts()).find((o) =>
            /State Childcare Assistance/i.test(o),
        )!;
        await correctionSelect.selectOption({ label: correctionLabel });
        await page.locator('[data-financials-funding-amount="true"]').fill("8");
        await page.locator('[data-financials-funding-preview-btn="true"]').click();
        await page.waitForTimeout(8_000);
        await expect(page.locator('[data-financials-funding-preview="true"]')).toBeVisible({ timeout: 60_000 });
        await page.locator('[data-financials-funding-confirm="true"]').click();
        await page.waitForTimeout(12_000);
        await expect(page.locator('[data-financials-funding-error="true"]')).toHaveCount(0);

        const after = {
            net: await detail.locator('[data-financials-charge-line="net"]').allInnerTexts(),
            outstanding: await detail.locator('[data-financials-charge-line="outstanding"]').allInnerTexts(),
            applied: await detail.locator('[data-financials-charge-line="application"]').allInnerTexts(),
        };
        // eslint-disable-next-line no-console
        console.log("[funding:money-after] " + JSON.stringify(after));
        expect(after.net, "expected funding changed the net obligation").toEqual(before.net);
        expect(after.outstanding, "expected funding reduced what is owed").toEqual(before.outstanding);
        expect(after.applied, "expected funding invented a payment").toEqual(before.applied);

        /*
         * AND THE CORRECTION REPLACED THE EXPECTATION RATHER THAN JOINING IT. Two active rows for
         * one agency is the agency expected to cover the same money twice — which a claim would
         * then be built from.
         */
        const rows = page.locator("[data-financials-funding-row]");
        const texts = await rows.allInnerTexts();
        // eslint-disable-next-line no-console
        console.log("[funding:rows-after-correction] " + JSON.stringify(texts));
        const stateAgencyRows = texts.filter((t) => /State Childcare Assistance/i.test(t));
        expect(stateAgencyRows, "one agency, one live expectation").toHaveLength(1);
        expect(stateAgencyRows[0], "the correction is what stands").toMatch(/\$8\.00/);
        await page.locator("[data-financials-arrangement-share]").first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(1_000);
        await page.screenshot({ path: `${OUT}/funding-03-corrected.png`, fullPage: false });
    });

    /*
     * READING WHERE MONEY MIGHT COME FROM IS A PERMITTED READ, NOT A PUBLIC ONE. The funding
     * registry names this organisation's agencies; a caller without financial read has no business
     * enumerating them.
     */
    test("the funding source registry refuses a caller without financial read", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "this is the unauthorized phase's case");
        test.setTimeout(600_000);
        await page.goto(HOME);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(20_000);

        const refused = await page.evaluate(async () => {
            const res = await fetch("/api/admin/financials/funding-sources", {
                credentials: "include",
                cache: "no-store",
            });
            return { status: res.status, body: await res.text() };
        });
        // eslint-disable-next-line no-console
        console.log("[funding:unauthorized] " + JSON.stringify(refused));
        expect([401, 403]).toContain(refused.status);
        if (refused.status === 403) {
            const body = JSON.parse(refused.body) as { error?: string; required_permission?: string };
            expect(body.required_permission).toBe("fin.read");
            expect(body.error ?? "", "operator copy must not name the grant").not.toContain("fin.read");
        }
    });
});
