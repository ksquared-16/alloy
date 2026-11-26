/**
 * ACCOUNTS REACHABILITY — reproduce the operator path and MEASURE it. No source assumptions.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/accounts-reachability";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

const SURFACE = () => {
    const q = (s: string) => document.querySelectorAll(s).length;
    const txt = (s: string) => { const e = document.querySelector(s) as HTMLElement | null; return e ? e.innerText.replace(/\s+/g, " ").trim().slice(0, 200) : null; };
    const rows = Array.from(document.querySelectorAll("[data-financials-account-row]")).map((e) => ({
        id: e.getAttribute("data-financials-account-row"),
        selected: e.getAttribute("data-financials-account-selected"),
        state: e.getAttribute("data-financials-account-state"),
        label: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 60),
    }));
    return {
        url: location.pathname + location.search,
        accountRows: rows.length,
        rows: rows.slice(0, 8),
        selectedRow: rows.find((r) => r.selected === "true")?.id ?? null,
        detailRoot: q("[data-financials-detail='true']"),
        detailAccount: document.querySelector("[data-financials-card='true']")?.getAttribute("data-financials-account") ?? null,
        overlays: Array.from(document.querySelectorAll("[data-financials-overlay]")).map((e) => e.getAttribute("data-financials-overlay")),
        ledgerRows: q("[data-financials-ledger-row]"),
        periods: q("[data-financials-period]"),
        lenses: q("[data-financials-lenses='true']"),
        payerRow: q("[data-financials-payer-row='true']"),
        responsibleFilter: q("[data-testid='financials-filter-responsible-party']"),
        commandBackdrop: q("[data-financials-command-backdrop='true']"),
        skeleton: q("[data-financials-card-skeleton='true']"),
        emptyKind: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null,
        workspaceTab: document.querySelector("[data-workspace-section-tab][aria-selected='true'], [data-workspace-section-tab][data-active='true']")?.getAttribute("data-workspace-section-tab") ?? null,
        detailText: txt("[data-financials-detail='true']"),
    };
};

test("Financials Workspace -> Accounts -> open an account", async ({ page }) => {
    const net: string[] = [];
    const errs: string[] = [];
    page.on("response", (r) => { const u = r.url().replace(/https:\/\/[^/]+/, ""); if (/financ/i.test(u)) net.push(`${r.status()} ${u.slice(0, 130)}`); });
    page.on("requestfailed", (r) => errs.push(`FAILED ${r.url().replace(/https:\/\/[^/]+/, "").slice(0, 130)} ${r.failure()?.errorText ?? ""}`));
    page.on("console", (m) => { if (m.type() === "error") errs.push(`CONSOLE ${m.text().slice(0, 240)}`); });
    page.on("pageerror", (e) => errs.push(`PAGEERROR ${String(e).slice(0, 240)}`));

    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    log(`STEP 0 url=${page.url()}`);

    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    await expect(nav, "the Financials sidebar entry").toHaveCount(1, { timeout: 60_000 });
    await nav.click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    const afterModal = await page.evaluate(SURFACE);
    log(`STEP 1 modal open ${JSON.stringify(afterModal)}`);
    await shot(page, "R0-modal-overview");

    const tab = page.locator("[data-workspace-section-tab='accounts']").first();
    log(`accounts tab count=${await tab.count()}`);
    await tab.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    const onAccounts = await page.evaluate(SURFACE);
    log(`STEP 2 ON ACCOUNTS ${JSON.stringify(onAccounts, null, 1)}`);
    save("step2-on-accounts", onAccounts);
    await shot(page, "R1-accounts-landing");

    /* The operator act: click an account row that is NOT already selected. */
    const target = onAccounts.rows.find((r) => r.selected !== "true") ?? onAccounts.rows[0];
    log(`STEP 3 target=${JSON.stringify(target)}`);
    const before = { url: page.url(), detailRoot: onAccounts.detailRoot, selected: onAccounts.selectedRow, ledgerRows: onAccounts.ledgerRows };
    let clickError: string | null = null;
    if (target?.id) {
        const row = page.locator(`[data-financials-account-row="${target.id}"]`).first();
        try {
            await row.click({ timeout: 25_000 });
        } catch (e) {
            clickError = String(e).slice(0, 400);
            log(`STEP 3 ORDINARY CLICK REFUSED: ${clickError}`);
            /* Measure the forced click too — the difference names an interception defect. */
            await row.click({ force: true, timeout: 25_000 }).catch((e2) => { clickError += ` | forced: ${String(e2).slice(0, 200)}`; });
        }
    }
    await page.waitForTimeout(13_000);
    const after = await page.evaluate(SURFACE);
    log(`STEP 4 AFTER CLICK ${JSON.stringify(after, null, 1)}`);
    save("step4-after-click", { before, clickError, after });
    await shot(page, "R2-after-account-click");

    log(`NETWORK (financials): ${net.join(" | ") || "(none)"}`);
    log(`ERRORS: ${errs.join(" || ") || "(none)"}`);
    save("network-and-errors", { net, errs, clickError });
});
