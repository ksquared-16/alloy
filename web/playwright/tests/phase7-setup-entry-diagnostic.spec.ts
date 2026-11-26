/**
 * Phase 7 — DIAGNOSTIC ONLY (not a certification spec). Determines the canonical product entry into
 * the document-to-form setup experience: which view/state renders after import + case open, and which
 * buttons/headings are available. Kept skipped in normal runs; run explicitly with --grep.
 */
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import { test, type Page } from "@playwright/test";
import { ensureAdminPlaywrightSession } from "../helpers/adminSessionAuth";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const FIXTURE_PDF = path.join(process.cwd(), "tests/fixtures/processing/enrollment-multisection-acroform.pdf");
const OUT = path.join(process.cwd(), "docs/sprints/active/phase-7-evidence/diagnostic");
const modal = (p: Page) => p.locator('[data-adminv2-bos-modal="adminv2-processing-modal"]');

async function dump(page: Page, label: string) {
    fs.mkdirSync(OUT, { recursive: true });
    const m = modal(page);
    const buttons = await m.getByRole("button").allInnerTexts().catch(() => []);
    const headings = await m.locator("h1,h2,h3,h4").allInnerTexts().catch(() => []);
    const tabs = await m.getByRole("tab").allInnerTexts().catch(() => []);
    const hasSetupCol = await m.locator('[data-testid^="review-question-"], [data-testid^="section-disposition-row-"]').count();
    const rec = {
        label,
        url: page.url(),
        tabs,
        headings: headings.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 25),
        buttons: [...new Set(buttons.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 40),
        setupColElements: hasSetupCol,
    };
    fs.appendFileSync(path.join(OUT, "diagnostic.log"), JSON.stringify(rec, null, 2) + "\n");
    await page.screenshot({ path: path.join(OUT, `${label}.png`), fullPage: true });
    // eslint-disable-next-line no-console
    console.log(`DIAG ${label}: tabs=${JSON.stringify(tabs)} setupEls=${hasSetupCol} buttons=${JSON.stringify(rec.buttons)}`);
}

test.describe("Phase 7 diagnostic — setup entry", () => {
    test.setTimeout(300_000);
    // Diagnostic only — retained for future debugging of the modal case-detail render; not a cert spec.
    test.skip("trace the document-to-form setup entry", async ({ page }) => {
        fs.rmSync(path.join(OUT, "diagnostic.log"), { force: true });
        page.on("console", (msg) => {
            const t = msg.text();
            // eslint-disable-next-line no-console
            if (t.includes("[TSC-STATE]") || msg.type() === "error") console.log(`PAGE[${msg.type()}]`, t.slice(0, 400));
        });
        page.on("pageerror", (err) => {
            // eslint-disable-next-line no-console
            console.log("PAGEERROR", (err.message || String(err)).slice(0, 500));
        });
        await ensureAdminPlaywrightSession(page);
        await page.locator('[data-adminv2-app-shell="workspace-v2"]').waitFor({ state: "visible", timeout: 120_000 });
        const trigger = page.getByRole("button", { name: /Processing — intake/i });
        await trigger.waitFor({ state: "visible", timeout: 120_000 });
        await trigger.scrollIntoViewIfNeeded();
        await trigger.click();
        try {
            await modal(page).waitFor({ state: "visible", timeout: 30_000 });
        } catch {
            await page.evaluate(() => window.dispatchEvent(new Event("adminv2:open-processing-modal")));
            await trigger.click();
            await modal(page).waitFor({ state: "visible", timeout: 60_000 });
        }
        await page.waitForTimeout(2500);
        await dump(page, "01-modal-open");

        // Switch to the Queue (work) view explicitly.
        const queueTab = modal(page).getByRole("tab", { name: /^Queue$/i });
        if (await queueTab.isVisible({ timeout: 5_000 }).catch(() => false)) await queueTab.click();
        await page.waitForTimeout(1500);
        await dump(page, "02-queue-view");

        // Expand the Incoming folder to reveal existing document cases.
        await modal(page).getByRole("button", { name: /^Incoming/i }).first().click().catch(() => {});
        await page.waitForTimeout(1200);
        await dump(page, "03-incoming-expanded");

        // Open the first existing case row and see what renders (setup column? work column? which buttons?).
        const firstCase = modal(page).locator("[data-processing-case-id]").first();
        const caseId = await firstCase.getAttribute("data-processing-case-id").catch(() => null);
        // eslint-disable-next-line no-console
        console.log(`DIAG opening caseId=${caseId}`);
        await firstCase.scrollIntoViewIfNeeded().catch(() => {});
        await firstCase.click().catch(() => {});
        await page.waitForTimeout(6000);
        await dump(page, "04-after-case-open");
        // Read the temporary render-branch instrumentation to know exactly which branch renders + why.
        const branchEl = modal(page).locator("[data-pos-branch]").first();
        const branch = await branchEl.getAttribute("data-pos-branch").catch(() => null);
        const hasDetail = await branchEl.getAttribute("data-pos-has-detail").catch(() => null);
        const primaryKind = await branchEl.getAttribute("data-pos-primary-kind").catch(() => null);
        const errorAttr = await branchEl.getAttribute("data-pos-error").catch(() => null);
        // eslint-disable-next-line no-console
        console.log(`DIAG BRANCH branch=${branch} hasDetail=${hasDetail} primaryKind=${primaryKind} error="${errorAttr}"`);
        // Definitive DOM check: page-level vs modal-scoped review-row presence + relevant testids.
        const pageRows = await page.locator('[data-testid^="review-question-"]').count();
        const modalRows = await modal(page).locator('[data-testid^="review-question-"]').count();
        const modalCount = await modal(page).count();
        const relevantTids = await page
            .locator("[data-testid]")
            .evaluateAll((els) =>
                els
                    .map((e) => e.getAttribute("data-testid") || "")
                    .filter((t) => /review-question|section-disposition|section-confidence|processing-native-form|review-inspector/.test(t))
                    .slice(0, 25)
            );
        // eslint-disable-next-line no-console
        console.log(`DIAG DOM pageRows=${pageRows} modalRows=${modalRows} modalMatches=${modalCount} tids=${JSON.stringify(relevantTids)}`);
        // Dump the full accessible tree of the case-detail region for exhaustive truth.
        const treeTxt = await modal(page).locator("body, *").first().innerText().catch(() => "");
        fs.writeFileSync(path.join(OUT, "case-detail-text.txt"), treeTxt.slice(0, 4000));
    });
});
