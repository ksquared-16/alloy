/**
 * THE WALKTHROUGH SURVIVES A RELOAD — mounted, because the unit tests cannot prove this half.
 *
 * `directorQaSession` holds the storage rules and is tested directly. What it cannot show is that
 * the READER actually uses them: that the Director's position comes back, that a half-written
 * observation is still in the box, and that neither of those reaches the acceptance record before
 * a result is chosen. Those are properties of the mounted page, so they are proven on the mounted
 * page.
 *
 * Local by construction. `/dev/core-financials-qa` 404s on a hosted runtime by design, so this spec
 * runs against the slot's own server and never against staging.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = process.env.THREAD11A_STORAGE?.trim()
    || "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE_URL = process.env.THREAD11A_BASE_URL?.trim() || "http://127.0.0.1:3012";

test.use({ storageState: STORAGE, baseURL: BASE_URL });
test.describe.configure({ timeout: 180_000 });

const READER = "/dev/core-financials-qa";

async function openReader(page: Page) {
    await page.goto(READER);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator('[data-qa-reader="core-financials"]')).toBeVisible({ timeout: 60_000 });
}

/** Enter the walkthrough from the landing surface, wherever it says it will resume. */
async function start(page: Page) {
    const startBtn = page.locator('[data-qa-start="true"]');
    await expect(startBtn).toBeVisible({ timeout: 60_000 });
    await startBtn.click();
    await expect(page.locator("[data-qa-scenario]")).toBeVisible({ timeout: 30_000 });
}

async function scenarioKey(page: Page): Promise<string | null> {
    return page.locator("[data-qa-scenario]").getAttribute("data-qa-scenario");
}

test("a reload comes back on the same scenario, not at the beginning", async ({ page }) => {
    await openReader(page);
    await start(page);

    /* Walk forward so "where I was" is distinguishable from "the start". */
    await page.locator('[data-qa-action="next"]').click();
    await page.locator('[data-qa-action="next"]').click();
    const before = await scenarioKey(page);
    expect(before, "the walkthrough moved off its first scenario").toBeTruthy();

    await page.reload();
    await expect(page.locator("[data-qa-scenario]")).toBeVisible({ timeout: 60_000 });
    expect(await scenarioKey(page), "a reload is not a restart").toBe(before);
});

test("an unsubmitted observation survives a reload, and reaches no record", async ({ page }) => {
    await openReader(page);
    await start(page);
    const key = await scenarioKey(page);

    const note = `mounted draft probe ${Date.now()}`;
    await page.locator('[data-qa-observation="true"]').fill(note);
    await page.locator('[data-qa-classification="true"]').selectOption("CONFUSING_UX");
    /* The reader debounces its writes; give it its own interval rather than guessing. */
    await page.waitForTimeout(700);

    await page.reload();
    await expect(page.locator("[data-qa-scenario]")).toBeVisible({ timeout: 60_000 });
    expect(await scenarioKey(page), "still the same scenario").toBe(key);
    await expect(page.locator('[data-qa-observation="true"]'), "the words are still there").toHaveValue(note);
    await expect(page.locator('[data-qa-classification="true"]')).toHaveValue("CONFUSING_UX");

    /*
     * A DRAFT IS NOT TESTIMONY. Nothing partial may reach the acceptance record, so the scenario is
     * still whatever it was before any of this typing — not a recorded result.
     */
    const readiness = await page.request.get("/api/admin/qa/financials-director");
    const json = (await readiness.json()) as { results?: Array<{ scenario_key: string; observation: string | null }> };
    const recorded = (json.results ?? []).find((r) => r.scenario_key === key);
    expect(recorded?.observation ?? "", "an unsubmitted note is not in the record").not.toContain(note);

    /* Leave the box as it was found; the next run starts from a clean form. */
    await page.locator('[data-qa-observation="true"]').fill("");
    await page.locator('[data-qa-classification="true"]').selectOption("");
    await page.waitForTimeout(700);
});

test("the landing surface offers to resume where the work is, and says where", async ({ page }) => {
    await openReader(page);
    const startBtn = page.locator('[data-qa-start="true"]');
    await expect(startBtn).toBeVisible({ timeout: 60_000 });

    const source = await startBtn.getAttribute("data-qa-resume-source");
    const scenario = await startBtn.getAttribute("data-qa-resume-scenario");
    expect(["stored", "first_unaccepted", "start"], "the resume rule names its reason").toContain(source ?? "");
    expect(scenario, "and names the scenario it will open").toBeTruthy();

    await startBtn.click();
    expect(await scenarioKey(page), "and opens the one it named").toBe(scenario);
});

test("the reader says which data environment it is reading, without marketing chrome", async ({ page }) => {
    await openReader(page);
    /* The landing facts render once the environment has been read; wait for them, not for a clock. */
    await expect(page.locator('[data-qa-view="landing"]')).toBeVisible({ timeout: 60_000 });
    const body = await page.locator("body").innerText();

    /* Never silently present local fixture truth as staging truth. */
    expect(body).toMatch(/Environment/);
    expect(body).toMatch(/Data readiness/);
    expect(body).toMatch(/Navigation readiness/);

    /*
     * AND NOT INSIDE THE PUBLIC SITE. This page was inheriting the marketing header and footer, so
     * a Director reading a financial scenario also got Vision, About, Contact and GET STARTED
     * wrapped around it. A QA surface sits outside the product's chrome; the marketing site's is
     * not an improvement on the product's.
     */
    expect(await page.locator(".marketing-site-chrome").count(), "no marketing chrome").toBe(0);
    for (const word of ["GET STARTED", "Request a Demo"]) {
        expect(body, `the public site's ${word} does not belong on a QA script`).not.toContain(word);
    }
});
