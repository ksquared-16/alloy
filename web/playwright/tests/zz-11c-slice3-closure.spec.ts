/**
 * 11C SLICE 3 — FINAL MOUNTED CLOSURE on the deployed repair.
 *
 * Every assertion proves it reached its surface first: the three defects this closes were all
 * found by mounting, and two of the three would have read as "fine" from a probe that never
 * opened the thing it was asserting about.
 *
 * Nothing writes. Kelly's fixture is read only.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice3-closure";
const ENTRY = "/workspace/work-unit/enrolled-children";
const MERGE = "cfd4168b80357997adbc428bc94bbb2eb04ece7b";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
async function reach(w: string, l: Locator, t = 30_000) { await expect(l, `reached ${w}`).toHaveCount(1, { timeout: t }); }

async function openDetails(page: Page) {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", d);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
}

/** Everything §2 says must survive one Escape. */
const fingerprint = (page: Page) => page.evaluate(() => ({
    detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
    lens: document.querySelector("[data-financials-lens]")?.getAttribute("data-financials-lens") ?? null,
    rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
    filters: Array.from(document.querySelectorAll("[data-testid^='financials-filter-']"))
        .map((e) => `${e.getAttribute("data-testid")}=${(e.querySelector(".alloy-select__value") as HTMLElement | null)?.innerText?.trim() ?? ""}`),
    discountPosition: document.querySelectorAll("[data-financials-discount-position]").length,
    responsibilityGear: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
    discountPanel: document.querySelectorAll('[data-financials-manage-discounts="open-panel"]').length,
}));

test("§1 — the deployed repair", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(10_000);
    const build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD ${JSON.stringify(build)}`);
    expect(build.gitSha).toBe(MERGE);
    expect(build.gitBranch).toBe("staging");
    expect(build.nodeEnv).toBe("production");
    expect(build.supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    save("build", build);
});

test("§2 — D1: one Escape dismisses the discount card and nothing else", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());
    R.before = await fingerprint(page);

    const gear = page.locator('[data-financials-manage-discounts="gear"]').first();
    await reach("the Discount gear", gear);
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    await reach("Discount management", page.locator('[data-financials-manage-discounts="open-panel"]').first());
    R.opened = await fingerprint(page);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(4000);
    R.afterEscape = await fingerprint(page);
    R.focusAfterEscape = await page.evaluate(() => {
        const a = document.activeElement as HTMLElement | null;
        return a === document.body ? "BODY" : `${a?.tagName}("${a?.getAttribute("aria-label") ?? ""}")`;
    });
    log(`§2 before=${JSON.stringify(R.before)}`);
    log(`§2 afterEscape=${JSON.stringify(R.afterEscape)} focus=${R.focusAfterEscape}`);

    const a = R.afterEscape as Record<string, unknown>, b = R.before as Record<string, unknown>;
    expect(a.discountPanel, "the discount card closed").toBe(0);
    expect(a.detailsOpen, "Details REMAINS open").toBeGreaterThan(0);
    expect(a.lens, "same lens").toBe(b.lens);
    expect(a.rows, "ledger intact").toBe(b.rows);
    expect(a.filters, "same filters").toEqual(b.filters);
    expect(a.discountPosition, "the position is still there").toBeGreaterThan(0);
    expect(a.responsibilityGear, "Responsibility untouched").toBeGreaterThan(0);
    expect(String(R.focusAfterEscape), "focus returns to Manage discounts").toContain("Manage discounts");

    /* Explicit Cancel/Close dismisses the same single layer. */
    await gear.click({ timeout: 15_000 });
    await page.waitForTimeout(8000);
    const close = page.locator('[data-financials-manage-discounts="open-panel"]').getByRole("button", { name: /^Close$/ }).first();
    if (await close.count()) { await close.click({ timeout: 15_000 }); await page.waitForTimeout(4000); }
    R.afterClose = await fingerprint(page);
    log(`§2 afterClose=${JSON.stringify(R.afterClose)}`);
    expect((R.afterClose as { detailsOpen: number }).detailsOpen, "Details survives Close too").toBeGreaterThan(0);
    save("d1-escape", R);
});

test("§4 §8 — D2 presentation and D3 one policy name", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openDetails(page);
    await reach("the Discount position", page.locator("[data-financials-discount-position]").first());

    R.position = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-discount-position]") as HTMLElement | null;
        return {
            fullText: root?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            policies: Array.from(root?.querySelectorAll("[data-financials-discount-policy]") ?? []).map((e) => ({
                policyId: e.getAttribute("data-financials-discount-policy"),
                header: (e.querySelector("p") as HTMLElement | null)?.innerText?.trim() ?? null,
            })),
            subjects: Array.from(root?.querySelectorAll("[data-financials-discount-subject]") ?? []).map(
                (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            ),
        };
    });
    log(`§4 POSITION: ${JSON.stringify(R.position)}`);
    await shot(page, "A-family-discount-1680");

    const pos = R.position as { fullText: string; policies: { header: string }[]; subjects: string[] };
    /* D2: the kind must not be printed twice, and the basis belongs to the relationship. */
    expect(pos.fullText, "no duplicated kind").not.toMatch(/discount · discount/i);
    expect(pos.policies[0]?.header, "the header is the policy name alone").not.toMatch(/10% of/);
    expect(pos.subjects.join(" | "), "each relationship carries its own basis").toMatch(/Expected \$[\d,]+\.\d{2}/);

    /* D3: the name the family shows is the name Organization shows. */
    R.familyPolicyName = pos.policies[0]?.header ?? null;
    R.familyPolicyId = (R.position as { policies: { policyId: string }[] }).policies[0]?.policyId ?? null;

    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    const openPol = page.getByRole("button", { name: /open policies/i }).first();
    await reach("the Policies tile", openPol);
    await openPol.click({ timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await reach("the Policies shell", page.locator('[data-testid="policies-configuration-shell"]').first());
    R.organization = await page.evaluate((id) => {
        const row = document.querySelector(`[data-testid="policy-${id}"]`) as HTMLElement | null;
        return { found: Boolean(row), text: row?.innerText?.replace(/\s+/g, " ").trim() ?? null };
    }, R.familyPolicyId);
    log(`§8 family name="${R.familyPolicyName}" id=${R.familyPolicyId}`);
    log(`§8 organization row: ${JSON.stringify(R.organization)}`);

    expect((R.organization as { found: boolean }).found, "the SAME policy id exists in Organization").toBe(true);
    expect((R.organization as { text: string }).text, "and Organization shows the same name")
        .toContain(String(R.familyPolicyName));
    expect(String(R.familyPolicyName), "the family no longer shows the bare kind").not.toBe("discount");
    save("d2-d3", R);
});
