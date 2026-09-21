/**
 * 11C SLICE 3 — FINAL MOUNTED PASS, part B: one derivation model across CONFIGURE → ACCEPT →
 * EXECUTE, the deployed scheduler claim, and the two keyboard sweeps.
 *
 * Generate Tuition is driven in PREVIEW only. Kelly's fixture is not written to.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-final";
const ENTRY = "/workspace/work-unit/enrolled-children";
const POLICY_ID = "5df9fc6c-71e6-4f1b-a00f-f612cecbe9e0";
const POLICY_NAME = "Sibling discount (QA specimen)";

test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (p: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
async function reach(what: string, l: Locator, t = 30_000) { await expect(l, `reached ${what}`).toHaveCount(1, { timeout: t }); }

/** What holds focus, and whether the browser is drawing a ring on it. */
const focused = (page: Page) => page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return null;
    const name = [a.innerText, a.getAttribute("aria-label"), a.getAttribute("title"), a.getAttribute("placeholder")]
        .map((v) => (v ?? "").trim()).find((v) => v.length > 0) ?? "";
    const cs = getComputedStyle(a);
    return {
        tag: a.tagName,
        role: a.getAttribute("role"),
        testId: a.getAttribute("data-testid"),
        name: name.replace(/\s+/g, " ").slice(0, 60),
        /* :focus-visible is the real question — .focus() alone never satisfies it. */
        focusVisible: a.matches(":focus-visible"),
        ring: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor} | box-shadow:${cs.boxShadow.slice(0, 60)}`,
    };
});

/** Keyboard only: Tab until `hit` says this is the control, or give up after `max`. */
async function tabUntil(page: Page, max: number, hit: (f: NonNullable<Awaited<ReturnType<typeof focused>>>) => boolean) {
    const walk: unknown[] = [];
    /*
     * LOOK BEFORE TABBING. A dialog that autofocuses its first field is ALREADY on the control
     * being looked for; a walk that presses Tab first steps straight past it and then reports the
     * field as unreachable by keyboard — a defect in the probe wearing the costume of one in the
     * product.
     */
    const start = await focused(page);
    if (start && hit(start)) return { found: true, steps: 0, at: start, walk: [{ i: -1, ...start }] };
    for (let i = 0; i < max; i += 1) {
        await page.keyboard.press("Tab");
        await page.waitForTimeout(140);
        const f = await focused(page);
        if (!f) continue;
        walk.push({ i, ...f });
        if (hit(f)) return { found: true, steps: i + 1, at: f, walk };
    }
    return { found: false, steps: max, at: null, walk };
}


/**
 * DISMISS THE WAY THE SURFACE ALLOWS, AND SAY WHICH WAY WORKED.
 *
 * Escape is the dismissal these sweeps try first, because it is the one an operator reaches for
 * without looking. Where it does nothing, the sweep is not over — a dialog with a Cancel control
 * is still keyboard-dismissible, and the finding is "Escape is not wired here", not "this cannot
 * be dismissed". Both answers are recorded so the difference stays visible.
 */
async function dismissByKeyboard(page: Page, dialogSel: string) {
    const visible = async () => page.evaluate((sel) => {
        const d = document.querySelector(sel) as HTMLElement | null;
        if (!d) return false;
        const r = d.getBoundingClientRect();
        const cs = getComputedStyle(d);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
    }, dialogSel);

    const before = await visible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(2500);
    const afterEscape = await visible();
    if (!afterEscape) return { before, escapeDismissed: true, cancelUsed: false, afterEscape, final: false, focus: await focused(page) };

    const toCancel = await tabUntil(page, 40, (f) => /^(Cancel|Close|Discard)$/i.test(f.name.trim()));
    if (!toCancel.found) return { before, escapeDismissed: false, cancelUsed: false, cancelReachable: false, afterEscape, final: await visible(), focus: await focused(page) };
    await page.keyboard.press("Enter");
    await page.waitForTimeout(2500);
    return { before, escapeDismissed: false, cancelUsed: true, cancelReachable: true, cancelSteps: toCancel.steps, afterEscape, final: await visible(), focus: await focused(page) };
}

test("§6 — CONFIGURE → ACCEPT → EXECUTE derive periods from one model", async ({ page }) => {
    const R: Record<string, unknown> = {};

    /* ── CONFIGURE: the frequencies the organization authored, and what each derives. ── */
    await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    await reach("the Tuition chapter", page.locator('[data-testid="financials-chapter-tuition"]').first());
    await reach("the Billing Frequencies surface", page.locator('[data-testid="tuition-billing-frequencies-panel"]').first());
    R.configure = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='billing-frequency-row-']")).map((r) => {
            const rec = r.querySelector("[data-billing-recurrence]");
            const per = r.querySelector("[data-billing-period-preview]");
            const cells = Array.from(r.querySelectorAll("td")).map((c) => (c as HTMLElement).innerText.replace(/\s+/g, " ").trim());
            return {
                itemKey: rec?.getAttribute("data-billing-recurrence") ?? r.getAttribute("data-testid"),
                billable: rec?.getAttribute("data-billing-recurrence-billable"),
                recurrence: (rec as HTMLElement | null)?.innerText?.trim() ?? null,
                billingPeriod: (per as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? cells[3] ?? null,
                cells,
            };
        }));
    log(`CONFIGURE ${JSON.stringify(R.configure, null, 1)}`);
    await shot(page, "p6-configure-frequencies");
    const cfg = R.configure as Array<{ itemKey: string; billable: string | null; recurrence: string | null; billingPeriod: string | null }>;
    expect(cfg.length, "the organization has authored frequencies").toBeGreaterThan(0);

    /* ── ACCEPT: what each child's assignment says its period is. ── */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    const children = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-children-child]")).map((e) => ({
            ocm: e.getAttribute("data-children-child"),
            who: /(Cert\w+ Certhouse)/.exec((e as HTMLElement).innerText.replace(/\s+/g, " "))?.[1] ?? null,
        })));
    const accept: Array<Record<string, unknown>> = [];
    for (const c of children) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const row = page.locator(`[data-children-child="${c.ocm}"]`).first();
        await reach(`${c.who}'s row`, row);
        await row.locator('button[title^="Assignments:"]').first().click({ force: true, timeout: 20_000 });
        await page.locator("[data-schedule-surface]").first().waitFor({ state: "visible", timeout: 45_000 });
        await page.waitForTimeout(6000);
        const m = await page.evaluate(() => {
            const s = document.querySelector("[data-schedule-surface]") as HTMLElement | null;
            const t = s?.innerText.replace(/\s+/g, " ") ?? "";
            return {
                surface: Boolean(s),
                /* The authority's own sentence, as the assignment states it. */
                periodLine: /Billing frequency[^|]*?(?=(Accept tuition|DISCOUNTS|$))/.exec(t)?.[0]?.trim() ?? null,
                tuition: /Overridden[^·]*·[^·]*/.exec(t)?.[0]?.trim() ?? null,
                text: t.slice(0, 900),
            };
        });
        expect(m.surface, `${c.who}'s assignment opened`).toBe(true);
        accept.push({ ...c, ...m });
        log(`ACCEPT ${c.who}: ${m.periodLine}`);
    }
    R.accept = accept;

    /* ── EXECUTE: what a generation run for that cadence plans, previewed only. ── */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(9000);
    /*
     * THE SECTION TAB IS A TAB. `getByRole("button", { name: "Charges" })` matches nothing here —
     * the control's role is `tab`, so a role-based locator that guessed "button" waits out its
     * timeout on a surface that is fully present.
     */
    await reach("the Financials workspace", page.locator("[data-adminv2-financials-workspace]").first());
    await page.locator('[data-workspace-section-tab="charges"]').first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(9000);
    await expect(
        page.locator('[data-adminv2-financials-workspace][data-financials-section="charges"]'),
        "Charges is the open section",
    ).toHaveCount(1, { timeout: 30_000 });
    /* §14 — the generation surface, proven by its own panel and not by the button that opens it. */
    await page.locator("[data-financials-bulk-open]").first().click({ force: true, timeout: 20_000 });
    await reach("the Generate tuition panel", page.locator("[data-financials-bulk-panel]").first());
    const period = await page.locator("[data-financials-bulk-period]").first().inputValue();
    const execute: Array<Record<string, unknown>> = [];
    for (const cadence of ["weekly", "monthly"]) {
        await page.locator('[data-testid="financials-bulk-cadence"]').first().click({ force: true });
        await page.waitForTimeout(700);
        await page.locator(`[data-option-value="${cadence}"]`).first().click({ force: true, timeout: 15_000 });
        await page.waitForTimeout(1200);
        const scope = await page.locator('[data-financials-bulk-scope="org_wide"]').first().innerText();
        /* PREVIEW ONLY. Confirm is never pressed; nothing in the fixture is generated. */
        await page.getByRole("button", { name: /^Preview/ }).first().click({ force: true, timeout: 20_000 });
        await page.waitForTimeout(12_000);
        const panel = await page.locator("[data-financials-bulk-panel]").first().innerText();
        execute.push({ cadence, period, scope: scope.replace(/\s+/g, " ").trim(), panel: panel.replace(/\n+/g, " | ") });
        log(`EXECUTE ${cadence} · ${period}: ${panel.replace(/\n+/g, " | ")}`);
        await shot(page, `p6-execute-${cadence}`);
    }
    R.execute = execute;
    save("p6-tuition-parity", R);

    /*
     * ONE MODEL, NOT THREE. The operator chose a cadence; the preview must describe THAT cadence,
     * because the defect this control was built to close was a monthly preview standing in for a
     * weekly run. And the frequency the organization authored must be the vocabulary all three
     * stages speak.
     */
    for (const e of execute) {
        const rx = new RegExp(String(e.cadence).replace("ly", "l(y|ies)?"), "i");
        expect(String(e.scope), `the ${e.cadence} run says it is ${e.cadence}`).toMatch(rx);
    }
    const weeklyAccept = accept.find((a) => /weekly/i.test(String(a.periodLine ?? "")));
    expect(weeklyAccept, "a weekly assignment states a weekly period").toBeTruthy();
    expect(String(weeklyAccept!.periodLine), "and states its current and next period").toMatch(/current period .* next /i);
    expect(cfg.some((c) => /weekly/i.test(c.itemKey ?? "")), "weekly is an authored frequency").toBe(true);
});

test("§7 — the deployed product claims no automatic tuition billing", async ({ page }) => {
    /*
     * Autopay being ACTIVE is not Billing being active. The deployed classification is read from
     * the lineage that built this deployment; what is measured HERE is the claim the product
     * makes to an operator — because the only way a shadow handler becomes a lie is if a surface
     * says tuition bills itself.
     */
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await reach("the Details door", d);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("Financials Details", page.locator("[data-financials-payment-methods]").first());
    const R = await page.evaluate(() => {
        const t = document.body.innerText.replace(/\s+/g, " ");
        const claims = [
            /tuition[^.]{0,40}(automatic|auto-?bill|bills itself|generated automatically)/i,
            /(automatic|automatically)[^.]{0,40}(generate|bill)[^.]{0,20}tuition/i,
        ].map((r) => r.exec(t)?.[0] ?? null).filter(Boolean);
        return {
            autopayMentioned: /autopay/i.test(t),
            autopayText: /Autopay[^|]{0,120}/i.exec(t)?.[0] ?? null,
            automaticBillingClaims: claims,
        };
    });
    log(`SCHEDULER CLAIM ${JSON.stringify(R, null, 1)}`);
    save("p7-scheduler-claim", R);
    expect(R.automaticBillingClaims, "Financials does not claim automatic tuition billing").toEqual([]);
});

test("§8 — Policies, keyboard only", async ({ page }) => {
    await page.goto("/organization/financials?chapter=policies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    await reach("the Policies chapter", page.locator('[data-testid="financials-chapter-policies"]').first());
    await reach("the Policies page", page.locator('[data-testid="policies-configuration-page"]').first());

    const R: Record<string, unknown> = {};
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    /* Reaching the sibling policy's own row by Tab — never by .focus(), which fakes the ring. */
    const toRow = await tabUntil(page, 90, (f) => f.testId === `policy-${POLICY_ID}` || /Sibling discount \(QA specimen\)/.test(f.name));
    R.toRow = { found: toRow.found, steps: toRow.steps, at: toRow.at };
    log(`POLICIES → row ${JSON.stringify(R.toRow, null, 1)}`);
    expect(toRow.found, "the policy row is reachable by Tab").toBe(true);
    expect(toRow.at!.focusVisible, "and shows a real focus ring").toBe(true);

    await page.keyboard.press("Enter");
    await page.waitForTimeout(3500);
    /* §14 — the selection actually happened: the overview for THAT policy is on screen. */
    await reach("the policy overview", page.locator('[data-testid="policy-overview"]').first());
    R.selected = await page.locator('[data-testid="policy-overview"]').first().innerText();
    expect(String(R.selected), "the selected policy is the sibling policy").toContain(POLICY_NAME);

    /* The primary action, reached the same way. */
    const toEdit = await tabUntil(page, 60, (f) => f.testId === "policy-edit" || /^Edit/.test(f.name));
    R.toEdit = { found: toEdit.found, steps: toEdit.steps, at: toEdit.at };
    log(`POLICIES → edit ${JSON.stringify(R.toEdit, null, 1)}`);
    expect(toEdit.found, "the primary action is reachable by Tab").toBe(true);
    expect(toEdit.at!.focusVisible, "and shows a real focus ring").toBe(true);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(4000);

    R.afterActivate = await page.evaluate(() => ({
        dialog: document.querySelectorAll('[role="dialog"]').length,
        nativeSelects: document.querySelectorAll("select:not([data-assignment-tuition-embed])").length,
        alloySelects: document.querySelectorAll(".alloy-select,[data-alloy-select]").length,
        text: (document.querySelector('[role="dialog"]') as HTMLElement | null)?.innerText?.replace(/\n+/g, " | ").slice(0, 400) ?? null,
    }));
    log(`POLICIES → after activate ${JSON.stringify(R.afterActivate, null, 1)}`);
    await shot(page, "p8-policies-keyboard");

    R.afterDismiss = await dismissByKeyboard(page, '[role="dialog"]');
    log(`POLICIES → after dismiss ${JSON.stringify(R.afterDismiss, null, 1)}`);
    await reach("Policies survived the dismissal", page.locator('[data-testid="policies-configuration-page"]').first());
    save("p8-policies-keyboard", R);
    const d8 = R.afterDismiss as { final: boolean };
    expect(d8.final, "the dialog is dismissible by keyboard").toBe(false);

    /*
     * ASSERTED LAST, ON PURPOSE. The control grammar is the part of this sweep that fails, and
     * failing it first would have thrown away the dismissal and focus-restoration evidence that
     * the same run had already earned. Everything above is recorded; this is the verdict.
     */
    expect(
        (R.afterActivate as { nativeSelects: number }).nativeSelects,
        "no native select on the Policies authoring path",
    ).toBe(0);
});

test("§9 — Billing Frequencies, keyboard only", async ({ page }) => {
    await page.goto("/organization/financials?chapter=tuition&setup=frequencies", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    await reach("the Billing Frequencies surface", page.locator('[data-testid="tuition-billing-frequencies-panel"]').first());

    const R: Record<string, unknown> = {};
    await page.locator("body").click({ position: { x: 4, y: 4 } });
    const toNew = await tabUntil(page, 90, (f) => f.testId === "billing-frequency-new" || /^(New|Add) billing frequency/i.test(f.name));
    R.toNew = { found: toNew.found, steps: toNew.steps, at: toNew.at };
    log(`BILLING → new ${JSON.stringify(R.toNew, null, 1)}`);
    expect(toNew.found, "the authoring action is reachable by Tab").toBe(true);
    expect(toNew.at!.focusVisible, "and shows a real focus ring").toBe(true);

    await page.keyboard.press("Enter");
    await page.waitForTimeout(3500);
    /* §14 — the authoring surface, by its own root. */
    await reach("the billing frequency dialog", page.locator('[data-testid="billing-frequency-dialog"]').first());

    R.controls = await page.evaluate(() => ({
        nativeSelects: document.querySelectorAll('[data-testid="billing-frequency-dialog"] select').length,
        alloySelects: document.querySelectorAll('[data-testid="billing-frequency-dialog"] .alloy-select,[data-testid="billing-frequency-dialog"] [data-alloy-select]').length,
        interval: Boolean(document.querySelector('[data-testid="billing-frequency-interval"]')),
        consequence: (document.querySelector('[data-testid="billing-frequency-consequence"]') as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
        billable: document.querySelector("[data-billing-frequency-billable]")?.getAttribute("data-billing-frequency-billable") ?? null,
    }));
    log(`BILLING → controls ${JSON.stringify(R.controls, null, 1)}`);
    expect((R.controls as { nativeSelects: number }).nativeSelects, "no native select in the dialog").toBe(0);

    /* Drive the name field, and read the consequence the authority derives from it. */
    const toName = await tabUntil(page, 40, (f) => f.testId === "billing-frequency-name");
    expect(toName.found, "the name field is reachable by Tab").toBe(true);
    await page.keyboard.type("Semi-Annual");
    await page.waitForTimeout(2500);
    R.semiAnnual = await page.evaluate(() => ({
        consequence: (document.querySelector('[data-testid="billing-frequency-consequence"]') as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim() ?? null,
        billable: document.querySelector("[data-billing-frequency-billable]")?.getAttribute("data-billing-frequency-billable") ?? null,
    }));
    log(`BILLING → Semi-Annual ${JSON.stringify(R.semiAnnual)}`);
    await shot(page, "p9-billing-keyboard");

    /* Dismissed with the keyboard, and nothing authored. */
    R.afterDismiss = await dismissByKeyboard(page, '[data-testid="billing-frequency-dialog"]');
    log(`BILLING → after dismiss ${JSON.stringify(R.afterDismiss, null, 1)}`);
    await reach("the frequencies surface survived", page.locator('[data-testid="tuition-billing-frequencies-panel"]').first());
    save("p9-billing-keyboard", R);
    const d9 = R.afterDismiss as { final: boolean; escapeDismissed: boolean };
    expect(d9.final, "the dialog is dismissible by keyboard").toBe(false);
});
