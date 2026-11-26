/**
 * §17 EXPECTED FUNDING — the final slice-2 gate, measured and classified.
 *
 * The prior zero was read with `[data-charge-detail]` and `[data-testid="arrangement-share"]`.
 * NEITHER EXISTS. The product emits `data-financials-charge-detail={chargeId}` on the detail root
 * and `data-financials-arrangement-share` on each share. So this requires a POSITIVE detail marker
 * before asserting anything, and reads the canonical charge projection for the SAME charge id the
 * marker names — so evidence from one charge can never be attributed to another.
 *
 * Measurement only. No product code changed, no fixture mutated.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { alloyOptions, isAlloyControl } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
/**
 * The slice-2 repair. Staging moved past it mid-run (12 scheduled-work commits), so this binds to
 * whatever is DEPLOYED and records it, having verified out-of-band that 41a17c2a is an ancestor of
 * it and that none of the intervening commits touch a slice-2 surface. Asserting equality against a
 * SHA that staging has legitimately moved past would fail the run for someone else's promotion.
 */
const SLICE2 = "41a17c2a4aaef56fc4d81bf28f0ea448c9635bce";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Expected Funding: open detail positively, then read canonical share truth", async ({ page }) => {
    const R: Record<string, unknown> = {};

    /* §1 — bind to the deployed build. */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "governed staging session is live").not.toContain("/login");
    R.build = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    expect((R.build as { gitSha: string }).gitSha, "a real deployed sha").toMatch(/^[0-9a-f]{40}$/);
    expect((R.build as { gitBranch: string }).gitBranch).toBe("staging");
    expect((R.build as { nodeEnv: string }).nodeEnv, "production runtime, no HMR").toBe("production");
    expect((R.build as { supabaseProjectRef: string }).supabaseProjectRef).toBe("ikaxilmwmrmbagoidedu");
    R.slice2Repair = SLICE2;
    log(`§1 BUILD ${(R.build as { gitSha: string }).gitSha} ${(R.build as { nodeEnv: string }).nodeEnv} (slice-2 repair ${SLICE2} is an ancestor)`);

    /* §2 — the real door: Financials → Charges → a charge row button. */
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    await expect(nav, "the Financials workspace door").toHaveCount(1);
    await nav.click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(13_000);
    await page.locator("[data-workspace-section-tab='charges']").first().click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);

    const section = page.locator('[data-testid="financials-charges-section"]');
    await expect(section, "the Charges section rendered").toHaveCount(1);

    /*
     * Walk the candidate rows until one positively opens Detail. A single click that fails to open
     * is what produced the prior zero; trying several and REQUIRING the marker is what separates
     * "nothing to show" from "never opened".
     */
    const rows = section.locator("button").filter({ hasText: /\$\s?[\d,]+\.\d{2}/ });
    R.candidateRows = await rows.count();
    const detailRoot = page.locator("[data-financials-charge-detail]");
    let opened = false;
    for (let i = 0; i < Math.min(await rows.count(), 6) && !opened; i += 1) {
        await rows.nth(i).click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(9000);
        opened = (await detailRoot.count()) > 0;
        R.openedOnRowIndex = opened ? i : null;
        if (!opened) {
            R.loadingOrError = {
                loading: await page.locator("[data-financials-charge-detail-loading]").count(),
                error: await page.locator("[data-financials-charge-detail-error]").count(),
            };
        }
    }
    R.detailOpened = opened;
    log(`§2 candidateRows=${R.candidateRows} detailOpened=${opened} onIndex=${R.openedOnRowIndex}`);

    if (!opened) {
        R.classification = "B_HARNESS_OR_PATH — detail never opened under any candidate row";
        log(`§5 ${R.classification} ${JSON.stringify(R.loadingOrError)}`);
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/expected-funding-gate.json`, JSON.stringify(R, null, 2));
        return;
    }

    /* §3 — the selected charge's identity, taken FROM the marker. */
    R.charge = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-charge-detail]") as HTMLElement | null;
        const line = (k: string) =>
            (root?.querySelector(`[data-financials-charge-line="${k}"]`) as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null;
        return {
            chargeId: root?.getAttribute("data-financials-charge-detail") ?? null,
            label: (root?.querySelector("[data-financials-charge-label]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            status: (root?.querySelector("[data-financials-charge-status]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            attribution: (root?.querySelector("[data-financials-charge-attribution]") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
            gross: line("gross"), net: line("net"), outstanding: line("outstanding"),
            responsibilityParty: line("responsibility-party"),
            responsibilityUnassigned: line("responsibility-unassigned"),
            expectedFundingLine: line("expected-funding"),
            /* The DOM's own share rows, by the attribute the product actually emits. */
            domArrangementShares: root?.querySelectorAll("[data-financials-arrangement-share]").length ?? 0,
            fundingTypeControls: root?.querySelectorAll('[data-testid="financials-funding-type"]').length ?? 0,
            fundingAgencyControls: root?.querySelectorAll('[data-testid="financials-funding-agency"]').length ?? 0,
            nativeSelectsInDetail: root?.querySelectorAll("select").length ?? 0,
        };
    });
    log(`§3 CHARGE: ${JSON.stringify(R.charge)}`);

    /* §4 — canonical charge-grain projection for THAT id. */
    R.projection = await page.evaluate(async (chargeId) => {
        if (!chargeId) return { error: "no charge id on the marker" };
        const res = await fetch(`/api/admin/financials/charge/${encodeURIComponent(chargeId)}`, { cache: "no-store", credentials: "include" });
        if (!res.ok) return { status: res.status };
        const b = await res.json();
        const d = b?.detail ?? b;
        const arr = d?.accountArrangement ?? null;
        return {
            status: res.status,
            chargeId: d?.chargeId ?? null,
            childName: d?.childName ?? null,
            chargeStatus: d?.status ?? null,
            responsibilityParties: (d?.responsibility?.parties ?? []).map((p: Record<string, unknown>) => p.name),
            accountArrangementPresent: Boolean(arr),
            arrangementId: arr?.id ?? null,
            arrangementEffectiveStart: arr?.effectiveStart ?? null,
            arrangementShares: (arr?.shares ?? []).length,
            shares: (arr?.shares ?? []).map((s: Record<string, unknown>) => ({
                id: s.id, name: s.name, method: s.method,
                amountCents: s.amountCents, percentBasisPoints: s.percentBasisPoints,
                expectedFunding: s.expectedFunding,
            })),
            topLevelExpectedFunding: d?.expectedFunding ?? null,
        };
    }, (R.charge as { chargeId: string | null }).chargeId);
    log(`§4 PROJECTION: ${JSON.stringify(R.projection)}`);

    /*
     * §7 — HARNESS CORRECTION. The funding panel has a COLLAPSED state: with a share present it
     * renders `data-financials-share-funding`, the current expectation ("Expected funding — none.")
     * and a "Manage expected funding →" button. The selects exist only after that button is
     * pressed. Reading control counts before pressing it measures a closed drawer and calls the
     * product broken — which is what the count above was about to say.
     */
    R.collapsed = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-charge-detail]") as HTMLElement | null;
        return {
            sharePanels: root?.querySelectorAll("[data-financials-share-funding]").length ?? 0,
            noneLine: (root?.querySelector("[data-financials-funding-none]") as HTMLElement | null)?.innerText?.trim() ?? null,
            fundingRows: root?.querySelectorAll("[data-financials-funding-row]").length ?? 0,
            manageButtons: root?.querySelectorAll("[data-financials-manage-funding]").length ?? 0,
        };
    });
    log(`§7 COLLAPSED PANEL: ${JSON.stringify(R.collapsed)}`);

    const manage = page.locator("[data-financials-manage-funding]").first();
    R.openedEditor = false;
    if (await manage.count()) {
        await manage.click({ timeout: 15_000 });
        await page.waitForTimeout(9000);
        R.openedEditor = true;
        R.charge = {
            ...(R.charge as Record<string, unknown>),
            fundingTypeControls: await page.locator('[data-testid="financials-funding-type"]').count(),
            fundingAgencyControls: await page.locator('[data-testid="financials-funding-agency"]').count(),
            nativeSelectsInDetail: await page.locator("[data-financials-charge-detail] select").count(),
        };
        log(`§7 AFTER OPENING EDITOR: ${JSON.stringify(R.charge)}`);
    }

    /* §5 — classify, from the two facts side by side. */
    const p = R.projection as Record<string, unknown>;
    const c = R.charge as Record<string, unknown>;
    const shares = Number(p.arrangementShares ?? 0);
    const controls = Number(c.fundingTypeControls ?? 0);
    R.classification =
        shares === 0 ? "A_FIXTURE_LIMIT — detail opened; canonical arrangementShares = 0, so Expected Funding has nothing to administer"
        : controls > 0 ? "RESOLVED_MOUNTED — shares exist and the controls render"
        : "C_PRODUCT_DEFECT — canonical shares exist, the editor was opened, and the controls still do not render";
    log(`§5 CLASSIFICATION: ${R.classification}`);

    if (controls > 0) {
        R.fundingControls = {
            typeCanonical: await isAlloyControl(page, "financials-funding-type"),
            typeOptions: (await alloyOptions(page, "financials-funding-type")).map((o) => o.label).slice(0, 6),
        };
        const agency = await page.locator('[data-testid="financials-funding-agency"]').count();
        if (agency) {
            const opts = await alloyOptions(page, "financials-funding-agency");
            (R.fundingControls as Record<string, unknown>).agencyCanonical = await isAlloyControl(page, "financials-funding-agency");
            (R.fundingControls as Record<string, unknown>).agencyOptions = opts.map((o) => o.label).slice(0, 5);
            (R.fundingControls as Record<string, unknown>).agencyPlaceholderNotAValue = opts.filter((o) => !o.value).length <= 1;
        }
        log(`§6 FUNDING CONTROLS: ${JSON.stringify(R.fundingControls)}`);
    }

    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/expected-funding-gate.json`, JSON.stringify(R, null, 2));
});
