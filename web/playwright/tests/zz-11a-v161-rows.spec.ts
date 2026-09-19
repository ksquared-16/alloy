/**
 * Which record is the panel actually about, and which opportunity carries the enrolled children?
 *
 * Two facts are missing and both are measurable from the lane itself: the card issued NO
 * `/api/admin/financial-config` request at all (so it could not name an opportunity), and the
 * opportunity the panel did fetch a drawer VM for answers that read with zero assignments. This
 * clicks each queue row and records, per row, the opportunity the panel fetches and what the
 * pricing read says for it.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(420_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("rows → opportunity → pricing read", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const seen: string[] = [];
    page.on("request", (r) => {
        const u = r.url().replace(/^https?:\/\/[^/]+/, "");
        if (/view-models\/drawer\/|financial-config/.test(u)) seen.push(u);
    });

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);

    const rows = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[data-queue-row-id],[data-row-id],[data-queue-row]"))
            .slice(0, 12)
            .map((e) => ({
                id: e.getAttribute("data-queue-row-id") ?? e.getAttribute("data-row-id") ?? e.getAttribute("data-queue-row"),
                text: (e as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 80),
            })),
    );
    log(`rows found: ${JSON.stringify(rows, null, 1)}`);

    const perRow: Array<Record<string, unknown>> = [];
    const count = Math.min(rows.length, 6);
    for (let i = 0; i < count; i += 1) {
        seen.length = 0;
        const loc = page.locator("[data-queue-row-id],[data-row-id],[data-queue-row]").nth(i);
        await loc.click({ timeout: 10_000 }).catch(() => undefined);
        await page.waitForTimeout(9000);
        const opp = seen.map((u) => u.match(/drawer\/opportunity\/([0-9a-f-]{36})/)?.[1]).filter(Boolean)[0] ?? null;
        const cardState = await page.evaluate(() => ({
            tuitionCount: document.querySelector("[data-assignment-tuition]")?.getAttribute("data-tuition-count") ?? null,
            empty: !!document.querySelector(".alloy-os-tuition__empty"),
            assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
                ocm: e.getAttribute("data-tuition-assignment"),
                state: e.getAttribute("data-tuition-state"),
                child: (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null,
            })),
        }));
        const pricing = await page.evaluate(async (o) => {
            if (!o) return null;
            const r = await fetch(`/api/admin/financial-config/opportunity/${o}`, { credentials: "include" });
            const b = (await r.json().catch(() => null)) as { assignments?: unknown[] } | null;
            return { status: r.status, assignments: b?.assignments?.length ?? null };
        }, opp);
        perRow.push({ i, row: rows[i], opportunity: opp, financialConfigRequests: seen.filter((u) => /financial-config/.test(u)), cardState, pricing });
        log(`row ${i}: ${JSON.stringify(perRow[i])}`);
    }

    writeFileSync(`${OUT}/v161-rows.json`, JSON.stringify({ rows, perRow }, null, 2));
});
