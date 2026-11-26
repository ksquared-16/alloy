/**
 * FINANCIALS 4B — THE PRODUCT, NOT THE SCAFFOLDING.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY FROM `financials-workspace.cert.spec.ts` ──
 *
 * The 4A suite proves STRUCTURE: the shell is the shared one, the sections mount, Studio exists,
 * a charge can be posted, a reload rebuilds. Every one of those assertions passes against a
 * Financials workspace containing no money at all — and for months it did, because the
 * certification harness deleted the tenant's charges after proving them. The product looked
 * finished and photographed as six empty white canvases.
 *
 * So structure is not the bar. This file's defining requirement is that IT MUST FAIL against that
 * empty tenant. Every assertion below is about content an operator could act on: rows that exist,
 * amounts that are not zero, households that can be told apart, a site filter whose answer
 * actually changes. If Financials regresses to empty containers, this suite goes red while the 4A
 * suite stays green — which is precisely the signal 4A could not give.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ──
 *
 * No pixel assertions, no screenshot diffing, no layout maths. Density here means "there is
 * operational content", not "the panel is 412px". It asserts through the same semantic data
 * attributes the product already ships for its own tests, and it is allowed to know the fixture's
 * identity — the certification seeds the tenant, so recognising "Alvarez" is knowledge it owns,
 * not a hardcoded product behaviour.
 */
import path from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const HOME = "/workspace";
const CERT = (name: string) => process.env[name] ?? "";

/** The demo households the seam seeds. Certification may know fixture identity; the product may not. */
const HOUSEHOLDS = ["Alvarez", "Brennan", "Chen", "Okafor"] as const;

function sectionTab(shell: Locator, key: string): Locator {
    return shell.locator(`[data-workspace-section-tab="${key}"]`);
}
function modeTab(shell: Locator, key: string): Locator {
    return shell.locator(`[data-alloy-mode="${key}"]`);
}

async function openFinancials(page: Page): Promise<Locator> {
    await page.goto(HOME);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(30_000);
    const navItem = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
    await expect(navItem, "Financials must appear in the left navigation").toBeVisible({ timeout: 60_000 });
    await navItem.click();
    const shell = page.locator('[data-testid="financials-workspace-shell"]');
    await expect(shell, "the canonical workspace shell opens").toBeVisible({ timeout: 60_000 });
    return shell;
}

/**
 * WAIT FOR THE FIGURES TO SETTLE BEFORE JUDGING THEM.
 *
 * The KPI tiles reserve their geometry and stay quiet while the metric pack is in flight, and the
 * exception rows now do the same. Asserting during that window measures the loading state and
 * reports it as an empty product — which is how a density suite produces a false red and teaches
 * everyone to ignore it. Settled means: nothing is holding reserved space any more.
 */
async function waitForFiguresSettled(page: Page) {
    await expect
        .poll(
            async () =>
                (await page.locator('[data-settlement-reserved="kpi"]').count())
                + (await page.locator('[data-settlement-reserved="exception"]').count())
                + (await page.locator('[data-kpi-pending="true"]').count()),
            { timeout: 120_000, message: "the Financials figures never settled" },
        )
        .toBe(0);
    // The recent-money zone resolves from its own read.
    await expect
        .poll(async () => (await page.locator("text=/Loading recent activity/i").count()), {
            timeout: 120_000,
            message: "recent money movement never loaded",
        })
        .toBe(0);
}

async function goTo(page: Page, shell: Locator, section: string) {
    await sectionTab(shell, section).click();
    await page.waitForTimeout(6_000);
    await expect(shell).toHaveAttribute("data-financials-section", section);
    // Sections resolve their own read; a "Loading …" line means the answer is not in yet.
    await expect
        .poll(async () => (await page.locator("text=/^Loading /i").count()), {
            timeout: 120_000,
            message: `${section} never finished loading`,
        })
        .toBe(0);
}

/** Cents parsed out of rendered money. "$1,210.00" -> 121000. Returns null when it is not money. */
function centsOf(text: string | null): number | null {
    if (!text) return null;
    const m = text.replace(/[−–]/g, "-").match(/-?\$\s?([\d,]+(?:\.\d{2})?)/);
    if (!m) return null;
    const value = Number(m[1]!.replace(/,/g, ""));
    return Number.isFinite(value) ? Math.round(value * 100) : null;
}

/**
 * THE ASSERTION THE OLD SCREENSHOTS FAIL.
 *
 * A dash is what this product renders when it has no figure. An operator staring at "—" where a
 * real number exists is the exact defect 4B was opened for, so a populated surface may not contain
 * one in its primary money band.
 */
async function expectNoBareDashes(scope: Locator, what: string) {
    const text = (await scope.innerText()).trim();
    expect(text.length, `${what} must render something`).toBeGreaterThan(0);
    const dashOnly = text
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l === "—" || l === "--");
    expect(dashOnly.length, `${what} still renders bare placeholder dashes`).toBe(0);
}

test.describe("financials 4B — the workspace has a financial day in it", () => {
    test.describe.configure({ mode: "serial" });
    test.skip(process.env.CERT_EXPECT_UNAUTHORIZED === "1", "the unauthorized run drives its own case");

    /*
     * ── READINESS: THE BROWSER DOES NOT JUDGE A TENANT THAT IS STILL CONVERGING ──────────────
     *
     * The seed posts charges, records payments and applies them through the canonical services.
     * Between "the seam exited 0" and "the workspace can show a settled household" there is a
     * window in which the data is real but incomplete, and a density suite that starts inside it
     * reports a true observation about a transient state as a product failure.
     *
     * The fix is not a sleep — a sleep encodes a guess about a machine's speed and goes stale the
     * first time the tenant grows. This polls THE SAME PROJECTION THE ACCOUNTS SECTION CONSUMES,
     * `/api/admin/financials/position`, and proceeds the instant that projection satisfies the
     * contract the suite is about to assert against:
     *
     *   the cohort has work in it · at least one obligation is fully settled · more than one
     *   household is distinguishable
     *
     * The settled obligation is the load-bearing one. It cannot be satisfied by a tenant that has
     * merely been seeded, only by one whose payments have committed AND whose read counts them —
     * which is exactly the seam that failed twice: the cohort-wide `.in()` reads that overflowed
     * the request URI and, with their errors dropped, reported every account as owing in full.
     * Had this gate existed, that defect would have stopped the suite here with the reason named,
     * rather than surfacing as an inexplicable assertion failure inside Scenario B.
     *
     * On timeout it fails loudly and says what it last saw. It never proceeds on a guess.
     */
    const READINESS_TIMEOUT_MS = Number(process.env.CERT_READINESS_TIMEOUT_MS || 180_000);
    const POSITION_ROUTE = "/api/admin/financials/position";

    test.beforeAll(async ({ playwright }) => {
        if (process.env.CERT_EXPECT_UNAUTHORIZED === "1") return;
        const ctx = await playwright.request.newContext({
            baseURL: process.env.CERT_APP_URL || "http://localhost:3011",
            storageState: path.join(__dirname, "..", ".auth", "operator.json"),
        });
        let last = "the projection never answered";
        try {
            const deadline = Date.now() + READINESS_TIMEOUT_MS;
            while (Date.now() < deadline) {
                const res = await ctx.get(POSITION_ROUTE);
                if (res.ok()) {
                    const body = (await res.json()) as {
                        rows?: Array<{
                            householdName?: string | null;
                            position?: { outstandingCents?: number; explanation?: { netCents?: number } };
                        }>;
                    };
                    const rows = body.rows ?? [];
                    // A settled OBLIGATION — money that was owed and has been paid. A credit line
                    // is also zero and proves nothing about whether payments are being counted.
                    const settled = rows.filter(
                        (r) => r.position?.outstandingCents === 0 && (r.position?.explanation?.netCents ?? 0) > 0,
                    ).length;
                    const households = new Set(rows.map((r) => r.householdName).filter(Boolean)).size;
                    if (rows.length > 0 && settled > 0 && households > 1) {
                        // eslint-disable-next-line no-console
                        console.log(
                            `[density] representative state ready: charges=${rows.length} settledObligations=${settled} households=${households}`,
                        );
                        return;
                    }
                    last = `charges=${rows.length} settledObligations=${settled} households=${households}`;
                } else {
                    last = `${POSITION_ROUTE} answered HTTP ${res.status()}`;
                }
                await new Promise((r) => setTimeout(r, 3_000));
            }
            throw new Error(
                `Financials never reached a representative state within ${READINESS_TIMEOUT_MS}ms — last saw: ${last}. `
                + "Density assertions were not run, because a red suite here would describe the seed, not the product.",
            );
        } finally {
            await ctx.dispose();
        }
    });

    /*
     * SCENARIO A — OVERVIEW POPULATED.
     *
     * Four headline KPIs, an exception band an operator can act on, and a record of what moved.
     * The numbers are read back out of the rendered product rather than the API, because the claim
     * is about what a person sees.
     */
    test("A · Overview shows real money, real decisions and real movement", async ({ page }) => {
        test.setTimeout(600_000);
        const shell = await openFinancials(page);

        await expect(shell, "Work is the landing mode").toHaveAttribute("data-financials-mode", "work");
        await expect(shell, "Overview is the landing section").toHaveAttribute("data-financials-section", "overview");

        const overview = page.locator('[data-testid="financials-overview"]');
        await expect(overview).toBeVisible({ timeout: 60_000 });
        await expect(
            page.locator("text=/don't have access to view financial information/i"),
            "an authorized operator sees no denial",
        ).toHaveCount(0);

        // ── THE MONEY BAND ────────────────────────────────────────────────────────────────────
        const kpis = page.locator('[data-testid="financials-overview-activity-kpis"]');
        await expect(kpis).toBeVisible({ timeout: 60_000 });
        await waitForFiguresSettled(page);
        await expectNoBareDashes(kpis, "the Overview KPI band");

        const kpiText = await kpis.innerText();
        const amounts = kpiText
            .split("\n")
            .map((l) => centsOf(l))
            .filter((c): c is number => c !== null);
        expect(amounts.length, "the KPI band renders money").toBeGreaterThan(0);
        expect(
            amounts.some((c) => c !== 0),
            `every KPI is zero — the tenant is empty. Band read: ${JSON.stringify(kpiText)}`,
        ).toBe(true);

        // ── NEEDS A DECISION ──────────────────────────────────────────────────────────────────
        const exceptions = page.locator('[data-financials-overview-exceptions="true"]');
        await expect(exceptions, "the exception band is present").toBeVisible();
        const exceptionRows = page.locator("[data-financials-overview-exception]");
        expect(await exceptionRows.count(), "Needs a decision lists work").toBeGreaterThan(0);

        // The seeded tenant always holds one unposted draft, so this row must carry a real figure.
        const awaiting = page.locator(
            '[data-financials-overview-exception="financials.charges_awaiting_post_count"]',
        );
        await expect(awaiting, "charges awaiting posting is an actionable row").toBeVisible();
        const awaitingText = await awaiting.innerText();
        expect(awaitingText, "awaiting posting is not a dash").not.toMatch(/^\s*—/);
        expect(
            /\b[1-9]\d*\b/.test(awaitingText),
            `charges awaiting posting shows no count: ${JSON.stringify(awaitingText)}`,
        ).toBe(true);

        // Each row offers a way into the section that owns it.
        expect(await page.locator("[data-financials-overview-open]").count()).toBeGreaterThan(0);

        // ── RECENT MONEY MOVEMENT ─────────────────────────────────────────────────────────────
        const recent = page.locator('[data-financials-overview-recent="true"]');
        await expect(recent, "the landing page says what moved").toBeVisible();
        const recentRows = page.locator("[data-financials-overview-recent-row]");
        expect(
            await recentRows.count(),
            "no recent financial events — Overview is a totals page with no history",
        ).toBeGreaterThan(0);

        // Content below the KPI band is the whole point: a band alone is the old screenshot.
        const overviewText = await overview.innerText();
        expect(overviewText.length, "Overview carries content beneath the KPIs").toBeGreaterThan(200);
    });

    /*
     * SCENARIO B — ACCOUNTS DENSITY.
     *
     * Four households, one of them settled. The settled one is the assertion that matters: the rail
     * used to drop it, which made "did the Brennans pay?" unanswerable on the Accounts surface.
     */
    test("B · Accounts lists every household and opens the canonical detail", async ({ page }) => {
        test.setTimeout(900_000);
        const shell = await openFinancials(page);
        await goTo(page, shell, "accounts");

        const list = page.locator('[data-financials-accounts-list="true"]');
        await expect(list).toBeVisible({ timeout: 60_000 });

        const rows = page.locator("[data-financials-account-row]");
        const count = await rows.count();
        expect(count, "the account rail is populated, not a 'Select an account' canvas").toBeGreaterThanOrEqual(4);

        const listText = await list.innerText();
        for (const household of HOUSEHOLDS) {
            expect(listText, `${household} is missing from the account rail`).toContain(household);
        }

        // A SETTLED ACCOUNT IS STILL DISCOVERABLE, and says what it is.
        const settled = page.locator('[data-financials-account-state="settled"]');
        expect(await settled.count(), "the settled household is hidden again").toBeGreaterThan(0);
        expect(await settled.first().innerText(), "a settled row explains itself").toMatch(/settled/i);

        /*
         * ── THE MOUNTED READ AND THE COMMITTED PROJECTION MUST BE THE SAME ANSWER ────────────
         *
         * Both halves of this were separately true while the product was wrong: the canonical
         * position resolver knew a household had paid in full, and the rail showed it owing the
         * whole charge, because the cohort read dropped an error and reported "nothing was ever
         * paid". Neither the resolver's own test nor a screenshot could catch that on its own —
         * only comparing them can. So the rail is checked against the very projection it renders.
         */
        const projection = (await (await page.request.get(POSITION_ROUTE)).json()) as {
            rows?: Array<{
                householdName?: string | null;
                position?: { outstandingCents?: number; explanation?: { netCents?: number } };
            }>;
        };
        const byHousehold = new Map<string, { net: number; outstanding: number }>();
        for (const r of projection.rows ?? []) {
            const name = r.householdName;
            if (!name) continue;
            const acc = byHousehold.get(name) ?? { net: 0, outstanding: 0 };
            acc.net += r.position?.explanation?.netCents ?? 0;
            acc.outstanding += r.position?.outstandingCents ?? 0;
            byHousehold.set(name, acc);
        }
        const settledByProjection = [...byHousehold.entries()]
            .filter(([, v]) => v.outstanding === 0 && v.net > 0)
            .map(([name]) => name);
        expect(
            settledByProjection.length,
            "the canonical projection reports no settled obligation, so the rail cannot be checked against it",
        ).toBeGreaterThan(0);

        const settledRailText = (await settled.allInnerTexts()).join("\n");
        for (const name of settledByProjection) {
            expect(
                settledRailText,
                `${name} is settled in the canonical projection but the rail does not present it as settled`,
            ).toContain(name);
        }

        // ATTENTION SORTS FIRST: the first row is not the settled one.
        await expect(
            rows.first(),
            "accounts needing attention lead the rail",
        ).not.toHaveAttribute("data-financials-account-state", "settled");

        // Rows carry a financial preview, not just a name.
        expect(await page.locator("[data-financials-account-outstanding]").count()).toBeGreaterThan(0);

        // ── SELECTION OPENS THREAD 2, AND CHANGES WITH THE SELECTION ──────────────────────────
        const alvarez = rows.filter({ hasText: "Alvarez" }).first();
        await alvarez.click();
        await page.waitForTimeout(6_000);
        const detail = page.locator("[data-financials-account-detail]");
        await expect(detail, "selecting a household opens its canonical detail").toBeVisible({ timeout: 60_000 });
        const firstId = await detail.getAttribute("data-financials-account-detail");
        expect(firstId, "the detail names the selected account").toBeTruthy();
        await expect(
            page.locator('[data-financials-detail-scope="account_wide"]'),
            "the detail says it is account-wide",
        ).toBeVisible();

        const chen = rows.filter({ hasText: "Chen" }).first();
        await chen.click();
        await page.waitForTimeout(6_000);
        const secondId = await page
            .locator("[data-financials-account-detail]")
            .getAttribute("data-financials-account-detail");
        expect(secondId, "a second selection opens a DIFFERENT account").not.toBe(firstId);
    });

    /*
     * SCENARIO C — CHARGES DENSITY. A draft that has not been posted, and posted work beside it.
     * Posting itself is already certified by the 4A suite; this proves the surface has work on it.
     */
    test("C · Charges shows real financial work, not just a Generate control", async ({ page }) => {
        test.setTimeout(600_000);
        const shell = await openFinancials(page);
        await goTo(page, shell, "charges");

        const queue = page.locator('[data-financials-work-queue="true"], [data-testid="financials-charges-section"]').first();
        await expect(queue).toBeVisible({ timeout: 60_000 });

        const rows = page.locator("[data-financials-queue-row]");
        expect(
            await rows.count(),
            "the Charges surface has no work on it — only its action bar",
        ).toBeGreaterThan(0);

        const queueText = await queue.innerText();
        expect(queueText, "a charge row names money").toMatch(/\$\s?[\d,]+/);
        expect(
            HOUSEHOLDS.some((h) => queueText.includes(h)),
            `no demo household appears in Charges: ${JSON.stringify(queueText.slice(0, 400))}`,
        ).toBe(true);

        // The registered bulk generation command stays reachable from this surface.
        await expect(
            page.locator('[data-financials-bulk-open="true"]'),
            "Generate tuition remains reachable",
        ).toBeVisible();

        // Selecting work opens the canonical account detail rather than a second money model.
        await rows.first().click();
        await page.waitForTimeout(6_000);
        await expect(
            page.locator("[data-financials-detail], [data-financials-account-detail]").first(),
            "selecting financial work opens the canonical detail",
        ).toBeVisible({ timeout: 60_000 });
    });

    /*
     * SCENARIO D — PAYMENTS DENSITY. Both lenses carry rows: money that arrived and money that
     * arrived and settled nothing. An empty Unapplied tab is the old screenshot.
     */
    test("D · Payments shows unapplied money and received money", async ({ page }) => {
        test.setTimeout(600_000);
        const shell = await openFinancials(page);
        await goTo(page, shell, "payments");

        // UNAPPLIED is the default lens.
        const unappliedList = page.locator('[data-financials-payments-list="unapplied"]');
        await expect(unappliedList).toBeVisible({ timeout: 60_000 });
        const unappliedRows = page.locator("[data-financials-payment-row]");
        expect(
            await unappliedRows.count(),
            "no unapplied payments — the lens the seed exists to fill is empty",
        ).toBeGreaterThan(0);
        const unappliedText = await unappliedList.innerText();
        expect(unappliedText, "the unapplied lens names the household").toContain("Okafor");
        expect(unappliedText, "and shows an amount").toMatch(/\$\s?[\d,]+/);

        // RECEIVED.
        await page.locator('[data-financials-payments-lens="received"]').click();
        await page.waitForTimeout(6_000);
        const receivedList = page.locator('[data-financials-payments-list="received"]');
        await expect(receivedList).toBeVisible({ timeout: 60_000 });
        const receivedRows = page.locator("[data-financials-payment-row]");
        expect(await receivedRows.count(), "received payments are listed").toBeGreaterThanOrEqual(2);
        const receivedText = await receivedList.innerText();
        expect(receivedText, "a received row names money").toMatch(/\$\s?[\d,]+/);
        expect(
            HOUSEHOLDS.some((h) => receivedText.includes(h)),
            "a received row names the household it came from",
        ).toBe(true);

        await receivedRows.first().click();
        await page.waitForTimeout(6_000);
        await expect(
            page.locator("[data-financials-payment-detail], [data-financials-detail], [data-financials-account-detail]").first(),
            "selecting a payment opens the canonical detail",
        ).toBeVisible({ timeout: 60_000 });
    });

    /*
     * SCENARIO E — SUBSIDY DENSITY.
     *
     * The seeded canonical state is a SUBMITTED CLAIM, not a variance. The spec asserts what the
     * tenant actually holds rather than demanding a variance the seed never created — inventing one
     * to make a surface look busier is the failure mode this whole pass is against.
     */
    test("E · Subsidy shows the canonical agency position", async ({ page }) => {
        test.setTimeout(600_000);
        const shell = await openFinancials(page);
        await goTo(page, shell, "subsidy");

        const list = page.locator('[data-financials-subsidy-list="true"]');
        await expect(list).toBeVisible({ timeout: 60_000 });
        const rows = page.locator("[data-financials-subsidy-row]");
        expect(
            await rows.count(),
            "the Subsidy canvas is blank — no expected funding, claim or variance is being shown",
        ).toBeGreaterThan(0);

        const text = await list.innerText();
        expect(text, "the subsidy position names the household").toContain("Chen");
        expect(text, "and carries an amount").toMatch(/\$\s?[\d,]+/);

        // The totals band explains what is with an agency versus what is still the family's.
        await expect(
            page.locator('[data-financials-subsidy-totals="true"]'),
            "subsidy totals are shown",
        ).toBeVisible();

        await rows.first().click();
        await page.waitForTimeout(6_000);
        await expect(
            page.locator("[data-financials-subsidy-detail], [data-financials-detail]").first(),
            "selecting a subsidy position opens its detail",
        ).toBeVisible({ timeout: 60_000 });
    });

    /*
     * SCENARIO F — ACTIVITY DENSITY. Several events, in operator language, each naming an account.
     */
    test("F · Activity reads as financial history, not a journal dump", async ({ page }) => {
        test.setTimeout(600_000);
        const shell = await openFinancials(page);
        await goTo(page, shell, "activity");

        const list = page.locator('[data-financials-activity-list="true"]');
        await expect(list).toBeVisible({ timeout: 60_000 });
        const rows = page.locator("[data-financials-activity-row]");
        expect(await rows.count(), "no financial history is shown").toBeGreaterThanOrEqual(3);

        const text = await list.innerText();

        /*
         * ── WHY THIS DOES NOT DEMAND ONE OF *OUR* HOUSEHOLDS ──
         *
         * It used to, and it failed on the promoted tree for a reason worth writing down. The top
         * of this feed is dominated by orphaned journal entries: Thread 8's payment-application
         * certification creates enrolment agreements, posts money against them, then tears the
         * agreements down — and posted money is immutable by design, so the entries outlive their
         * own billable source. Fifty of the fifty most recent entries name an agreement that no
         * longer exists, so no account can be resolved for any of them. That is fixture residue,
         * not a rendering defect, and demanding a demo household inside that window asserts
         * something about another thread's cleanup rather than about this product.
         *
         * What IS this product's contract: an account is shown when one can be resolved, and the
         * surface says out loud how much of what you are looking at could not be attributed.
         * Asserting the disclosure is what keeps an unattributable feed from passing silently.
         */
        const attributed = await page
            .locator("[data-financials-activity-row]")
            .filter({ hasText: "·" })
            .count();
        const footer = await page.locator('[data-financials-activity-footer="true"]').innerText();
        expect(footer, "the surface states the scope its history obeys").toMatch(/history only/i);
        if (attributed === 0) {
            // Every visible row is unattributable — the operator must be TOLD that, not left to
            // wonder whose money this was.
            expect(
                footer,
                "a feed with no resolvable account must disclose that, not render anonymous rows silently",
            ).toMatch(/no accounting period|unattributed|\d+ entr/i);
        }
        expect(text, "events are described in operator language").toMatch(
            /charge posted|payment received|payment applied|posted|received|applied/i,
        );
        expect(text, "and carry amounts").toMatch(/\$\s?[\d,]+/);

        // The canonical entry type travels for tests; the operator is not shown accounting jargon.
        expect(await page.locator("[data-financials-activity-entry-type]").count()).toBeGreaterThan(0);
        expect(text, "no double-entry vocabulary reaches the operator").not.toMatch(/\bdebit\b|\bcredit account\b/i);
    });

    /*
     * SCENARIO G — STUDIO. Six cards, every one a real destination. A card that looks clickable and
     * goes nowhere is worse than no card.
     */
    test("G · every Studio card is a real destination", async ({ page }) => {
        test.setTimeout(600_000);
        const shell = await openFinancials(page);
        await modeTab(shell, "studio").click();
        await page.waitForTimeout(6_000);
        await expect(shell).toHaveAttribute("data-financials-mode", "studio");

        const tiles = page.locator("[data-financials-studio-tile]");
        const count = await tiles.count();
        expect(count, "Studio keeps its six chapters").toBeGreaterThanOrEqual(6);

        /*
         * NAMED, NOT COUNTED. Six tiles is satisfied by six of anything; the claim is that these
         * six chapters of the financial day are each reachable. A chapter that quietly disappears
         * takes its configuration with it and leaves a Studio that still counts to six.
         */
        const CHAPTERS = ["tuition", "catalog", "policies", "accounting", "simulator", "funding"] as const;
        const present = await tiles.evaluateAll((els) =>
            els.map((el) => el.getAttribute("data-financials-studio-tile")),
        );
        for (const chapter of CHAPTERS) {
            expect(present, `Studio is missing its ${chapter} chapter`).toContain(chapter);
        }

        /*
         * AND EACH SAYS WHAT KIND OF DESTINATION IT IS. Funding is the one that matters: it is
         * owned by Processing, not by Financials config, and a card that deep-links there without
         * saying so teaches an operator that Financials owns who-pays. Every tile carries a
         * posture label, so "owned elsewhere" is disclosed rather than implied by the href.
         */
        for (const chapter of CHAPTERS) {
            const tile = page.locator(`[data-financials-studio-tile="${chapter}"]`);
            const text = (await tile.innerText()).trim();
            expect(text.length, `the ${chapter} card renders nothing`).toBeGreaterThan(0);
            expect(
                text,
                `the ${chapter} card does not declare what kind of destination it is`,
                // Case-insensitive: the posture chip is CSS-uppercased, so `innerText` returns
                // "CONFIGURATION" for the label the model calls "Configuration".
            ).toMatch(/Configuration|Utility|Owned elsewhere/i);
        }

        // Funding is the case the disclosure exists for: Processing owns who-pays, not Financials.
        expect(
            (await page.locator('[data-financials-studio-tile="funding"]').innerText()),
            "the funding card must say it is owned elsewhere rather than imply Financials configures it",
        ).toMatch(/Owned elsewhere/i);

        for (let i = 0; i < count; i += 1) {
            const tile = tiles.nth(i);
            const id = await tile.getAttribute("data-financials-studio-tile");
            const href = await tile.getAttribute("href");
            expect(href, `Studio card "${id}" is a dead card with no destination`).toBeTruthy();
            expect(href!.length, `Studio card "${id}" has an empty destination`).toBeGreaterThan(1);
            // Every card points at the canonical configuration owner, never a Financials-local copy.
            expect(href!, `Studio card "${id}" must deep-link to the canonical owner`).toContain("/organization");
        }
    });

    /*
     * SCENARIO H — LOCATION NARROWING, PROVED IN THE PRODUCT.
     *
     * Two campuses carry two households each, so a site selection must CHANGE the answer. In a
     * single-site tenant this assertion is unwritable: narrowing a list to itself agrees with
     * itself and proves nothing. Narrowing may shrink the cohort and may never grow it.
     */
    test("H · a campus narrows the operational cohort and never widens it", async ({ page }) => {
        test.setTimeout(900_000);
        const shell = await openFinancials(page);
        await goTo(page, shell, "accounts");

        const rows = page.locator("[data-financials-account-row]");
        const list = page.locator('[data-financials-accounts-list="true"]');

        /*
         * The site picker is Alloy's own listbox, NOT a native <select> — it is a button with
         * aria-haspopup="listbox" whose options carry role="option". Reaching for `select` finds
         * nothing, which is a test looking for a control the product deliberately does not use.
         */
        const sitePicker = shell.getByRole("button", { name: "Site" });
        await expect(sitePicker, "the workspace offers a site filter").toBeVisible({ timeout: 60_000 });

        const allSitesCount = await rows.count();
        const allSitesText = await list.innerText();
        expect(allSitesCount, "All sites shows the whole cohort").toBeGreaterThanOrEqual(4);

        /*
         * Open the listbox and pick one option. Deliberately no enumerate-then-reopen dance: the
         * first version opened the picker to read its options, pressed Escape and reopened, which
         * left a matched-but-unactionable option node and hung the click. One open, one choice.
         *
         * The campuses are addressed by name because certification may know fixture identity —
         * the seam seeds Riverside and Lakeside itself.
         */
        async function chooseSite(label: RegExp) {
            await sitePicker.click();
            const option = page.getByRole("option", { name: label });
            await expect(option, `the picker offers ${label}`).toBeVisible({ timeout: 30_000 });
            await option.click({ timeout: 30_000 });
            await expect(page.getByRole("listbox"), "the picker closes after choosing").toHaveCount(0, {
                timeout: 30_000,
            });
            await page.waitForTimeout(8_000);
        }

        const CAMPUSES: Array<{ label: string; match: RegExp }> = [
            { label: "Riverside", match: /Riverside/i },
            { label: "Lakeside", match: /Lakeside/i },
        ];

        const seen: Array<{ label: string; text: string; count: number }> = [];
        for (const campus of CAMPUSES) {
            await chooseSite(campus.match);
            const narrowedCount = await rows.count();
            const narrowedText = await list.innerText();

            expect(
                narrowedCount,
                `${campus.label} widened the cohort — a site filter may never add work`,
            ).toBeLessThanOrEqual(allSitesCount);
            expect(narrowedCount, `${campus.label} is empty; that campus carries real work`).toBeGreaterThan(0);
            seen.push({ label: campus.label, text: narrowedText, count: narrowedCount });
        }

        /*
         * THE ANSWER ACTUALLY DIFFERS. Two campuses rendering the same list are not filtering — and
         * in a single-site tenant this assertion cannot be written at all, which is why 4A could
         * never make it.
         */
        expect(
            seen[0]!.text,
            `${seen[0]!.label} and ${seen[1]!.label} show the same cohort — the filter is not narrowing`,
        ).not.toBe(seen[1]!.text);

        // NEITHER CAMPUS LEAKS THE OTHER'S HOUSEHOLDS.
        for (const campus of seen) {
            const other = seen.find((c) => c.label !== campus.label)!;
            const exclusive = HOUSEHOLDS.filter(
                (h) => other.text.includes(h) && !campus.text.includes(h),
            );
            expect(
                exclusive.length,
                `${campus.label} shows no household exclusive to ${other.label} — the two campuses are indistinguishable`,
            ).toBeGreaterThan(0);
        }

        // Back to All sites: the whole cohort returns.
        await chooseSite(/all sites/i);
        expect(await rows.count(), "All sites restores the whole cohort").toBe(allSitesCount);
        expect(await list.innerText(), "and restores the same households").toBe(allSitesText);
    });

    /*
     * SCENARIO I — COLD RELOAD. The workspace is rebuilt from the database, not from anything the
     * previous page left in memory.
     */
    test("I · a cold reload reconstructs the populated workspace from the database", async ({ page }) => {
        test.setTimeout(900_000);
        let shell = await openFinancials(page);
        await goTo(page, shell, "accounts");
        const before = await page.locator("[data-financials-account-row]").count();
        expect(before).toBeGreaterThanOrEqual(4);

        await page.reload();
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);

        shell = await openFinancials(page);
        await goTo(page, shell, "accounts");
        const after = await page.locator("[data-financials-account-row]").count();
        expect(after, "the cohort is reconstructed from canonical truth after a cold reload").toBe(before);

        const listText = await page.locator('[data-financials-accounts-list="true"]').innerText();
        for (const household of HOUSEHOLDS) {
            expect(listText, `${household} survived the reload`).toContain(household);
        }
    });
});

/*
 * SCENARIO J — UNAUTHORIZED. Driven by the harness, which revokes `fin.read` around this run.
 *
 * It asserts BOTH halves deliberately: the key present for diagnostics, and absent from the
 * sentence a person reads. Holding them in tension is what stops them collapsing back into one
 * string, which is how "Viewing financial work requires fin.read." became operator copy.
 */
test.describe("financials 4B — the refusal", () => {
    test("J · an operator without the grant is refused, in business language", async ({ page }) => {
        test.skip(process.env.CERT_EXPECT_UNAUTHORIZED !== "1", "driven by the harness");
        test.setTimeout(600_000);
        await page.goto(HOME);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(30_000);

        const res = await page.request.get("/api/admin/financials/work-queue");
        const body = await res.text();
        expect(res.status(), body).toBe(403);

        const parsed = JSON.parse(body) as { error?: string; required_permission?: string };
        expect(parsed.required_permission, "the key stays available to diagnostics").toBe("fin.read");
        expect(parsed.error ?? "", "operator copy must not contain a grant key").not.toMatch(/fin\.read/i);
        expect(parsed.error ?? "", "operator copy explains access in business language").toMatch(
            /don't have access/i,
        );
        void CERT;
    });
});
