/** FINAL REMOUNT — Accounts reachability and the account switch. Read only; nothing is committed. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-remount";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

const SURFACE = () => {
    const q = (s: string) => document.querySelectorAll(s).length;
    const txt = (s: string) => { const e = document.querySelector(s) as HTMLElement | null; return e ? e.innerText.replace(/\s+/g, " ").trim().slice(0, 260) : null; };
    const rows = Array.from(document.querySelectorAll("[data-financials-account-row]")).map((e) => ({
        id: e.getAttribute("data-financials-account-row"),
        selected: e.getAttribute("data-financials-account-selected"),
        label: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 40),
    }));
    const backdrop = document.querySelector(".alloy-accounts-command-backdrop") as HTMLElement | null;
    const floor = document.querySelector('[data-financials-surface-role="floor"]') as HTMLElement | null;
    const box = (e: HTMLElement | null) => { if (!e) return null; const r = e.getBoundingClientRect();
        return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) }; };
    return {
        rows: rows.slice(0, 10),
        rowCount: rows.length,
        selectedRow: rows.find((r) => r.selected === "true")?.id ?? null,
        selectedLabel: rows.find((r) => r.selected === "true")?.label ?? null,
        floorPresent: q('[data-financials-surface-role="floor"]'),
        floorBox: box(floor),
        /* The whole point: is the scrim actually painted over the list? */
        backdropDisplay: backdrop ? getComputedStyle(backdrop).display : "absent",
        floorPosition: floor ? getComputedStyle(floor).position : "absent",
        detailRoot: q("[data-financials-detail='true']"),
        ledgerRows: q("[data-financials-ledger-row]"),
        kpis: txt("[data-financials-detail='true']"),
        payerRow: txt("[data-financials-payer-row='true']"),
        discountGear: q("[data-financials-manage-discounts='gear']"),
        managePayments: q("[data-financials-manage-payments='open']"),
        responsibilityGear: q("[data-financials-manage-responsibility='gear']"),
        responsibleFilter: q("[data-testid='financials-filter-responsible-party']"),
        lenses: txt("[data-financials-lenses='true']"),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
};

async function openAccounts(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']"), "the shared account surface").toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
}

test("§9 — Accounts opens, the list is live, and a different family opens ITS ledger", async ({ page }) => {
    await openAccounts(page);
    const landing = await page.evaluate(SURFACE);
    log(`LANDING ${JSON.stringify({ ...landing, rows: landing.rows.length }, null, 1)}`);
    save("A-landing", landing);
    await shot(page, "M1-accounts-landing");

    expect(landing.rowCount, "account rows are visible").toBeGreaterThan(1);
    expect(landing.detailRoot, "the first selected account's detail is visible").toBe(1);
    expect(landing.floorPresent, "and it is declared the floor").toBe(1);
    expect(landing.backdropDisplay, "NO command backdrop over the list").toBe("none");
    expect(landing.floorPosition, "the floor sits in the pane, not fixed over it").not.toBe("fixed");

    /* The hard gate: an ORDINARY click on a different family. */
    const target = landing.rows.find((r) => r.selected !== "true" && r.id !== landing.selectedRow)!;
    log(`SWITCHING from ${landing.selectedRow} (${landing.selectedLabel}) to ${target.id} (${target.label})`);
    const before = { selected: landing.selectedRow, kpis: landing.kpis, payerRow: landing.payerRow, ledgerRows: landing.ledgerRows };
    await page.locator(`[data-financials-account-row="${target.id}"]`).first().click({ timeout: 25_000 });
    await page.waitForTimeout(12_000);
    const after = await page.evaluate(SURFACE);
    log(`AFTER SWITCH ${JSON.stringify({ selectedRow: after.selectedRow, selectedLabel: after.selectedLabel, detailRoot: after.detailRoot, ledgerRows: after.ledgerRows, payerRow: after.payerRow, kpis: (after.kpis || "").slice(0, 120) }, null, 1)}`);
    save("A-after-switch", { before, target, after });
    await shot(page, "M2-after-account-switch");

    expect(after.selectedRow, "the selected row changed to the family clicked").toBe(target.id);
    expect(after.detailRoot, "the detail surface is still the shared one").toBe(1);
    expect(after.kpis, "the ledger is the NEW account's, not the old one's").not.toBe(before.kpis);
    expect(after.backdropDisplay, "still no scrim").toBe("none");
    /* Relationship and administration controls belong to the surface that is now shown. */
    expect(after.responsibilityGear + after.discountGear + after.managePayments, "admin controls present").toBeGreaterThan(0);
});

test("§8 — Focus Panel Financials reachability (platform settlement)", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(20_000);
    expect(page.url()).not.toContain("/login");
    const fp = await page.evaluate(() => ({
        card: document.querySelectorAll("[data-financials-card='true']").length,
        empty: document.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null,
        detailsDoor: document.querySelectorAll("[data-financials-details='true']").length,
        skeleton: document.querySelectorAll("[data-financials-card-skeleton='true']").length,
        attendance: document.querySelectorAll("[data-attendance-card], [data-card-key='attendance']").length,
        health: document.querySelectorAll("[data-health-card], [data-card-key='health_safety']").length,
    }));
    log(`FOCUS PANEL ${JSON.stringify(fp)}`);
    save("A-focus-panel", fp);
    await shot(page, "M3-focus-panel");
});
