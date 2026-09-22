/** §5/§6 — author a complete arrangement through the operator workflow, then resolve. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-s4";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const TARGET = "6005cf5f-24e8-4fd2-a624-0bc83496b977";
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

test("S4 · complete arrangement then positive resolution", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (!res.url().includes("/api/admin/actions/execute")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ request: req, response: body });
    });

    // ── §5 · AUTHOR THE ARRANGEMENT, through Financials → Charges → charge detail.
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    await page.getByRole("button", { name: /Certhouse Family \$/ }).first().click({ timeout: 15_000 });
    await page.waitForTimeout(7000);
    await page.locator('[data-financials-manage-responsibility="open"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(5000);

    const form = await page.evaluate(() => ({
        date: (document.querySelector("input[type='date']") as HTMLInputElement | null)?.value ?? null,
        candidates: Array.from(document.querySelectorAll("input[type='number']")).map((i) =>
            ((i as HTMLElement).closest("label,div,li") as HTMLElement | null)?.innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? null),
    }));
    log(`FORM effective=${form.date} candidates=${JSON.stringify(form.candidates)}`);
    /* $25.00 — the obligation's own net, as the engine's preview reported it. Not backdated. */
    await page.locator("input[type='number']").first().fill("25.00");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Preview$/ }).first().click();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${OUT}/s4-arrangement-preview.png` });
    await page.getByRole("button", { name: /^Confirm$/ }).first().click();
    await page.waitForTimeout(10_000);
    const arranged = await page.evaluate(() => ({
        done: (document.querySelector('[data-financials-responsibility-done="true"]') as HTMLElement | null)?.innerText ?? null,
        inForce: (document.querySelector('[data-financials-responsibility-arrangement="in-force"]') as HTMLElement | null)?.innerText ?? null,
    }));
    log(`ARRANGEMENT: ${JSON.stringify(arranged)}`);
    await page.screenshot({ path: `${OUT}/s4-arrangement-done.png` });

    // ── §6 · RESOLVE, and capture the response before going anywhere.
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
    const resolveCalls = wire.filter((w) => JSON.stringify(w.request).includes("resolve_responsibility"));
    log(`RESOLVE RESULT: ${JSON.stringify((resolveCalls[resolveCalls.length - 1] as { response?: unknown })?.response).slice(0, 700)}`);

    if (afterConfirm.overlay !== "detail") {
        await page.getByRole("button", { name: /^Details$/ }).first().click();
        await page.waitForTimeout(9000);
    }
    const rows = await ledger(page);
    const after = rows.find((r) => r.chargeId === TARGET);
    const hist = rows.find((r) => r.chargeId === HISTORICAL);
    log(`AFTER  : ${JSON.stringify(after)}`);
    log(`HISTORICAL: ${hist?.responsibility} ("${hist?.responsibilityText}")`);
    const filters = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")));
    log(`FILTERS: ${JSON.stringify(filters)}`);
    await page.screenshot({ path: `${OUT}/s4-positive.png` });
    writeFileSync(`${OUT}/s4-complete.json`, JSON.stringify({ form, arranged, before, afterConfirm, after, historical: hist, filters, wire }, null, 2));
});
