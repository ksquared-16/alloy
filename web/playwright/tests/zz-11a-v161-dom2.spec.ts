/** The subject markers, read directly rather than through a truncated attribute sweep. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("subject markers", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    const out = await page.evaluate(() => {
        const one = (sel: string) => {
            const e = document.querySelector(sel);
            if (!e) return null;
            const o: Record<string, string> = { tag: e.tagName.toLowerCase() };
            for (const a of Array.from(e.attributes)) if (a.name.startsWith("data-")) o[a.name] = a.value.slice(0, 80);
            o._text = (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 120);
            return o;
        };
        const all = (sel: string) => Array.from(document.querySelectorAll(sel)).slice(0, 8).map((e) => {
            const o: Record<string, string> = { tag: e.tagName.toLowerCase() };
            for (const a of Array.from(e.attributes)) if (a.name.startsWith("data-")) o[a.name] = a.value.slice(0, 80);
            o._text = (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 90);
            return o;
        });
        return {
            queueRows: all("[data-queue-row-subject]"),
            bodySubject: one("[data-focus-panel-body-subject]"),
            identity: one("[data-focus-panel-subject-identity]"),
            inline: one("[data-inline-focus-panel-subject]"),
            financialsSubject: one("[data-financials-subject]"),
            attendanceSubject: one("[data-attendance-subject]"),
            childrenChildren: all("[data-children-child]"),
            focusedChild: one("[data-children-focused-child]"),
            tuition: one("[data-assignment-tuition]"),
        };
    });
    writeFileSync(`${OUT}/v161-dom2.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 2).slice(0, 6000));
});
