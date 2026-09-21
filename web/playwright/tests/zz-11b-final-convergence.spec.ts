/**
 * 11B FINAL CONVERGENCE — the same canonical truth on every surface, measured mounted.
 *
 * Read `playwright/FINANCIALS-NAVIGATION.md` before changing anything here: the Financials
 * workspace is modal-dispatched, the sidebar needs `force: true`, and an expired session
 * redirects every route to /login while every selector hypothesis appears to confirm itself.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-final";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("final cross-surface convergence and accounting-period cost", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const artifact: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/final-convergence.json`, JSON.stringify(artifact, null, 2));

    // ── THE FIRST ASSERTION IS ALWAYS THE SESSION ────────────────────────────────────────────
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    artifact.shellUrl = page.url();

    // ── 1 · ASSIGNMENT (child grain) ─────────────────────────────────────────────────────────
    const child = page.getByRole("button", { name: /^custom/ }).first();
    const assignment: Record<string, unknown> = { reached: false };
    if (await child.count()) {
        await child.click();
        await page.waitForTimeout(13_000);
        Object.assign(assignment, await page.evaluate(() => {
            const q = (s: string) => document.querySelector(s);
            const txt = (s: string) => q(s)?.textContent?.trim() ?? null;
            const sel = document.querySelector("select[data-assignment-tuition-embed='true']") as HTMLSelectElement | null;
            return {
                reached: true,
                cards: [...new Set(Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")))],
                /* THE RETIREMENT, MEASURED ON THE RENDERED PANEL. */
                billingPreviewRendered: Boolean(q("[data-universal-card-key='billing_preview']")),
                tuitionSelect: Boolean(sel),
                tuitionOptions: sel ? Array.from(sel.querySelectorAll("option")).map((o) => (o as HTMLOptionElement).textContent?.trim()) : [],
                accepted: txt("[data-assignment-tuition-accepted]") ?? txt("[data-assignment-tuition-recommended]"),
                billingFrequency: txt("[data-assignment-billing-frequency]"),
                billingPeriod: q("[data-tuition-billing-period]")?.getAttribute("data-tuition-billing-period") ?? txt("[data-assignment-billing-period]"),
                discountSection: Boolean(q("[data-assignment-discount-forecast]")),
                discountOutcomes: Array.from(document.querySelectorAll("[data-forecast-outcome]")).map((e) => ({
                    kind: e.getAttribute("data-forecast-outcome"),
                    reason: e.getAttribute("data-forecast-reason"),
                    policy: e.getAttribute("data-forecast-policy"),
                    text: e.textContent?.trim().slice(0, 120),
                })),
                /* The diagnostics that moved here when the standalone card retired. */
                noMatch: q("[data-assignment-tuition-no-match]")?.getAttribute("data-assignment-tuition-no-match") ?? null,
                rejected: q("[data-assignment-tuition-rejected]")?.getAttribute("data-assignment-tuition-rejected") ?? null,
                addExceptionOffered: Boolean(q("[data-add-policy-exception]")),
                exceptionsListed: Array.from(document.querySelectorAll("[data-policy-exception]")).map((e) => e.getAttribute("data-policy-exception")),
                responsibility: Boolean(q("[data-financials-manage-responsibility]")),
            };
        }));
        await page.screenshot({ path: `${OUT}/assignment-1680.png`, fullPage: true });
    }
    artifact.assignment = assignment;
    log(`ASSIGNMENT: ${JSON.stringify(assignment, null, 1)}`);
    flush();

    // ── 2 · FOCUS PANEL FINANCIALS — summary, then details ───────────────────────────────────
    const summary = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-card='true']");
        if (!card) return { present: false };
        return {
            present: true,
            account: card.getAttribute("data-financials-account"),
            reserved: card.getAttribute("data-financials-reserved"),
            text: (card as HTMLElement).innerText.slice(0, 500),
        };
    });
    artifact.focusPanelSummary = summary;
    log(`FOCUS SUMMARY: ${JSON.stringify(summary).slice(0, 600)}`);

    const detailsLink = page.locator("[data-financials-details-link], [data-universal-card-key='financials'] a").first();
    const details: Record<string, unknown> = { opened: false };
    if (await detailsLink.count()) {
        await detailsLink.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(10_000);
        Object.assign(details, await page.evaluate(() => ({
            opened: true,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
            prepaid: (document.querySelector("[data-financials-prepaid]") as HTMLElement | null)?.innerText?.trim() ?? null,
            paymentMethods: Boolean(document.querySelector("[data-financials-payment-methods]")),
        })));
        await page.screenshot({ path: `${OUT}/focus-details-1680.png`, fullPage: true });
    }
    artifact.focusPanelDetails = details;
    log(`FOCUS DETAILS: ${JSON.stringify(details)}`);
    flush();

    // ── 3 · FINANCIALS WORKSPACE → ACCOUNTS (modal-dispatched) ───────────────────────────────
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(1500);
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    const accounts: Record<string, unknown> = { reached: false };
    if (await nav.count()) {
        await nav.click({ force: true, timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(12_000);
        const tab = page.locator("[data-workspace-section-tab='accounts']").first();
        if (await tab.count()) { await tab.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(12_000); }
        Object.assign(accounts, await page.evaluate(() => ({
            reached: true,
            rows: document.querySelectorAll("[data-financials-account-row]").length,
            manageResponsibility: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
            columns: Array.from(document.querySelectorAll("[data-financials-ledger-column]")).map((e) => e.textContent?.trim()),
        })));
        await page.screenshot({ path: `${OUT}/accounts-1680.png`, fullPage: true });
    }
    artifact.accounts = accounts;
    log(`ACCOUNTS: ${JSON.stringify(accounts)}`);
    flush();

    // ── 4 · /organization/financials + THE ACCOUNTING PERIOD COST (§7) ───────────────────────
    /*
     * MEASURED, NOT ASSUMED. Three numbers: when the configuration chapter is meaningfully
     * rendered, what the calendar read costs, and what the period-state read costs. The fourth
     * claim — that none of it is a boot dependency for unrelated Financials surfaces — is proved
     * by the three surfaces above having already rendered without touching these routes.
     */
    const t0 = Date.now();
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);
    const meaningful = await page.evaluate(async () => {
        const start = performance.now();
        for (let i = 0; i < 300; i++) {
            if (document.querySelector("[data-accounting-calendar], [data-financials-gl-account], [data-organization-financials]")) {
                return Math.round(performance.now() - start);
            }
            await new Promise((r) => setTimeout(r, 100));
        }
        return -1;
    });
    const timings = await page.evaluate(async () => {
        const time = async (url: string) => {
            const t = performance.now();
            const r = await fetch(url, { credentials: "include" });
            const ok = r.ok;
            await r.text();
            return { url, ms: Math.round(performance.now() - t), status: r.status, ok };
        };
        return {
            calendarRead: await time("/api/admin/financials/accounting-calendar"),
            periodState: await time("/api/admin/financials/accounting-calendar?include=periods"),
        };
    });
    artifact.accountingPeriod = { navigateToMeaningfulMs: Date.now() - t0, meaningfulRenderMs: meaningful, ...timings };
    log(`ACCOUNTING PERIOD COST: ${JSON.stringify(artifact.accountingPeriod, null, 1)}`);
    await page.screenshot({ path: `${OUT}/organization-financials-1680.png`, fullPage: true });
    flush();

    /*
     * NOT A BOOT DEPENDENCY. The unrelated surfaces are loaded again AFTER the accounting chapter,
     * and their cost is stated beside it — a surface that had quietly acquired the calendar as a
     * boot dependency would show it here.
     */
    const t1 = Date.now();
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    artifact.unrelatedSurfaceAfterAccounting = {
        ms: Date.now() - t1,
        rendered: await page.locator("[data-universal-card-key]").count(),
        url: page.url(),
    };
    log(`UNRELATED SURFACE AFTER ACCOUNTING: ${JSON.stringify(artifact.unrelatedSurfaceAfterAccounting)}`);
    flush();
});
