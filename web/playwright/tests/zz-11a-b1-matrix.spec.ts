/** Section 7 matrix — A configuration · B Summary · C Details · D Workspace, on the settled candidate. */
import { test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-b1";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(280_000);
const F: Array<{ row: string; what: string; ok: boolean; observed: string }> = [];
const rec = (row: string, what: string, ok: boolean, observed: string) => {
    F.push({ row, what, ok, observed });
    console.log(`${ok ? "PASS" : "FAIL"} ${row.padEnd(7)} ${what} → ${observed}`); // eslint-disable-line no-console
};
const save = () => writeFileSync(`${OUT}/b1-matrix.json`, JSON.stringify(F, null, 2));

test("MATRIX A · /organization/financials", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const seen: Record<string, string> = {};
    for (const ch of ["tuition", "catalog", "policies", "accounting", "simulator"]) {
        await page.goto(`/settings/organization/financials?chapter=${ch}`, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(9000);
        /* The resolved-today panel sits well past the first screenful; 1100 chars cut it off. */
        seen[ch] = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "));
    }
    rec("A-tuition", "tuition plans and billing frequencies reachable", /Tuition Plans/.test(seen.tuition!) && /Billing Frequencies/.test(seen.tuition!), seen.tuition!.slice(0, 140));
    rec("A-catalog", "catalog charge types reachable", /New Catalog Item/.test(seen.catalog!), seen.catalog!.slice(0, 120));
    rec("A-gl", "GL codes and category mapping reachable", /New GL Code/.test(seen.accounting!) && /charge category/i.test(seen.accounting!), seen.accounting!.slice(0, 140));
    rec("A-sim", "commercial simulator reachable", /Preview pricing/.test(seen.simulator!), seen.simulator!.slice(0, 120));
    rec("A-discount", "discount policy authoring reachable", /New Policy/.test(seen.policies!), "New Policy present");
    const active = ["Proration", "Billing cadence", "Posting review", "Due date", "Vacation credit", "Grace period"].filter((t) => seen.policies!.includes(t));
    const inert = ["Late fee", "NSF fee", "Refund policy"].filter((t) => seen.policies!.includes(t));
    rec("A-policy", "six consuming execution policy types offered, inert ones withheld",
        active.length === 6 && inert.length === 0, `active=${active.length} inertShown=${JSON.stringify(inert)}`);
    rec("A-due", "the due-date policy this run authored is in force", /Due date/.test(seen.policies!) && /QA due date/.test(seen.policies!),
        /QA due date/.test(seen.policies!) ? "QA due date policies listed" : "not listed");
    save();
});

test("MATRIX B/C · Focus Panel Summary and Details", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    const summary = await page.evaluate(() => {
        const card = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
        return { text: (card?.innerText ?? "").replace(/\n+/g, " / "), body: card?.querySelector('[data-financials-card-body="true"]') ? "rich" : "sparse" };
    });
    const zones = ["Current period", "Charges", "Discounts & credits", "Net obligation", "Due", "Past due", "Balance", "Paid"];
    const present = zones.filter((z) => new RegExp(z, "i").test(summary.text));
    rec("B", "the approved rich Summary anatomy is intact", summary.body === "rich" && present.length >= 7,
        `body=${summary.body} zones=${present.length}/${zones.length} — ${summary.text.slice(0, 200)}`);
    rec("B-prepaid", "prepaid is shown when positive", /Available/i.test(summary.text), /Available/i.test(summary.text) ? "Available shown" : "silent (no funds)");
    await page.screenshot({ path: `${OUT}/b1-matrix-summary.png` });

    await page.getByRole("button", { name: /^Details$/ }).first().click();
    await page.waitForTimeout(8000);
    const d = await page.evaluate(() => {
        const txt = (document.body.innerText || "");
        const rows = Array.from(document.querySelectorAll(".alloy-os-billingdetail__row")).filter((r) => !r.className.includes("--head"));
        return {
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            rows: rows.length,
            lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
            filters: Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")),
            actions: [...new Set(Array.from(document.querySelectorAll("[data-financials-row-action]")).map((e) => e.getAttribute("data-financials-row-action")))],
            states: [...new Set(Array.from(document.querySelectorAll("[data-financials-responsibility]")).map((e) => e.getAttribute("data-financials-responsibility")))],
            orphanBand: document.querySelectorAll('[data-financials-payment-band="detail"]').length,
            hasGL: /4\d{3} · /.test(txt),
            hasPeriods: /SEPTEMBER 2026|OCTOBER 2026/i.test(txt),
        };
    });
    writeFileSync(`${OUT}/b1-matrix-details.json`, JSON.stringify(d, null, 2));
    rec("C-surface", "one focused Details surface with the full ledger", d.overlay === "detail" && d.rows > 50, `overlay=${d.overlay} rows=${d.rows}`);
    rec("C-lenses", "all five lenses present", d.lenses.length === 5, JSON.stringify(d.lenses));
    rec("C-filters", "subject, period and responsible-party filters offered", d.filters.length >= 3, JSON.stringify(d.filters));
    rec("C-actions", "the row command vocabulary is complete", d.actions.length >= 4, JSON.stringify(d.actions));
    rec("C-resp", "responsibility states include partial disclosure", d.states.includes("partial"), JSON.stringify(d.states));
    rec("C-band", "the payment band is owned by the card, not orphaned", d.orphanBand > 0, `owned bands=${d.orphanBand}`);
    rec("C-gl", "GL and billing periods render on the ledger", d.hasGL && d.hasPeriods, `gl=${d.hasGL} periods=${d.hasPeriods}`);
    await page.screenshot({ path: `${OUT}/b1-matrix-details.png` });
    save();
});

test("MATRIX D · Workspace Accounts parity", async ({ page }) => {
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /Financials — the financial work/ }).first().click();
    await page.waitForTimeout(9000);
    await page.getByRole("tab", { name: /^Accounts$/ }).or(page.getByRole("button", { name: /^Accounts$/ })).first().click({ timeout: 20_000 });
    /* The account list needs longer than the tab click; 6s read the shell, not the queue. */
    await page.waitForTimeout(12_000);
    const listText = await page.evaluate(() => (document.body.innerText || "").replace(/\n+/g, " / "));
    rec("D-zero", "a zero-activity household is reachable and honestly described",
        /nothing billed|No fina|\$0\.00/.test(listText), listText.slice(0, 180));
    rec("D-unavail", "no false Financial Account Unavailable state", !/Financial Account Unavailable/i.test(listText), "absent");
    await page.getByText(/Certhouse Family/).first().click();
    await page.waitForTimeout(9000);
    const d = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll(".alloy-os-billingdetail__row")).filter((r) => !r.className.includes("--head"));
        return {
            rows: rows.length,
            lenses: Array.from(document.querySelectorAll("[data-financials-lens]")).map((e) => e.getAttribute("data-financials-lens")),
            filters: Array.from(document.querySelectorAll("[data-testid^='financials-filter-']")).map((e) => e.getAttribute("data-testid")),
            actions: [...new Set(Array.from(document.querySelectorAll("[data-financials-row-action]")).map((e) => e.getAttribute("data-financials-row-action")))],
            states: [...new Set(Array.from(document.querySelectorAll("[data-financials-responsibility]")).map((e) => e.getAttribute("data-financials-responsibility")))],
            hasGL: /4\d{3} · /.test(document.body.innerText || ""),
        };
    });
    writeFileSync(`${OUT}/b1-matrix-ws.json`, JSON.stringify(d, null, 2));
    rec("D-ledger", "the same ledger, lenses and GL", d.rows > 40 && d.lenses.length === 5 && d.hasGL, `rows=${d.rows} lenses=${d.lenses.length} gl=${d.hasGL}`);
    rec("D-filters", "the same filter vocabulary", d.filters.length >= 3, JSON.stringify(d.filters));
    rec("D-actions", "the same row commands", d.actions.length >= 3, JSON.stringify(d.actions));
    rec("D-resp", "the same responsibility states including partial", d.states.includes("partial"), JSON.stringify(d.states));
    await page.screenshot({ path: `${OUT}/b1-matrix-ws.png` });
    save();
});
