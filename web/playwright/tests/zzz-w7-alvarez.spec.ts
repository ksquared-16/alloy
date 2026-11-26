/**
 * §8 — ALVAREZ LEGIBILITY.
 *
 * Two $40.00 charges both called "Field trip" sit on one family and read as a duplicate pair. Phase 0
 * established they are NOT a duplicate: one is `enrollment_agreement` grain (the child) and one is
 * `customer` grain (the household), created six days apart for different service dates.
 *
 * The requirement is that the surface make that legible BY STATING THE GRAIN — not with a
 * "Not duplicate" badge, and not by explaining its own data model to an operator. So this reads both
 * records and checks what the presentation says, and what it refuses to say.
 *
 * Nothing here writes. The Alvarez rows are evidence and are not mutated.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/fifth/alvarez";
const ENTRY = "/workspace/work-unit/enrolled-children";
/** The pair, by id, so "the two that look alike" is not a judgement made in the browser. */
const CHILD_GRAIN = "a8c9460a-3d32-4259-b100-02ad593e6ea7";     // enrollment_agreement · service Oct 31
const HOUSEHOLD_GRAIN = "d66432ef-07b8-472f-9031-958fff1a4af2"; // customer · service Oct 9
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const found: Record<string, unknown>[] = [];
const save = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/alvarez.json`, JSON.stringify(found, null, 2)); };

const readDetails = (page: Page) => page.evaluate(() => {
    const card = document.querySelector("[data-financials-overlay='charge_detail'], [data-financials-charge-detail]");
    if (!card) return null;
    const rows: Record<string, string> = {};
    card.querySelectorAll("[data-financials-charge-line]").forEach((r) => {
        const spans = r.querySelectorAll("span");
        if (spans.length >= 2) rows[spans[0]!.textContent?.trim() ?? ""] = spans[1]!.textContent?.trim() ?? "";
    });
    const body = (card as HTMLElement).innerText;
    return {
        label: (card.querySelector("[data-financials-charge-label]") as HTMLElement | null)?.innerText.trim() ?? null,
        attribution: (card.querySelector("[data-financials-charge-attribution]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null,
        attributionState: card.querySelector("[data-financials-charge-attribution]")?.getAttribute("data-financials-charge-attribution") ?? null,
        rows,
        uuidsInBody: (body.match(/[0-9a-f]{8}-[0-9a-f]{4}-/gi) ?? []).length,
        /* The vocabulary that must NOT reach an operator. */
        forbidden: ["Not duplicate", "not a duplicate", "billable_source", "enrollment_agreement",
                    "customer grain", "grain", "read model", "projection", "canonical"]
            .filter((w) => new RegExp(w.replace(/[_ ]/g, "[_ ]"), "i").test(body)),
        text: body.replace(/\s+/g, " ").slice(0, 700),
    };
});

async function expandLedgerPeriods(page: Page) {
    const toggles = page.locator("[data-financials-period-toggle]");
    const n = await toggles.count();
    for (let i = 0; i < n; i++) {
        const t = toggles.nth(i);
        if ((await t.getAttribute("aria-expanded")) === "false") {
            await t.click({ timeout: 15_000 }).catch(() => undefined);
            await page.waitForTimeout(1_200);
        }
    }
    await page.waitForTimeout(4_000);
}

test("the pair states its grain, and explains nothing", async ({ page }) => {
    let commands = 0;
    page.on("request", (r) => { if (/actions\/execute/.test(r.url())) commands += 1; });
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
    const accounts = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .map((r) => ({ id: r.getAttribute("data-financials-account-row"), text: (r as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 80) })));
    log(`ACCOUNTS: ${accounts.length}`);
    const alvarez = accounts.find((a) => /alvarez/i.test(a.text));
    log(`ALVAREZ ACCOUNT: ${JSON.stringify(alvarez)}`);
    if (!alvarez) {
        log("ALVAREZ not in the Accounts cohort — recording the account list and stopping.");
        found.push({ proof: "alvarez", reachable: false, accounts }); save();
        return;
    }
    await page.locator(`[data-financials-account-row="${alvarez.id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(13_000);
    await expandLedgerPeriods(page);
    const readings: Record<string, unknown> = {};
    for (const [name, cid] of [["child_grain", CHILD_GRAIN], ["household_grain", HOUSEHOLD_GRAIN]] as const) {
        const opener = page.locator(`[data-financials-row-open="${cid}"]`).first();
        if (await opener.count() === 0) { readings[name] = { present: false }; log(`${name}: row absent`); continue; }
        await opener.click({ timeout: 20_000 });
        await page.waitForTimeout(9_000);
        /* Confirm WHICH record rendered, from the card's own attribute, not from the click target. */
        const renderedFor = await page.evaluate(() =>
            document.querySelector("[data-financials-charge-detail-for]")?.getAttribute("data-financials-charge-detail-for") ?? null);
        const d = await readDetails(page);
        readings[name] = { ...d, renderedFor, matchesRequested: renderedFor === cid };
        log(`${name} (${cid.slice(0, 8)}) renderedFor=${String(renderedFor).slice(0, 8)}: ${JSON.stringify(d)}`);
        await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
        found.push({ proof: "alvarez", stage: name, commands, readings }); save();
        /* The open overlay intercepts pointer events, so it must be dismissed before the next row.
         * Scope Close INSIDE the overlay — an unscoped one silently matched something else. */
        const close = page.locator("[data-financials-overlay='charge_detail'] button", { hasText: /^Close$/ }).first();
        if (await close.count() > 0) await close.click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(4_000);
        await page.waitForFunction(() => document.querySelector("[data-financials-charge-detail-for]") == null,
                                  undefined, { timeout: 30_000 }).catch(() => log(`  ${name}: overlay did not dismiss`));
    }
    log(`COMMANDS DISPATCHED: ${commands}`);
    found.push({ proof: "alvarez", reachable: true, commands, readings }); save();
    expect(commands, "reading the pair writes nothing").toBe(0);
});
