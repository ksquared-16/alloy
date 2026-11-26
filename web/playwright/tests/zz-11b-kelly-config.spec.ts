import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("prerequisite configuration census for Kelly's organization", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);
    expect(page.url()).not.toContain("/login");
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(13_000);

    const c = await page.evaluate(async () => {
        const get = async (u: string) => { const r = await fetch(u, { credentials: "include" }); return { s: r.status, b: await r.json().catch(() => null) }; };
        const ids = [...new Set(Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => e.getAttribute("data-tuition-assignment")).filter(Boolean))] as string[];
        const cid = (document.querySelector("[data-financials-card='true']") as HTMLElement | null)?.getAttribute("data-financials-account") ?? "";
        const cal = await get("/api/admin/financials/accounting-calendar");
        const acc = await get(`/api/admin/financials/card?customer_id=${cid}`);
        const fcs = [];
        for (const id of ids) {
            const f = await get(`/api/admin/financials/reduction-forecast?opportunity_customer_member_id=${id}`);
            fcs.push({ id, status: f.s, gross: f.b?.forecast?.grossCents ?? null, outcomes: f.b?.forecast?.outcomes ?? null,
                       liveExceptions: (f.b?.exceptions ?? []).filter((e: Record<string, unknown>) => e.isLiveNow).length,
                       exceptionReasons: (f.b?.exceptions ?? []).map((e: Record<string, unknown>) => String(e.reason ?? "").slice(0, 60)) });
        }
        const vm = acc.b?.vm ?? {};
        return {
            customerId: cid,
            assignments: ids,
            acceptedTermsPresent: fcs.every((f) => f.gross !== null),
            forecasts: fcs,
            accountingCalendars: (cal.b?.calendars ?? []).length,
            accountingPeriods: (cal.b?.periods ?? []).length,
            accountingActive: (cal.b?.calendars ?? []).filter((x: Record<string, unknown>) => x.is_active).length,
            responsibilityShares: (vm.responsibility?.shares ?? []).length,
            prepaidAvailableCents: vm.prepaid?.availableCents ?? null,
            prepaidHeldCents: vm.prepaid?.heldCents ?? null,
            reductions: (vm.reductions ?? []).length,
            subjects: (vm.subjects ?? []).length,
        };
    });
    log(JSON.stringify(c, null, 1));
    writeFileSync("../certification/financials/11b-audit/kelly-config.json", JSON.stringify(c, null, 2));
});
