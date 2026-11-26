/** §10 — the six time identities of one posted specimen, from the canonical charge detail. */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-accounting";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const SPECIMEN = "18e860f9-8ce5-4645-9283-ca3ebcb9a4a9";

test("six identities", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11_000);
    expect(page.url()).not.toContain("/login");
    const out = await page.evaluate(async (id) => {
        const r = await fetch(`/api/admin/financials/charge/${id}`, { credentials: "include", cache: "no-store" });
        const b = await r.json().catch(() => null);
        const d = (b?.detail ?? b) as Record<string, any> | null;
        if (!d) return { status: r.status, raw: JSON.stringify(b).slice(0, 400) };
        return {
            status: r.status,
            chargeStatus: d.status ?? null,
            gross: d.grossCents ?? d.amountCents ?? null,
            subject: d.subjectLabel ?? d.childLabel ?? null,
            // ── the six ──
            serviceDate: d.serviceDate ?? null,
            billingPeriodLabel: d.billingPeriodLabel ?? null,
            invoiceDate: d.invoiceDate ?? null,
            dueDate: d.dueDate ?? null,
            payments: Array.isArray(d.payments) ? d.payments.length : d.payments ?? null,
            accountingPeriod: d.accountingPeriod ?? null,
            accountingDeferredFrom: d.accountingDeferredFrom ?? null,
            // ── non-mutation companions ──
            reductions: Array.isArray(d.reductions) ? d.reductions.length : d.reductions ?? null,
            responsibility: d.responsibility ?? null,
            accountArrangement: d.accountArrangement ? { id: d.accountArrangement.id, grain: d.accountArrangement.customerMemberId ? "child" : "household" } : null,
            glAccount: d.glAccount ?? null,
        };
    }, SPECIMEN);
    log(JSON.stringify(out, null, 1));
    writeFileSync(`${OUT}/six-identities.json`, JSON.stringify(out, null, 2));
});
