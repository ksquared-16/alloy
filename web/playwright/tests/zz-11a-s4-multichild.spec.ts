/** §6/§7/§12 — two obligations from ONE Add, each independently resolvable. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const ledger = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim() ?? null,
            actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

async function details(p: Page) {
    await p.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(13_000);
    await p.getByRole("button", { name: /^Details$/ }).first().click();
    await p.waitForTimeout(8000);
}

test("S4 · one Add, two obligations, two independent resolutions", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await details(page);
    const before = await ledger(page);
    const beforeIds = new Set(before.map((r) => r.chargeId));

    // ── ONE MULTI-CHILD ADD, through the command already certified in Section 3.
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    /*
     * LATE PICKUP, not Field trip: it is "dated today · billed immediately", so the obligation
     * lands on today's date — inside the arrangement in force — and needs no service date. Field
     * trip declares SERVICE DATE REQUIRED, and leaving it empty is why the first attempt committed
     * nothing at all.
     */
    const pick = names.findIndex((n) => /late pickup/i.test(n));
    await tpl.selectOption({ index: pick >= 0 ? pick : 0 });
    await page.waitForTimeout(3000);
    // Anchor on a child, then widen to the sibling.
    const grain = page.locator('[data-financials-overlay="add_charge"] select').nth(1);
    await grain.selectOption({ label: "Certa Certhouse" }).catch(() => undefined);
    await page.waitForTimeout(3000);
    const boxes = page.locator("[data-addcharge-child]");
    if (await boxes.count()) { await boxes.first().check(); await page.waitForTimeout(2500); }
    const sum = await page.evaluate(() => (document.querySelector("[data-addcharge-childsum]") as HTMLElement | null)?.innerText?.replace(/\n/g, " ") ?? null);
    log(`childsum: ${sum}`);
    await page.screenshot({ path: `${OUT}/s4-mc-add.png` });
    const addBtn = page.getByRole("button", { name: /^Add charge$/ }).first();
    log(`add disabled: ${await addBtn.isDisabled().catch(() => "n/a")}`);
    await addBtn.click();
    await page.waitForTimeout(12_000);
    log(`post-add overlay: ${await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null)}`);
    log(`post-add error: ${await page.evaluate(() => (document.querySelector("[data-financials-command-error], .alloy-os-fdetail__moveerror") as HTMLElement | null)?.innerText ?? null)}`);
    await page.screenshot({ path: `${OUT}/s4-mc-added.png` });

    /*
     * The command surface DISMISSES on success and the card returns to its resting state, which has
     * no ledger at all — reading here found zero rows and said the Add had done nothing. Re-open
     * Details before asking what exists.
     */
    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click();
        await page.waitForTimeout(9000);
    }
    const afterAdd = await ledger(page);
    const fresh = afterAdd.filter((r) => r.chargeId && !beforeIds.has(r.chargeId));
    log(`rows before=${before.length} after=${afterAdd.length} new=${fresh.length}`);
    log(`notice: ${await page.evaluate(() => (document.querySelector("[data-financials-notice], .alloy-os-financials__note") as HTMLElement | null)?.innerText ?? null)}`);
    log(`todays rows: ${JSON.stringify(afterAdd.filter((r) => /Sep 18, 2026/.test((r.cells as string[])[0] ?? "")).map((r) => (r.cells as string[]).slice(0, 5)))}`);
    for (const r of fresh) log(`  ${r.chargeId} ${JSON.stringify(r.cells)} actions=${JSON.stringify(r.actions)}`);
    writeFileSync(`${OUT}/s4-mc-new.json`, JSON.stringify(fresh, null, 2));
    rec("12-1", "one Add produced N independent obligations, one per child",
        fresh.length >= 2, `${fresh.length} new rows · children=${JSON.stringify(fresh.map((r) => (r.cells as string[])[2]))}`);
    rec("12-2", "no household responsibility was manufactured from one gesture",
        fresh.every((r) => r.responsibility !== "named"),
        JSON.stringify(fresh.map((r) => r.responsibility)));

    // ── RESOLVE EACH, INDEPENDENTLY.
    const resolved: string[] = [];
    for (const r of fresh.slice(0, 2)) {
        const id = String(r.chargeId);
        const ctl = page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${id}"]`).first();
        if (!(await ctl.count())) { log(`no resolve control for ${id}`); continue; }
        await ctl.click();
        await page.waitForTimeout(4000);
        await page.getByTestId("responsibility-preview-button").click();
        await page.waitForTimeout(6000);
        const p2 = await page.evaluate(() => ({
            preview: (document.querySelector('[data-testid="responsibility-preview"]') as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null,
            error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
        }));
        log(`  ${id} preview=${p2.preview} error=${p2.error}`);
        if (!p2.preview) { log(`  refused: ${p2.error}`); await page.getByTestId("responsibility-cancel").click(); await page.waitForTimeout(3000); continue; }
        await page.getByTestId("responsibility-confirm").click();
        await page.waitForTimeout(10_000);
        resolved.push(id);
    }

    const finalRows = await ledger(page);
    writeFileSync(`${OUT}/s4-mc-final.json`, JSON.stringify(finalRows, null, 2));
    const named = finalRows.filter((r) => resolved.includes(String(r.chargeId)) && r.responsibility === "named");
    rec("14-6", "each resolved obligation names its party", named.length === resolved.length && resolved.length > 0,
        `resolved=${resolved.length} named=${named.length} parties=${JSON.stringify(named.map((r) => r.responsibilityText))}`);
    rec("12-3", "the two children's obligations resolved independently, each keeping its own child",
        named.length >= 2 && new Set(named.map((r) => (r.cells as string[])[2])).size >= 2,
        JSON.stringify(named.map((r) => [(r.cells as string[])[2], r.responsibilityText, (r.cells as string[])[4]])));

    const f = await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")));
    rec("14-8", "the Responsible Party filter appears once it divides the cohort",
        f.includes("financials-filter-responsible-party"), JSON.stringify(f));
    await page.screenshot({ path: `${OUT}/s4-mc-resolved.png` });
    writeFileSync(`${OUT}/s4-mc-findings.json`, JSON.stringify({ resolved, findings: F }, null, 2));
});
