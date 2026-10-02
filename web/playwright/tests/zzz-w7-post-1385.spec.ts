/**
 * §3 — THE DECISIVE PROOF, THIRD ATTEMPT, WITH THE ACTION TRACE AS THE AUTHORITY.
 *
 * Twice before, this charge posted with no allocation. The instruction is explicit: if
 * `billing.configure_responsibility` does not appear in the trace, FAIL; if it appears and no
 * allocation persists, FAIL. So the trace is captured rather than inferred from the preview.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the standing arrangement becomes the charge's allocation", async ({ page }) => {
    const actions: Array<Record<string, unknown>> = [];
    const responses: Array<Record<string, unknown>> = [];
    page.on("request", (r) => {
        if (!/actions\/execute/.test(r.url())) return;
        try {
            const b = JSON.parse(r.postData() ?? "{}") as Record<string, unknown>;
            const payload = (b.payload ?? {}) as Record<string, unknown>;
            /*
             * The ENTITY the action is invoked against, not just which action ran. The third defect
             * was a registry refusal on entity type, so the grain the envelope states is itself
             * part of the proof: it must say `customer` for a household charge, with the real
             * account id — never a borrowed type that happens to be admitted.
             */
            actions.push({
                action: b.action_key ?? b.action,
                mode: b.mode,
                entity_type: b.entity_type ?? null,
                entity_id: b.entity_id ?? null,
                payload_customer_id: payload.customer_id ?? null,
                payload_charge_id: payload.charge_id ?? null,
                payload_member_id: payload.customer_member_id ?? null,
                shares: Array.isArray(payload.shares) ? JSON.stringify(payload.shares).slice(0, 200) : null,
            });
        } catch { actions.push({ unparsed: true }); }
    });
    page.on("response", async (r) => {
        if (!/actions\/execute/.test(r.url())) return;
        try {
            const j = (await r.json()) as Record<string, unknown>;
            const data = (j.data ?? {}) as Record<string, unknown>;
            responses.push({ ok: j.ok, affected_id: data.affected_id ?? null,
                             execution_result: JSON.stringify(data.execution_result ?? null).slice(0, 160) });
        } catch { /* streamed */ }
    });

    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);
    const id = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .find((r) => /certfree/i.test((r as HTMLElement).innerText))?.getAttribute("data-financials-account-row") ?? null);
    await page.locator(`[data-financials-account-row="${id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(12_000);

    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);
    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await page.locator("[role='option'], [data-alloy-select-option]").filter({ hasText: /Field trip/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(8_000);
    const d = page.locator("[data-addcharge-event-date] input").first();
    /*
     * A DATE NOT USED BEFORE. `charge.add` is idempotent on
     * `tpl:<template>:<occurs_on>:<customer>`, so reusing a date answers `skipped_posted` with the
     * EXISTING charge's id — which is correct behaviour and was mistaken for a new write once.
     * Oct 1-5 are spent on earlier attempts.
     */
    await d.fill("Oct 6, 2026"); await d.press("Tab");
    await page.waitForTimeout(11_000);

    actions.length = 0; responses.length = 0;
    await page.locator("[data-addcharge-submit]").first().click({ timeout: 25_000 });
    await page.waitForTimeout(28_000);

    log(`ACTION TRACE: ${JSON.stringify(actions)}`);
    log(`RESPONSES: ${JSON.stringify(responses)}`);
    const after = await page.evaluate(() => ({
        error: (document.querySelector("[data-addcharge-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
        notAllocated: document.body.innerText.includes("Not allocated"),
        detail: (document.querySelector("[data-financials-detail-account]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 400) ?? null,
    }));
    log(`AFTER: ${JSON.stringify(after)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/post-1385-trace.json`, JSON.stringify({ actions, responses, after }, null, 2));
    await page.screenshot({ path: `${OUT}/POST1385-after.png`, fullPage: true });

    const keys = actions.map((a) => String(a.action));
    expect(keys, "charge.add ran").toContain("charge.add");
    expect(responses[0]?.affected_id, "the response carried the new charge id").toBeTruthy();
    expect(keys, "the follow-up that inherits the standing arrangement ACTUALLY executed")
        .toContain("billing.configure_responsibility");

    /* G — the envelope states the ACTUAL financial grain, with the real account id. */
    const follow = actions.find((a) => a.action === "billing.configure_responsibility");
    expect(follow?.entity_type, "invoked against the customer grain, not a borrowed type").toBe("customer");
    expect(follow?.entity_id, "with the real household/customer entity id").toBeTruthy();
    expect(follow?.payload_member_id, "household grain leaves the member null").toBeFalsy();

    /* I — and it SUCCEEDED, not merely ran. */
    const followResponse = responses[1];
    expect(followResponse?.ok, "the responsibility write succeeded").toBe(true);
});
