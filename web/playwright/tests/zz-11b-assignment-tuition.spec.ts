/**
 * 11B §1/§3 — what the EXISTING Assignment Tuition control does, measured on the mounted product.
 *
 * Two questions: (1) do the offered options belong to THIS assignment, and (2) does selecting one
 * write an accepted term or a snapshot?
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the assignment tuition control", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const seen: Array<{ url: string; status: number }> = [];
    page.on("request", (r) => {
        const u = r.url().replace(/^https?:\/\/[^/]+/, "");
        if (/assignment-quote|pricing|financial-config|actions/.test(u)) seen.push({ url: `${r.method()} ${u}`, status: 0 });
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    // Certa's row, then the Scheduling card's editor.
    const certa = page.getByText(/Certa Certhouse/).first();
    log(`Certa rows: ${await certa.count()}`);
    if (await certa.count()) { await certa.click(); await page.waitForTimeout(10_000); }

    const open = page.locator("[data-scheduling-open]").first();
    log(`scheduling-open controls: ${await open.count()}`);
    if (await open.count()) { await open.click(); await page.waitForTimeout(7000); }

    // The editor is behind the detail surface; find whatever opens it.
    const editor = page.locator("[data-schedule-editor]");
    if (!(await editor.count())) {
        const btns = await page.locator("[data-schedule-surface] button").allInnerTexts();
        log(`no editor yet · buttons: ${JSON.stringify(btns.slice(0, 20))}`);
        const edit = page.getByRole("button", { name: /^(Edit|Change|Adjust)/ }).first();
        if (await edit.count()) { await edit.click(); await page.waitForTimeout(7000); }
    }

    const sel = page.locator("[data-assignment-tuition-embed='true']");
    const out = await page.evaluate(() => {
        const s = document.querySelector("[data-assignment-tuition-embed='true']") as HTMLSelectElement | null;
        return {
            present: Boolean(s),
            forChild: s?.getAttribute("data-assignment-tuition-plan") ?? null,
            options: s ? Array.from(s.options).map((o) => ({ value: o.value, text: o.text })) : [],
            editorOpen: Boolean(document.querySelector("[data-schedule-editor]")),
            surfaceText: (document.querySelector("[data-schedule-surface]") as HTMLElement | null)?.innerText?.replace(/\n+/g, " / ").slice(0, 700) ?? null,
        };
    });
    log(`select present: ${out.present} · editorOpen: ${out.editorOpen} · forChild: ${out.forChild}`);
    log(`OPTIONS: ${JSON.stringify(out.options, null, 1)}`);
    log(`SURFACE: ${out.surfaceText}`);
    if (await sel.count()) await sel.screenshot({ path: `${OUT}/assignment-tuition-select.png` }).catch(() => {});
    await page.screenshot({ path: `${OUT}/assignment-tuition.png`, fullPage: true });
    log(`\nREQUESTS: ${JSON.stringify(seen.map((s) => s.url))}`);
    writeFileSync(`${OUT}/assignment-tuition.json`, JSON.stringify({ ...out, requests: seen.map((s) => s.url) }, null, 2));
});
