/**
 * BATCH A — one mounted pass, attributed to Sections 3F, 4A, 5 and 6.
 *
 * Each observation is recorded against the requirement(s) it proves. Nothing is counted by
 * implication: a capability is reported present only where this pass actually saw its control.
 */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-batchA";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);

const F: Array<{ sec: string; id: string; what: string; ok: boolean; observed: string }> = [];
const rec = (sec: string, id: string, what: string, ok: boolean, observed: string) => {
    F.push({ sec, id, what, ok, observed });
    console.log(`${ok ? "OK  " : "GAP "} ${sec} ${id.padEnd(5)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

/** Structure of whatever deep surface is on screen — the same reading for both hosts (§5). */
const surfaceShape = (p: Page) => p.evaluate(() => {
    const q = (s: string) => Array.from(document.querySelectorAll(s));
    const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
    return {
        overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
        rowActions: [...new Set(q("[data-financials-row-action]").map((e) => e.getAttribute("data-financials-row-action")))],
        chargeCommands: [...new Set(q("[data-charge-command]").map((e) => e.getAttribute("data-charge-command")))],
        lenses: q("[data-financials-lens]").map((e) => e.getAttribute("data-financials-lens")),
        lensButtons: [...new Set(q("button").map(txt).filter((t) => /Credits & adjustments|All activity|Charges|Payments/i.test(t)))],
        buttons: [...new Set(q("button").map(txt).filter(Boolean))].slice(0, 45),
        selects: q("select").map((e) => e.getAttribute("data-testid") || (e as HTMLSelectElement).name || "?"),
        statLabels: [...new Set(q(".alloy-os-fdetail__statlabel, [class*='statlabel']").map(txt))].slice(0, 20),
        // Responsibility (§4): reporting zone vs an administration control.
        responsibilityReported: /Responsibility/i.test(document.body.innerText || ""),
        manageResponsibility: q("button, a").filter((e) => /manage responsibility/i.test(txt(e))).length,
        textLen: (document.body.innerText || "").length,
    };
});

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

/* ───────────────────────── SECTION 6 — configuration reachability ───────────────────────── */
test("S6 · /organization/financials configuration inventory", async ({ page }) => {
    const chapters = ["tuition", "catalog", "policies", "accounting", "simulator", "funding"];
    const inventory: Record<string, unknown> = {};

    for (const ch of chapters) {
        await page.goto(`/settings/organization/financials?chapter=${ch}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(9000);
        const shape = await page.evaluate(() => {
            const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 70) ?? "";
            return {
                headings: [...new Set(Array.from(document.querySelectorAll("h1,h2,h3")).map(txt).filter(Boolean))].slice(0, 25),
                buttons: [...new Set(Array.from(document.querySelectorAll("button")).map(txt).filter(Boolean))].slice(0, 30),
                selects: Array.from(document.querySelectorAll("select")).length,
                inputs: Array.from(document.querySelectorAll("input")).length,
                textLen: (document.body.innerText || "").length,
                text: (document.body.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 2500),
            };
        });
        inventory[ch] = shape;
        rec("S6", ch, `chapter "${ch}" renders its own operator surface`, shape.textLen > 1200,
            `textLen=${shape.textLen} headings=${shape.headings.length} controls=${shape.buttons.length}`);
        log(`\n--- ${ch} ---\nheadings: ${shape.headings.join(" | ")}\nbuttons: ${shape.buttons.join(" | ")}`);
        await page.screenshot({ path: `${OUT}/s6-${ch}.png` });
    }

    // The policy TYPE vocabulary is the operator's real configuration surface; it lives in the form.
    await page.goto("/settings/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const newPolicy = page.getByRole("button", { name: /New Policy/i }).first();
    if (await newPolicy.count()) {
        await newPolicy.click();
        await page.waitForTimeout(4000);
        const opts = await page.locator("select option").allTextContents();
        (inventory as Record<string, unknown>).policyTypeOptions = opts;
        rec("S6", "types", "the policy type vocabulary is offered to the operator", opts.length > 0, opts.join(" | ").slice(0, 400));
        await page.screenshot({ path: `${OUT}/s6-policy-types.png` });
    } else {
        rec("S6", "types", "New Policy authoring form reachable", false, "control not found");
    }
    writeFileSync(`${OUT}/s6-inventory.json`, JSON.stringify(inventory, null, 2));
});

/* ─────────── SECTIONS 4A / 5 — Focus Panel Details as the deep surface ─────────── */
test("S4A/S5 · Focus Panel Details", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `${OUT}/s5-focuspanel-details.png` });

    const shape = await surfaceShape(page);
    writeFileSync(`${OUT}/s5-focuspanel.json`, JSON.stringify(shape, null, 2));
    log(`FP buttons: ${shape.buttons.join(" | ")}`);
    log(`FP rowActions: ${JSON.stringify(shape.rowActions)} chargeCommands: ${JSON.stringify(shape.chargeCommands)}`);
    log(`FP statLabels: ${JSON.stringify(shape.statLabels)} selects: ${JSON.stringify(shape.selects)}`);

    rec("S5", "FP-1", "Focus Panel Details is the deep surface", shape.overlay === "detail", `overlay=${shape.overlay}`);
    rec("S5", "FP-2", "row actions are present on the ledger", shape.rowActions.length > 0, JSON.stringify(shape.rowActions));
    rec("S4", "4A-FP", "Manage responsibility is reachable from Focus Panel Details",
        shape.manageResponsibility > 0,
        shape.manageResponsibility > 0 ? `${shape.manageResponsibility} control(s)`
            : `absent — responsibility is REPORTED here (${shape.responsibilityReported}) but not administered`);
});

/* ─────── SECTIONS 3F / 4A / 5 — Financials Workspace → Accounts as the other deep surface ─────── */
test("S3F/S4A/S5 · Workspace Accounts", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const fin = page.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await fin.count()) { await fin.click(); await page.waitForTimeout(9000); }
    else {
        const alt = page.locator('[aria-label^="Financials"]').first();
        if (await alt.count()) { await alt.click(); await page.waitForTimeout(9000); }
    }
    const accountsTab = page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first();
    if (await accountsTab.count()) { await accountsTab.click(); await page.waitForTimeout(6000); }
    const account = page.getByText(/Certhouse Family/).first();
    const reached = await account.count();
    if (reached) { await account.click(); await page.waitForTimeout(8000); }
    rec("S5", "WS-0", "Workspace Accounts reaches an account", reached > 0, reached ? "Certhouse Family opened" : "account row not found");
    await page.screenshot({ path: `${OUT}/s5-workspace-account.png` });

    const shape = await surfaceShape(page);
    writeFileSync(`${OUT}/s5-workspace.json`, JSON.stringify(shape, null, 2));
    log(`WS buttons: ${shape.buttons.join(" | ")}`);
    log(`WS rowActions: ${JSON.stringify(shape.rowActions)} chargeCommands: ${JSON.stringify(shape.chargeCommands)}`);
    log(`WS statLabels: ${JSON.stringify(shape.statLabels)} selects: ${JSON.stringify(shape.selects)}`);
    log(`WS lensButtons: ${JSON.stringify(shape.lensButtons)}`);

    rec("S3", "3F-1", "Workspace offers Add on the account", shape.buttons.some((b) => /^Add\b/.test(b)),
        shape.buttons.filter((b) => /Add/i.test(b)).join(" | ") || "no Add control");
    rec("S4", "4A-WS", "Manage responsibility is reachable from Workspace Accounts",
        shape.manageResponsibility > 0,
        shape.manageResponsibility > 0 ? `${shape.manageResponsibility} control(s)` : "not at the account level");

    // A charge row is where the Workspace hangs its responsibility panel — follow one.
    const row = page.locator("[data-charge-id]").first();
    if (await row.count()) {
        await row.click();
        await page.waitForTimeout(6000);
        await page.screenshot({ path: `${OUT}/s5-workspace-charge.png` });
        const deep = await surfaceShape(page);
        writeFileSync(`${OUT}/s5-workspace-charge.json`, JSON.stringify(deep, null, 2));
        log(`WS-charge buttons: ${deep.buttons.join(" | ")}`);
        rec("S4", "4A-WSC", "Manage responsibility is reachable from a Workspace charge",
            deep.manageResponsibility > 0,
            deep.manageResponsibility > 0 ? `${deep.manageResponsibility} control(s) on the charge detail` : "absent on the charge detail too");
    } else {
        rec("S4", "4A-WSC", "a charge row is reachable in the Workspace", false, "no [data-charge-id] row");
    }
});

test.afterAll(() => {
    writeFileSync(`${OUT}/batchA.json`, JSON.stringify(F, null, 2));
    console.log(`\n=== BATCH A MOUNTED ${F.filter((f) => f.ok).length}/${F.length} ===`); // eslint-disable-line no-console
});
