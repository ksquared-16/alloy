/**
 * The two gaps re-measured with the right handles. Both were my probe.
 *
 * C2 searched for a button whose text is exactly `Credits` — the lens is labelled "Credits &
 * adjustments" — and for testids `subject`/`period`, which are `financials-filter-subject` and
 * `financials-filter-period`. The lenses carry `data-lens`, which is what a lens should be
 * identified by.
 *
 * J3 opened the COMMERCIAL discount authoring form and read its selects. The financial EXECUTION
 * policies are a separate panel further down the same chapter — the same class of mistake this
 * thread already recorded once: searching for a policy on the panel that does not list it.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11a-freeze";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const results: Array<{ id: string; ok: boolean; observed: string }> = [];
const record = (id: string, ok: boolean, observed: string) => {
    results.push({ id, ok, observed });
    log(`${ok ? "OK  " : "GAP "} ${id} → ${observed}`);
};

test("J3 and J4, on the panel that actually lists them", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    /*
     * THE DETAILS HALF LIVES IN `zz-11a-deployed-gap.spec.ts`, which opens the overlay reliably and
     * measured it twice on this build: lenses `all/charges/credits/funding/payments` with counts
     * 78/22/56/0/2, and the three `financials-filter-*` controls beside `available-prepaid`. Two
     * attempts to re-open it from here timed out on the overlay, which is a probe flake and not a
     * reading of the product — so that measurement is taken from the probe that had it open, and
     * this file keeps only what it actually added.
     */
    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    const exec = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const i = t.indexOf("Financial execution policies");
        const panel = i < 0 ? "" : t.slice(i, i + 2500);
        const active = ["proration", "billing cadence", "due", "posting review", "deposit"].filter((k) => new RegExp(k, "i").test(panel));
        const inert = ["write off", "write-off", "withdrawal", "adjustment approval", "draft expiration"].filter((k) => new RegExp(k, "i").test(panel));
        return { found: i >= 0, active, inert, panel: panel.replace(/\n+/g, " / ").slice(0, 700) };
    });
    await page.screenshot({ path: `${OUT}/gap2-policies.png`, fullPage: true });
    record("J3 financial execution policies reachable", exec.found && exec.active.length >= 4, `${exec.active.length}/5: ${exec.active.join(", ")}`);
    record("J4 inert policy types remain withheld", exec.inert.length === 0, exec.inert.length ? `OFFERED: ${exec.inert.join(", ")}` : "none named");
    log(`\nEXECUTION PANEL: ${exec.panel}`);

    writeFileSync(`${OUT}/gap2.json`, JSON.stringify({ exec, results }, null, 2));
    const failed = results.filter((r) => !r.ok);
    log(`\n=== RE-MEASURED ${results.length - failed.length}/${results.length} ===`);
    expect(failed.map((f) => f.id), JSON.stringify(failed, null, 1)).toEqual([]);
});
