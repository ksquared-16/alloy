/** §5→§8 — author a complete household arrangement, resolve the household obligation, reflect. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
/*
 * ENROLMENT-BACKED, which responsibility requires: the household-grain twin was refused outright
 * with "Only an enrolment-backed charge carries responsibility." Certb's Sep 18 registration fee is
 * a child charge, so an arrangement can govern it.
 */
const TARGET = "907d1b64-09d5-4926-bed0-63d044c15441";        // Registration fee $75, Certb, Sep 18
const HISTORICAL = "f089a3f4-85a1-44b6-bb94-50588a581b00";

const ledger = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    document.querySelectorAll(".alloy-os-billingdetail__row").forEach((r) => {
        if (r.className.includes("--head")) return;
        const resp = r.querySelector("[data-financials-responsibility]");
        out.push({
            chargeId: r.querySelector("[data-charge-id]")?.getAttribute("data-charge-id") ?? null,
            responsibility: resp?.getAttribute("data-financials-responsibility") ?? null,
            responsibilityText: (resp as HTMLElement | null)?.innerText?.trim() ?? null,
            actions: Array.from(r.querySelectorAll("[data-financials-row-action]")).map((a) => a.getAttribute("data-financials-row-action")),
            cells: Array.from(r.querySelectorAll("span")).map((s) => (s as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 9),
        });
    });
    return out;
});

test("S4 · positive resolution and reflection", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/actions/execute")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ request: req, response: body });
        writeFileSync(`${OUT}/s4-pos-wire.json`, JSON.stringify(wire, null, 2));
    });

    /*
     * NO CONFIGURE STEP. The authority already refused a same-day supersession —
     * "An arrangement already in force starts on or after this date" — and backdating is forbidden.
     * The arrangement in force from Sep 18 is what governs, and this proves what it does.
     */
    const arranged = { done: "skipped — predecessor_starts_later", inForce: null };
    // ── §6 · resolve the household obligation.
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const before = (await ledger(page)).find((r) => r.chargeId === TARGET);
    log(`BEFORE: ${JSON.stringify(before)}`);

    await page.locator(`[data-financials-row-action="resolveResponsibility"][data-charge-id="${TARGET}"]`).first().click();
    await page.waitForTimeout(4000);
    await page.getByTestId("responsibility-preview-button").click();
    await page.waitForTimeout(7000);
    await page.getByTestId("responsibility-confirm").click();
    await page.waitForTimeout(12_000);
    const afterConfirm = await page.evaluate(() => ({
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        error: (document.querySelector('[data-testid="responsibility-error"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`AFTER CONFIRM: ${JSON.stringify(afterConfirm)}`);
    const rc = wire.filter((w) => JSON.stringify(w.request).includes("resolve_responsibility") && (w.request as { mode?: string })?.mode === "execute");
    log(`RESOLVE RESULT: ${JSON.stringify(rc[rc.length - 1]?.response).slice(0, 500)}`);
    await page.screenshot({ path: `${OUT}/s4-pos-confirm.png` });

    // ── §7 · the projection, the party, the filter.
    if (afterConfirm.overlay !== "detail") {
        const back = page.getByRole("button", { name: /^Details$/ }).first();
        if (await back.count()) { await back.click().catch(() => undefined); await page.waitForTimeout(9000); }
    }
    const rows = await ledger(page);
    const after = rows.find((r) => r.chargeId === TARGET);
    const hist = rows.find((r) => r.chargeId === HISTORICAL);
    log(`AFTER : ${JSON.stringify(after)}`);
    log(`HISTORICAL: ${hist?.responsibility} ("${hist?.responsibilityText}")`);
    const filters = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")));
    log(`FILTERS: ${JSON.stringify(filters)}`);
    await page.screenshot({ path: `${OUT}/s4-pos-after.png` });
    writeFileSync(`${OUT}/s4-positive.json`, JSON.stringify({ arranged, before, afterConfirm, after, historical: hist, filters }, null, 2));
});
