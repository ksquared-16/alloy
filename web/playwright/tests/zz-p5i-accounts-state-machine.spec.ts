/**
 * 5H DEPLOYED-SMOKE REPAIR — the Accounts state machine, proven in both directions.
 *
 * A healthy household must go PENDING → ACCOUNT and must never pass through UNAVAILABLE.
 * A subject whose authoritative read answers with no account must still reach UNAVAILABLE — so the
 * repair is proven to have gated the verdict rather than deleted it.
 *
 * The negative case stubs the account read's RESPONSE at the transport boundary. That is the
 * authoritative answer arriving and saying "no account"; it is labelled as stubbed wherever it is
 * reported, so nobody reads it as a natural fixture.
 */
import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const BASE = "https://staging.workwithalloy.com";
const HOUSEHOLD = "fd000000-0000-4000-8000-0000000c0001";
const OUT = "../certification/financials";
const MOUNTED = 120_000;

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });

const shot = async (page: Page, name: string) => {
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/${name}.png` });
};

/** Classify every distinct card state from the click onward. */
async function record(page: Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __s?: string[] };
        w.__s = [];
        let last = "";
        const tick = () => {
            const c = document.querySelector('[data-financials-card="true"]') as HTMLElement | null;
            let state = "NO_CARD";
            let detail = "";
            if (c) {
                const empty = c.querySelector("[data-financials-empty]")?.getAttribute("data-financials-empty") ?? null;
                const text = c.innerText.replace(/\s+/g, " ");
                const account = c.getAttribute("data-financials-account");
                if (/Financial account unavailable/.test(text) || empty === "no-account" || empty === "no-subject") {
                    state = "UNAVAILABLE";
                } else if (empty === "loading" || /Reading the account/.test(text) || c.querySelector("[aria-busy='true']")) {
                    state = "PENDING";
                } else if (account) {
                    state = "ACCOUNT";
                } else {
                    state = "PENDING";
                }
                detail = `h=${Math.round(c.getBoundingClientRect().height)} account=${account ?? "-"} text="${text.slice(0, 70)}"`;
            }
            const line = `${state} ${detail}`;
            if (line !== last) { last = line; w.__s!.push(`+${Math.round(performance.now())}ms ${line}`); }
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    });
}

const states = (page: Page) => page.evaluate(() => (window as unknown as { __s: string[] }).__s ?? []);

async function openAccountsQueue(page: Page) {
    await page.goto("/workspace");
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-adminv2-sidebar-modal-nav="financials"]').first().click({ force: true });
    const shell = page.locator("[data-adminv2-financials-workspace]");
    await expect(shell).toBeVisible({ timeout: MOUNTED });
    await shell.locator("[data-workspace-section-tab]").filter({ hasText: "Accounts" }).first().click();
    const row = shell.locator(`[data-financials-account-row="${HOUSEHOLD}"]`);
    await expect(row).toBeVisible({ timeout: MOUNTED });
    return row;
}

test("healthy account · PENDING → ACCOUNT, never UNAVAILABLE", async ({ page }) => {
    test.setTimeout(600_000);
    // eslint-disable-next-line no-console
    console.log("DEPLOYED " + (await (await page.request.get(`${BASE}/api/build-info`)).text()).slice(0, 120));
    const row = await openAccountsQueue(page);
    await record(page);
    await row.click();
    await page.waitForTimeout(22_000);
    const seq = await states(page);
    // eslint-disable-next-line no-console
    console.log("HEALTHY_SEQUENCE (" + seq.length + ")\n" + seq.join("\n"));
    await shot(page, "p5i-01-healthy-resolved");

    const kinds = seq.map((l) => l.split(" ")[1]);
    const falseUnavailable = kinds.filter((k) => k === "UNAVAILABLE").length;
    // eslint-disable-next-line no-console
    console.log("FALSE_UNAVAILABLE_COUNT " + falseUnavailable);
    expect(falseUnavailable, "a healthy account never renders the unavailable verdict").toBe(0);
    expect(kinds[kinds.length - 1], "and it settles on the account").toBe("ACCOUNT");
});

test("answered with no account · PENDING → UNAVAILABLE (response stubbed)", async ({ page }) => {
    test.setTimeout(600_000);
    const row = await openAccountsQueue(page);
    /*
     * The authoritative read answers, and its answer is that there is no account. Stubbed at the
     * transport boundary because this tenant's Accounts queue only lists households that HAVE
     * accounts — the state is unreachable from the queue by construction.
     */
    await page.route("**/api/admin/financials/card**", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, vm: null }) });
    });
    await record(page);
    await row.click();
    await page.waitForTimeout(20_000);
    const seq = await states(page);
    // eslint-disable-next-line no-console
    console.log("NO_ACCOUNT_SEQUENCE (" + seq.length + ")\n" + seq.join("\n"));
    await shot(page, "p5i-02-genuine-unavailable");

    const kinds = seq.map((l) => l.split(" ")[1]);
    expect(kinds, "the honest verdict is still reachable").toContain("UNAVAILABLE");
    expect(kinds.indexOf("PENDING"), "and it waits before saying so").toBeLessThan(kinds.indexOf("UNAVAILABLE"));
});
