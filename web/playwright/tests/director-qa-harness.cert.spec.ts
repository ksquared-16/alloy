/**
 * THE HARNESS, EXERCISED ON THE REAL HOSTED ROUTE.
 *
 * Local behaviour proves nothing about a route that is served through a rewrite, behind a layout
 * that redirects, in a build whose revision the page itself claims to know. Every assertion below
 * runs against https://staging.workwithalloy.com.
 *
 * THE LOAD-BEARING ONE IS THE LAST. A QA tool that can move money is not a QA tool, so this file
 * reads the canonical account before and after recording an acceptance result and requires that
 * every figure is identical. Everything else here is about whether the harness is usable; that one
 * is about whether it is safe.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const ROUTE = "/workspace/qa/core-financials";
const API = "/api/admin/qa/financials-director";
const HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0001";

test.use({ baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 950 } });
test.describe.configure({ mode: "serial", timeout: 240_000 });

async function financialState(request: APIRequestContext) {
    const res = await request.get(`/api/admin/financials/card?customer_id=${HOUSEHOLD}`);
    expect(res.ok(), `account read ${res.status()}`).toBe(true);
    const vm = ((await res.json()) as { vm?: Record<string, any> }).vm ?? {};
    return {
        reconciliation: vm.reconciliation,
        collectible: vm.collectible,
        rowCount: (vm.rows ?? []).length,
        paymentCount: (vm.payments ?? []).length,
        reductionCount: (vm.reductions ?? []).length,
    };
}

async function openHarness(page: Page) {
    await page.goto(ROUTE);
    await page.waitForLoadState("domcontentloaded");
    const shell = page.locator('[data-adminv2-director-qa="true"]');
    await expect(shell, "the harness mounts on the hosted route").toBeVisible({ timeout: 90_000 });
    // The landing resolves readiness from Financials before it shows anything; wait for the real page.
    await expect(page.locator('[data-qa-panel="environment"]')).toBeVisible({ timeout: 90_000 });
    return shell;
}

// ── ACCESS ──────────────────────────────────────────────────────────────────────────────────────

test.describe("access", () => {
    test("an unauthenticated visitor is sent to sign in, and the API refuses them", async ({ browser }) => {
        /* A fresh context with NO storage state — genuinely signed out, not merely a different tab. */
        const ctx = await browser.newContext({ baseURL: "https://staging.workwithalloy.com" });
        const page = await ctx.newPage();
        await page.goto(ROUTE);
        await page.waitForLoadState("domcontentloaded");
        expect(page.url(), `signed-out visitor landed on ${page.url()}`).toMatch(/\/login/);

        const api = await ctx.request.get(API);
        expect(api.status(), "the readiness API refuses an unauthenticated caller").toBeGreaterThanOrEqual(400);
        const body = await api.text();
        expect(body, "and it discloses no tenant data while refusing").not.toContain("Alvarez");
        await ctx.close();
    });
});

// ── THE HARNESS ITSELF ──────────────────────────────────────────────────────────────────────────

test.describe("the hosted harness", () => {
    test.use({ storageState: STORAGE });

    test("an authorized operator opens it, and it states the build it is describing", async ({ page, request }) => {
        await openHarness(page);
        await expect(page.getByRole("heading", { name: /Core Financials — Director QA/ })).toBeVisible();

        /*
         * THE REVISION IT CLAIMS MUST BE THE REVISION IT IS. A harness that reports the wrong build
         * would let an acceptance be recorded against code nobody ran.
         */
        const build = await (await request.get("/api/build-info")).json();
        const env = await page.locator('[data-qa-panel="environment"]').innerText();
        expect(env.replace(/\s+/g, " "), "the displayed revision is the deployed revision")
            .toContain(String(build.gitSha));
    });

    test("it resolves the Alvarez subject live, and opens Scenario 1", async ({ page, request }) => {
        await openHarness(page);

        const subjectText = (await page.locator('[data-qa-panel="subject"]').innerText()).replace(/\s+/g, " ");
        expect(subjectText, "the QA household is resolved").toMatch(/Alvarez/);

        /* Live, not authored: the figure on screen is the figure the canonical reader returns now. */
        const state = await financialState(request);
        const owed = Number(state.reconciliation?.balanceCents ?? 0);
        const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
        expect(subjectText, "outstanding is the canonical figure").toContain(money(owed));

        await page.locator('[data-qa-action="start-walkthrough"]').click();
        const scenario = page.locator("[data-qa-scenario]");
        await expect(scenario, "a scenario opens").toBeVisible({ timeout: 60_000 });
        await expect(page.locator('[data-qa-panel="starting-state"]'), "with a live starting state").toBeVisible();
        await expect(page.locator('[data-qa-deeplink="workspace"]'), "and a link into the product").toBeVisible();
    });

    test("a failure must be explained before it can be recorded", async ({ page }) => {
        await openHarness(page);
        await page.locator('[data-qa-action="start-walkthrough"]').click();
        await expect(page.locator("[data-qa-scenario]")).toBeVisible({ timeout: 60_000 });

        /* FAIL with no observation and no classification: refused, and told why. */
        await page.locator('[data-qa-action="record-fail"]').click();
        await expect(page.locator('[data-qa-error="true"]'), "an unexplained failure is refused")
            .toBeVisible({ timeout: 30_000 });
    });

    /**
     * PERSISTENCE, AND THE PROOF THAT RECORDING TESTIMONY MOVES NO MONEY.
     *
     * NOT RUN is used deliberately: it exercises the whole write path and leaves the program in the
     * state it was already in, so certifying the harness never fabricates an acceptance.
     */
    test("a result persists across a reload, and changes nothing financial", async ({ page, request }) => {
        const before = await financialState(request);

        await openHarness(page);
        await page.locator('[data-qa-action="start-walkthrough"]').click();
        await expect(page.locator("[data-qa-scenario]")).toBeVisible({ timeout: 60_000 });
        const scenarioKey = await page.locator("[data-qa-scenario]").getAttribute("data-qa-scenario");
        expect(scenarioKey, "the scenario names itself").toBeTruthy();

        await page.locator("#qa-observation").fill("Harness certification: exercising the persistence path.");
        await page.locator('[data-qa-action="record-not-run"]').click();
        await page.waitForTimeout(3_000);

        // It survives a genuine reload.
        await page.reload();
        await openHarness(page);
        const api = await (await request.get(API)).json();
        const saved = (api.results ?? []).find((r: Record<string, unknown>) => r.scenario_key === scenarioKey);
        expect(saved, `the result was stored for ${scenarioKey}`).toBeTruthy();
        expect(String(saved.deployed_revision), "bound to this build").not.toBe("");
        expect(String(saved.scenario_definition_version), "and to the wording answered").not.toBe("");

        /*
         * THE ONE THAT MATTERS. Recording acceptance must not touch a single financial figure.
         */
        const after = await financialState(request);
        expect(after.reconciliation, "reconciliation is untouched").toEqual(before.reconciliation);
        expect(after.collectible, "collectibility is untouched").toEqual(before.collectible);
        expect(after.rowCount, "no ledger row was created").toBe(before.rowCount);
        expect(after.paymentCount, "no payment was created").toBe(before.paymentCount);
        expect(after.reductionCount, "no reduction was created").toBe(before.reductionCount);
    });

    test("the demo path offers only what has actually been accepted", async ({ page, request }) => {
        const api = await (await request.get(API)).json();
        const passed = new Set(
            (api.results ?? []).filter((r: Record<string, unknown>) => r.result === "pass")
                .map((r: Record<string, unknown>) => String(r.scenario_key)),
        );

        await openHarness(page);
        await page.locator('[data-qa-action="demo-path"]').click();
        await page.waitForTimeout(2_000);

        const listed = await page.locator("[data-qa-scenario-row]").evaluateAll(
            (els) => els.map((e) => e.getAttribute("data-qa-scenario-row") || ""),
        );
        for (const key of listed) {
            expect(passed.has(key), `demo offers ${key}, which nobody accepted`).toBe(true);
        }
        expect(listed.length, "the demo path is exactly the accepted set").toBe(passed.size);
    });

    test("it is usable at phone width", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openHarness(page);
        await expect(page.locator('[data-qa-action="start-walkthrough"]'), "the primary control is reachable")
            .toBeVisible();
        const overflow = await page.evaluate(() => ({
            scroll: document.documentElement.scrollWidth,
            client: document.documentElement.clientWidth,
        }));
        expect(
            overflow.scroll - overflow.client,
            `the page does not scroll sideways at 390px: ${JSON.stringify(overflow)}`,
        ).toBeLessThanOrEqual(1);
    });
});
