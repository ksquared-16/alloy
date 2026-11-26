/**
 * RECONNAISSANCE — what these surfaces ACTUALLY render, before anything is called a defect.
 *
 * The first mounted pass reported gaps that were more likely my own selector assumptions: the
 * "compact" card answered with Details-shaped labels, and two pages returned ~900 characters, which
 * is the size of a shell, not a populated surface. Guessing again would just produce a second wrong
 * report, so this dumps structure instead of asserting against it.
 */
import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = process.env.QA_BASE_URL || "http://127.0.0.1:3112";
const OUT = "../certification/financials/11a-mounted";

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.beforeAll(() => mkdirSync(OUT, { recursive: true }));

async function dump(page: import("@playwright/test").Page, name: string, url: string, waitMs = 9000) {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(waitMs);
    await page.screenshot({ path: `${OUT}/recon-${name}.png`, fullPage: false });

    const report = await page.evaluate(() => {
        const txt = (document.body.innerText || "").replace(/\n{3,}/g, "\n\n");
        const pick = (sel: string) =>
            Array.from(document.querySelectorAll(sel)).slice(0, 40).map((e) => {
                const h = e as HTMLElement;
                return {
                    tag: h.tagName.toLowerCase(),
                    cls: (h.className?.toString() || "").split(/\s+/).slice(0, 3).join(" "),
                    testid: h.getAttribute("data-testid"),
                    text: (h.innerText || "").trim().slice(0, 80),
                };
            });
        return {
            title: document.title,
            url: location.pathname + location.search,
            textLength: txt.length,
            text: txt.slice(0, 3000),
            financialsCards: document.querySelectorAll('[data-financials-card="true"]').length,
            overlay: document.querySelector("[data-financials-overlay]")?.getAttribute("data-financials-overlay") ?? null,
            testids: Array.from(document.querySelectorAll("[data-testid]")).slice(0, 60)
                .map((e) => e.getAttribute("data-testid")),
            billing: pick("[class*='alloy-os-billing__']"),
            fdetail: pick("[class*='alloy-os-fdetail__stat']"),
            selects: pick("select"),
            buttons: Array.from(document.querySelectorAll("button")).slice(0, 40)
                .map((b) => (b as HTMLElement).innerText.trim().slice(0, 40)).filter(Boolean),
        };
    });

    writeFileSync(`${OUT}/recon-${name}.json`, JSON.stringify(report, null, 2));
    log(`\n########## ${name} · ${report.url} · title="${report.title}" ##########`);
    log(`textLength=${report.textLength} financialsCards=${report.financialsCards} overlay=${report.overlay}`);
    log(`testids: ${(report.testids ?? []).filter(Boolean).join(", ") || "(none)"}`);
    log(`buttons: ${report.buttons.join(" | ") || "(none)"}`);
    log(`--- TEXT (first 1200) ---\n${report.text.slice(0, 1200)}`);
}

test("recon · organization financials policies", async ({ page }) => {
    await dump(page, "org-policies", "/adminV2/settings/organization/financials?chapter=policies", 12_000);
});

test("recon · financials workspace", async ({ page }) => {
    await dump(page, "workspace", "/adminV2/financials", 12_000);
});

test("recon · work-unit lane financials card", async ({ page }) => {
    await dump(page, "lane", "/workspace/work-unit/enrolled-children", 14_000);
});
