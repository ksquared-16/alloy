/**
 * 5H DEPLOYED PROOF — the Focus Panel half, which the first serial run never reached.
 *
 * Everything here is measured off the deployed DOM. Human acceptance is NOT claimed.
 *
 * The known BOS occlusion (HANDOFF-SWL-BOS-RAIL-2026-09-16) is an external shared-layout defect at
 * 1280/1440. This runs at 1680x1050 where it does not apply, and reports pointer reachability as a
 * measurement rather than asserting it, so that handed-off defect is never re-filed as a Financials
 * failure here.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const CHILD = "fd000000-0000-4000-8000-0000000d0001";
const OUT = "../certification/financials";

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });

const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png` });
};

test("deployed · Focus Panel → Financials", async ({ page }) => {
    test.setTimeout(600_000);
    // eslint-disable-next-line no-console
    console.log("DEPLOYED " + (await (await page.request.get(`${BASE}/api/build-info`)).text()).slice(0, 110));

    /*
     * OPEN THE LANE AND TAKE THE SUBJECT THE QUEUE ACTUALLY HOLDS. A subject id carried over from
     * the local fixture is not a subject on this tenant — the first attempt skipped for exactly
     * that reason, and a skip is not a proof.
     */
    const LANES = ["enrolled-children", "active-pipeline", "all", "registration", "waitlist"];
    let opened = "";
    for (const lane of LANES) {
        await page.goto(`/workspace/work-unit/${lane}`);
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(7_000);
        const rows = page.locator("[data-queue-row-surface-id], [data-queue-row], [role='row']");
        const n = await rows.count();
        // eslint-disable-next-line no-console
        console.log(`LANE ${lane} rows=${n}`);
        if (n === 0) continue;
        await rows.first().click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(9_000);
        if (await page.locator('[data-financials-card="true"]').count()) { opened = lane; break; }
    }
    // eslint-disable-next-line no-console
    console.log("FOCUS_PANEL_LANE " + (opened || "none"));
    const card = page.locator('[data-financials-card="true"]').first();
    if (!(await card.count())) {
        // eslint-disable-next-line no-console
        console.log("FOCUS_PANEL_UNREACHABLE — no lane on this tenant opened a panel with a Financials card");
        await shot(page, "p5i-10-focus-unreachable");
        test.skip(true, "no Focus Panel Financials card reachable on the hosted tenant");
        return;
    }
    await page.waitForTimeout(9_000);

    const compact = await page.evaluate(() => {
        const c = document.querySelector('[data-financials-card="true"]') as HTMLElement;
        const reach = (el: Element | null) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return at === el || el.contains(at as Node);
        };
        const byText = (t: string) => [...c.querySelectorAll("button")].find((b) => (b.innerText || "").trim().startsWith(t)) ?? null;
        return {
            cardRoots: document.querySelectorAll('[data-financials-card="true"]').length,
            h: Math.round(c.getBoundingClientRect().height),
            commands: [...c.querySelectorAll("[data-financials-command]")].map((b) => b.getAttribute("data-financials-command")),
            nav: [...c.querySelectorAll("[data-financials-nav]")].map((b) => b.getAttribute("data-financials-nav")),
            labels: [...c.querySelectorAll("button")].map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean),
            paymentReachable: reach(byText("Payment")),
            addReachable: reach(byText("Add")),
            detailsReachable: reach(byText("Details")),
        };
    });
    // eslint-disable-next-line no-console
    console.log("FP_COMPACT " + JSON.stringify(compact));
    await shot(page, "p5i-10-focus-compact");

    // ── DETAILS ────────────────────────────────────────────────────────────────────────────────
    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 20_000 });
    const detail = page.locator('[data-financials-overlay="detail"]');
    await expect(detail).toBeVisible({ timeout: 60_000 });
    const firstFrame = await page.evaluate(() => {
        const g = document.querySelector('[data-fp-card-intrinsic="financials"]') as HTMLElement | null;
        return {
            shellH: g ? Math.round(g.getBoundingClientRect().height) : null,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            lenses: document.querySelectorAll("[data-financials-lens]").length,
        };
    });
    await page.waitForTimeout(16_000);
    const hydrated = await page.evaluate(() => {
        const g = document.querySelector('[data-fp-card-intrinsic="financials"]') as HTMLElement | null;
        const scroll = document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null;
        return {
            shellH: g ? Math.round(g.getBoundingClientRect().height) : null,
            cardRoots: document.querySelectorAll('[data-financials-card="true"]').length,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            lenses: document.querySelectorAll("[data-financials-lens]").length,
            heads: document.querySelectorAll(".alloy-os-billingdetail__row--head").length,
            headings: [...document.querySelectorAll(".alloy-os-billingdetail__row--head span")].map((s) => (s as HTMLElement).innerText.trim()),
            filters: [...document.querySelectorAll('[data-testid^="financials-filter-"]')].map((el) => {
                const r = el.getBoundingClientRect();
                const v = el.querySelector(".alloy-select__value") as HTMLElement | null;
                const vr = v?.getBoundingClientRect();
                return { id: el.getAttribute("data-testid"), y: Math.round(r.y), label: v?.innerText ?? null, clipped: v && vr ? v.scrollWidth > Math.ceil(vr.width) + 1 : null };
            }),
            reverse: document.querySelectorAll('[data-charge-command="charge.reverse"]').length,
            adjust: document.querySelectorAll('[data-charge-command="billing.adjust_account"]').length,
            post: document.querySelectorAll('[data-charge-command="charge.post"]').length,
            rowActions: document.querySelectorAll("[data-financials-row-action]").length,
            linkFarm: document.querySelectorAll(".alloy-os-fdetail__paymentops").length,
            scrollH: scroll?.scrollHeight ?? null,
            clientH: scroll?.clientHeight ?? null,
        };
    });
    // eslint-disable-next-line no-console
    console.log("FP_DETAILS first=" + JSON.stringify(firstFrame) + " hydrated=" + JSON.stringify(hydrated));
    await shot(page, "p5i-11-focus-details");

    // ── ROW ADJUST — the same shell, in Adjustment mode, with the source bound ─────────────────
    const adjust = page.locator('[data-charge-command="billing.adjust_account"]').first();
    if (await adjust.count()) {
        await adjust.click({ timeout: 20_000 });
        await page.waitForTimeout(4_000);
        const bound = await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="add_charge"]');
            const sel = document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null;
            return {
                overlay: host?.getAttribute("data-financials-overlay") ?? null,
                mode: host?.getAttribute("data-financials-entry-mode") ?? null,
                sourceCharge: sel?.value ?? null,
                tabs: [...document.querySelectorAll("[data-financials-entry-mode-tab]")].map((t) => t.getAttribute("data-financials-entry-mode-tab")),
            };
        });
        // eslint-disable-next-line no-console
        console.log("FP_ROW_ADJUST " + JSON.stringify(bound));
        await shot(page, "p5i-12-focus-row-adjust");
    } else {
        // eslint-disable-next-line no-console
        console.log("FP_ROW_ADJUST none-offered (no posted obligation with room to reduce)");
    }

    expect(hydrated.cardRoots, "exactly one card root").toBe(1);
    expect(hydrated.linkFarm, "no command link farm").toBe(0);
    expect(hydrated.shellH, "the Details shell commits one height").toBe(firstFrame.shellH);
});
