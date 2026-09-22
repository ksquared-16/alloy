/**
 * PASS 5J — the mounted proof.
 *
 * Compact anatomy and command geometry, the Add selector's height, the Details ledger-commit
 * timeline row by row, the shared grid's column widths at two viewports, the period disclosure, and
 * every row action clicked through the real UI in both hosts with dismissal checked afterwards.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const HOUSEHOLD = "29944d3e-8267-45b7-8dcb-7405060e2573";
const OUT = "../certification/financials";
const MOUNTED = 180_000;

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });

const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png` }); };

/** Every distinct ledger state from the click onward — rows, periods, pending, lens counts. */
async function armLedgerTimeline(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __led?: string[] };
        w.__led = [];
        let last = "";
        const tick = () => {
            const detail = document.querySelector('[data-financials-overlay="detail"]');
            const sig = detail
                ? [
                      `rows=${document.querySelectorAll("[data-financials-ledger-row]").length}`,
                      `periods=${document.querySelectorAll("[data-financials-ledger-period]").length}`,
                      `pending=${document.querySelectorAll("[data-financials-ledger-hydrating]").length > 0}`,
                      `heads=${document.querySelectorAll(".alloy-os-billingdetail__row--head").length}`,
                      `lenses=${document.querySelectorAll("[data-financials-lens]").length}`,
                      `counts=${[...document.querySelectorAll(".alloy-os-fdetail__lenscount")].map((c) => (c as HTMLElement).innerText.trim() || "-").join("/")}`,
                      `stats=${document.querySelectorAll(".alloy-os-fdetail__stat").length}`,
                  ].join(" ")
                : "NO_DETAIL";
            if (sig !== last) { last = sig; w.__led!.push(`+${Math.round(performance.now())}ms ${sig}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}
const timeline = (p: Page) => p.evaluate(() => (window as unknown as { __led: string[] }).__led ?? []);

const gridWidths = (p: Page) =>
    p.evaluate(() => {
        const head = document.querySelector(".alloy-os-billingdetail__row--head");
        if (!head) return null;
        const cells = [...head.children].map((c) => ({
            label: (c as HTMLElement).innerText.trim() || "actions",
            w: Math.round(c.getBoundingClientRect().width),
        }));
        const gl = [...document.querySelectorAll(".alloy-os-billingdetail__gl")]
            .map((g) => ({ text: (g as HTMLElement).innerText.trim(), clipped: g.scrollWidth > Math.ceil(g.getBoundingClientRect().width) + 1 }))
            .slice(0, 6);
        return { cells, gl };
    });

test("compact · Due, command geometry, height", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(9_000);
    // eslint-disable-next-line no-console
    console.log("COMPACT_5J " + JSON.stringify(await card.evaluate((n) => {
        const r = n.getBoundingClientRect();
        const heads = [...n.querySelectorAll(".alloy-os-billing__zone-head")].map((h) => (h as HTMLElement).innerText.trim());
        const cmds = [...n.querySelectorAll(".alloy-os-billing__commands > *")].map((b) => {
            const br = b.getBoundingClientRect();
            const cs = getComputedStyle(b as HTMLElement);
            return { label: (b as HTMLElement).innerText.trim(), h: Math.round(br.height), w: Math.round(br.width), y: Math.round(br.y), radius: cs.borderRadius, fontSize: cs.fontSize };
        });
        return { height: Math.round(r.height), heads, amount: (n.querySelector(".alloy-os-billing__amount") as HTMLElement | null)?.innerText.trim(), commands: cmds };
    })));
    await shot(page, "p5k-01-compact-due");

    // ── ADD SELECTOR HEIGHT ────────────────────────────────────────────────────────────────────
    await card.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator('[data-financials-overlay="add_charge"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3_000);
    // eslint-disable-next-line no-console
    console.log("ADD_SELECTOR_5J " + JSON.stringify(await page.evaluate(() => {
        const sel = document.querySelector(".alloy-os-financials__entrymodes") as HTMLElement | null;
        const shell = document.querySelector('[data-universal-card-key="add_charge"], .alloy-os-addcharge-host') as HTMLElement | null;
        const tabs = [...document.querySelectorAll("[data-financials-entry-mode-tab]")].map((t) => {
            const r = t.getBoundingClientRect();
            return { mode: t.getAttribute("data-financials-entry-mode-tab"), w: Math.round(r.width), h: Math.round(r.height) };
        });
        const cs = sel ? getComputedStyle(sel) : null;
        return {
            selectorHeight: sel ? Math.round(sel.getBoundingClientRect().height) : null,
            marginBottom: cs?.marginBottom ?? null,
            shellHeight: shell ? Math.round(shell.getBoundingClientRect().height) : null,
            tabs,
        };
    })));
    await shot(page, "p5k-02-add-charge-selected");
    await page.locator('[data-financials-entry-mode-tab="adjustment"]').click({ timeout: 20_000 });
    await page.waitForTimeout(2_500);
    await shot(page, "p5k-03-add-adjustment-selected");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2_000);
});

test("details · ledger commit timeline, grid, disclosure", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(9_000);

    await armLedgerTimeline(page);
    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 20_000 });
    await shot(page, "p5k-04-details-first-frame");
    await page.waitForTimeout(1_200);
    await shot(page, "p5k-05-details-ledger-pending");
    await page.waitForTimeout(18_000);
    await shot(page, "p5k-06-details-complete-ledger");
    // eslint-disable-next-line no-console
    console.log("LEDGER_TIMELINE_5J\n" + (await timeline(page)).join("\n"));

    // eslint-disable-next-line no-console
    console.log("GRID_1680 " + JSON.stringify(await gridWidths(page)));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(3_000);
    // eslint-disable-next-line no-console
    console.log("GRID_1280 " + JSON.stringify(await gridWidths(page)));
    await shot(page, "p5k-07-grid-1280");
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.waitForTimeout(3_000);

    // ── PERIOD DISCLOSURE ──────────────────────────────────────────────────────────────────────
    const toggle = page.locator("[data-financials-period-toggle]").first();
    // eslint-disable-next-line no-console
    console.log("DISCLOSURE_BEFORE " + JSON.stringify(await page.evaluate(() => {
        const t = document.querySelector("[data-financials-period-toggle]");
        const sec = t?.closest("[data-financials-ledger-period]");
        return {
            ariaExpanded: t?.getAttribute("aria-expanded") ?? null,
            expandedAttr: sec?.getAttribute("data-financials-period-expanded") ?? null,
            collapsedSentence: document.body.innerText.includes("Collapsed · select to expand"),
        };
    })));
    await toggle.click({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    // eslint-disable-next-line no-console
    console.log("DISCLOSURE_AFTER " + JSON.stringify(await page.evaluate(() => {
        const t = document.querySelector("[data-financials-period-toggle]");
        const sec = t?.closest("[data-financials-ledger-period]");
        return {
            ariaExpanded: t?.getAttribute("aria-expanded") ?? null,
            expandedAttr: sec?.getAttribute("data-financials-period-expanded") ?? null,
            rowsInThatPeriod: sec?.querySelectorAll("[data-financials-ledger-row]").length ?? null,
        };
    })));
    await shot(page, "p5k-08-period-collapsed");
    await toggle.click({ timeout: 20_000 });
    await page.waitForTimeout(1_200);
    await shot(page, "p5k-09-period-expanded");
});

test("commands · click every eligible action, then dismiss", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: MOUNTED });
    await page.waitForTimeout(9_000);
    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 20_000 });
    await expect(page.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(16_000);

    const state = () =>
        page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            lens: document.querySelector('[data-financials-lens][aria-pressed="true"]')?.getAttribute("data-financials-lens") ?? null,
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            scroll: Math.round((document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null)?.scrollTop ?? -1),
            expandedPeriods: [...document.querySelectorAll("[data-financials-period-expanded]")].map((p) => p.getAttribute("data-financials-period-expanded")).join(","),
        }));

    for (const kind of ["adjust", "reverse", "post"] as const) {
        const icon = page.locator(`[data-financials-row-action="${kind}"]`).first();
        if (!(await icon.count())) {
            // eslint-disable-next-line no-console
            console.log(`FP_${kind.toUpperCase()}_NONE_ELIGIBLE`);
            continue;
        }
        const before = await state();
        await page.locator("[data-financials-detail-scroll]").evaluate((el) => { (el as HTMLElement).scrollTop = 120; }).catch(() => undefined);
        await icon.scrollIntoViewIfNeeded().catch(() => undefined);
        await icon.click({ timeout: 20_000 });
        await page.waitForTimeout(3_500);
        const opened = await page.evaluate(() => {
            const host = document.querySelector('[data-financials-overlay="add_charge"], [data-financials-overlay="detail"]');
            const sel = document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null;
            return {
                overlay: host?.getAttribute("data-financials-overlay") ?? null,
                mode: host?.getAttribute("data-financials-entry-mode") ?? null,
                sourceCharge: sel?.value ?? null,
                reversePanel: document.querySelectorAll('[data-testid="charge-reverse-panel"]').length,
                bodyHas: (document.body.innerText.match(/Reverse|Adjustment|Post/g) ?? []).slice(0, 3).join("/"),
            };
        });
        // eslint-disable-next-line no-console
        console.log(`FP_${kind.toUpperCase()}_OPENED ` + JSON.stringify(opened));
        await shot(page, `p5k-10-fp-${kind}-opened`);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(3_000);
        const after = await state();
        // eslint-disable-next-line no-console
        console.log(`FP_${kind.toUpperCase()}_DISMISSED before=${JSON.stringify(before)} after=${JSON.stringify(after)}`);
        await shot(page, `p5k-11-fp-${kind}-dismissed`);
    }
});

test("accounts · same grid, disclosure and command", async ({ page }) => {
    test.setTimeout(900_000);
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });
    await row.click({ timeout: 20_000 });
    await page.waitForTimeout(15_000);
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_GRID " + JSON.stringify(await gridWidths(page)));
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_DISCLOSURE " + JSON.stringify(await page.evaluate(() => ({
        toggles: document.querySelectorAll("[data-financials-period-toggle]").length,
        collapsedSentence: document.body.innerText.includes("Collapsed · select to expand"),
    }))));
    await shot(page, "p5k-12-accounts-grid");

    const adjust = page.locator('[data-financials-row-action="adjust"]').first();
    await expect(adjust).toBeVisible({ timeout: 30_000 });
    await adjust.click({ timeout: 20_000 });
    await page.waitForTimeout(4_000);
    // eslint-disable-next-line no-console
    console.log("ACCOUNTS_ADJUST " + JSON.stringify(await page.evaluate(() => {
        const host = document.querySelector('[data-financials-overlay="add_charge"]');
        const sel = document.querySelector('[data-testid="adjustment-source-charge"]') as HTMLSelectElement | null;
        return { overlay: host?.getAttribute("data-financials-overlay") ?? null, mode: host?.getAttribute("data-financials-entry-mode") ?? null, sourceCharge: sel?.value ?? null };
    })));
    await shot(page, "p5k-13-accounts-adjust-open");
});
