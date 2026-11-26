/** §7C — author a CHILD-grain responsibility arrangement through Manage responsibility. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const F: Array<{ id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (id: string, what: string, ok: boolean, observed: string) => {
    F.push({ id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("7C · child-grain arrangement authoring", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), status: res.status(), request: req, response: body });
        writeFileSync(`${OUT}/b1-7c-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await page.waitForTimeout(7000);
    await page.getByRole("tab", { name: /^Posted/ }).or(page.getByRole("button", { name: /^Posted/ })).first().click({ timeout: 15_000 });
    await page.waitForTimeout(6000);
    /*
     * A charge with a CHILD in view. The Posted list is labelled by amount and date only, and the
     * $75.00 household registration fee sorts first — opening that one correctly shows NO scope
     * control, because a household charge has no second scope to choose between.
     */
    const rows = page.getByRole("button", { name: /Certhouse Family \$/ });
    const n = await rows.count();
    let head = "";
    for (let i = 0; i < Math.min(n, 10); i++) {
        await rows.nth(i).click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(5000);
        head = await page.evaluate(() => {
            const b = document.body.innerText || ""; const j = b.indexOf("Account-wide financial detail");
            return b.slice(j, j + 200).replace(/\n+/g, " / ");
        });
        if (/Cert[ab] Certhouse ·/.test(head)) break;
    }
    log(`charge in view: ${head}`);

    await page.locator('[data-financials-manage-responsibility="open"]').first().click({ timeout: 15_000 });
    await page.waitForTimeout(5000);
    const scope = page.locator('[data-testid="responsibility-scope"]').first();
    const present = await scope.count();
    const opts = present ? await scope.locator("option").allTextContents() : [];
    const dflt = present ? await scope.inputValue() : null;
    rec("7C-1", "APPLIES TO offers Household and the child in view, defaulting to Household",
        present > 0 && dflt === "household" && opts.length === 2, `default=${dflt} options=${JSON.stringify(opts)}`);
    await page.screenshot({ path: `${OUT}/b1-7c-scope.png` });

    if (!present) { writeFileSync(`${OUT}/b1-7c.json`, JSON.stringify(F, null, 2)); return; }

    // Deliberately choose the child; author a FIXED share; effective the day AFTER the arrangement
    // already in force, because same-day supersession is canonically refused and backdating is not
    // an option this proof is allowed to take.
    await scope.selectOption("child");
    await page.waitForTimeout(2500);
    await page.locator("input[type='number']").first().fill("25.00");
    await page.locator("input[type='date']").first().fill("2026-09-19");
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: /^Preview$/ }).first().click();
    await page.waitForTimeout(6500);
    const previewText = await page.evaluate(() => {
        const p = document.querySelector('[data-financials-manage-responsibility="open-panel"]') as HTMLElement | null;
        return (p?.innerText ?? "").replace(/\n+/g, " / ").slice(0, 700);
    });
    log(`PREVIEW PANEL: ${previewText}`);
    rec("7C-2", "the preview identifies scope, party, amount and effective date",
        /Certa|Certb|only/i.test(previewText) && /25/.test(previewText) && /2026-09-19|Sep 19/.test(previewText),
        previewText.slice(0, 260));
    await page.screenshot({ path: `${OUT}/b1-7c-preview.png` });

    await page.getByRole("button", { name: /^Confirm$/ }).first().click();
    await page.waitForTimeout(11_000);
    const after = await page.evaluate(() => ({
        done: (document.querySelector('[data-financials-responsibility-done="true"]') as HTMLElement | null)?.innerText ?? null,
        inForce: (document.querySelector('[data-financials-responsibility-arrangement="in-force"]') as HTMLElement | null)?.innerText ?? null,
        body: (document.body.innerText || "").slice(0, 60),
    }));
    const cfg = wire.filter((w) => JSON.stringify(w.request).includes("configure_responsibility") && (w.request as { mode?: string })?.mode === "execute");
    const last = cfg[cfg.length - 1] as { request?: { payload?: Record<string, unknown> }; response?: unknown } | undefined;
    log(`CONFIGURE PAYLOAD: ${JSON.stringify(last?.request?.payload)}`);
    log(`CONFIGURE RESULT: ${JSON.stringify(last?.response).slice(0, 320)}`);
    log(`AFTER: ${JSON.stringify(after)}`);
    rec("7C-3", "the payload carries the explicitly selected child, not null and not an inherited grain",
        Boolean(last?.request?.payload?.customer_member_id),
        `customer_member_id=${String(last?.request?.payload?.customer_member_id)} effective=${String(last?.request?.payload?.effective_start)}`);
    rec("7C-4", "the arrangement committed", /updated/i.test(String(after.done)) || Boolean((last?.response as { ok?: boolean })?.ok),
        `done=${after.done} inForce=${after.inForce}`);
    await page.screenshot({ path: `${OUT}/b1-7c-after.png` });
    writeFileSync(`${OUT}/b1-7c.json`, JSON.stringify({ findings: F, payload: last?.request?.payload }, null, 2));
});
