/**
 * W7 Batch 1 — the semantic repairs, mounted on deployed f329419e9 (#1382).
 *
 * Every configured charge type is driven in turn, and for each the command's own fields are read:
 * Service Date (editable or stated), Billing Period, Due. One pass covers all three repairs and
 * all three occurs_on strategies, because the strategy is what makes the Service Date editable.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/semantics";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function reachAccounts(page: Page) {
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);
}

const readFields = (page: Page) => page.evaluate(() => {
    const field = (label: string) => {
        const f = [...document.querySelectorAll(".alloy-os-addcharge__field")]
            .find((e) => (e as HTMLElement).innerText.trim().toUpperCase().startsWith(label));
        if (!f) return null;
        const whole = (f as HTMLElement).innerText.replace(/\s+/g, " ").trim();
        return whole.replace(new RegExp("^" + label + "\\s*(REQUIRED)?\\s*", "i"), "").trim();
    };
    return {
        template: (document.querySelector("[data-testid='addcharge-template']") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        serviceDate: field("SERVICE DATE"),
        serviceDateEditable: !!document.querySelector("[data-addcharge-event-date]"),
        billingPeriod: field("BILLING PERIOD"),
        due: field("DUE"),
        amount: field("AMOUNT"),
        nativeDateInputs: document.querySelectorAll("input[type='date']").length,
        emojiInControl: /[\u{1F300}-\u{1FAFF}]/u.test(
            (document.querySelector("[data-addcharge-event-date]") as HTMLElement | null)?.innerHTML ?? ""),
    };
});

test("every charge type's Service Date, Billing Period and Due", async ({ page }) => {
    await reachAccounts(page);
    const target = await page.evaluate(() => {
        const rows = [...document.querySelectorAll("[data-financials-account-row]")];
        const pick = rows.find((r) => {
            const x = (r as HTMLElement).innerText;
            return /demo|automation|certfree|certopp/i.test(x) && !/certhouse|alvarez/i.test(x);
        });
        return pick?.getAttribute("data-financials-account-row") ?? null;
    });
    await page.locator(`[data-financials-account-row="${target}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(7_000);
    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);

    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    const options = await page.evaluate(() =>
        [...document.querySelectorAll("[role='option'], [data-alloy-select-option]")]
            .map((o) => (o as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean));
    log(`TEMPLATES: ${JSON.stringify(options)}`);
    /*
     * The dropdown is ALREADY OPEN here and must not be dismissed with Escape: escape-layer
     * ownership hands Escape to the command, so it closed the whole Add surface and the select
     * itself went away. The first option is chosen from the open list, and the list is reopened
     * only between iterations.
     */
    const rows: Record<string, unknown>[] = [];
    for (const [i, opt] of options.entries()) {
        if (i > 0) {
            await sel.click({ timeout: 20_000 });
            await page.waitForTimeout(1_200);
        }
        await page.locator("[role='option'], [data-alloy-select-option]")
            .filter({ hasText: opt }).first().click({ timeout: 20_000 });
        await page.waitForTimeout(9_000);
        const f = await readFields(page);
        log(`  ${opt.padEnd(26)} | svcDate=${String(f.serviceDate).padEnd(16)} editable=${String(f.serviceDateEditable).padEnd(5)} | period=${String(f.billingPeriod).padEnd(18)} | due=${f.due}`);
        rows.push({ option: opt, ...f });
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/semantics.json`, JSON.stringify(rows, null, 2));
    await page.screenshot({ path: `${OUT}/add-charge-semantics.png`, fullPage: true });

    /* ── DUE ─────────────────────────────────────────────────────────────────────────────── */
    const dues = rows.map((r) => String(r.due ?? ""));
    expect(dues.some((d) => /configured policy/i.test(d)), "no charge type still says 'Configured policy'").toBe(false);
    for (const d of dues) {
        expect(d === "No due date" || d === "—" || /\d/.test(d),
            `Due is a date, an honest absence, or NOT YET KNOWN — got "${d}"`).toBe(true);
    }

    /* ── BILLING PERIOD ──────────────────────────────────────────────────────────────────── */
    for (const r of rows) {
        const p = String(r.billingPeriod ?? "");
        expect(/^[A-Z][a-z]+ \d{4}$/.test(p) || /–/.test(p) || p === "",
            `a Billing Period is an interval, not an invoice date — got "${p}"`).toBe(true);
    }

    /* ── SERVICE DATE: editable exactly where the operator authors it ────────────────────── */
    const editable = rows.filter((r) => r.serviceDateEditable).map((r) => r.option);
    const stated = rows.filter((r) => !r.serviceDateEditable).map((r) => r.option);
    log(`SERVICE DATE editable for: ${JSON.stringify(editable)}`);
    log(`SERVICE DATE stated for  : ${JSON.stringify(stated)}`);
    expect(editable.length, "at least one event_date template offers the control").toBeGreaterThan(0);
    expect(stated.length, "and at least one derived template states it instead").toBeGreaterThan(0);
    for (const r of rows) {
        if (!r.serviceDateEditable) {
            expect(String(r.serviceDate ?? ""), "a stated Service Date still says something").not.toBe("");
        }
    }

    /* ── THE DATE CONTROL DRAWS ITS GLYPH ────────────────────────────────────────────────── */
    expect(rows.every((r) => r.nativeDateInputs === 0), "no native browser date input anywhere").toBe(true);
    expect(rows.some((r) => r.emojiInControl), "the calendar is drawn, not typed").toBe(false);
});
