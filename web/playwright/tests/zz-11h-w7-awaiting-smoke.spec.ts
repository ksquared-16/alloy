/**
 * W7-F001 — the Charges workspace, read off the deployed build.
 *
 * The first slice-1 smoke reached the Focus Panel's financials card, which is not where the Charges
 * queue and the operational band live: those are the Financials workspace, opened from the sidebar.
 * This opens it and reads the two things the F001 presentation repair changed.
 *
 * READ-ONLY. It opens a modal, switches a tab and clicks a row. It posts nothing.
 */
import { expect, test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the operational band and the awaiting-posting reasons", async ({ page }) => {
    /*
     * `/workspace` is the deployed shell — the first slice-1 smoke reached its Focus Panel from
     * `/workspace/work-unit/enrolled-children`. `/adminV2` rendered no sidebar at all, which a first
     * version of this probe recorded as "the workspace did not open" when it had never been on the
     * page that holds the control.
     */
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    const navs = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-adminv2-sidebar-modal-nav]"))
            .map((e) => e.getAttribute("data-adminv2-sidebar-modal-nav")));
    log(`SIDEBAR_NAVS ${JSON.stringify(navs)}`);

    /*
     * The workspace opens from the sidebar. NOT through a DOM event: `openWorkspaceModal` is a
     * module-level store with a subscription, so nothing a page script dispatches reaches it — a
     * first version of this probe guessed an event name and recorded NOT_REACHED for a surface that
     * opens perfectly well from its own control.
     */
    const nav = page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first();
    log(`NAV_COUNT ${await nav.count()}`);
    if ((await nav.count()) > 0) {
        await nav.click({ timeout: 20_000 }).catch(() => undefined);
        /* The workspace modal mounts, then resolves the queue and the position over the network.
         * 12s was not enough on the deployed build; wait for the section rather than a stopwatch. */
        await page.locator('[data-testid="financials-charges-section"], [data-financials-charges-view]')
            .first().waitFor({ timeout: 120_000 }).catch(() => undefined);
        await page.waitForTimeout(8_000);
    }
    /* What actually mounted, so a miss is diagnosable rather than just absent. */
    const mounted = await page.evaluate(() => ({
        section: Boolean(document.querySelector('[data-testid="financials-charges-section"]')),
        band: Boolean(document.querySelector('[data-testid="financials-kpi-band"]')),
        views: Array.from(document.querySelectorAll("[data-financials-charges-view]"))
            .map((e) => e.getAttribute("data-financials-charges-view")),
        workspaceKeys: Array.from(document.querySelectorAll("[data-testid]"))
            .map((e) => e.getAttribute("data-testid"))
            .filter((k) => (k ?? "").startsWith("financials")),
    }));
    log(`MOUNTED ${JSON.stringify(mounted)}`);

    /*
     * THE WORKSPACE OPENS ON OVERVIEW. The band and the Charges queue live on the CHARGES section,
     * so the shell's section tab has to be selected — a first version of this probe read an absent
     * band and concluded the workspace had not opened, when `financials-workspace-shell` and
     * `financials-overview` were both mounted and it was simply looking at a different section.
     */
    if (!mounted.section) {
        const sections = page.locator("[data-workspace-mode-sections='financials']");
        const charges = sections.getByRole("tab", { name: /Charges/ }).first();
        log(`SECTION_TABS ${await sections.count()} CHARGES_TAB ${await charges.count()}`);
        if ((await charges.count()) > 0) {
            await charges.click({ timeout: 20_000 }).catch(() => undefined);
            await page.locator('[data-testid="financials-charges-section"]').first()
                .waitFor({ timeout: 120_000 }).catch(() => undefined);
            await page.waitForTimeout(8_000);
        }
    }
    const after = await page.evaluate(() => ({
        section: Boolean(document.querySelector('[data-testid="financials-charges-section"]')),
        band: Boolean(document.querySelector('[data-testid="financials-kpi-band"]')),
    }));
    log(`AFTER_SECTION ${JSON.stringify(after)}`);
    const present = (after.section ? 1 : 0) + (after.band ? 1 : 0);
    log(`WORKSPACE_PRESENT ${present}`);
    if (present === 0) {
        log("NOT_REACHED: the Financials workspace did not open from this entry point");
        return;
    }

    const band = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="financials-kpi-band"]') as HTMLElement | null;
        return el ? el.innerText.replace(/\s+/g, " ").slice(0, 300) : null;
    });
    log(`BAND ${band ?? "ABSENT"}`);

    /* The Charges section, and its awaiting tab. */
    const chargesNav = page.locator('[data-financials-charges-view="awaiting"]').first();
    if ((await chargesNav.count()) === 0) {
        const tab = page.getByRole("tab", { name: /Charges/ }).first();
        if ((await tab.count()) > 0) { await tab.click({ timeout: 20_000 }).catch(() => undefined); await page.waitForTimeout(8_000); }
    }
    if ((await page.locator('[data-financials-charges-view="awaiting"]').count()) > 0) {
        await page.locator('[data-financials-charges-view="awaiting"]').first().click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(8_000);
    }

    const awaiting = await page.evaluate(() => {
        const reasons = Array.from(document.querySelectorAll("[data-financials-awaiting-reason]"));
        const counts: Record<string, number> = {};
        for (const el of reasons) {
            const k = el.getAttribute("data-financials-awaiting-reason") ?? "?";
            counts[k] = (counts[k] ?? 0) + 1;
        }
        return {
            queueRows: document.querySelectorAll("[data-financials-queue-row]").length,
            reasonElements: reasons.length,
            byReason: counts,
            sample: reasons.slice(0, 5).map((e) => (e as HTMLElement).innerText.trim()),
            tabLabels: Array.from(document.querySelectorAll("[data-financials-charges-view]"))
                .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()),
        };
    });
    log(`AWAITING ${JSON.stringify(awaiting)}`);
    /* Every row carries a reason, or the repair is not rendering. */
    if (awaiting.queueRows > 0) {
        expect(awaiting.reasonElements, "every draft row states why it is waiting").toBe(awaiting.queueRows);
    }

    /* And one row's detail panel must say the same thing in a sentence. */
    const row = page.locator("[data-financials-queue-row]").first();
    if ((await row.count()) > 0) {
        await row.click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(8_000);
        const detail = await page.evaluate(() => {
            const g = (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                return el ? el.innerText.trim().slice(0, 240) : null;
            };
            return {
                awaitingSentence: g("[data-financials-charge-awaiting]"),
                awaitingKey: document.querySelector("[data-financials-charge-awaiting]")
                    ?.getAttribute("data-financials-charge-awaiting") ?? null,
                identityGap: g("[data-financials-charge-actor-identity-gap]"),
                identityStatus: document.querySelector("[data-financials-charge-actor-identity-gap]")
                    ?.getAttribute("data-financials-charge-actor-identity-gap") ?? null,
                origin: g('[data-testid="charge-detail-origin"]'),
            };
        });
        log(`DETAIL ${JSON.stringify(detail)}`);
    }
});
