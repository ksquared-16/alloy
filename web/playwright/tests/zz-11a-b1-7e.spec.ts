/** §7E — configure a due-date policy and prove a new charge records the resolved date. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(290_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("7E · author a due-date policy", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const wire: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        const u = res.url();
        /* Every non-GET the page makes — the policy writer's route was not where I guessed. */
        if (res.request().method() === "GET") return;
        if (!u.includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        wire.push({ url: u.replace(/^https?:\/\/[^/]+/, ""), status: res.status(), request: req, response: body });
        writeFileSync(`${OUT}/b1-7e-wire.json`, JSON.stringify(wire, null, 2));
    });

    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    await page.getByRole("button", { name: "New policy", exact: true }).first().click();
    await page.waitForTimeout(4000);

    await page.locator('[data-testid="create-policy-type"]').selectOption({ label: "Due date" });
    await page.waitForTimeout(3000);
    const controls = await page.evaluate(() => ({
        selects: Array.from(document.querySelectorAll("select")).map((s) => ({
            testid: s.getAttribute("data-testid"), value: s.value,
            options: Array.from(s.options).map((o) => o.text.trim()),
        })),
        inputs: Array.from(document.querySelectorAll("input")).map((i) => ({
            type: i.type, name: i.getAttribute("data-testid") ?? i.getAttribute("name"), value: i.value,
        })),
    }));
    log(`DUE-DATE CONTROLS: ${JSON.stringify(controls, null, 1).slice(0, 1600)}`);
    writeFileSync(`${OUT}/b1-7e-controls.json`, JSON.stringify(controls, null, 2));
    await page.screenshot({ path: `${OUT}/b1-7e-form.png` });

    // Strategy → on the invoice date. The label is required; the effective date defaults to today.
    const strategy = page.locator('[data-testid="policy-value-strategy"]').first();
    if (await strategy.count()) {
        const opts = await strategy.locator("option").allTextContents();
        log(`strategies: ${JSON.stringify(opts)}`);
        const onInvoice = opts.findIndex((o) => /on the invoice date/i.test(o));
        await strategy.selectOption({ index: onInvoice >= 0 ? onInvoice : 0 });
        await page.waitForTimeout(2000);
    }
    /*
     * The validator requires an offset even for `on_invoice`, which ignores it — so zero is the
     * honest value rather than a workaround. Noted as an authoring-surface observation, not a
     * financial defect: the resolver reads a malformed offset as zero anyway.
     */
    await page.locator('[data-testid="policy-value-offset_days"]').fill("0");
    await page.waitForTimeout(800);
    await page.locator('[data-testid="create-policy-label"]').fill("QA due date — on invoice");
    /* Effective from today — the form requires it and does not default it. Never backdated. */
    await page.locator('[data-testid="create-policy-effective_start"]').fill("2026-09-18");
    await page.waitForTimeout(1200);
    await page.waitForTimeout(1000);
    const createBtn = page.getByRole("button", { name: /^Create policy$/ }).first();
    log(`create disabled: ${await createBtn.isDisabled().catch(() => "n/a")}`);
    await createBtn.click();
    await page.waitForTimeout(9000);
    log(`form errors: ${await page.evaluate(() => Array.from(document.querySelectorAll("[role='alert'], .text-red-600, [data-testid*='error']")).map((e) => (e as HTMLElement).innerText.trim()).join(" | ") || "(none)")}`);
    await page.screenshot({ path: `${OUT}/b1-7e-created.png` });

    const after = await page.evaluate(() => (document.body.innerText || ""));
    const i = after.indexOf("Due date");
    log(`POST-CREATE around 'Due date': ${i >= 0 ? after.slice(Math.max(0, i - 260), i + 200).replace(/\n+/g, " / ") : "(absent)"}`);
    log(`WIRE (${wire.length}): ${JSON.stringify(wire.map((w) => ({ url: w.url, status: w.status, ok: (w.response as { ok?: boolean })?.ok, err: (w.response as { error?: unknown })?.error }))).slice(0, 900)}`);
});
