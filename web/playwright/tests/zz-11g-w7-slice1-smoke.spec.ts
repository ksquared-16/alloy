/**
 * W7 SLICE 1 — the four repairs, read off the deployed build.
 *
 * READ-ONLY by construction. It opens surfaces, reads text and presses one control that writes
 * nothing (the review stage of the responsibility editor runs the command in preview mode). It never
 * reaches a commit stage, so no arrangement is written and no money moves.
 *
 * What it is for: telling the Director whether the repairs RENDER before they spend a walkthrough on
 * them. It is not a substitute for the walkthrough and proves nothing about acceptance.
 */
import { expect, test } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the band, the awaiting reasons, the staged control and the identity line", async ({ page }) => {
    await page.goto("/api/build-info", { waitUntil: "domcontentloaded" });
    const build = await page.evaluate(() => document.body.innerText.slice(0, 120));
    log(`BUILD ${build.replace(/\s+/g, " ")}`);

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    const details = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await expect(details).toHaveCount(1, { timeout: 90_000 });
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);

    /* ── 1. THE OPERATIONAL BAND no longer counts drafts ─────────────────────────────────────── */
    const band = await page.evaluate(() => {
        const el = document.querySelector('[data-testid="financials-kpi-band"]') as HTMLElement | null;
        return el ? el.innerText.replace(/\s+/g, " ").slice(0, 240) : null;
    });
    log(`BAND ${band ?? "ABSENT"}`);

    /* ── 2. THE CHARGES TAB — every draft says why ───────────────────────────────────────────── */
    const chargesTab = page.getByRole("tab", { name: /Charges/ }).first();
    if ((await chargesTab.count()) > 0) {
        await chargesTab.click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(8_000);
    }
    const awaiting = await page.evaluate(() => {
        const reasons = Array.from(document.querySelectorAll("[data-financials-awaiting-reason]"));
        return {
            rows: document.querySelectorAll("[data-financials-queue-row]").length,
            reasonCount: reasons.length,
            keys: [...new Set(reasons.map((e) => e.getAttribute("data-financials-awaiting-reason")))],
            firstLabels: reasons.slice(0, 4).map((e) => (e as HTMLElement).innerText.trim()),
        };
    });
    log(`AWAITING ${JSON.stringify(awaiting)}`);

    /* ── 3. THE CHARGE DETAIL — the awaiting sentence and the identity line ──────────────────── */
    const firstRow = page.locator("[data-financials-queue-row]").first();
    if ((await firstRow.count()) > 0) {
        await firstRow.click({ timeout: 20_000 }).catch(() => undefined);
        await page.waitForTimeout(8_000);
        const detail = await page.evaluate(() => {
            const g = (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                return el ? { attr: el.getAttributeNames().join(","), text: el.innerText.trim().slice(0, 220) } : null;
            };
            return {
                awaiting: g("[data-financials-charge-awaiting]"),
                identityGap: g("[data-financials-charge-actor-identity-gap]"),
                origin: g('[data-testid="charge-detail-origin"]'),
                panelText: (document.querySelector("[data-financials-charge-detail]") as HTMLElement | null)
                    ?.innerText.replace(/\s+/g, " ").slice(0, 400) ?? null,
            };
        });
        log(`DETAIL ${JSON.stringify(detail)}`);
    }

    /* ── 4. THE RESPONSIBILITY EDITOR — one staged control ───────────────────────────────────── */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await expect(details).toHaveCount(1, { timeout: 90_000 });
    await details.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    if ((await gear.count()) === 0) {
        log("RESPONSIBILITY NOT_REACHED: no manage-responsibility affordance on this account");
        return;
    }
    await gear.click({ timeout: 20_000 });
    await page.waitForTimeout(10_000);

    const staged = await page.evaluate(() => {
        const primary = document.querySelector("[data-financials-responsibility-stage]") as HTMLButtonElement | null;
        const hint = document.querySelector("[data-financials-responsibility-stage-hint]") as HTMLElement | null;
        const blocker = document.querySelector("[data-financials-responsibility-confirm-blocker]") as HTMLElement | null;
        return {
            primaryPresent: Boolean(primary),
            stage: primary?.getAttribute("data-financials-responsibility-stage") ?? null,
            label: primary ? primary.innerText.trim() : null,
            disabled: primary?.disabled ?? null,
            hint: hint ? hint.innerText.trim().slice(0, 180) : null,
            blocker: blocker ? blocker.innerText.trim().slice(0, 180) : null,
            /* The old pair must be gone: exactly one control carries a stage. */
            stageControls: document.querySelectorAll("[data-financials-responsibility-stage]").length,
            shareRows: document.querySelectorAll("[data-financials-responsibility-share]").length,
            addable: document.querySelectorAll("[data-financials-responsibility-add]").length,
        };
    });
    log(`STAGED ${JSON.stringify(staged)}`);

    /* A disabled primary must always carry a visible requirement. */
    if (staged.disabled === true) {
        expect(staged.blocker, "a disabled primary states its unmet requirement").not.toBeNull();
    }

    /* One press of the REVIEW stage. Writes nothing. */
    if (staged.primaryPresent && staged.stage === "review" && staged.disabled === false) {
        await page.locator("[data-financials-responsibility-stage]").first().click({ timeout: 20_000 });
        await page.waitForTimeout(10_000);
        const after = await page.evaluate(() => {
            const primary = document.querySelector("[data-financials-responsibility-stage]") as HTMLButtonElement | null;
            return {
                stage: primary?.getAttribute("data-financials-responsibility-stage") ?? null,
                label: primary ? primary.innerText.trim() : null,
                previewShown: Boolean(document.querySelector("[data-financials-responsibility-preview]")),
                hint: (document.querySelector("[data-financials-responsibility-stage-hint]") as HTMLElement | null)
                    ?.innerText.trim().slice(0, 180) ?? null,
            };
        });
        log(`AFTER_REVIEW ${JSON.stringify(after)}`);
    }
});
