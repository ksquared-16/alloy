/**
 * §3–§14 — one governed posting, and the six time identities around it.
 *
 * September 2026 is CLOSED; October onward are open. A charge whose service date falls in
 * September must therefore post successfully and have its ACCOUNTING attribution deferred to
 * October, while every commercial fact about it stays exactly where it was.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-accounting";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(560_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("posting attribution and deferral", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    /* An existing SEPTEMBER draft — no new fixture residue is created for this proof. */
    const specimen = await page.evaluate(async () => {
        const j = async (u: string) => { const r = await fetch(u, { credentials: "include", cache: "no-store" }); return r.ok ? r.json() : { error: r.status }; };
        const q = await j("/api/admin/financials/charge?view=queue");
        return { probe: JSON.stringify(q).slice(0, 400) };
    });
    log(`queue probe: ${specimen.probe}`);

    // Reach the Charges section, which owns charge detail.
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    await page.waitForTimeout(9000);
    await page.locator('[data-workspace-section-tab="charges"]').first().click({ force: true });
    await page.waitForTimeout(12_000);

    const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-financials-queue-row]")).map((e) => ({
            chargeId: e.getAttribute("data-financials-queue-row"),
            text: (e as HTMLElement).innerText.replace(/\n+/g, " · "),
        })),
    );
    log(`queue rows: ${rows.length}`);
    for (const r of rows.slice(0, 8)) log(`  ${r.chargeId} · ${r.text}`);
    /* September, and a positive obligation rather than a discount, so the specimen is a charge. */
    const pick = rows.find((r) => /September 2026/.test(r.text ?? "") && !/-\$/.test(r.text ?? ""));
    out.specimenRow = pick ?? null;
    log(`\nSPECIMEN: ${JSON.stringify(pick)}`);
    if (!pick) { writeFileSync(`${OUT}/posting-attribution.json`, JSON.stringify({ blocked: "no September draft", rows }, null, 2)); return; }

    await page.locator(`[data-financials-queue-row="${pick.chargeId}"]`).first().click({ force: true });
    await page.waitForTimeout(10_000);

    const readDetail = async (label: string) => {
        const d = await page.evaluate(async (id) => {
            const r = await fetch(`/api/admin/financials/charge?charge_id=${id}`, { credentials: "include", cache: "no-store" });
            const b = r.ok ? await r.json() : { error: r.status };
            const det = (b.detail ?? b) as Record<string, any>;
            return {
                status: det.status ?? null,
                serviceDate: det.serviceDate ?? det.service_date ?? null,
                billingPeriod: det.billingPeriod ?? det.billing_period ?? null,
                invoiceDate: det.invoiceDate ?? det.billable_on ?? null,
                dueDate: det.dueDate ?? det.due_date ?? null,
                accountingPeriod: det.accountingPeriod ?? null,
                grossCents: det.grossCents ?? det.amountCents ?? det.amount_cents ?? null,
                subject: det.subjectLabel ?? det.childName ?? null,
                reductions: det.reductions ?? null,
                responsibility: det.responsibility ?? null,
                payments: det.payments ?? null,
                raw: JSON.stringify(det).slice(0, 900),
            };
        }, pick.chargeId);
        log(`\n--- ${label} ---\n${JSON.stringify(d, null, 1)}`);
        return d;
    };

    out.before = await readDetail("BEFORE (draft)");
    await page.screenshot({ path: `${OUT}/posting-before.png`, fullPage: true });
    writeFileSync(`${OUT}/posting-attribution.json`, JSON.stringify(out, null, 2));
});
