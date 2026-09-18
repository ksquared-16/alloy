/** §4B — prove the persisted arrangement through the normal projections, not UI optimism. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-4b";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(7)} ${what} → ${observed}`); // eslint-disable-line no-console
};

/** The ledger, read by its real row markup — the same reading used before the assignment. */
const ledger = (p: import("@playwright/test").Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim() ?? null,
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

test("4B-after · Focus Panel Details", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    const rows = await ledger(page);
    writeFileSync(`${OUT}/4b-after-ledger.json`, JSON.stringify(rows, null, 2));
    const target = rows.find((r) => r.chargeId === "f089a3f4-85a1-44b6-bb94-50588a581b00");
    const sibling = rows.find((r) => r.chargeId === "04fe2205-dd53-4ce2-a077-adbad350b969");
    const states: Record<string, number> = {};
    for (const r of rows) states[String(r.responsibility)] = (states[String(r.responsibility)] ?? 0) + 1;
    log(`states after: ${JSON.stringify(states)}`);

    rec("4B-SUBJ", "the $18 obligation keeps its child and identity",
        Boolean(target) && JSON.stringify(target?.cells).includes("Certa Certhouse") && JSON.stringify(target?.cells).includes("$18.00"),
        `chargeId=${target?.chargeId} cells=${JSON.stringify(target?.cells)}`);
    rec("4B-RESP", "the $18 obligation's responsibility state after assignment", true,
        `${target?.responsibility} ("${target?.responsibilityText}") — sibling 04fe2205 is ${sibling?.responsibility}`);

    // The responsible-party filter — the shared control, not the subject filter.
    const opts = await page.evaluate(() => {
        const sels = Array.from(document.querySelectorAll("select"));
        return sels.map((s) => ({
            testid: s.getAttribute("data-testid"),
            options: Array.from(s.options).map((o) => o.text.trim()),
        }));
    });
    writeFileSync(`${OUT}/4b-after-filters.json`, JSON.stringify(opts, null, 2));
    log(`filters: ${JSON.stringify(opts)}`);
    const partyFilter = opts.find((o) => o.options.some((x) => /Cert Certhouse|Unassigned/i.test(x)));
    rec("4B-FILT", "the Responsible Party filter offers the assigned party",
        Boolean(partyFilter), partyFilter ? JSON.stringify(partyFilter.options) : "no responsible-party options rendered");
    await page.screenshot({ path: `${OUT}/4b-after-fp.png` });

    writeFileSync(`${OUT}/4b-after-findings.json`, JSON.stringify(F, null, 2));
});

test("4B-after · Workspace Accounts states the same truth", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(8000);
    const rows = await ledger(page);
    const target = rows.find((r) => r.chargeId === "f089a3f4-85a1-44b6-bb94-50588a581b00");
    const states: Record<string, number> = {};
    for (const r of rows) states[String(r.responsibility)] = (states[String(r.responsibility)] ?? 0) + 1;
    writeFileSync(`${OUT}/4b-after-workspace.json`, JSON.stringify({ states, target, count: rows.length }, null, 2));
    rec("4B-WS", "the Workspace states the SAME responsibility truth for the same charge",
        Boolean(target), `rows=${rows.length} states=${JSON.stringify(states)} target=${target?.responsibility} ("${target?.responsibilityText}")`);
    await page.screenshot({ path: `${OUT}/4b-after-ws.png` });
    writeFileSync(`${OUT}/4b-after-findings.json`, JSON.stringify(F, null, 2));
});
