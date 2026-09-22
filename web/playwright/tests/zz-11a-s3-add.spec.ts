/** Section 3 · multi-child Add economics and Adjustment mode, mounted. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s3";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};

async function details(p: Page) {
    await p.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(13_000);
    await p.getByRole("button", { name: /^Details$/ }).first().click();
    await p.waitForTimeout(8000);
}

test("multi-child economics and adjustment mode", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await details(page);
    await page.getByRole("button", { name: /^Add$/ }).first().click();
    await page.waitForTimeout(4000);

    // Choose a per-child charge type, then widen the selection.
    const tpl = page.locator("[data-financials-overlay='add_charge'] select").first();
    const options = await tpl.locator("option").allTextContents();
    rec("M0", "charge types offered", options.length > 0, options.join(" | ").slice(0, 120));
    const fieldTrip = options.findIndex((o) => /field trip/i.test(o));
    if (fieldTrip >= 0) { await tpl.selectOption({ index: fieldTrip }); await page.waitForTimeout(3000); }

    const boxes = page.locator("[data-addcharge-child]");
    const n = await boxes.count();
    rec("M1", "sibling selection reachable", n > 0, `${n} sibling checkbox(es)`);
    if (n > 0) {
        await boxes.first().check();
        await page.waitForTimeout(2500);
    }
    await page.screenshot({ path: `${OUT}/10-multichild.png` });

    const sum = await page.evaluate(() => {
        const el = document.querySelector("[data-addcharge-childsum]") as HTMLElement | null;
        const body = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return { summary: el?.innerText?.replace(/\n/g, " ") ?? null, text: (body?.innerText ?? "").slice(0, 700) };
    });
    rec("M2", "per-child economics stated", Boolean(sum.summary), sum.summary ?? "no summary line");
    rec("M3", "amount is PER CHILD, not a divided total", /per child/i.test(sum.summary ?? ""), sum.summary ?? "—");

    // ── ADJUSTMENT MODE on the same command surface
    // The mode control is a TABLIST — role="tab", not role="button". getByRole("button") cannot
    // see it, which is what made this read as a missing control rather than a wrong selector.
    const adjMode = page.locator('[data-financials-entry-mode-tab="adjustment"]').first();
    if (await adjMode.count()) {
        await adjMode.click();
        await page.waitForTimeout(3500);
        const st = await page.evaluate(() => ({
            mode: document.querySelector("[data-financials-entry-mode]")?.getAttribute("data-financials-entry-mode") ?? null,
            panel: !!document.querySelector('[data-testid="adjustment-panel"]'),
            agreement: (document.querySelector('[data-testid="adjustment-agreement"]') as HTMLSelectElement | null)?.value ?? null,
            sourceCharge: (document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null)?.value ?? null,
            sourceOptions: Array.from(document.querySelectorAll('[data-testid="adjustment-source-charge"] option')).length,
        }));
        rec("G1", "Adjustment mode opens on the SAME command surface", st.mode === "adjustment" && st.panel, JSON.stringify(st));
        rec("G2", "generic Adjustment demands explicit context", st.sourceCharge === "" && st.sourceOptions > 1,
            `sourceCharge="${st.sourceCharge}" options=${st.sourceOptions}`);
        await page.screenshot({ path: `${OUT}/11-adjustment-mode.png` });

        // Switching modes must not strand an empty surface.
        const back = page.locator('[data-financials-entry-mode-tab="charge"]').first();
        if (await back.count()) {
            await back.click(); await page.waitForTimeout(3000);
            const m = await page.evaluate(() => document.querySelector("[data-financials-entry-mode]")?.getAttribute("data-financials-entry-mode"));
            rec("G3", "switching modes leaves no empty intermediate surface", m === "charge", `mode=${m}`);
        }
    } else {
        rec("G1", "Adjustment mode reachable", false, "no Adjustment mode control");
    }

    writeFileSync(`${OUT}/add.json`, JSON.stringify(F, null, 2));
    console.log(`\n=== S3 ADD ${F.filter((f) => f.ok).length}/${F.length} ===`); // eslint-disable-line no-console
});
