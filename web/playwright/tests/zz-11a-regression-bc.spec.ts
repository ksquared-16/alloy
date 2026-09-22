/**
 * B and C — the Payment surface behind Details, and whether discount/prepaid facts reach Details.
 * DIAGNOSIS: report what is on screen and what the read model carries. No assertions about design.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-regression";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("B/C · open Details and inspect depth + facts", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const vmSeen: Array<Record<string, unknown>> = [];
    page.on("response", async (r) => {
        if (r.url().includes("/api/admin/financials/card")) {
            try {
                const j = await r.json();
                const vm = j?.vm ?? {};
                vmSeen.push({
                    url: r.url().slice(-90),
                    hasPrepaid: !!vm.prepaid,
                    prepaid: vm.prepaid ?? null,
                    reductionsOnRows: (vm.rows ?? []).filter((x: Record<string, unknown>) => ["discount", "credit", "adjustment"].includes(String(x.categoryKey))).length,
                    rowCount: (vm.rows ?? []).length,
                    paymentCount: (vm.payments ?? []).length,
                    unappliedTotal: (vm.payments ?? []).reduce((a: number, p: Record<string, number>) => a + (p.unappliedCents ?? 0), 0),
                });
            } catch { /* ignore */ }
        }
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);

    const details = page.getByRole("button", { name: /^Details$/ }).first();
    if (!(await details.count())) { log("GAP no Details control"); return; }
    await details.click();
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${OUT}/bc-details.png` });

    const r = await page.evaluate(() => {
        const vis = (el: Element) => {
            const s = getComputedStyle(el as HTMLElement);
            const b = (el as HTMLElement).getBoundingClientRect();
            return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0.01 && b.width > 0 && b.height > 0;
        };
        const paymentish = Array.from(document.querySelectorAll("*")).filter((el) => {
            const t = (el as HTMLElement).innerText ?? "";
            return /record payment/i.test(t) && (el as HTMLElement).children.length < 6 && vis(el);
        }).slice(0, 6).map((el) => {
            const h = el as HTMLElement;
            const r2 = h.getBoundingClientRect();
            return { cls: (h.className?.toString() || "").slice(0, 70), z: getComputedStyle(h).zIndex, text: h.innerText.trim().slice(0, 60), box: `${Math.round(r2.width)}x${Math.round(r2.height)}` };
        });
        const detailRoot = document.querySelector(".alloy-os-fdetail__strip, [data-financials-overlay]");
        return {
            detailPresent: !!detailRoot,
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            financialsCards: document.querySelectorAll('[data-financials-card="true"], [data-financials-card="compact"], [data-financials-card-body="true"]').length,
            visibleRecordPayment: paymentish,
            stats: Array.from(document.querySelectorAll(".alloy-os-fdetail__statlabel")).map((e) => (e as HTMLElement).innerText.trim()),
            lensLabels: Array.from(document.querySelectorAll("[class*='lens'], [data-testid*='lens']")).slice(0, 8).map((e) => (e as HTMLElement).innerText.trim().slice(0, 40)),
            bodyHasDiscountWord: /discount/i.test(document.body.innerText),
            bodyHasPrepaidWord: /prepaid|available/i.test(document.body.innerText),
        };
    });
    writeFileSync(`${OUT}/bc.json`, JSON.stringify({ dom: r, vm: vmSeen }, null, 2));
    /* eslint-disable no-console */
    log(`overlay             : ${r.overlay}`);
    log(`financials card nodes: ${r.financialsCards}`);
    log(`detail strip present : ${r.detailPresent}`);
    log(`VISIBLE "record payment" nodes: ${JSON.stringify(r.visibleRecordPayment, null, 1)}`);
    log(`detail stats        : ${JSON.stringify(r.stats)}`);
    log(`body mentions discount=${r.bodyHasDiscountWord} prepaid/available=${r.bodyHasPrepaidWord}`);
    log(`--- VM payloads seen ---\n${JSON.stringify(vmSeen, null, 1)}`);
    /* eslint-enable no-console */
});
