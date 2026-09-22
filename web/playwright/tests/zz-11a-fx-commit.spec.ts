/**
 * §9–§12 — commit the monthly run from the operator surface, rerun it, then the weekly run.
 *
 * The confirm control only exists once something would be billed, which is why the earlier pass
 * reported none: the preview said "nothing to confirm" and meant it. The controls are read from the
 * surface rather than guessed at — a regex for the wrong verb has cost this thread probes before.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const wire: Array<Record<string, unknown>> = [];

async function openGenerate(p: Page) {
    await p.goto("/workspace", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    await p.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await p.waitForTimeout(9000);
    await p.getByRole("tab", { name: /^Charges$/ }).or(p.getByRole("button", { name: /^Charges$/ })).first().click({ timeout: 20_000 });
    await p.waitForTimeout(7000);
    await p.getByRole("button", { name: /Generate a period's tuition/i }).first().click();
    await p.waitForTimeout(5000);
}

async function previewThenConfirm(p: Page, tag: string) {
    await openGenerate(p);
    await p.getByRole("button", { name: /^Preview run$/ }).first().click();
    await p.waitForTimeout(10_000);
    const controls = await p.evaluate(() =>
        Array.from(document.querySelectorAll("button"))
            .map((b) => ({ text: (b as HTMLElement).innerText.trim(), disabled: (b as HTMLButtonElement).disabled }))
            .filter((b) => b.text && b.text.length < 60),
    );
    log(`[${tag}] controls after preview: ${JSON.stringify(controls.filter((c) => /gener|run|confirm|post|bill/i.test(c.text)))}`);
    await p.screenshot({ path: `${OUT}/commit-${tag}-preview.png`, fullPage: true });

    const confirm = p.locator("button", { hasText: /^(Generate|Confirm|Bill|Run)/i }).filter({ hasNotText: /Preview run|Generate a period/i }).first();
    if (!(await confirm.count())) { log(`[${tag}] no confirm control`); return null; }
    const label = (await confirm.innerText()).trim();
    log(`[${tag}] confirming with: "${label}"`);
    await confirm.click();
    await p.waitForTimeout(18_000);
    await p.screenshot({ path: `${OUT}/commit-${tag}-after.png`, fullPage: true });
    const after = await p.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / ").slice(0, 900));
    log(`[${tag}] after: ${after}`);
    return label;
}

test("monthly commit, rerun, then weekly", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    page.on("response", async (res) => {
        if (res.request().method() === "GET" || !res.url().includes("/api/")) return;
        let body: unknown = null; let req: unknown = null;
        try { body = await res.json(); } catch { body = "(unparseable)"; }
        try { req = JSON.parse(res.request().postData() ?? "null"); } catch { req = null; }
        if (!/generate_tuition/i.test(JSON.stringify(req))) return;
        wire.push({ url: res.url().replace(/^https?:\/\/[^/]+/, ""), status: res.status(), request: req, response: body });
        writeFileSync(`${OUT}/commit-wire.json`, JSON.stringify(wire, null, 2));
    });

    await previewThenConfirm(page, "monthly-1");
    await previewThenConfirm(page, "monthly-2");

    /*
     * WEEKLY. The generation surface offers a MONTH and no billing frequency, so a weekly run is
     * not reachable from it — `buildPreview` never passes a cadence either. The registered action
     * does take one, so the weekly specimen is run through the canonical action, and the operator
     * gap is reported rather than papered over.
     */
    const weekly = await page.evaluate(async () => {
        const call = async (mode: string) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.generate_tuition",
                    entity_type: "organization",
                    mode,
                    confirmation: { confirmed: true },
                    payload: { period_key: "2026-09", cadence: "weekly" },
                }),
            });
            return { mode, status: r.status, body: await r.json().catch(() => null) };
        };
        const first = await call("execute");
        const second = await call("execute");
        return { first, second };
    });
    writeFileSync(`${OUT}/weekly-run.json`, JSON.stringify(weekly, null, 2));
    log(`\n=== WEEKLY RUN 1 ===\n${JSON.stringify(weekly.first).slice(0, 3000)}`);
    log(`\n=== WEEKLY RUN 2 ===\n${JSON.stringify(weekly.second).slice(0, 3000)}`);

    log(`\n=== MONTHLY WIRE (${wire.length}) ===`);
    for (const w of wire) log(`${JSON.stringify((w.request as { mode?: unknown })?.mode)} ${JSON.stringify(w.response).slice(0, 1400)}`);
});
