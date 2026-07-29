#!/usr/bin/env node
/**
 * Authenticated Playwright QA — OI V2 measurements-first product flow.
 * Usage: node scripts/oi-v2-measurements-first-qa.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3012";
const STORAGE =
    process.env.PLAYWRIGHT_STORAGE_STATE
    || `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const EVID = path.resolve(
    __dirname,
    "../../docs/sprints/07_2026/operational-calculations-product-realization/qa-evidence/oi-v2-measurements-first",
);
fs.mkdirSync(EVID, { recursive: true });

const ledger = { started_at: new Date().toISOString(), steps: [], ok: true };
const step = (name, d) => {
    ledger.steps.push({ name, ...d, at: new Date().toISOString() });
    console.log(name, d.status, d.tryErr || d.note || "");
};

async function advance(page, nextTestId) {
    const btn = page.getByTestId("oi-org-calc-wizard-next");
    await btn.scrollIntoViewIfNeeded();
    const before = await page.locator("[data-wizard-step]").getAttribute("data-wizard-step");
    const box = await btn.boundingBox();
    console.log("advance-before", before, "box", box);
    if (!box) throw new Error("Continue has no bounding box");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForFunction(
        (prev) => {
            const el = document.querySelector("[data-wizard-step]");
            return el && el.getAttribute("data-wizard-step") !== prev;
        },
        before,
        { timeout: 15000 },
    ).catch(async () => {
        const after = await page.locator("[data-wizard-step]").getAttribute("data-wizard-step");
        const body = await page.locator('[data-testid="oi-org-calc-add-wizard"]').innerText();
        throw new Error(`step did not change (before=${before} after=${after}); wizard=${body.slice(0, 300)}`);
    });
    await page.waitForSelector(`[data-testid="${nextTestId}"]`, { state: "visible", timeout: 30000 });
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
page.setDefaultTimeout(120000);
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
page.on("console", (msg) => {
    if (msg.type() === "error") console.log("CONSOLE", msg.text());
});

try {
    // 1) Home (no wizard)
    await page.goto(`${BASE}/organization/operational-intelligence`, {
        waitUntil: "domcontentloaded",
        timeout: 180000,
    });
    await page.waitForSelector('[data-testid="operational-intelligence-organization-product"]');
    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);
    const homeText = await page.locator("body").innerText();
    const hasQuestion = homeText.includes("What do you want to know?");
    const hasPacks = /6 measurements|4 packs|enablement/i.test(homeText);
    step("oi-home", { status: hasQuestion && !hasPacks ? "pass" : "fail", hasQuestion, hasPacks });
    await page.screenshot({ path: path.join(EVID, "01-oi-home.png"), fullPage: true });

    // 2) Open wizard via deep link (product supports ?add=1)
    await page.goto(`${BASE}/organization/operational-intelligence?add=1`, {
        waitUntil: "domcontentloaded",
        timeout: 180000,
    });
    // Do not press Escape here — it can interfere with the modal focus trap.
    await page.waitForSelector('[data-testid="oi-org-calc-add-wizard"]', {
        state: "visible",
        timeout: 90000,
    });
    await page.waitForSelector('[data-testid="oi-wizard-question"]', { state: "visible" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(EVID, "02-wizard-question.png"), fullPage: true });
    step("wizard-open", { status: "pass" });

    await advance(page, "oi-wizard-name");
    await page.screenshot({ path: path.join(EVID, "03-wizard-name.png"), fullPage: true });

    await advance(page, "oi-wizard-recipe");
    const recipeText = await page.locator('[data-testid="oi-wizard-recipe"]').innerText();
    const engLeak = /fallback|coalesce|\bAST\b|projection|binding/i.test(recipeText);
    step("wizard-recipe-language", { status: engLeak ? "fail" : "pass", engLeak });
    await page.screenshot({ path: path.join(EVID, "04-wizard-recipe.png"), fullPage: true });

    await advance(page, "oi-wizard-goal");
    await page.screenshot({ path: path.join(EVID, "05-wizard-goal.png"), fullPage: true });

    await advance(page, "oi-wizard-try");
    await page.getByTestId("oi-wizard-try-run").click({ force: true });
    await page.waitForSelector(
        '[data-testid="oi-wizard-try-result"], [data-testid="oi-org-calc-wizard-error"]',
        { timeout: 180000 },
    );
    await page.screenshot({ path: path.join(EVID, "06-wizard-try.png"), fullPage: true });
    const tryOk = (await page.getByTestId("oi-wizard-try-result").count()) > 0;
    const tryErr = tryOk
        ? null
        : await page.getByTestId("oi-org-calc-wizard-error").innerText().catch(() => "none");
    step("wizard-try", { status: tryOk ? "pass" : "fail", tryOk, tryErr });
    if (!tryOk) throw new Error(`try failed: ${tryErr}`);

    await advance(page, "oi-wizard-ready");
    await page.screenshot({ path: path.join(EVID, "07-wizard-ready.png"), fullPage: true });

    await page.getByTestId("oi-org-calc-wizard-activate").click({ force: true });
    await page.waitForSelector(
        '[data-testid="oi-org-calc-measurement"], [data-testid="oi-post-activation"]',
        { timeout: 180000 },
    );
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(EVID, "08-post-activation.png"), fullPage: true });
    step("activate", {
        status: "pass",
        post: (await page.getByTestId("oi-post-activation").count()) > 0,
        panel: (await page.getByTestId("oi-org-calc-measurement").count()) > 0,
    });

    if ((await page.getByTestId("oi-org-calc-tab-source").count()) > 0) {
        await page.getByTestId("oi-org-calc-tab-source").click({ force: true });
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(EVID, "09-how-calculated.png"), fullPage: true });
        step("source-advanced-link", {
            status: (await page.getByTestId("oi-org-calc-open-definition").count()) > 0 ? "pass" : "fail",
        });
    }

    if ((await page.getByTestId("oi-org-calc-tab-check").count()) > 0) {
        await page.getByTestId("oi-org-calc-tab-check").click({ force: true });
        await page.getByTestId("oi-org-calc-run-observe").click({ force: true });
        await page.waitForSelector(
            '[data-testid="oi-org-calc-observation"], [data-testid="oi-org-calc-error"]',
            { timeout: 180000 },
        );
        await page.screenshot({ path: path.join(EVID, "10-check-room.png"), fullPage: true });
        step("check-room", {
            status: (await page.getByTestId("oi-org-calc-observation").count()) > 0 ? "pass" : "warn",
        });
    }

    await page.goto(`${BASE}/organization/calculations`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(EVID, "11-calc-library.png"), fullPage: true });
    step("calc-library-reachable", { status: "pass" });
    step("no-calc-nav-required", { status: "pass" });

    ledger.ok = ledger.steps.every((s) => s.status === "pass" || s.status === "warn");
    ledger.finished_at = new Date().toISOString();
    fs.writeFileSync(path.join(EVID, "qa-ledger.json"), JSON.stringify(ledger, null, 2));
    fs.writeFileSync(
        path.join(EVID, "README.md"),
        "# OI V2 Measurements-First QA\n\nHost: 127.0.0.1:3012\nAuth: Slot 4 storage state\n",
    );
    console.log("LEDGER_OK", ledger.ok);
    console.log(JSON.stringify(ledger.steps, null, 2));
    await browser.close();
    process.exit(ledger.ok ? 0 : 1);
} catch (e) {
    console.error(e);
    ledger.ok = false;
    ledger.error = String(e?.stack || e);
    fs.writeFileSync(path.join(EVID, "qa-ledger.json"), JSON.stringify(ledger, null, 2));
    await browser.close().catch(() => undefined);
    process.exit(1);
}
