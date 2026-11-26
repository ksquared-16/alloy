/**
 * THE HUMAN PATH, after the retirement — visible navigation only.
 *
 * Absence is measured by the RENDERED identity (`assignment_tuition`), never by the registry key,
 * which is the selector that let a false claim into the certification record.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("household entry, then the child's Assignment, by clicking", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const R: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/final-human-path.json`, JSON.stringify(R, null, 2));

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

    const composition = () => page.evaluate(() => ({
        cards: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
        standaloneTuitionByRenderedIdentity: Boolean(document.querySelector("[data-universal-card-key='assignment_tuition']")),
        prepaidNamed: /available prepaid/i.test(document.body.innerText || ""),
    }));
    R.entry = await composition();
    log(`ENTRY: ${JSON.stringify(R.entry)}`);
    await page.screenshot({ path: `${OUT}/final-01-entry.png`, fullPage: true });
    flush();

    /* ── CHILDREN → the child's Assignment, through whatever the product visibly offers ───── */
    const childControl = page.getByRole("button", { name: /^custom/ }).first();
    R.childAffordance = {
        present: (await childControl.count()) > 0,
        accessibleName: (await childControl.count()) ? (await childControl.textContent())?.replace(/\s+/g, " ").trim().slice(0, 80) : null,
    };
    if ((await childControl.count()) > 0) {
        await childControl.click({ timeout: 20_000 });
        await page.waitForTimeout(14_000);
    }
    R.childPanel = await composition();
    R.assignment = await page.evaluate(() => {
        const s = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
        const t = s?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            assignmentCardPresent: Boolean(s),
            tuition: /tuition/i.test(t),
            acceptedAmount: (/\$[\d,]+\.\d{2}\/(weekly|monthly)/i.exec(t) || [null])[0],
            billingFrequency: (/Billing frequency[^·]*·[^·]*·[^A-Z]*/i.exec(t) || [null])[0],
            currentAndNextPeriod: /current period[\s\S]{0,60}next/i.test(t),
            responsibility: /who owes|responsib/i.test(t),
            discounts: /DISCOUNTS/i.test(t),
            discountText: (/DISCOUNTS[\s\S]{0,140}/i.exec(t) || [null])[0],
            diagnostics: /did not apply|no authored tuition/i.test(t),
            residue: /A-K|§12|H\/I|duplicate pair|promotion proof/i.test(t),
        };
    });
    log(`CHILD: ${JSON.stringify(R.childPanel)}`);
    log(`ASSIGNMENT: ${JSON.stringify(R.assignment)}`);
    await page.screenshot({ path: `${OUT}/final-02-assignment.png`, fullPage: true });
    flush();

    /* ── THE POLICIES TILE, read before opening ──────────────────────────────────────────── */
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    R.policiesTile = await page.evaluate(() => {
        const tile = document.querySelector('[data-testid="financials-landing-tile-policies"]') as HTMLElement | null;
        return { present: Boolean(tile), text: tile?.innerText?.replace(/\s+/g, " ") ?? null,
                 namesDiscountBeforeOpening: /discount/i.test(tile?.innerText ?? "") };
    });
    log(`POLICIES TILE: ${JSON.stringify(R.policiesTile)}`);
    flush();
});
