/** §17 discount non-regression · §18 performance · §19 responsive after override. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(480_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const CERTA_OCM = "79f8011d-a236-4054-bee7-af10f1dbc632";

test("discounts, performance, responsive", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};

    // ── §18 PERFORMANCE: when is the assignment shell usable, and when do the commercial reads land? ──
    const t0 = Date.now();
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    const marks: Record<string, number> = {};
    const tOpen = Date.now();
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true, timeout: 15_000 });
    /* The shell is usable when the schedule editor is interactive — not when pricing lands. */
    await page.locator("[data-schedule-surface]").first().waitFor({ state: "visible", timeout: 30_000 });
    marks.shellUsableMs = Date.now() - tOpen;
    await page.locator("select[data-assignment-tuition-embed], [data-assignment-tuition-recommended]").first()
        .waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
    marks.pricingOptionsMs = Date.now() - tOpen;
    await page.locator("[data-assignment-accepted-term]").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
    marks.acceptedTermMs = Date.now() - tOpen;
    await page.locator("[data-assignment-billing-period]").first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => {});
    marks.billingPeriodMs = Date.now() - tOpen;
    marks.totalFromNavigationMs = Date.now() - t0;
    out.performance = marks;
    log(`PERFORMANCE: ${JSON.stringify(marks)}`);
    /* The shell must not wait on the commercial reads. */
    out.shellNotBlocked = marks.shellUsableMs < marks.acceptedTermMs || marks.shellUsableMs < 2000;
    log(`shell independent of commercial reads: ${out.shellNotBlocked}`);

    // ── §19 RESPONSIVE, in the post-override state (accepted line, period, recommendation, disclosure). ──
    const resp: Record<string, unknown> = {};
    for (const w of [1280, 1440, 1680]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2200);
        resp[w] = await page.evaluate(() => {
            const region = document.querySelector("[data-assignment-tuition-region]") as HTMLElement | null;
            if (!region) return { missing: true };
            const r = region.getBoundingClientRect();
            const lines = ["data-assignment-accepted-term", "data-assignment-billing-period", "data-assignment-tuition-recommended"]
                .map((a) => {
                    const el = document.querySelector(`[${a}]`) as HTMLElement | null;
                    return el ? { a, clipped: el.scrollWidth > el.clientWidth + 1, right: Math.round(el.getBoundingClientRect().right) } : { a, absent: true };
                });
            return { width: Math.round(r.width), height: Math.round(r.height), overflows: r.right > window.innerWidth + 1, regionClipped: region.scrollWidth > region.clientWidth + 1, lines };
        });
        log(`${w}: ${JSON.stringify(resp[w])}`);
    }
    out.responsive = resp;
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.screenshot({ path: `${OUT}/sliceA-final.png`, fullPage: true });

    // ── §17 DISCOUNTS: the overridden gross must still be what reductions are computed against. ──
    out.discounts = await page.evaluate(async (ocm) => {
        const r = await fetch("/api/admin/actions/execute", {
            method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_key: "billing.generate_tuition", entity_type: "opportunity_customer_member",
                entity_id: ocm, mode: "preview", confirmation: { confirmed: false },
                payload: { opportunity_customer_member_id: ocm, period_key: "2026-09", cadence: "weekly" },
            }),
        });
        const b = await r.json().catch(() => null);
        const after = b?.data?.execution_result?.preview?.after ?? null;
        return { status: r.status, total: after?.total_amount_cents ?? null, counts: after?.counts ?? null };
    }, CERTA_OCM);
    log(`\nDISCOUNT BASIS (generation gross from the overridden term): ${JSON.stringify(out.discounts)}`);
    writeFileSync(`${OUT}/sliceA-final.json`, JSON.stringify(out, null, 2));
});
