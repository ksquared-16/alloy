/**
 * §1–§3 — the specificity repair, on the ACTUAL product navigation.
 *
 * The harness was wrong three times, not the product. Corrected from the DOM contract:
 *   · Financials is MODAL-dispatched; the sidebar control is
 *     `[data-adminv2-sidebar-modal-nav="financials"]`, whose accessible name is the long title
 *     ("Financials — the financial work waiting on an operator…"), not "Financials".
 *   · account rows are `[data-financials-account-row=<customerId>]`
 *   · ledger rows are `[data-financials-ledger-row=<key>]`
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("specificity, mounted", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    const errors: string[] = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);

    const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]');
    const navCount = await nav.count();
    log(`sidebar financials control: ${navCount}`);
    if (navCount === 0) {
        /* An empty surface is usually an expired QA session, not a wrong selector. Say which. */
        log(`url is ${page.url()} — if this is /login the session expired`);
        writeFileSync(`${OUT}/specificity-mounted.json`, JSON.stringify({ blocked: "no sidebar control", url: page.url() }, null, 2));
        return;
    }
    /* force: a plain click is intercepted by the shell's own overlay. */
    await nav.first().click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(12_000);

    out.modal = await page.evaluate(() => ({
        accountRows: Array.from(document.querySelectorAll("[data-financials-account-row]")).map((e) => ({
            customerId: e.getAttribute("data-financials-account-row"),
            label: (e as HTMLElement).innerText.split("\n")[0]?.trim() ?? null,
        })),
        sections: Array.from(document.querySelectorAll("button"))
            .map((b) => (b as HTMLElement).innerText.trim()).filter((t) => t && t.length < 24).slice(0, 24),
    }));
    log(`ACCOUNT ROWS: ${JSON.stringify((out.modal as { accountRows: unknown[] }).accountRows)}`);
    log(`buttons: ${JSON.stringify((out.modal as { sections: string[] }).sections)}`);

    // The modal lands on Overview; Accounts is its own section tab.
    if ((out.modal as { accountRows: unknown[] }).accountRows.length === 0) {
        const acc = page.locator('[data-workspace-section-tab="accounts"]').first();
        log(`Accounts tab: ${await acc.count()}`);
        if (await acc.count()) { await acc.click({ force: true }).catch(() => {}); await page.waitForTimeout(12_000); }
        out.modal = await page.evaluate(() => ({
            accountRows: Array.from(document.querySelectorAll("[data-financials-account-row]")).map((e) => ({
                customerId: e.getAttribute("data-financials-account-row"),
                label: (e as HTMLElement).innerText.split("\n")[0]?.trim() ?? null,
            })),
            sections: [],
        }));
        log(`ACCOUNT ROWS (after): ${JSON.stringify((out.modal as { accountRows: unknown[] }).accountRows)}`);
    }

    const rows = (out.modal as { accountRows: Array<{ customerId: string; label: string }> }).accountRows;
    const cert = rows.find((r) => /Cert/i.test(r.label ?? "")) ?? rows[0];
    if (cert) {
        await page.locator(`[data-financials-account-row="${cert.customerId}"]`).first().click({ timeout: 15_000 }).catch((e) => log(`account click: ${e}`));
        await page.waitForTimeout(12_000);
    }
    out.detail = await page.evaluate(() => ({
        filterSlot: Boolean(document.querySelector("[data-financials-filter-slot]")),
        responsibleFilter: Boolean(document.querySelector("[data-testid='financials-filter-responsible-party']")),
        subjectFilter: Boolean(document.querySelector("[data-testid='financials-filter-subject']")),
        ledgerRows: Array.from(document.querySelectorAll("[data-financials-ledger-row]")).slice(0, 8).map((e) => ({
            key: e.getAttribute("data-financials-ledger-row"),
            text: (e as HTMLElement).innerText.replace(/\n+/g, " · ").slice(0, 120),
        })),
    }));
    log(`\nDETAIL: filterSlot=${(out.detail as Record<string, unknown>).filterSlot} responsibleFilter=${(out.detail as Record<string, unknown>).responsibleFilter}`);
    for (const r of (out.detail as { ledgerRows: Array<Record<string, string>> }).ledgerRows) log(`  ${r.key} · ${r.text}`);
    await page.screenshot({ path: `${OUT}/specificity-detail.png`, fullPage: true });
    log(`\nERRORS: ${JSON.stringify(errors.slice(0, 5))}`);
    writeFileSync(`${OUT}/specificity-mounted.json`, JSON.stringify({ ...out, errors }, null, 2));
});
