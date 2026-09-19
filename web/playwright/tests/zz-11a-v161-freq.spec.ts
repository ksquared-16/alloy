/**
 * §5 — WEEKLY BILLING FREQUENCY, through the operator's own configuration authority.
 *
 * Recon first, then act in the same pass: the sub-nav item is a link in the Tuition chapter's own
 * navigation ("Plans / Enrollment Commitments / Billing Frequencies"), not a role=tab, which is a
 * distinction that has cost this thread probes before.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("billing frequencies surface", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/settings/organization/financials?chapter=tuition", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);

    const nav = page.getByText("Billing Frequencies", { exact: true }).first();
    log(`nav matches: ${await page.getByText("Billing Frequencies", { exact: true }).count()}`);
    await nav.click({ timeout: 10_000 }).catch((e) => log(`click failed: ${String(e).slice(0, 120)}`));
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${OUT}/freq-surface.png`, fullPage: true });

    const shape = await page.evaluate(() => ({
        url: location.pathname + location.search,
        text: (document.body.innerText || "").replace(/\n+/g, " / ").slice(0, 2500),
        buttons: [...new Set(Array.from(document.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean))].slice(0, 40),
        rows: Array.from(document.querySelectorAll("[data-billing-frequency],[data-frequency-row],[data-frequency-key]")).map((e) => {
            const o: Record<string, string> = {};
            for (const a of Array.from(e.attributes)) if (a.name.startsWith("data-")) o[a.name] = a.value;
            o._text = (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 80);
            return o;
        }),
        inputs: Array.from(document.querySelectorAll("input,select,textarea")).map((i) => ({
            tag: i.tagName.toLowerCase(),
            type: (i as HTMLInputElement).type ?? null,
            id: i.getAttribute("data-testid") ?? i.getAttribute("name") ?? i.getAttribute("placeholder") ?? i.getAttribute("aria-label"),
            options: i.tagName === "SELECT" ? Array.from((i as HTMLSelectElement).options).map((o) => o.text.trim()).slice(0, 14) : undefined,
        })).slice(0, 25),
    }));
    writeFileSync(`${OUT}/freq-surface.json`, JSON.stringify(shape, null, 2));
    log(`URL: ${shape.url}`);
    log(`BUTTONS: ${shape.buttons.join(" | ").slice(0, 900)}`);
    log(`ROWS: ${JSON.stringify(shape.rows).slice(0, 900)}`);
    log(`INPUTS: ${JSON.stringify(shape.inputs).slice(0, 900)}`);
    log(`TEXT: ${shape.text.slice(0, 1800)}`);
});
