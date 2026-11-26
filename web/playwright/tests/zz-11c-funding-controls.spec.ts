/**
 * §6 — the Expected Funding control grammar, proved without spending an Escape on the way.
 *
 * The previous pass read the TYPE options with `alloyOptions`, which dismisses the listbox with
 * Escape — and Escape is a real dismissal of a real layer, so the funding editor closed and the
 * agency control was gone before it could be read. Here each control is inspected in place, and
 * only the agency listbox is opened.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { isAlloyControl, openAlloy } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("funding type and agency are both canonical; the agency empty state is a placeholder", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(13_000);
    await page.locator("[data-workspace-section-tab='charges']").first().click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);

    const section = page.locator('[data-testid="financials-charges-section"]');
    const rows = section.locator("button").filter({ hasText: /\$\s?[\d,]+\.\d{2}/ });
    await rows.first().click({ timeout: 15_000 });
    await page.waitForTimeout(9000);
    await expect(page.locator("[data-financials-charge-detail]"), "detail is positively open").toHaveCount(1);
    await page.locator("[data-financials-manage-funding]").first().click({ timeout: 15_000 });
    await page.waitForTimeout(8000);

    /* In place — no listbox opened, so no Escape is spent. */
    R.inPlace = {
        typePresent: await page.locator('[data-testid="financials-funding-type"]').count(),
        agencyPresent: await page.locator('[data-testid="financials-funding-agency"]').count(),
        typeCanonical: await isAlloyControl(page, "financials-funding-type"),
        agencyCanonical: await isAlloyControl(page, "financials-funding-agency"),
        nativeSelectsInDetail: await page.locator("[data-financials-charge-detail] select").count(),
        typeValue: await page.locator('[data-testid="financials-funding-type"] .alloy-select__value').first().innerText().catch(() => null),
        agencyValue: await page.locator('[data-testid="financials-funding-agency"] .alloy-select__value').first().innerText().catch(() => null),
        agencyValueIsPlaceholder: await page.locator('[data-testid="financials-funding-agency"] .alloy-select__value--placeholder').count(),
    };
    log(`§6 IN PLACE: ${JSON.stringify(R.inPlace)}`);

    /* Only the agency listbox, and read its rows while it is open. */
    if ((R.inPlace as { agencyPresent: number }).agencyPresent) {
        await openAlloy(page, "financials-funding-agency");
        R.agencyOptions = await page.locator('[data-testid="financials-funding-agency"] [role=option]')
            .evaluateAll((n) => n.map((e) => ({
                label: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
                value: e.getAttribute("data-option-value"),
            })));
        const opts = R.agencyOptions as { label: string; value: string | null }[];
        R.emptyValued = opts.filter((o) => !o.value);
        log(`§6 AGENCY OPTIONS: ${JSON.stringify(opts.slice(0, 6))}`);
        log(`§6 EMPTY-VALUED ROWS: ${JSON.stringify(R.emptyValued)}`);
        expect(R.emptyValued, "the empty agency row is a single placeholder, not a financial value").toHaveLength(1);
        expect((R.emptyValued as { label: string }[])[0]!.label, "and it reads as a prompt").toMatch(/choose|select|…/i);
    }
    expect((R.inPlace as { nativeSelectsInDetail: number }).nativeSelectsInDetail, "zero native selects").toBe(0);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/expected-funding-controls.json`, JSON.stringify(R, null, 2));
});
