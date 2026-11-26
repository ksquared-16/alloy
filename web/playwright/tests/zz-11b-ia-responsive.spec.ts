/**
 * §23 discoverability, and §32 responsive proof for what this pass changed.
 *
 * Three widths for the two surfaces that gained a line, because a line added to a dense strip is
 * exactly the kind of change that reads well at 1680 and wraps at 1280.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("discounts discoverability and responsive", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};

    // ── §23 · can an operator find Discounts? ──────────────────────────────────────────────
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    out.policies = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const heading = !!document.querySelector('[data-testid="commercial-policies-heading"]');
        const exec = !!document.querySelector('[data-testid="financial-execution-policies"]');
        const i = t.indexOf("Discounts & commercial policies");
        return {
            heading, exec,
            saysDiscounts: /Discounts & commercial policies/.test(t),
            section: i < 0 ? null : t.slice(i, i + 420).replace(/\n+/g, " / "),
            siblingPolicyVisible: /Sibling discount/.test(t),
            /* The facts §23 says an operator must be able to read without a ledger. */
            statesType: /Pricing · Discount|Discount/.test(t),
            statesEffective: /from 2026-01-01|Active · from/.test(t),
        };
    });
    await page.screenshot({ path: `${OUT}/ia-policies-1680.png`, fullPage: true });
    log(`POLICIES: ${JSON.stringify(out.policies, null, 1)}`);

    // Open the policy and read its rate/eligibility/scope.
    const policy = page.getByRole("button", { name: /Sibling discount/ }).first();
    if (await policy.count()) { await policy.click(); await page.waitForTimeout(9000); }
    out.policyDetail = await page.evaluate(() => {
        const t = document.body.innerText || "";
        return {
            rate: /10\s*%|Percentage/.test(t),
            eligibility: /sibling|Eligib/i.test(t),
            scope: /Locations:|Whole organization|scope/i.test(t),
            status: /Active/.test(t),
        };
    });
    await page.screenshot({ path: `${OUT}/ia-policy-detail.png`, fullPage: true });
    log(`POLICY DETAIL: ${JSON.stringify(out.policyDetail)}`);

    // ── §32 · the two changed surfaces at three widths ─────────────────────────────────────
    const widths = [1280, 1440, 1680];
    const shots: Array<Record<string, unknown>> = [];
    for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(22_000);
        const tuition = await page.evaluate(() => {
            const el = document.querySelector("[data-tuition-billing-period]") as HTMLElement | null;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { text: el.innerText.replace(/\s+/g, " ").trim(), widthPx: Math.round(r.width), lines: el.getClientRects().length, overflow: r.right > window.innerWidth };
        });
        await page.screenshot({ path: `${OUT}/resp-tuition-${width}.png`, fullPage: false });
        shots.push({ width, tuition });
        log(`${width} tuition period: ${JSON.stringify(tuition)}`);
    }
    out.responsive = shots;

    // Accounts prepaid at the narrow width — the strip that gained a fourth stat.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const fin = page.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await fin.count()) { await fin.click(); await page.waitForTimeout(14_000); }
    const acct = page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first();
    if (await acct.count()) { await acct.click(); await page.waitForTimeout(10_000); }
    const row = page.locator("button", { hasText: /Certhouse/ }).first();
    if (await row.count()) { await row.click(); await page.waitForTimeout(14_000); }
    out.accounts1280 = await page.evaluate(() => {
        const strip = document.querySelector(".alloy-os-fdetail__strip") as HTMLElement | null;
        const prepaid = document.querySelector('[data-testid="available-prepaid"]') as HTMLElement | null;
        return {
            stats: strip ? Array.from(strip.children).map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim()) : [],
            prepaid: prepaid?.innerText.replace(/\s+/g, " ").trim() ?? null,
            overflowsViewport: strip ? strip.getBoundingClientRect().right > window.innerWidth : false,
        };
    });
    await page.screenshot({ path: `${OUT}/resp-accounts-1280.png`, fullPage: false });
    log(`ACCOUNTS 1280: ${JSON.stringify(out.accounts1280)}`);

    writeFileSync(`${OUT}/ia-responsive.json`, JSON.stringify(out, null, 2));
});
