/** §6/§7 — resolve an obligation the arrangement in force actually covers, then prove reflection. */
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
const filters = (p: Page) => p.evaluate(() =>
    Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => ({
        id: e.getAttribute("data-testid"), text: (e as HTMLElement).innerText.trim().replace(/\s+/g, " ").slice(0, 60),
    })));

async function details(p: Page) {
    await p.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(13_000);
    await p.getByRole("button", { name: /^Details$/ }).first().click();
    await p.waitForTimeout(8000);
}

/** On/after Sep 18 2026 — the date the arrangement in force begins. */
const eligibleByDate = (cells: string[]) => {
    const m = /^([A-Z][a-z]{2}) (\d{1,2}), (\d{4})$/.exec(cells[0] ?? "");
    if (!m) return false;
    const month = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(m[1]!);
    const d = new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
    return d >= new Date(Date.UTC(2026, 8, 18));
};

test("S4 · resolve an eligible obligation and prove the reflection", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await details(page);
    const before = await ledger(page);
    const candidates = before.filter((r) =>
        (r.actions as string[]).includes("resolveResponsibility") && eligibleByDate(r.cells as string[]));
    log(`eligible candidates: ${candidates.length}`);
    for (const c of candidates.slice(0, 6)) log(`  ${c.chargeId} ${JSON.stringify(c.cells)}`);
    rec("6-1", "an obligation the arrangement in force covers is available and unallocated",
        candidates.length > 0, candidates.length ? JSON.stringify(candidates[0]?.cells) : "none dated on/after Sep 18");
    if (!candidates.length) { writeFileSync(`${OUT}/s4-eligible.json`, JSON.stringify(F, null, 2)); return; }

    const target = candidates[0]!;
    const chargeId = String(target.chargeId);
    const subjectBefore = (target.cells as string[])[2];

    await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${chargeId}"]`).first().click();
    await page.waitForTimeout(4000);
    await page.getByTestId("responsibility-preview-button").click();
    await page.waitForTimeout(6000);
    const prev = await page.evaluate(() => ({
        preview: (document.querySelector('[data-testid="responsibility-preview"]') as HTMLElement | null)?.innerText?.replace(/\n/g, " / ") ?? null,
        error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`preview: ${prev.preview} error: ${prev.error}`);
    rec("11-1", "the responsibility base comes from the engine: gross, reductions, then what is left",
        Boolean(prev.preview && /to divide/.test(prev.preview)), prev.preview ?? prev.error ?? "none");
    await page.screenshot({ path: `${OUT}/s4-eligible-preview.png` });

    await page.getByTestId("responsibility-confirm").click();
    await page.waitForTimeout(11_000);
    await page.screenshot({ path: `${OUT}/s4-eligible-after.png` });

    const after = await ledger(page);
    writeFileSync(`${OUT}/s4-eligible-after.json`, JSON.stringify(after, null, 2));
    const row = after.find((r) => r.chargeId === chargeId);
    rec("14-6", "the obligation becomes resolved and names its party",
        row?.responsibility === "named", `state=${row?.responsibility} party="${row?.responsibilityText}"`);
    rec("14-12", "the child it is for did not change",
        (row?.cells as string[])?.[2] === subjectBefore,
        `before="${subjectBefore}" after="${(row?.cells as string[])?.[2]}"`);
    rec("14-14", "a resolved obligation now offers Reallocate instead of Resolve",
        (row?.actions as string[])?.includes("reallocateResponsibility")
        && !(row?.actions as string[])?.includes("resolveResponsibility"),
        JSON.stringify(row?.actions));

    const f = await filters(page);
    log(`filters: ${JSON.stringify(f)}`);
    rec("14-8", "the Responsible Party filter appears now that it divides the cohort",
        f.some((x) => x.id === "financials-filter-responsible-party"), JSON.stringify(f));

    writeFileSync(`${OUT}/s4-eligible.json`, JSON.stringify({ chargeId, findings: F }, null, 2));
});
