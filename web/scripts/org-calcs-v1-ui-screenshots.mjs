/**
 * Capture Organization Calculations V1 product screenshots with health checks.
 * Wizard steps use URL + session hydration; selected workspace uses an existing calculation.
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3014";
const STORAGE =
    process.env.PLAYWRIGHT_STORAGE_STATE
    || `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const EVIDENCE = path.resolve(
    process.cwd(),
    "../docs/sprints/07_2026/operational-calculations-product-realization/qa-evidence/org-calcs-v1",
);

async function healthy() {
    try {
        const res = await fetch(`${BASE}/login`);
        return res.status === 200 || res.status === 302 || res.status === 307;
    } catch {
        return false;
    }
}

async function gotoRetry(page, url, attempts = 6) {
    let last;
    for (let i = 0; i < attempts; i++) {
        if (!(await healthy())) {
            await new Promise((r) => setTimeout(r, 2000));
            continue;
        }
        try {
            await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
            return;
        } catch (e) {
            last = e;
            await page.waitForTimeout(2500);
        }
    }
    throw last ?? new Error("navigation failed");
}

async function main() {
    fs.mkdirSync(EVIDENCE, { recursive: true });
    if (!(await healthy())) throw new Error("Server not healthy");

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        storageState: STORAGE,
        viewport: { width: 1440, height: 900 },
    });
    const page = await context.newPage();

    await gotoRetry(page, `${BASE}/organization/calculations`);
    await page.getByTestId("organization-calculations-domain-home").waitFor({ timeout: 90_000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(EVIDENCE, "01-domain-home.png"), fullPage: true });

    // Wizard steps via URL (step query) + sessionStorage hydrate
    await page.evaluate(() => {
        sessionStorage.setItem(
            "org-calcs-wizard-v1",
            JSON.stringify({
                step: 1,
                name: "Product QA seats",
                description: "Lowest of physical and licensed.",
                productTypeId: "capacity_lowest_physical_licensed",
            }),
        );
    });
    await gotoRetry(page, `${BASE}/organization/calculations?view=new`);
    await page.getByTestId("organization-calculations-new-wizard").waitFor({ timeout: 90_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "02-new-wizard-type.png"), fullPage: true });

    await page.evaluate(() => {
        sessionStorage.setItem(
            "org-calcs-wizard-v1",
            JSON.stringify({
                step: 2,
                name: "Product QA seats",
                description: "Lowest of physical and licensed.",
                productTypeId: "capacity_lowest_physical_licensed",
            }),
        );
    });
    await gotoRetry(page, `${BASE}/organization/calculations?view=new&step=2`);
    await page.getByTestId("organization-calculations-wizard-info").waitFor({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "03-new-wizard-info.png"), fullPage: true });

    await page.evaluate(() => {
        sessionStorage.setItem(
            "org-calcs-wizard-v1",
            JSON.stringify({
                step: 3,
                name: "Product QA seats",
                description: "Lowest of physical and licensed.",
                productTypeId: "capacity_lowest_physical_licensed",
            }),
        );
    });
    await gotoRetry(page, `${BASE}/organization/calculations?view=new&step=3`);
    await page.getByTestId("organization-calculations-wizard-inputs").waitFor({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "04-new-wizard-inputs.png"), fullPage: true });

    await page.evaluate(() => {
        sessionStorage.setItem(
            "org-calcs-wizard-v1",
            JSON.stringify({
                step: 4,
                name: "Product QA seats",
                description: "Lowest of physical and licensed.",
                productTypeId: "capacity_lowest_physical_licensed",
            }),
        );
    });
    await gotoRetry(page, `${BASE}/organization/calculations?view=new&step=4`);
    await page.getByTestId("organization-calculations-wizard-preview").waitFor({ timeout: 60_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "05-new-wizard-preview.png"), fullPage: true });

    // Selected workspace from existing published calculation (API-backed list)
    const calcId = await page.evaluate(async () => {
        const list = await fetch("/api/admin/organization-calculations").then((r) => r.json());
        const published = (list.calculations || []).find((c) => c.lifecycle === "published");
        const any = published || (list.calculations || [])[0];
        return any?.id ?? null;
    });
    if (!calcId) throw new Error("No calculation available for selected workspace screenshots");

    await gotoRetry(page, `${BASE}/organization/calculations?view=collection&calculationId=${calcId}`);
    await page.getByTestId("organization-calculations-selected").waitFor({ timeout: 90_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "06-selected-overview.png"), fullPage: true });

    await page.getByTestId("organization-calculations-tab-definition").click();
    await page.getByTestId("organization-calculations-definition").waitFor();
    await page.screenshot({ path: path.join(EVIDENCE, "07-definition.png"), fullPage: true });

    await page.getByTestId("organization-calculations-tab-test").click();
    await page.getByTestId("organization-calculations-evaluate-card").waitFor();
    const roomSelect = page.getByTestId("organization-calculations-room-id");
    const opt = roomSelect.locator("option").first();
    if (await opt.count()) {
        await roomSelect.selectOption(await opt.getAttribute("value"));
    }
    await page.getByTestId("organization-calculations-effective-at").fill("2026-06-01");
    await page.getByTestId("organization-calculations-evaluate").click();
    await page.getByTestId("organization-calculations-eval-result").waitFor({ timeout: 90_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "08-test-result.png"), fullPage: true });

    await page.getByTestId("organization-calculations-tab-versions").click();
    await page.getByTestId("organization-calculations-versions-card").waitFor();
    await page.screenshot({ path: path.join(EVIDENCE, "09-versions.png"), fullPage: true });

    await page.getByTestId("organization-calculations-tab-usage").click();
    await page.getByTestId("organization-calculations-usage").waitFor();
    await page.screenshot({ path: path.join(EVIDENCE, "10-usage.png"), fullPage: true });

    await page.getByTestId("organization-calculations-tab-lifecycle").click();
    await page.getByTestId("organization-calculations-lifecycle").waitFor();
    await page.screenshot({ path: path.join(EVIDENCE, "11-lifecycle.png"), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoRetry(page, `${BASE}/organization/calculations`);
    await page.getByTestId("organization-calculations-product").waitFor({ timeout: 90_000 });
    await page.screenshot({ path: path.join(EVIDENCE, "12-narrow-layout.png"), fullPage: true });

    await browser.close();
    console.log(JSON.stringify({ ok: true, evidence: EVIDENCE, calcId }));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
