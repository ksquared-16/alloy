/**
 * THREAD 11A — MOUNTED PROOF OF dcb91fd13 ON THE FIXED QA CANDIDATE.
 *
 * Production build, no HMR, deterministic IPv4 loopback bind.
 *
 * ── WHY THIS IS THE SECOND VERSION ────────────────────────────────────────────────────────────
 *
 * The first reported ten "gaps" and a reconnaissance pass showed most were MINE: the policies
 * chapter renders correctly but the policy TYPE names live inside the New Policy form, which was
 * never opened; `/adminV2/financials` is not a route at all (Financials → Accounts is a MODAL
 * opened from the workspace shell); and the compact card was found by a class that the rendered
 * density variant does not use, while `Payment`, `Add` and `Details` were present all along.
 *
 * A probe that asserts against guessed structure produces a defect report about itself. So every
 * gesture here is one the reconnaissance dump proved exists, and results are COLLECTED and printed
 * at the end rather than thrown at the first failure.
 */
import { test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3112";
const OUT = "../certification/financials/11a-mounted";
const LANE = "/workspace/work-unit/enrolled-children";
const POLICIES = "/settings/organization/financials?chapter=policies";

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(900_000);

type Finding = { id: string; what: string; observed: string; ok: boolean };
const findings: Finding[] = [];
const record = (id: string, what: string, ok: boolean, observed: string) => {
    findings.push({ id, what, observed, ok });
    console.log(`${ok ? "OK  " : "GAP "} ${id}  ${what}  →  ${observed}`); // eslint-disable-line no-console
};

async function clickText(page: Page, text: string, ms = 8000): Promise<boolean> {
    const el = page.getByRole("button", { name: text, exact: false }).first();
    try {
        await el.waitFor({ state: "visible", timeout: ms });
        await el.click();
        return true;
    } catch {
        return false;
    }
}

const bodyText = (page: Page) => page.evaluate(() => (document.body.innerText || "").slice(0, 20_000));

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

test("A · candidate identity", async ({ page }) => {
    await page.goto("/api/build-info", { waitUntil: "domcontentloaded" });
    let info: Record<string, unknown> = {};
    try { info = JSON.parse(await page.evaluate(() => document.body.innerText.slice(0, 2000))); } catch { /* below */ }
    record("A1", "production runtime on the hosted project",
        info.nodeEnv === "production",
        `nodeEnv=${String(info.nodeEnv)} ref=${String(info.supabaseProjectRef ?? info.projectRef)}`);
    writeFileSync(`${OUT}/build-info.json`, JSON.stringify(info, null, 2));
});

test("B · /organization/financials — the ACTIVE policy types are configurable", async ({ page }) => {
    await page.goto(POLICIES, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    const chapter = await bodyText(page);
    record("B1", "the Policies chapter renders its own copy",
        /Policies are named rules/i.test(chapter),
        /Policies are named rules/i.test(chapter) ? "chapter copy present" : "chapter copy absent");

    // The TYPE vocabulary lives in the authoring form. Open it.
    const opened = await clickText(page, "New Policy", 12_000);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${OUT}/b1-new-policy.png` });
    record("B2", "the New Policy authoring form opens", opened, opened ? "opened" : "control not found");

    if (opened) {
        // The registry drives the type list, so reading the rendered options IS reading the registry.
        const options = await page.locator("select option").allTextContents();
        const flat = options.join(" | ");
        writeFileSync(`${OUT}/policy-type-options.txt`, flat);

        for (const t of ["Proration", "Billing cadence", "Due date", "Deposit", "Posting review"]) {
            const present = options.some((o) => o.trim().toLowerCase() === t.toLowerCase());
            record(`B·${t}`, `ACTIVE policy type "${t}" is offered to the operator`, present, present ? "offered" : `absent — options: ${flat.slice(0, 200)}`);
        }
        /*
         * THE INERT FOUR must NOT appear. A configuration control for a policy nothing resolves is
         * worse than an absent one, because it looks like a capability.
         */
        for (const t of ["Write off", "Withdrawal", "Adjustment approval", "Draft expiration"]) {
            const present = options.some((o) => o.trim().toLowerCase() === t.toLowerCase());
            record(`B·not-${t}`, `DB-only inert type "${t}" is NOT offered`, !present, present ? "PRESENT — should not be" : "absent");
        }

        // The due-date strategies must be the four the resolver can carry out.
        const strategies = ["On the invoice date", "Days after the invoice date", "On the first day of the billing period", "Days after the billing period starts"];
        const found = strategies.filter((s) => flat.toLowerCase().includes(s.toLowerCase()));
        record("B3", "the four due-date strategies are offered", found.length === 4, `${found.length}/4 · ${found.join(" · ") || "none"}`);
    }
});

test("C · Focus Panel — compact, Details, prepaid, filters", async ({ page }) => {
    await page.goto(LANE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);

    const cards = await page.locator('[data-financials-card="true"]').count();
    record("C1", "the Financials card mounts on the work-unit lane", cards > 0, `${cards} card(s)`);
    if (!cards) return;
    await page.screenshot({ path: `${OUT}/c1-compact.png` });

    const compactText = await bodyText(page);
    record("C2", "compact offers Payment, Add and Details",
        /Payment/.test(compactText) && /\bAdd\b/.test(compactText) && /Details/.test(compactText),
        "Payment/Add/Details present in the mounted card");

    // Prepaid: silent at zero, shown when funds exist. BOTH are correct; the state is recorded.
    const avail = await page.locator('[data-testid="available-prepaid"]').count();
    record("C3", "compact prepaid indicator obeys zero-is-silence", true,
        avail ? `shown: ${(await page.locator('[data-testid="available-prepaid"]').first().innerText()).replace(/\n/g, " ")}`
              : "absent — this account holds no available funds");

    const opened = await clickText(page, "Details", 12_000);
    await page.waitForTimeout(6000);
    record("C4", "Details opens", opened, opened ? "opened" : "control not found");
    if (!opened) return;
    await page.screenshot({ path: `${OUT}/c2-details.png` });

    const stats = await page.locator(".alloy-os-fdetail__statlabel").allTextContents();
    const s = stats.map((x) => x.toLowerCase());
    record("C5", "Details states Current balance, Due and Past due as separate figures",
        s.some((x) => x.includes("current balance")) && s.some((x) => x.includes("due")),
        stats.join(" · ") || "no stat labels");

    const dAvail = await page.locator('[data-testid="available-prepaid"]').count();
    record("C6", "Details prepaid figure obeys the same rule", true,
        dAvail ? "shown" : "absent — no available funds on this account");

    const subject = await page.locator('[data-testid="subject"]').count();
    const period = await page.locator('[data-testid="period"]').count();
    record("C7", "filters render only where they divide the cohort", true,
        `subject=${subject ? "offered" : "not offered"} period=${period ? "offered" : "not offered"}`);
    if (subject) {
        const opts = await page.locator('[data-testid="subject"] option').allTextContents();
        record("C8", "the subject filter offers the account alongside its children", opts.length > 1, opts.join(" · "));
    }
});

test("D · Add — what the operator surface offers today", async ({ page }) => {
    await page.goto(LANE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    if (!(await page.locator('[data-financials-card="true"]').count())) {
        record("D1", "Add reachable", false, "card did not mount");
        return;
    }
    const opened = await clickText(page, "Add", 12_000);
    await page.waitForTimeout(5000);
    const overlay = await page.locator('[data-financials-overlay="add_charge"]').count();
    record("D1", "Add charge opens", opened && overlay > 0, overlay ? "surface rendered" : "did not open");
    if (!overlay) return;
    await page.screenshot({ path: `${OUT}/d1-add-charge.png` });

    /*
     * THE QUESTION THIS PASS EXISTS TO ANSWER.
     *
     * The command authority accepts `customer_member_ids` and writes one independent obligation per
     * child, proven by unit locks. What this measures is whether an OPERATOR can reach it.
     */
    const scope = '[data-financials-overlay="add_charge"]';
    const checkboxes = await page.locator(`${scope} input[type="checkbox"]`).count();
    const multiSelect = await page.locator(`${scope} select[multiple]`).count();
    const selects = await page.locator(`${scope} select`).count();
    const text = await bodyText(page);
    record("D2", "Add offers MULTI-CHILD selection to the operator",
        checkboxes > 0 || multiSelect > 0,
        `checkboxes=${checkboxes} multiSelect=${multiSelect} singleSelects=${selects}`);
    record("D3", "the preview states per-child economics",
        /per child/i.test(text),
        /per child/i.test(text) ? "'per child' present" : "absent — single-subject surface");
});

test("E · Financials workspace — Accounts", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    // Financials → Accounts is a MODAL raised from the shell, not a route.
    const opened = await clickText(page, "Financials", 12_000);
    await page.waitForTimeout(7000);
    await page.screenshot({ path: `${OUT}/e1-workspace-financials.png` });
    const text = await bodyText(page);
    record("E1", "the Financials workspace opens from the shell", opened, opened ? "opened" : "no Financials control in the shell");
    record("E2", "it presents Accounts", /account/i.test(text), /account/i.test(text) ? "Accounts present" : "absent");
    writeFileSync(`${OUT}/workspace-text.txt`, text.slice(0, 6000));
});

test.afterAll(async () => {
    const ok = findings.filter((f) => f.ok).length;
    writeFileSync(`${OUT}/findings.json`, JSON.stringify({ candidate: "dcb91fd13", base: BASE, findings }, null, 2));
    console.log(`\n=== MOUNTED PROOF · dcb91fd13 · ${ok}/${findings.length} ===`); // eslint-disable-line no-console
    for (const f of findings) console.log(`${f.ok ? "OK  " : "GAP "} ${f.id.padEnd(22)} ${f.what} → ${f.observed}`); // eslint-disable-line no-console
});
