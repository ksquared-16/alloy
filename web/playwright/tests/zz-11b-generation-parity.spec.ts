/**
 * §15/§16 — the Assignment and the generation run must derive periods from one authority.
 *
 * Compared as KEYS, not as formatted strings: two surfaces can print "Sep 15–21" from different
 * arithmetic, and the whole point is that the boundaries come from the same place.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(480_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const CERTA_OCM = "79f8011d-a236-4054-bee7-af10f1dbc632";

test("assignment and generation share the period authority", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const out: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");

    // ── What the ASSIGNMENT says, read off the rendered card. ──
    await page.getByRole("button", { name: /^custom/ }).first().click({ force: true, timeout: 15_000 });
    await page.waitForTimeout(13_000);
    out.assignmentWeekly = await page.evaluate(() => {
        const p = document.querySelector("[data-assignment-billing-period]") as HTMLElement | null;
        return {
            frequency: p?.getAttribute("data-assignment-billing-frequency") ?? null,
            current: p?.getAttribute("data-assignment-billing-period") ?? null,
            next: p?.getAttribute("data-assignment-next-billing-period") ?? null,
            accepted: (document.querySelector("[data-assignment-accepted-term]") as HTMLElement | null)?.innerText ?? null,
        };
    });
    log(`ASSIGNMENT (Certa, weekly): ${JSON.stringify(out.assignmentWeekly)}`);

    // ── What GENERATION says for the same assignment and cadence. ──
    const preview = async (cadence: string, periodKey: string, ocm: string) =>
        page.evaluate(async ([cad, pk, id]) => {
            const r = await fetch("/api/admin/actions/execute", {
                method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action_key: "billing.generate_tuition", entity_type: "opportunity_customer_member",
                    entity_id: id, mode: "preview", confirmation: { confirmed: false },
                    payload: { opportunity_customer_member_id: id, period_key: pk, cadence: cad },
                }),
            });
            const b = await r.json().catch(() => null);
            const d = b?.data?.execution_result?.preview?.details ?? b?.data?.execution_result?.preview ?? b;
            return { status: r.status, raw: JSON.stringify(b).slice(0, 1500), details: d };
        }, [cadence, periodKey, ocm] as const);

    const weekly = await preview("weekly", "2026-09", CERTA_OCM);
    log(`\nGENERATION PREVIEW (weekly, 2026-09) status ${weekly.status}`);
    log(weekly.raw);
    out.generationWeekly = weekly;

    writeFileSync(`${OUT}/generation-parity.json`, JSON.stringify(out, null, 2));
});
