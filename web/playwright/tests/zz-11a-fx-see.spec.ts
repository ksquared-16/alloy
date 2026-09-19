/**
 * The rows exist — the creation response carries their org and opportunity — and the pricing read
 * still answers with none. Two readers, one table: if the Children card now drops the `unlinked:`
 * prefix, the rows are visible and the pricing reader's own query is what is failing.
 *
 * `buildOpportunityTuitionViews` discards its error (`const { data } = await …`) and returns [] on
 * any failure, so a broken query and an empty table are indistinguishable from outside. That is the
 * hypothesis this separates.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const OPP = "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";

test("who can see the assignments", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);

    const dom = await page.evaluate(() => ({
        children: Array.from(document.querySelectorAll("[data-children-child]")).map((e) => e.getAttribute("data-children-child")),
        tuition: {
            count: document.querySelector("[data-assignment-tuition]")?.getAttribute("data-tuition-count") ?? null,
            text: (document.querySelector('[data-universal-card-key="assignment_tuition"]') as HTMLElement | null)?.innerText?.slice(0, 900) ?? null,
        },
        assignments: Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
            ocm: e.getAttribute("data-tuition-assignment"),
            member: e.getAttribute("data-tuition-member"),
            state: e.getAttribute("data-tuition-state"),
            child: (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null,
        })),
    }));

    const api = await page.evaluate(async (opp) => {
        const r = await fetch(`/api/admin/financial-config/opportunity/${opp}?t=${Date.now()}`, { credentials: "include", cache: "no-store" });
        const b = (await r.json().catch(() => null)) as { assignments?: unknown[]; enrollments?: unknown[] } | null;
        return { status: r.status, assignments: b?.assignments?.length ?? null, enrollments: b?.enrollments?.length ?? null };
    }, OPP);

    writeFileSync(`${OUT}/who-sees.json`, JSON.stringify({ dom, api }, null, 2));
    await page.screenshot({ path: `${OUT}/who-sees.png`, fullPage: true });
    log(`children card ids: ${JSON.stringify(dom.children)}`);
    log(`financial-config: ${JSON.stringify(api)}`);
    log(`tuition card count=${dom.tuition.count} assignments=${JSON.stringify(dom.assignments)}`);
    log(`--- tuition text ---\n${dom.tuition.text}`);
});
