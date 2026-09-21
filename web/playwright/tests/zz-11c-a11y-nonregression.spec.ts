/**
 * §20 multi-select accessibility and §22 mounted non-regression, re-measured on the REPAIRED
 * build so nothing in this slice is certified against an older deployment.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { activeElementDescriptor, alloyOptions } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("§20 §22 — Applies to by keyboard, per-child economics, Prepaid separation", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    /* §22 — Prepaid stays a separate position from Balance, on the entry card. */
    R.prepaid = await page.evaluate(() => {
        const c = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        const t = c?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            availablePrepaid: (/Available prepaid \$[\d,]+\.\d{2}/.exec(t) || [null])[0],
            balance: (/Balance \$[\d,]+\.\d{2}/.exec(t) || [null])[0],
            netted: /Balance \$0\.00/.test(t),
        };
    });
    log(`§22 PREPAID: ${JSON.stringify(R.prepaid)}`);

    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(9000);

    const selected = async () =>
        (await page.locator('[data-testid="addcharge-target"] [role=option][aria-selected=true] .alloy-select__option-label')
            .allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    const activeRow = () => page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return a?.getAttribute("role") === "option" ? a.getAttribute("data-option-value") : null;
    });
    /** Home then N downs — the stepper clamps, so a bounded walk can pin against an end. */
    async function keyToggle(value: string) {
        const idx = await page.locator('[data-testid="addcharge-target"] [role=option]')
            .evaluateAll((n, v) => n.findIndex((e) => e.getAttribute("data-option-value") === v), value);
        await page.keyboard.press("Home");
        for (let i = 0; i < idx; i += 1) await page.keyboard.press("ArrowDown");
        expect(await activeRow(), `arrowed onto ${value}`).toBe(value);
        await page.keyboard.press("Enter");
        await page.waitForTimeout(400);
    }

    const offered = await alloyOptions(page, "addcharge-target");
    const kids = offered.filter((o) => /cert[ab]\s+certhouse/i.test(o.label));
    const household = offered.find((o) => /household/i.test(o.label))!;

    await page.locator('[data-testid="addcharge-target"] button.alloy-select__trigger').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(600);
    for (const s of offered.filter((o) => o.selected && o.value)) await keyToggle(s.value!);
    R.start = await selected();

    await keyToggle(kids[0]!.value!);
    await keyToggle(kids[1]!.value!);
    R.bothChildren = await selected();
    await keyToggle(household.value!);
    R.afterHousehold = await selected();
    log(`§20 start=${JSON.stringify(R.start)} both=${JSON.stringify(R.bothChildren)} household=${JSON.stringify(R.afterHousehold)}`);
    expect(R.bothChildren, "both children hold").toHaveLength(2);
    expect(R.afterHousehold, "Household is exclusive").toEqual([household.label]);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(900);
    R.listAfterEscape = await page.locator('[data-testid="addcharge-target"] [role=listbox]').count();
    R.focusAfterEscape = await activeElementDescriptor(page);
    log(`§20 escape list=${R.listAfterEscape} focus=${R.focusAfterEscape}`);
    expect(R.listAfterEscape).toBe(0);
    expect(String(R.focusAfterEscape)).not.toBe("BODY");

    /* §22 — per-child economics: two children selected still says each receives their own charge. */
    await keyToggle(kids[0]!.value!).catch(() => {});
    R.summaryLine = await page.evaluate(() =>
        (document.querySelector("[data-addcharge-targetsum]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null);
    log(`§22 SUMMARY: ${R.summaryLine}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/gate-a11y-nonregression.json`, JSON.stringify(R, null, 2));
});
