/**
 * 11C SLICE 3 — FINAL MOUNTED PASS, part C: the same six surfaces at 1280, 1440 and 1680.
 *
 * Overflow is measured per element and for the page, because "no horizontal scrollbar" and "no
 * clipped content" are different questions and a surface can fail either one alone.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-final";
const ENTRY = "/workspace/work-unit/enrolled-children";
const POLICY_NAME = "Sibling discount (QA specimen)";
const WIDTHS = [1280, 1440, 1680];

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
async function reach(what: string, l: Locator, t = 40_000) { await expect(l, `reached ${what}`).toHaveCount(1, { timeout: t }); }

/** Clipping and overflow for one named element, plus whether it fits the viewport. */
const geometry = (page: Page, sel: string) => page.evaluate((s) => {
    const e = document.querySelector(s) as HTMLElement | null;
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return {
        present: true,
        box: `${Math.round(r.width)}x${Math.round(r.height)}`,
        /* Content wider than its own box is content the operator cannot read. */
        clipped: e.scrollWidth > e.clientWidth + 1,
        overflowBy: e.scrollWidth - e.clientWidth,
        insideViewport: r.left >= -1 && r.right <= window.innerWidth + 1,
        offRight: Math.round(r.right - window.innerWidth),
    };
}, sel);

const pageOverflow = (page: Page) => page.evaluate(() => {
    const d = document.scrollingElement as HTMLElement;
    return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth, horizontalOverflow: d.scrollWidth > d.clientWidth + 1 };
});

async function openDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url()).not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", d);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
}

for (const width of WIDTHS) {
    test(`§10-12 — ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const R: Record<string, unknown> = { width };
        const shot = async (n: string) => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/r${width}-${n}.png`, fullPage: true }); };

        /* ── Family Discount position, and the depth card over it. ── */
        await openDetails(page);
        await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
        R.position = await geometry(page, "[data-financials-discount-position]");
        R.positionText = await page.locator("[data-financials-discount-position]").first().innerText();
        R.positionPage = await pageOverflow(page);
        await shot("discount-position");

        await page.locator('[data-financials-manage-discounts="gear"]').first().click({ timeout: 20_000 });
        await page.waitForTimeout(4000);
        await reach("the Discount management root", page.locator('[data-financials-manage-discounts="open-panel"]').first());
        R.management = await geometry(page, '[data-financials-manage-discounts="open-panel"]');
        R.managementText = await page.locator('[data-financials-manage-discounts="open-panel"]').first().innerText();
        R.managementPage = await pageOverflow(page);
        await shot("discount-management");
        await page.keyboard.press("Escape");
        await page.waitForTimeout(1500);

        /* ── Each child's Assignment. ── */
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(14_000);
        const children = await page.evaluate(() =>
            Array.from(document.querySelectorAll("[data-children-child]")).map((e) => ({
                ocm: e.getAttribute("data-children-child"),
                who: /(Cert\w+ Certhouse)/.exec((e as HTMLElement).innerText.replace(/\s+/g, " "))?.[1] ?? null,
            })));
        const assignments: Array<Record<string, unknown>> = [];
        for (const c of children) {
            await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
            await page.waitForTimeout(13_000);
            await page.locator(`[data-children-child="${c.ocm}"]`).first()
                .locator('button[title^="Assignments:"]').first().click({ force: true, timeout: 20_000 });
            await page.locator("[data-schedule-surface]").first().waitFor({ state: "visible", timeout: 45_000 });
            await page.waitForTimeout(6000);
            const surfaceText = await page.locator("[data-schedule-surface]").first().innerText();
            expect(surfaceText.replace(/\s+/g, " "), `${c.who}'s assignment`).toContain(String(c.who));
            assignments.push({
                ...c,
                surface: await geometry(page, "[data-schedule-surface]"),
                forecast: await geometry(page, "[data-assignment-discount-forecast]"),
                forecastText: await page.locator("[data-assignment-discount-forecast]").first().innerText().catch(() => null),
                page: await pageOverflow(page),
            });
            await shot(`assignment-${String(c.who).split(" ")[0].toLowerCase()}`);
        }
        R.assignments = assignments;

        /* ── Policies. ── */
        await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(15_000);
        await reach("the Policies page", page.locator('[data-testid="policies-configuration-page"]').first());
        R.policies = await geometry(page, '[data-testid="policies-configuration-page"]');
        R.policiesPage = await pageOverflow(page);
        R.policiesNamesPolicy = (await page.locator('[data-testid="policies-configuration-page"]').first().innerText()).includes(POLICY_NAME);
        await shot("policies");

        /* ── Billing Frequencies. ── */
        await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(15_000);
        await reach("the Billing Frequencies surface", page.locator('[data-testid="tuition-billing-frequencies-panel"]').first());
        R.billing = await geometry(page, '[data-testid="tuition-billing-frequencies-panel"]');
        R.billingTable = await geometry(page, '[data-testid="billing-frequencies-table"]');
        R.billingPage = await pageOverflow(page);
        await shot("billing-frequencies");

        log(`RESPONSIVE ${width} ${JSON.stringify(R, null, 1)}`);
        save(`responsive-${width}`, R);

        /* ── The requirements, stated once per width. ── */
        expect((R.positionPage as { horizontalOverflow: boolean }).horizontalOverflow, "no horizontal overflow on Details").toBe(false);
        expect((R.position as { clipped: boolean }).clipped, "the Discount position is not clipped").toBe(false);
        expect(String(R.positionText), "the position names the policy").toContain(POLICY_NAME);
        expect((R.management as { insideViewport: boolean }).insideViewport, "the depth card is inside the viewport").toBe(true);
        expect((R.management as { clipped: boolean }).clipped, "the depth card is not clipped").toBe(false);
        expect(String(R.managementText), "management names the policy").toContain(POLICY_NAME);
        for (const a of assignments) {
            expect((a.surface as { clipped: boolean }).clipped, `${a.who}'s assignment is not clipped`).toBe(false);
            expect((a.page as { horizontalOverflow: boolean }).horizontalOverflow, `no horizontal overflow on ${a.who}'s assignment`).toBe(false);
            expect(String(a.forecastText ?? ""), `${a.who}'s forecast names the policy`).toContain(POLICY_NAME);
        }
        expect(R.policiesNamesPolicy, "Policies names the policy").toBe(true);
        expect((R.policiesPage as { horizontalOverflow: boolean }).horizontalOverflow, "no horizontal overflow on Policies").toBe(false);
        expect((R.billingPage as { horizontalOverflow: boolean }).horizontalOverflow, "no horizontal overflow on Billing").toBe(false);
    });
}
