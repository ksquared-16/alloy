/**
 * 11C SLICE 3 — MOUNTED, part B: Policies (including the REQUIRED visual gate), Billing
 * configuration, Assignment billing, and the responsive sweep.
 *
 * §13 is explicit that source using the correct primitive is not sufficient, so the Policies
 * check measures COMPUTED colour on the running product and classifies every blue element as
 * semantic status or action chrome.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice3-mounted";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };
const shot = async (page: Page, n: string) => { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };
async function reach(where: string, locator: Locator, timeout = 30_000) {
    await expect(locator, `§34 reached ${where}`).toHaveCount(1, { timeout });
}

async function openPolicies(page: Page) {
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    const open = page.getByRole("button", { name: /open policies/i }).first();
    await reach("the Policies tile button", open);
    await open.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    await reach("the Policies shell", page.locator('[data-testid="policies-configuration-shell"]').first());
}

async function openBillingFrequencies(page: Page) {
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const open = page.getByRole("button", { name: /open tuition/i }).first();
    await reach("the Tuition tile button", open);
    await open.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
    /* The setup sections are LINKS (next/link), not buttons — the subnav renders <a>. */
    const tab = page.getByRole("link", { name: /billing frequenc/i }).first();
    await reach("the Billing Frequencies tab", tab);
    await tab.click({ timeout: 15_000 });
    await page.waitForTimeout(10_000);
    await reach("a Billing Frequency row", page.locator("[data-billing-recurrence]").first());
}

test("§12 §13 §14 §15 — Policies: summary, the visual gate, master/detail, actions", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openPolicies(page);

    /* §12 — the five facts, before selection. */
    R.rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='policy-']")).slice(0, 8).map((e) => ({
            testid: e.getAttribute("data-testid"),
            text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
            selected: e.getAttribute("aria-selected"),
        })),
    );
    log(`§12 ROWS: ${JSON.stringify(R.rows, null, 1)}`);

    /* §13 — THE VISUAL GATE. Computed colour, classified. */
    R.visual = await page.evaluate(() => {
        const bluish = (rgb: string) => {
            const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgb);
            if (!m) return false;
            const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
            return b > r + 25 && b > g + 15 && Math.max(r, g, b) - Math.min(r, g, b) > 30;
        };
        const out: Record<string, unknown>[] = [];
        for (const el of Array.from(document.querySelectorAll("button, a, [role=tab], [role=option], input, select"))) {
            const cs = getComputedStyle(el as HTMLElement);
            const hit = bluish(cs.backgroundColor) || bluish(cs.color) || bluish(cs.borderTopColor);
            if (!hit) continue;
            const text = (el as HTMLElement).innerText?.replace(/\s+/g, " ").trim().slice(0, 44) ?? "";
            /* A filled blue background on a button is ACTION CHROME; text/border on a badge is STATUS. */
            const filled = bluish(cs.backgroundColor) && cs.backgroundColor !== "rgba(0, 0, 0, 0)";
            out.push({
                tag: el.tagName, role: el.getAttribute("role"), text,
                background: cs.backgroundColor, color: cs.color,
                classification: filled && el.tagName === "BUTTON" ? "ACTION_CHROME" : "SEMANTIC_OR_TEXT",
                className: (el.getAttribute("class") ?? "").slice(0, 80),
            });
        }
        return {
            blueElements: out,
            actionChrome: out.filter((o) => o.classification === "ACTION_CHROME").length,
            bendPineElements: document.querySelectorAll("[class*='bend-pine']").length,
            nativeSelects: document.querySelectorAll("select").length,
        };
    });
    log(`§13 VISUAL: actionChrome=${(R.visual as {actionChrome:number}).actionChrome} bendPine=${(R.visual as {bendPineElements:number}).bendPineElements} nativeSelects=${(R.visual as {nativeSelects:number}).nativeSelects}`);
    for (const e of (R.visual as { blueElements: Record<string, unknown>[] }).blueElements) log(`   BLUE ${JSON.stringify(e)}`);
    await shot(page, "C-policies-landing-1680");

    /* §14 — master/detail: selecting a policy changes the detail to that policy. */
    const rows = page.locator("[data-testid^='policy-']");
    R.rowCount = await rows.count();
    if (R.rowCount) {
        await rows.first().click({ timeout: 15_000 });
        await page.waitForTimeout(8000);
        R.afterSelect = await page.evaluate(() => {
            const sel = document.querySelector("[data-testid^='policy-'][aria-selected='true']");
            const main = document.querySelector("main");
            return {
                selectedTestid: sel?.getAttribute("data-testid") ?? null,
                selectedText: (sel as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").trim().slice(0, 80) ?? null,
                detailPresent: Boolean(main && main.innerText.trim().length > 40),
                detailHead: main?.innerText?.replace(/\s+/g, " ").trim().slice(0, 160) ?? null,
                competingEditors: document.querySelectorAll("form").length,
            };
        });
        log(`§14 AFTER SELECT: ${JSON.stringify(R.afterSelect)}`);
        await shot(page, "D-policy-detail-1680");
    }

    /* §15 — keyboard reaches the primary action with a visible focus ring. */
    const primary = page.locator('[data-testid="policies-new"]').first();
    if (await primary.count()) {
        /*
         * TAB to it, never `.focus()`. `:focus-visible` is only satisfied by keyboard interaction,
         * so a scripted focus reports "no ring" on a button that rings correctly for a real
         * operator — measuring the harness instead of the product.
         */
        await page.locator("body").click({ position: { x: 4, y: 4 } }).catch(() => {});
        let reached = false;
        for (let i = 0; i < 80 && !reached; i += 1) {
            await page.keyboard.press("Tab");
            reached = await page.evaluate(() => Boolean(document.activeElement?.closest('[data-testid="policies-new"]')));
        }
        R.tabReachedPrimary = reached;
        R.primaryAction = await page.evaluate(() => {
            const a = document.activeElement as HTMLElement | null;
            const cs = a ? getComputedStyle(a) : null;
            return {
                focused: a?.innerText?.replace(/\s+/g, " ").trim().slice(0, 40) ?? null,
                background: cs?.backgroundColor ?? null,
                outlineOrRing: `${cs?.outlineStyle ?? ""} ${cs?.boxShadow?.slice(0, 40) ?? ""}`.trim(),
            };
        });
        log(`§15 PRIMARY ACTION: ${JSON.stringify(R.primaryAction)}`);
    }
    save("policies", R);
});

test("§16 §17 §18 §19 §20 — Billing configuration, Semi-Annual, authoring, preview", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openBillingFrequencies(page);

    R.frequencies = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-testid^='billing-frequency-row-']")).map((tr) => {
            const cells = Array.from(tr.querySelectorAll("td")).map((td) => (td as HTMLElement).innerText.replace(/\s+/g, " ").trim());
            const rec = tr.querySelector("[data-billing-recurrence]");
            const prev = tr.querySelector("[data-billing-period-preview]");
            return {
                key: tr.getAttribute("data-testid")?.replace("billing-frequency-row-", ""),
                cells,
                recurrenceBillable: rec?.getAttribute("data-billing-recurrence-billable"),
                previewBillable: prev?.getAttribute("data-billing-period-preview-billable"),
                current: (tr.querySelector("[data-billing-period-current]") as HTMLElement | null)?.innerText ?? null,
                next: (tr.querySelector("[data-billing-period-next]") as HTMLElement | null)?.innerText ?? null,
                none: (tr.querySelector("[data-billing-period-none]") as HTMLElement | null)?.innerText ?? null,
            };
        }),
    );
    log(`§17 FREQUENCIES:`);
    for (const f of R.frequencies as Record<string, unknown>[]) log(`   ${JSON.stringify(f)}`);
    await shot(page, "E-billing-frequencies-1680");

    /* §19 — authoring states the consequence BEFORE Save. */
    /* The control is "New Frequency", addressed by its own testid rather than a guessed name. */
    const add = page.locator('[data-testid="billing-frequency-new"]').first();
    await reach("the New Frequency control", add);
    {
        await add.click({ timeout: 15_000 });
        await page.waitForTimeout(6000);
        await reach("the authoring dialog", page.locator('[data-testid="billing-frequency-dialog"]').first());
        const name = page.locator('[data-testid="billing-frequency-name"]').first();
        await name.fill("Weekly");
        await page.waitForTimeout(1200);
        R.consequenceWeekly = await page.locator('[data-testid="billing-frequency-consequence"]').innerText().catch(() => null);
        R.weeklyBillable = await page.locator('[data-testid="billing-frequency-consequence"]').getAttribute("data-billing-frequency-billable").catch(() => null);
        await name.fill("Semi-Annual");
        await page.waitForTimeout(1200);
        R.consequenceSemi = await page.locator('[data-testid="billing-frequency-consequence"]').innerText().catch(() => null);
        R.semiBillable = await page.locator('[data-testid="billing-frequency-consequence"]').getAttribute("data-billing-frequency-billable").catch(() => null);
        R.dialogFields = await page.evaluate(() => ({
            inputs: Array.from(document.querySelectorAll('[data-testid="billing-frequency-dialog"] input')).map((i) => i.getAttribute("data-testid")),
            nativeSelects: document.querySelectorAll('[data-testid="billing-frequency-dialog"] select').length,
        }));
        log(`§19 CONSEQUENCE weekly="${R.consequenceWeekly}" (${R.weeklyBillable}) semi="${R.consequenceSemi}" (${R.semiBillable})`);
        log(`§19 FIELDS: ${JSON.stringify(R.dialogFields)}`);
        await shot(page, "F-billing-authoring-1680");
        await page.keyboard.press("Escape");
    }
    save("billing-config", R);
});

test("§21 §22 — Certa weekly and Certb monthly, against the same authority", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const child of ["Certa", "Certb"]) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const card = page.locator("[data-universal-card-key='children']");
        const idx = await card.evaluate((el, who) => {
            const btns = Array.from(el.querySelectorAll("button"));
            const at = btns.findIndex((b) => new RegExp(`${who}\\s+Certhouse`, "i").test(b.innerText || ""));
            if (at < 0) return -1;
            for (let i = at + 1; i < btns.length; i += 1) {
                const t = (btns[i].innerText || "").trim();
                if (/Certhouse/i.test(t)) break;
                if (/→\s*$/.test(t) && !/view children/i.test(t)) return i;
            }
            return -1;
        }, child);
        if (idx >= 0) { await card.locator("button").nth(idx).click({ timeout: 20_000 }); await page.waitForTimeout(14_000); }
        await reach(`${child}'s Assignment`, page.locator("[data-universal-card-key='scheduling']").first());
        R[child] = await page.evaluate((who) => {
            const s = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
            const t = s?.innerText?.replace(/\s+/g, " ") ?? "";
            const subject = (/ASSIGNMENTS\s+\w*\s*(Cert[ab])\s+Certhouse/i.exec(t) || [null, null])[1];
            return {
                subjectInSection: subject,
                subjectMatches: subject?.toLowerCase() === who.toLowerCase(),
                accepted: (/\$[\d,]+\.\d{2}\s*\/?\s*(weekly|monthly|biweekly)/i.exec(t) || [null])[0],
                overridden: (/Overridden \$[\d,]+\.\d{2}\s*\/\s*\w+/i.exec(t) || [null])[0],
                billingLine: (/Billing frequency[^|]{0,140}/i.exec(t) || [null])[0],
                discountLine: (/discount[^|]{0,90}expected to apply/i.exec(t) || [null])[0],
                exceptionLanguage: /Excluded for this assignment|Not eligible|No discount policies configured/i.exec(t)?.[0] ?? null,
            };
        }, child);
        log(`§2${child === "Certa" ? 1 : 2} ${child}: ${JSON.stringify(R[child])}`);
        await shot(page, `${child === "Certa" ? "G" : "H"}-${child.toLowerCase()}-assignment-1680`);
    }
    save("assignment-billing", R);
});
