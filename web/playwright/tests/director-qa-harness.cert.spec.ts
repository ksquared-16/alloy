/**
 * THE CANONICAL DIRECTOR QA, EXERCISED ON THE REAL HOSTED ROUTE.
 *
 * Local behaviour proves nothing about a route served from a deployment whose revision the page
 * itself claims to know. Every assertion below runs against https://staging.workwithalloy.com.
 *
 * ── SHELL-LESS, NOT UNAUTHENTICATED ────────────────────────────────────────────────────────────
 *
 * `/dev/core-financials-qa` resolves for anyone. That is a statement about CHROME: the walkthrough
 * is read beside the product, without navigating the operator workspace to reach it. It is not a
 * statement about authority. The money behind it is gated exactly where it always was — on
 * `/api/admin/qa/financials-director`, which calls `requireAdminOrOps()` on both verbs and
 * `assertFinancialsReadAllowed` on the read. So the first describe below signs nobody in and
 * requires that the frame renders and NOTHING financial does.
 *
 * ── THE LOAD-BEARING ONE IS THE MONEY ──────────────────────────────────────────────────────────
 *
 * A QA tool that can move money is not a QA tool. The persistence test reads the canonical account
 * before and after recording testimony and requires every figure to be identical. It records
 * NOT RUN deliberately: that exercises the whole write path and leaves the programme in the state
 * it was already in, so certifying the harness never fabricates an acceptance of a W7 scenario.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const ROUTE = "/dev/core-financials-qa";
/** The room this replaced. It must not still be a QA product. */
const RETIRED_ROUTE = "/workspace/qa/core-financials";
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

/** Open the landing view and wait for the live readiness read, not merely for HTML. */
async function openQa(page: Page) {
    await page.goto(ROUTE);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-qa-reader="core-financials"]'), "the reader mounts on the hosted route")
        .toBeVisible({ timeout: 90_000 });
    await expect(page.locator('[data-qa-progress="true"]'), "and resolves the environment")
        .toBeVisible({ timeout: 90_000 });
}

/** Into the walkthrough, at whichever scenario the resume contract chooses. */
async function startWalk(page: Page) {
    await page.locator('[data-qa-start="true"]').click();
    await expect(page.locator("[data-qa-scenario]"), "a scenario opens").toBeVisible({ timeout: 60_000 });
}

// ── SHELL-LESS DOES NOT MEAN OPEN ───────────────────────────────────────────────────────────────

test.describe("an anonymous visitor", () => {
    test("gets the frame and none of the money, and the API refuses them", async ({ browser }) => {
        /* A fresh context with NO storage state — genuinely signed out, not merely a different tab. */
        const ctx = await browser.newContext({ baseURL: "https://staging.workwithalloy.com" });
        const page = await ctx.newPage();
        await page.goto(ROUTE);
        await page.waitForLoadState("domcontentloaded");

        /*
         * THE PAGE RESOLVES. It is no longer a 404 on a hosted runtime, and it is not a login
         * redirect either — the frame is the frame, served to whoever asks for it.
         */
        expect(page.url(), `anonymous visitor landed on ${page.url()}`).toContain(ROUTE);
        await expect(page.locator('[data-qa-reader="core-financials"]')).toBeVisible({ timeout: 60_000 });
        await expect(page.getByText("Core Financials Director QA")).toBeVisible({ timeout: 60_000 });

        /* AND NOTHING BEHIND IT DOES. No scenario, no fixture, no household, no balance. */
        const body = (await page.locator("body").innerText()).replace(/\s+/g, " ");
        expect(body, "no walkthrough is offered").not.toContain("Start walkthrough");
        expect(body, "no household is named").not.toMatch(/Alvarez|Certhouse|Certopp/);
        expect(body, "no fixture doctrine is disclosed").not.toContain("READ ONLY");
        expect(await page.locator("[data-qa-scenario]").count(), "no scenario renders").toBe(0);
        expect(await page.locator('[data-qa-fixture-doctrine="true"]').count(), "no doctrine renders").toBe(0);

        /* THE READ IS REFUSED, and refuses without leaking what it is protecting. */
        const read = await ctx.request.get(API);
        expect(read.status(), "the readiness API refuses an anonymous caller").toBe(401);
        expect(await read.text(), "and discloses no tenant data while refusing").not.toMatch(/Alvarez|Certhouse/);

        /* SO IS THE WRITE. A surface anyone can open must not be a surface anyone can testify on. */
        const write = await ctx.request.post(API, {
            data: { scenario_key: "accounting_period", result: "not_run", observation: "anonymous write attempt" },
        });
        expect(write.status(), "the result write refuses an anonymous caller").toBe(401);

        await ctx.close();
    });
});

// ── THE ROOM THAT WAS REPLACED ──────────────────────────────────────────────────────────────────

test.describe("the retired operator-shell QA", () => {
    test.use({ storageState: STORAGE });

    test("no longer functions, and sends an old bookmark to the canonical one", async ({ page }) => {
        await page.goto(RETIRED_ROUTE);
        await page.waitForLoadState("domcontentloaded");
        /*
         * A redirect rather than a 404: this was a working URL that people and this very spec
         * pointed at, and there is exactly one place it can mean.
         */
        expect(page.url(), `the retired route landed on ${page.url()}`).toContain(ROUTE);
        await expect(page.locator('[data-qa-reader="core-financials"]'), "at the canonical reader")
            .toBeVisible({ timeout: 90_000 });
        /* And it is not the old surface wearing a new URL. */
        expect(await page.locator('[data-adminv2-director-qa="true"]').count(), "the shell harness is gone").toBe(0);
    });
});

// ── THE WALKTHROUGH AS THE DIRECTOR MEETS IT ────────────────────────────────────────────────────

test.describe("the canonical Director QA", () => {
    test.use({ storageState: STORAGE });

    test("opens without the operator shell, and states the build it describes", async ({ page, request }) => {
        await openQa(page);
        await expect(page.getByRole("heading", { name: /Core Financials — Director QA/ })).toBeVisible();

        /* NO WORKSPACE NAVIGATION. That absence is the whole point of the surface. */
        expect(await page.locator("[data-adminv2-sidebar]").count(), "no operator sidebar").toBe(0);
        expect(await page.locator("nav[aria-label='Primary']").count(), "no primary nav").toBe(0);

        /*
         * THE REVISION IT CLAIMS MUST BE THE REVISION IT IS. A harness reporting the wrong build
         * would let an acceptance be recorded against code nobody ran.
         */
        const build = await (await request.get("/api/build-info")).json();
        const body = (await page.locator('[data-qa-view="landing"]').innerText()).replace(/\s+/g, " ");
        expect(body, "the displayed build is the deployed build")
            .toContain(String(build.gitSha).slice(0, 12));
    });

    test("offers the integrated catalog, with the rule and the doctrine before the walk", async ({ page }) => {
        await openQa(page);
        /* The rule that the suites behind scenarios are evidence and never an acceptance. */
        await expect(page.locator('[data-qa-no-automatic-pass="true"]')).toBeVisible();
        /* Which account may be spent, stated before the scenario that would spend one. */
        const doctrine = page.locator('[data-qa-fixture-doctrine="true"]');
        await expect(doctrine).toBeVisible();
        await expect(doctrine).toContainText("Certhouse");
        await expect(doctrine).toContainText("READ ONLY");

        /*
         * TWO DENOMINATORS. The walk is larger than the human-only slice it used to be — the
         * suite-certified and explicitly deferred scenarios are in it — and the line says how much
         * of the catalog it is not.
         */
        const progress = (await page.locator('[data-qa-progress="true"]').innerText()).replace(/\s+/g, " ");
        expect(progress, "deferred is counted").toContain("deferred");
        expect(progress, "and the remainder is named").toMatch(/not in this walk/);
    });

    test("resolves the subject live and renders evidence on the scenario", async ({ page, request }) => {
        await openQa(page);
        const landing = (await page.locator('[data-qa-view="landing"]').innerText()).replace(/\s+/g, " ");
        expect(landing, "the QA household is resolved").toMatch(/Alvarez|Certhouse/);

        /* Live, not authored: the figure on screen is what the canonical reader returns now. */
        const state = await financialState(request);
        const owed = Number(state.reconciliation?.balanceCents ?? 0);
        const money = (c: number) => (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
        expect(landing, "outstanding is the canonical figure").toContain(money(owed));

        await startWalk(page);
        await expect(page.locator('[data-qa-open-product]'), "a link into the product").toBeVisible();
        /* What this scenario costs to drive, in the Director's words rather than the enum's. */
        await expect(page.locator('[data-qa-evidence="true"]')).toBeVisible();
        expect(await page.locator("[data-qa-evidence-class]").count(), "evidence classes render")
            .toBeGreaterThan(0);
    });

    test("offers all five dispositions, and refuses an unexplained one", async ({ page }) => {
        await openQa(page);
        await startWalk(page);
        for (const id of ["record-pass", "record-fail", "record-blocked", "record-deferred", "record-not-run"]) {
            await expect(page.locator(`[data-testid="${id}"]`), id).toBeVisible();
        }
        /* FAIL with no observation and no classification: refused, and told why. */
        await page.locator('[data-testid="record-fail"]').click();
        await expect(page.locator('[data-qa-error="true"]'), "an unexplained failure is refused")
            .toBeVisible({ timeout: 30_000 });
    });

    /**
     * NOTES — THE THING THE DIRECTOR REMEMBERS.
     *
     * Written, recorded, read back after a genuine reload, carried across Next and Previous, then
     * replaced and re-read. NOT RUN throughout, so no W7 scenario is ever falsely accepted.
     */
    test("a note is written, recorded, survives a reload, and survives navigation", async ({ page }) => {
        await openQa(page);
        await startWalk(page);
        const key = await page.locator("[data-qa-scenario]").getAttribute("data-qa-scenario");
        expect(key, "the scenario names itself").toBeTruthy();

        const first = `Notes certification ${Date.now()}: observed and recorded as NOT RUN.`;
        await page.locator("#qa-observation").fill(first);

        /* DRAFTS SURVIVE BEFORE A RESULT IS CHOSEN — kept in this browser as you type. */
        await page.waitForTimeout(1_500);
        await page.reload();
        await openQa(page);
        await startWalk(page);
        await expect(page.locator("#qa-observation"), "the unsent draft survived a reload")
            .toHaveValue(first, { timeout: 30_000 });

        /* RECORDED. The draft is spent and the testimony is read back instead. */
        await page.locator('[data-testid="record-not-run"]').click();
        await page.waitForTimeout(3_000);
        const note = page.locator('[data-qa-recorded-note="true"]');
        await expect(note, "the recorded note is shown back").toBeVisible({ timeout: 30_000 });
        await expect(note).toContainText(first);
        await expect(page.locator("#qa-observation"), "and the form is clear, not restating it")
            .toHaveValue("");

        /* IT SURVIVES A GENUINE RELOAD. */
        await page.reload();
        await openQa(page);
        await startWalk(page);
        await expect(page.locator('[data-qa-recorded-note="true"]')).toContainText(first, { timeout: 30_000 });

        /* AND NEXT, THEN PREVIOUS, RETURNS TO IT. */
        await page.locator('[data-testid="next"]').click();
        await expect(page.locator("[data-qa-scenario]")).not.toHaveAttribute("data-qa-scenario", key!);
        await page.locator('[data-testid="prev"]').click();
        await expect(page.locator("[data-qa-scenario]")).toHaveAttribute("data-qa-scenario", key!);
        await expect(page.locator('[data-qa-recorded-note="true"]'), "the note is still there")
            .toContainText(first, { timeout: 30_000 });

        /* UPDATED, AND THE UPDATE IS WHAT PERSISTS. */
        const second = `${first} Amended on a second pass.`;
        await page.locator("#qa-observation").fill(second);
        await page.locator('[data-testid="record-not-run"]').click();
        await page.waitForTimeout(3_000);
        await page.reload();
        await openQa(page);
        await startWalk(page);
        const after = page.locator('[data-qa-recorded-note="true"]');
        await expect(after, "the amended note persists").toContainText("Amended on a second pass", { timeout: 30_000 });
    });

    test("a result persists in the store, and changes nothing financial", async ({ page, request }) => {
        const before = await financialState(request);

        await openQa(page);
        await startWalk(page);
        const key = await page.locator("[data-qa-scenario]").getAttribute("data-qa-scenario");
        await page.locator("#qa-observation").fill("Persistence certification: exercising the write path.");
        await page.locator('[data-testid="record-not-run"]').click();
        await page.waitForTimeout(3_000);

        const api = await (await request.get(API)).json();
        const saved = (api.results ?? []).find((r: Record<string, unknown>) => r.scenario_key === key);
        expect(saved, `the result was stored for ${key}`).toBeTruthy();
        expect(String(saved.deployed_revision), "bound to this build").not.toBe("");
        expect(String(saved.scenario_definition_version), "and to the wording answered").not.toBe("");
        expect(String(saved.result), "and left NOT RUN, accepting nothing").toBe("not_run");

        /* THE ONE THAT MATTERS. Recording testimony must not touch a single financial figure. */
        const after = await financialState(request);
        expect(after.reconciliation, "reconciliation is untouched").toEqual(before.reconciliation);
        expect(after.collectible, "collectibility is untouched").toEqual(before.collectible);
        expect(after.rowCount, "no ledger row was created").toBe(before.rowCount);
        expect(after.paymentCount, "no payment was created").toBe(before.paymentCount);
        expect(after.reductionCount, "no reduction was created").toBe(before.reductionCount);
    });

    test("leaving and returning restores the place it was left", async ({ page }) => {
        await openQa(page);
        await startWalk(page);
        await page.locator('[data-testid="next"]').click();
        const key = await page.locator("[data-qa-scenario]").getAttribute("data-qa-scenario");
        expect(key, "a second scenario is open").toBeTruthy();

        /* LEAVE the surface entirely, not merely the scenario view. */
        await page.goto("/api/build-info");
        await openQa(page);

        /*
         * THE RESUME CONTRACT IS REPORTED, NOT INFERRED. The landing states which scenario it will
         * open and on what authority — stored place, or first unaccepted.
         */
        const start = page.locator('[data-qa-start="true"]');
        await expect(start).toHaveAttribute("data-qa-resume-source", "stored", { timeout: 30_000 });
        await expect(start).toHaveAttribute("data-qa-resume-scenario", key!);
        await start.click();
        await expect(page.locator("[data-qa-scenario]")).toHaveAttribute("data-qa-scenario", key!);
    });

    test("a deferral is reachable and carries the boundary that explains it", async ({ page }) => {
        await openQa(page);
        await startWalk(page);

        /*
         * WALK TO A DEFERRAL. The old filter removed these from the walk entirely, so reaching one
         * by navigation is the proof that it is reachable at all.
         */
        let found = false;
        for (let i = 0; i < 90 && !found; i += 1) {
            if (await page.locator("[data-qa-evidence-boundary]").count() > 0) { found = true; break; }
            const next = page.locator('[data-testid="next"]');
            if (await next.isDisabled()) break;
            await next.click();
            await page.waitForTimeout(150);
        }
        expect(found, "a scenario carrying an evidence boundary is reachable by walking").toBe(true);
        await expect(page.locator("[data-qa-evidence-boundary]")).toContainText(/./);
        /* And DEFERRED is offered on it. */
        await expect(page.locator('[data-testid="record-deferred"]')).toBeVisible();
    });

    test("it is usable at phone width", async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await openQa(page);
        await expect(page.locator('[data-qa-start="true"]'), "the primary control is reachable").toBeVisible();
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
