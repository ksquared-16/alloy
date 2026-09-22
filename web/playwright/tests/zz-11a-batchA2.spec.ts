/**
 * BATCH A · pass 2 — responsibility administration (§4), Reverse smoke (§3I), ledger effect (§3G).
 *
 * §4A's question is WHERE the one responsibility administration surface is reachable from. Pass 1
 * proved it is not on Focus Panel Details and not on Workspace Accounts; the source says it hangs
 * off the CHARGES tab's charge detail. This mounts that path rather than trusting the source.
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
    console.log(`${ok ? "OK  " : "GAP "} ${sec} ${id.padEnd(6)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function openFinancialsWorkspace(p: Page) {
    await p.goto("/workspace", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    const fin = p.getByRole("button", { name: /Financials — the financial work/ }).first();
    if (await fin.count()) { await fin.click(); await p.waitForTimeout(9000); }
}

/* ───────── §4A / §4B / §4C — the responsibility administration surface ───────── */
test("S4 · Manage responsibility, from the Charges tab", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await openFinancialsWorkspace(page);

    const chargesTab = page.getByRole("tab", { name: /^Charges$/ }).or(page.getByRole("button", { name: /^Charges$/ })).first();
    const reached = await chargesTab.count();
    if (reached) { await chargesTab.click(); await page.waitForTimeout(7000); }
    rec("S4", "4A-CT", "the Charges tab is reachable in the Financials workspace", reached > 0, reached ? "opened" : "no Charges tab");
    await page.screenshot({ path: `${OUT}/s4-charges-tab.png` });

    // A charge must be SELECTED for its detail — the detail re-resolves every figure by charge id.
    const rows = page.locator("[data-charge-row], [data-testid='charge-row'], tbody tr");
    const n = await rows.count();
    log(`charge rows: ${n}`);
    if (n > 0) { await rows.first().click(); await page.waitForTimeout(7000); }
    await page.screenshot({ path: `${OUT}/s4-charge-detail.png` });

    const shape = await page.evaluate(() => {
        const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 70) ?? "";
        const body = document.body.innerText || "";
        return {
            manage: Array.from(document.querySelectorAll("button, a")).filter((e) => /manage responsibility/i.test(txt(e))).map(txt),
            saysResponsibility: /Responsib/i.test(body),
            saysArrangement: /arrangement/i.test(body),
            // What the model actually represents — shares, percentages, or named parties.
            saysShare: /\bshare\b|\d+\s*%/i.test(body),
            saysUnassigned: /unassigned/i.test(body),
            buttons: [...new Set(Array.from(document.querySelectorAll("button")).map(txt).filter(Boolean))].slice(0, 45),
            excerpt: body.slice(0, 2500),
        };
    });
    writeFileSync(`${OUT}/s4-charge-detail.json`, JSON.stringify(shape, null, 2));
    log(`buttons: ${shape.buttons.join(" | ")}`);
    log(`excerpt:\n${shape.excerpt.slice(0, 1400)}`);

    rec("S4", "4A", "ONE responsibility administration surface is mounted-reachable",
        shape.manage.length > 0, shape.manage.length ? `"${shape.manage.join('", "')}" on the charge detail` : "no Manage responsibility control found on this path");
    rec("S4", "4A-R", "the charge detail states responsibility at all", shape.saysResponsibility,
        `responsibility=${shape.saysResponsibility} arrangement=${shape.saysArrangement} unassigned=${shape.saysUnassigned} share/%=${shape.saysShare}`);

    if (shape.manage.length) {
        await page.getByRole("button", { name: /manage responsibility/i }).first().click();
        await page.waitForTimeout(5000);
        await page.screenshot({ path: `${OUT}/s4-manage-open.png` });
        const form = await page.evaluate(() => {
            const txt = (e: Element) => (e as HTMLElement).innerText?.trim().replace(/\s+/g, " ").slice(0, 60) ?? "";
            return {
                selects: Array.from(document.querySelectorAll("select")).map((s) => ({
                    id: s.getAttribute("data-testid") || s.getAttribute("name") || "?",
                    options: Array.from(s.options).map((o) => o.text.trim()).slice(0, 12),
                })),
                inputs: Array.from(document.querySelectorAll("input")).map((i) => ({
                    type: i.type, name: i.getAttribute("name") || i.getAttribute("data-testid") || i.getAttribute("placeholder") || "?",
                })).slice(0, 15),
                buttons: [...new Set(Array.from(document.querySelectorAll("button")).map(txt).filter(Boolean))].slice(0, 30),
            };
        });
        writeFileSync(`${OUT}/s4-manage-form.json`, JSON.stringify(form, null, 2));
        log(`FORM selects: ${JSON.stringify(form.selects)}`);
        log(`FORM inputs: ${JSON.stringify(form.inputs)}`);
        rec("S4", "4C", "the arrangement form exposes what the model actually supports",
            form.selects.length > 0 || form.inputs.length > 0,
            `selects=${form.selects.length} inputs=${form.inputs.length} — ${JSON.stringify(form.inputs.map((i) => i.name))}`);
    }
});

/* ───────── §3I Reverse smoke · §3G adjustment through the shared ledger ───────── */
test("S3 · Reverse smoke and the credits lens", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);

    // §3I — Reverse raises the canonical focused command, and Cancel returns to the SAME Details.
    const rev = page.locator('[data-financials-row-action="reverse"]').first();
    const hasRev = await rev.count();
    if (hasRev) {
        await rev.click();
        await page.waitForTimeout(4500);
        const opened = await page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            movepanel: document.querySelectorAll("[data-movepanel], .movepanel").length,
        }));
        await page.screenshot({ path: `${OUT}/s3i-reverse.png` });
        rec("S3", "3I-1", "Reverse raises the canonical focused command, not a raw movepanel",
            opened.overlay === "reverse_charge" && opened.movepanel === 0,
            `overlay=${opened.overlay} movepanel=${opened.movepanel}`);

        const cancel = page.getByRole("button", { name: /^Cancel$/ }).first();
        if (await cancel.count()) { await cancel.click(); await page.waitForTimeout(4000); }
        const back = await page.evaluate(() => ({
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            account: !!document.querySelector("[data-financials-card='true']"),
        }));
        rec("S3", "3I-2", "Cancel returns to the SAME Details", back.overlay === "detail" && back.account, JSON.stringify(back));
    } else {
        rec("S3", "3I-1", "a reversible row is present", false, "no reverse row action");
    }

    // §3G — the Credits & adjustments lens isolates reductions through the shared ledger.
    const lens = page.getByRole("button", { name: /Credits & adjustments/i }).first();
    if (await lens.count()) {
        await lens.click();
        await page.waitForTimeout(4000);
        await page.screenshot({ path: `${OUT}/s3g-credits-lens.png` });
        const l = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll("[data-charge-id]"));
            const body = document.body.innerText || "";
            return {
                rows: rows.length,
                concepts: [...new Set((body.match(/\b(Discount|Credit|Adjustment|Reversal)\b/g) ?? []))],
                hasResponsibleCol: /Responsible party/i.test(body),
                hasPeriods: (body.match(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+20\d\d/g) ?? []).slice(0, 6),
                basis: (body.match(/\d+% of \$[\d,.]+/g) ?? []).slice(0, 3),
            };
        });
        writeFileSync(`${OUT}/s3g-credits.json`, JSON.stringify(l, null, 2));
        log(`credits lens: ${JSON.stringify(l)}`);
        rec("S3", "3G-1", "the Credits & adjustments lens isolates reductions in the shared ledger",
            l.concepts.length > 0, `concepts=${JSON.stringify(l.concepts)} rows=${l.rows}`);
        rec("S3", "3G-2", "reduction rows carry period and responsible-party grain",
            l.hasResponsibleCol && l.hasPeriods.length > 0,
            `responsibleCol=${l.hasResponsibleCol} periods=${JSON.stringify(l.hasPeriods)} basis=${JSON.stringify(l.basis)}`);
    }
});

test.afterAll(() => {
    writeFileSync(`${OUT}/batchA2.json`, JSON.stringify(F, null, 2));
    console.log(`\n=== BATCH A2 ${F.filter((f) => f.ok).length}/${F.length} ===`); // eslint-disable-line no-console
});
