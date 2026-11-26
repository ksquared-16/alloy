/**
 * POSITIVE AVAILABLE PREPAID — created through the CANONICAL command, then measured end to end.
 *
 * Zero prepaid is correct doctrine and is already proven, but a capability an operator cannot see is
 * one he cannot QA. This overpays a posted charge through `payment.record` — the same registered
 * action the operator uses — so the remainder lands as unapplied money on the account. Nothing is
 * written directly to the database and no production semantics change.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-prepaid";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("create positive prepaid and prove it reaches the operator", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);

    const made = await page.evaluate(async () => {
        const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });
        // The account this lane shows, read through the card API the product itself uses.
        const cust = "29944d3e-8267-45b7-8dcb-7405060e2573";
        const vm = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm;
        const before = vm?.prepaid ?? null;
        const payable = (vm?.rows ?? []).find((r: Record<string, unknown>) => r.offersPayment && Number(r.outstandingCents) > 0);
        if (!payable) return { step: "no_payable_row", before, rows: (vm?.rows ?? []).length };

        // OVERPAY: outstanding + $200, so $200 is left unallocated on the account.
        const overpay = Number(payable.outstandingCents) + 20_000;
        const exec = await j(await fetch("/api/admin/actions/execute", {
            method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
            body: JSON.stringify({
                action_key: "payment.record",
                // The action's own contract: the subject is a person/child, the CHARGE travels in
                // the payload. Naming the charge as the entity is refused, correctly.
                entity_type: "child",
                entity_id: payable.subjectMemberId ?? cust,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: { charge_id: payable.chargeId, amount_cents: overpay, method: "ach", reference_number: "QA-PREPAID-FIXTURE" },
            }),
        }));
        const after = (await j(await fetch(`/api/admin/financials/card?customer_id=${cust}`, { credentials: "include" }))).body?.vm?.prepaid ?? null;
        return { step: "done", chargeId: payable.chargeId, outstanding: payable.outstandingCents, overpay, execStatus: exec.status, execOk: exec.body?.ok, execErr: exec.body?.error, before, after };
    });
    writeFileSync(`${OUT}/fixture.json`, JSON.stringify(made, null, 2));
    log(JSON.stringify(made, null, 1).slice(0, 1600)); // eslint-disable-line no-console

    // Now measure what the OPERATOR sees.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    await page.screenshot({ path: `${OUT}/prepaid-card.png` });
    const seen = await page.evaluate(() => {
        const txt = document.body.innerText || "";
        const el = document.querySelector('[data-testid="available-prepaid"]') as HTMLElement | null;
        return {
            indicatorPresent: !!el,
            indicatorText: el?.innerText?.replace(/\n/g, " ") ?? null,
            mentionsAvailable: /available/i.test(txt),
            balanceLine: (txt.match(/Balance[^\n]*\n[^\n]*/) ?? [])[0] ?? null,
        };
    });
    /* eslint-disable no-console */
    log(`indicator present : ${seen.indicatorPresent}  "${seen.indicatorText}"`);
    log(`mentions Available: ${seen.mentionsAvailable}`);
    log(`balance line      : ${seen.balanceLine}`);
    /* eslint-enable no-console */
});
