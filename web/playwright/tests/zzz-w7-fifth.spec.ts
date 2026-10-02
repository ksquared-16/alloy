/**
 * §2 the fifth decisive proof, and §5 the idempotency proof — in one pass, because a REPEAT of the
 * charge just created is itself the no-op case.
 *
 * Part A: one new Field trip on an unused Service Date. All three governed acts must execute and
 *         succeed — charge.add (created), configure (customer grain), resolve (divides the net).
 * Part B: the SAME date again. charge.add must answer a no-new-write, and configure/resolve must
 *         NOT appear at all. The prior broken behaviour mutated a historical charge's
 *         responsibility on exactly this path.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/fifth";
const ENTRY = "/workspace/work-unit/enrolled-children";
const SERVICE_DATE = "Oct 7, 2026";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const out: Record<string, unknown>[] = [];
const save = () => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/fifth-proof.json`, JSON.stringify(out, null, 2)); };

type Act = { action: string; entity_type: unknown; entity_id: unknown; charge_id: unknown; shares: string | null };

function instrument(page: Page) {
    const acts: Act[] = [];
    const responses: Array<Record<string, unknown>> = [];
    page.on("request", (r) => {
        if (!/actions\/execute/.test(r.url())) return;
        try {
            const b = JSON.parse(r.postData() ?? "{}") as Record<string, unknown>;
            const p = (b.payload ?? {}) as Record<string, unknown>;
            acts.push({
                action: String(b.action_key ?? b.action ?? ""),
                entity_type: b.entity_type ?? null,
                entity_id: b.entity_id ?? null,
                charge_id: p.charge_id ?? null,
                shares: Array.isArray(p.shares) ? JSON.stringify(p.shares).slice(0, 180) : null,
            });
        } catch { /* ignore */ }
    });
    page.on("response", async (r) => {
        if (!/actions\/execute/.test(r.url())) return;
        try {
            const j = (await r.json()) as Record<string, unknown>;
            const d = (j.data ?? {}) as Record<string, unknown>;
            const ex = (d.execution_result ?? {}) as Record<string, unknown>;
            responses.push({ ok: j.ok, affected_id: d.affected_id ?? null, write_status: ex.write_status ?? null,
                             detail: JSON.stringify(ex).slice(0, 180) });
        } catch { /* ignore */ }
    });
    return { acts, responses };
}

async function addFieldTrip(page: Page) {
    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);
    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await page.locator("[role='option'], [data-alloy-select-option]").filter({ hasText: /Field trip/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(8_000);
    const preview: Record<string, unknown> = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return { body: card?.innerText.replace(/\s+/g, " ").slice(0, 600) ?? null };
    });
    const d = page.locator("[data-addcharge-event-date] input").first();
    await d.fill("Oct 7, 2026"); await d.press("Tab");
    await page.waitForTimeout(11_000);
    /* The preview AFTER the date is the one whose figures the arrangement, the allocation, the
     * ledger row and Details must all agree with. */
    preview.priced = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return card?.innerText.replace(/\s+/g, " ").slice(0, 700) ?? null;
    });
    /* CHARGE TO IS NEVER TOUCHED. */
    await page.locator("[data-addcharge-submit]").first().click({ timeout: 25_000 });
    await page.waitForTimeout(28_000);
    return preview;
}

async function openCertfree(page: Page) {
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
    await page.waitForTimeout(13_000);
}

test("A · all three governed acts execute and succeed", async ({ page }) => {
    const { acts, responses } = instrument(page);
    await openCertfree(page);
    const before = await page.evaluate(() => document.body.innerText.match(/Charges\s+(\d+)/)?.[1] ?? null);
    acts.length = 0; responses.length = 0;
    const preview = await addFieldTrip(page);
    log(`PREVIEW: ${JSON.stringify(preview)}`);
    log(`ACTS: ${JSON.stringify(acts)}`);
    log(`RESPONSES: ${JSON.stringify(responses)}`);
    const after = await page.evaluate(() => ({
        charges: document.body.innerText.match(/Charges\s+(\d+)/)?.[1] ?? null,
        error: (document.querySelector("[data-addcharge-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 240) ?? null,
        notice: (document.querySelector("[data-financials-command-notice]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
    }));
    log(`AFTER: before=${before} ${JSON.stringify(after)}`);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/A-after-create.png`, fullPage: true });
    out.push({ part: "A-create", before, preview, acts, responses, after }); save();

    const keys = acts.map((a) => a.action);
    expect(keys, "charge.add ran").toContain("charge.add");
    const write = responses.find((r) => r.write_status != null);
    expect(write?.write_status, "a NEW charge was written").toBe("created");
    expect(keys, "configure ran").toContain("billing.configure_responsibility");
    expect(keys, "resolve ran — the charge is divided, not merely governed").toContain("billing.resolve_responsibility");
    const cfg = acts.find((a) => a.action === "billing.configure_responsibility");
    expect(cfg?.entity_type, "configure states the customer grain").toBe("customer");
    const res = acts.find((a) => a.action === "billing.resolve_responsibility");
    expect(res?.charge_id, "resolve names the charge").toBeTruthy();
    expect(res?.shares, "resolve sends no shares — the net is the server's").toBeNull();
    for (const r of responses) expect(r.ok, "every act succeeded").toBe(true);
});

test("B · an equivalent repeat follows nothing up", async ({ page }) => {
    const { acts, responses } = instrument(page);
    await openCertfree(page);
    acts.length = 0; responses.length = 0;
    await addFieldTrip(page);
    log(`REPEAT ACTS: ${JSON.stringify(acts)}`);
    log(`REPEAT RESPONSES: ${JSON.stringify(responses)}`);
    const after = await page.evaluate(() => ({
        charges: document.body.innerText.match(/Charges\s+(\d+)/)?.[1] ?? null,
        notice: (document.querySelector("[data-financials-command-notice]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
        error: (document.querySelector("[data-addcharge-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
    }));
    log(`REPEAT AFTER: ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${OUT}/B-after-repeat.png`, fullPage: true });
    out.push({ part: "B-repeat", acts, responses, after }); save();

    const keys = acts.map((a) => a.action);
    expect(keys, "charge.add ran").toContain("charge.add");
    const write = responses.find((r) => r.write_status != null);
    expect(write?.write_status, "charge.add reached its write branch").toBeTruthy();
    expect(write?.write_status, "and wrote nothing new").not.toBe("created");
    expect(keys, "configure MUST NOT run on a no-op").not.toContain("billing.configure_responsibility");
    expect(keys, "resolve MUST NOT run on a no-op").not.toContain("billing.resolve_responsibility");
    expect(after.notice, "the operator is told nothing new was created").toMatch(/already exists|Nothing new/i);
});
