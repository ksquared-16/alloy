/** §7 — resolve the eligible Sep 18 obligation and prove the reflection chain. */
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

test("S4 · resolve the eligible Sep 18 obligation", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await details(page);
    const rows = await ledger(page);
    const eligible = rows.filter((r) => /Sep 1[89], 2026|Sep 2[0-9], 2026/.test((r.cells as string[])[0] ?? "")
        && (r.actions as string[]).includes("resolveResponsibility"));
    log(`eligible on/after Sep 18: ${eligible.length}`);
    for (const e of eligible) log(`  ${e.chargeId} ${JSON.stringify((e.cells as string[]).slice(0, 6))}`);
    rec("6-1", "an obligation inside the arrangement in force is unallocated and offers Resolve",
        eligible.length > 0, eligible.length ? JSON.stringify((eligible[0]!.cells as string[]).slice(0, 6)) : "none");
    if (!eligible.length) { writeFileSync(`${OUT}/s4-final.json`, JSON.stringify(F, null, 2)); return; }

    const target = eligible[0]!;
    const id = String(target.chargeId);
    const childBefore = (target.cells as string[])[2];

    await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${id}"]`).first().click();
    await page.waitForTimeout(4000);
    await page.getByTestId("responsibility-preview-button").click();
    await page.waitForTimeout(6000);
    const prev = await page.evaluate(() => ({
        preview: (document.querySelector('[data-testid="responsibility-preview"]') as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null,
        error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`preview=${prev.preview} error=${prev.error}`);
    if (!prev.preview) { rec("7-0", "the action previews the allocatable net", false, String(prev.error)); return; }
    await page.getByTestId("responsibility-confirm").click();
    await page.waitForTimeout(11_000);

    if (await page.evaluate(() => document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay")) !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click();
        await page.waitForTimeout(9000);
    }
    const after = await ledger(page);
    writeFileSync(`${OUT}/s4-final-after.json`, JSON.stringify(after, null, 2));
    const row = after.find((r) => r.chargeId === id);
    log(`AFTER ${id}: ${JSON.stringify(row)}`);
    rec("14-6", "the obligation is resolved and names its responsible party",
        row?.responsibility === "named", `state=${row?.responsibility} party="${row?.responsibilityText}"`);
    rec("14-12", "the child it is for is unchanged", (row?.cells as string[])?.[2] === childBefore,
        `before="${childBefore}" after="${(row?.cells as string[])?.[2]}"`);
    rec("14-14", "a resolved obligation offers Reallocate, not Resolve",
        (row?.actions as string[])?.includes("reallocateResponsibility") && !(row?.actions as string[])?.includes("resolveResponsibility"),
        JSON.stringify(row?.actions));
    const f = await page.evaluate(() => Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")));
    rec("14-8", "the Responsible Party filter appears now that it divides the cohort",
        f.includes("financials-filter-responsible-party"), JSON.stringify(f));
    await page.screenshot({ path: `${OUT}/s4-final-resolved.png` });
    writeFileSync(`${OUT}/s4-final.json`, JSON.stringify({ id, findings: F }, null, 2));
});
