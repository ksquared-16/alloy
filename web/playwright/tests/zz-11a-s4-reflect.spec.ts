/** §7/§8/§9 — the filter, workspace parity, and reallocation reachability. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(5)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const RESOLVED = "907d1b64-09d5-4926-bed0-63d044c15441";
const HISTORICAL = "f089a3f4-85a1-44b6-bb94-50588a581b00";

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

test("S4 · filter, reallocation, and the Focus Panel reflection", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    const all = await ledger(page);
    const row = all.find((r) => r.chargeId === RESOLVED);
    rec("7-1", "the resolved obligation names its party in the projection",
        row?.responsibility === "named" && row?.responsibilityText === "Cert Certhouse",
        `${row?.responsibility} "${row?.responsibilityText}" child=${(row?.cells as string[])?.[2]} amount=${(row?.cells as string[])?.[4]}`);

    // §7 — the filter's own options, and what filtering to the party returns.
    const opts = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="financials-filter-responsible-party"]');
        return { present: !!el, text: (el as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null };
    });
    rec("7-2", "the Responsible Party filter is offered now that it divides the cohort", opts.present, JSON.stringify(opts));
    if (opts.present) {
        await page.locator('[data-testid="financials-filter-responsible-party"]').click();
        await page.waitForTimeout(2000);
        const choices = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[role='option'], [role='listbox'] *"))
                .map((e) => (e as HTMLElement).innerText?.trim()).filter((t) => t && t.length < 40));
        log(`choices: ${JSON.stringify([...new Set(choices)].slice(0, 10))}`);
        const cert = page.getByRole("option", { name: /Cert Certhouse/ }).first();
        if (await cert.count()) {
            await cert.click();
            await page.waitForTimeout(4000);
            const filtered = await ledger(page);
            const ids = filtered.map((r) => r.chargeId);
            rec("7-3", "filtering to the party returns the resolved obligation and excludes the rest",
                ids.includes(RESOLVED) && !ids.includes(HISTORICAL),
                `rows=${filtered.length} includesResolved=${ids.includes(RESOLVED)} includesUnassignedHistorical=${ids.includes(HISTORICAL)}`);
            await page.screenshot({ path: `${OUT}/s4-filtered.png` });
        } else {
            rec("7-3", "the party appears as a filter choice", false, JSON.stringify([...new Set(choices)].slice(0, 10)));
        }
    }

    // §9 — reallocation is now the offered command, and demands a reason.
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const rc = page.locator(`[data-financials-row-action="reallocateResponsibility"][data-charge-id="${RESOLVED}"]`).first();
    rec("9-1", "Resolve is no longer offered where Reallocate is appropriate", (await rc.count()) > 0
        && (await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${RESOLVED}"]`).count()) === 0,
        `reallocate=${await rc.count()} resolve=${await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${RESOLVED}"]`).count()}`);
    if (await rc.count()) {
        await rc.click();
        await page.waitForTimeout(4000);
        const shell = await page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            mode: document.querySelector("[data-financials-responsibility-mode]")?.getAttribute("data-financials-responsibility-mode") ?? null,
            reason: !!document.querySelector('[data-testid="responsibility-reason"]'),
            confirmDisabled: (document.querySelector('[data-testid="responsibility-confirm"]') as HTMLButtonElement | null)?.disabled ?? null,
        }));
        rec("9-2", "Reallocate opens and demands a reason before it will commit",
            shell.mode === "reallocate" && shell.reason && shell.confirmDisabled === true, JSON.stringify(shell));
        await page.screenshot({ path: `${OUT}/s4-reallocate.png` });
        await page.getByTestId("responsibility-cancel").click();
        await page.waitForTimeout(3000);
    }
    writeFileSync(`${OUT}/s4-reflect.json`, JSON.stringify(F, null, 2));
});

test("S4 · Workspace Accounts states the same truth", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(8000);
    const rows = await ledger(page);
    const row = rows.find((r) => r.chargeId === RESOLVED);
    const filters = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")));
    rec("8-1", "the Workspace states the same party, child and amount for the same charge",
        row?.responsibility === "named" && row?.responsibilityText === "Cert Certhouse",
        `${row?.responsibility} "${row?.responsibilityText}" child=${(row?.cells as string[])?.[2]} amount=${(row?.cells as string[])?.[4]}`);
    rec("8-2", "the Workspace offers the same Responsible Party filter and the same row command",
        filters.includes("financials-filter-responsible-party")
        && (row?.actions as string[])?.includes("reallocateResponsibility"),
        `filters=${JSON.stringify(filters)} actions=${JSON.stringify(row?.actions)}`);
    await page.screenshot({ path: `${OUT}/s4-workspace-parity.png` });
    writeFileSync(`${OUT}/s4-reflect.json`, JSON.stringify(F, null, 2));
});
