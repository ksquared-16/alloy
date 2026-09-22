/**
 * §5/§6 — the specimen the operator-authorable arrangement can actually govern.
 *
 * `readArrangementInForce` takes the MOST SPECIFIC arrangement: a child-scoped one beats an
 * account-wide one. Certa's charges are therefore governed by a pre-existing CHILD-grain
 * arrangement whose fixed shares total $500.00, which no $25.00 obligation can satisfy — and the
 * operator panel authors HOUSEHOLD grain only. A household-grain obligation is matched only by
 * household-grain arrangements, which is exactly what an operator can author.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
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

test("S4 · a household obligation the household arrangement governs", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/actions/execute")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ request: req, response: body });
    });
    const dump = (tag: string) => writeFileSync(`${OUT}/s4-hh-${tag}.json`, JSON.stringify(wire, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const before = await ledger(page);
    const beforeIds = new Set(before.map((r) => r.chargeId));

    // ── A HOUSEHOLD-GRAIN OBLIGATION, dated today, through the certified Add command.
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4500);
    const tpl = page.locator('[data-financials-overlay="add_charge"] select').first();
    const names = await tpl.locator("option").allTextContents();
    const reg = names.findIndex((n) => /registration/i.test(n));
    await tpl.selectOption({ index: reg >= 0 ? reg : 0 });
    await page.waitForTimeout(3000);
    await page.locator('[data-financials-overlay="add_charge"] select').nth(1).selectOption({ label: "Household" });
    await page.waitForTimeout(3000);
    const shape = await page.evaluate(() => {
        const scope = document.querySelector('[data-financials-overlay="add_charge"]') as HTMLElement | null;
        const sels = Array.from(scope?.querySelectorAll("select") ?? []);
        return { grain: sels[1] ? sels[1].options[sels[1].selectedIndex]?.text : null, text: (scope?.innerText ?? "").slice(0, 400) };
    });
    log(`ADD grain=${shape.grain}`);
    await page.getByRole("button", { name: /^Add charge$/ }).first().click();
    await page.waitForTimeout(12_000);
    dump("after-add");

    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay")) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click();
        await page.waitForTimeout(9000);
    }
    const afterAdd = await ledger(page);
    const fresh = afterAdd.filter((r) => r.chargeId && !beforeIds.has(r.chargeId));
    /* Household grain renders with an em dash in the Child column — no child is named. */
    const household = afterAdd.filter((r) => /^(Household|—|-)$/.test(((r.cells as string[])[2] ?? "").trim())
        && (r.actions as string[]).includes("resolveResponsibility"));
    log(`fresh=${fresh.length} householdRowsOfferingResolve=${household.length}`);
    for (const h of household.slice(0, 5)) log(`  ${h.chargeId} ${JSON.stringify((h.cells as string[]).slice(0, 6))}`);
    writeFileSync(`${OUT}/s4-hh-rows.json`, JSON.stringify({ fresh, household }, null, 2));

    const target = (fresh[0] ?? household[0]) as Record<string, unknown> | undefined;
    if (!target) { log("NO HOUSEHOLD TARGET"); return; }
    const id = String(target.chargeId);
    const net = (target.cells as string[])[4];
    log(`TARGET ${id} net=${net} cells=${JSON.stringify(target.cells)}`);
    writeFileSync(`${OUT}/s4-hh-target.json`, JSON.stringify(target, null, 2));
});
