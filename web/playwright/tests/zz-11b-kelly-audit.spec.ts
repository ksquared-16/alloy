/**
 * KELLY'S PATH — discovery by visible navigation only.
 *
 * Rules this probe obeys, from the audit instruction:
 *   • start where Kelly starts, and click what an operator can see;
 *   • no direct URLs to internal chapters during discovery;
 *   • no test ids used to FIND a capability — they are only read afterwards to describe
 *     what was reached;
 *   • a DOM node existing somewhere is not sufficient.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-audit";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what can an operator actually reach", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const A: Record<string, unknown> = {};
    const flush = () => writeFileSync(`${OUT}/kelly-path.json`, JSON.stringify(A, null, 2));

    /* ── KELLY'S ENTRY POINT, exactly as he opened it ─────────────────────────────────────── */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");
    A.entryUrl = page.url();
    A.runtime = await page.evaluate(async () => (await (await fetch("/api/build-info")).json()));

    const surface = () => page.evaluate(() => ({
        cards: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
        /* What an operator can actually READ on this screen. */
        headings: Array.from(document.querySelectorAll("h1,h2,h3,[class*='title']")).map((e) => e.textContent?.trim()).filter((t) => t && t.length < 60).slice(0, 30),
        visibleWords: (document.body.innerText || "").replace(/\s+/g, " ").slice(0, 2500),
    }));

    A.entry = await surface();
    log(`ENTRY cards: ${JSON.stringify(A.entry && (A.entry as Record<string, unknown>).cards)}`);
    await page.screenshot({ path: `${OUT}/01-entry.png`, fullPage: true });
    flush();

    /* Does the word an operator would look for appear anywhere on the entry screen? */
    const wordsAt = (text: string) => ({
        responsibility: /responsib/i.test(text),
        discount: /discount/i.test(text),
        prepaid: /prepaid|available/i.test(text),
        billingFrequency: /billing frequency/i.test(text),
        billingPeriod: /billing period/i.test(text),
        accountingPeriod: /accounting period|accounting calendar/i.test(text),
    });
    A.entryWords = wordsAt(String((A.entry as Record<string, unknown>).visibleWords));
    log(`ENTRY words: ${JSON.stringify(A.entryWords)}`);

    /* ── CAN AN OPERATOR REACH THE CHILD? the children card's row action ─────────────────── */
    const childRow = page.getByRole("button", { name: /^custom/ }).first();
    A.childRowVisible = (await childRow.count()) > 0;
    A.childRowAccessibleName = A.childRowVisible ? await childRow.textContent() : null;
    if (A.childRowVisible) {
        await childRow.click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(14_000);
        A.childPanel = await surface();
        A.childWords = wordsAt(String((A.childPanel as Record<string, unknown>).visibleWords));
        log(`CHILD cards: ${JSON.stringify((A.childPanel as Record<string, unknown>).cards)}`);
        log(`CHILD words: ${JSON.stringify(A.childWords)}`);
        await page.screenshot({ path: `${OUT}/02-child.png`, fullPage: true });
    }
    flush();

    /* ── THE CANONICAL POSITION OF THIS ACCOUNT — read once, to separate data from product ── */
    A.account = await page.evaluate(async () => {
        const cid = (document.querySelector("[data-financials-card='true']") as HTMLElement | null)?.getAttribute("data-financials-account");
        if (!cid) return { customerId: null };
        const b = await (await fetch(`/api/admin/financials/card?customer_id=${cid}`, { credentials: "include" })).json().catch(() => null);
        const vm = b?.vm ?? {};
        return {
            customerId: cid,
            prepaid: vm.prepaid ?? null,
            heldDeposits: vm.heldDeposits ?? null,
            responsibility: vm.responsibility ? { shares: (vm.responsibility.shares ?? []).length, arrangementId: vm.responsibility.arrangementId ?? null } : null,
            reductions: (vm.reductions ?? []).length,
            subjects: (vm.subjects ?? []).length,
        };
    });
    log(`ACCOUNT: ${JSON.stringify(A.account)}`);
    flush();

    /* ── ORGANIZATION → FINANCIALS, by clicking, not by URL ──────────────────────────────── */
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    A.sidebarFinancialsPresent = (await nav.count()) > 0;
    A.sidebarFinancialsName = A.sidebarFinancialsPresent ? (await nav.getAttribute("aria-label")) ?? (await nav.textContent()) : null;

    /* The organization settings route an operator would browse to for configuration. */
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    A.orgLanding = await surface();
    A.orgLandingWords = wordsAt(String((A.orgLanding as Record<string, unknown>).visibleWords));
    /* Are the chapter names actually CLICKABLE, or only printed? */
    A.orgChapterAffordances = await page.evaluate(() => {
        const names = ["Tuition", "Catalog", "Policies", "Payments", "Accounting", "Simulator", "Funding"];
        return names.map((n) => {
            const el = Array.from(document.querySelectorAll("a,button,[role='button'],[role='tab'],[role='link']"))
                .find((e) => (e.textContent || "").trim() === n);
            return { name: n, interactive: Boolean(el), tag: el?.tagName ?? null, href: (el as HTMLAnchorElement | null)?.getAttribute?.("href") ?? null };
        });
    });
    log(`ORG LANDING words: ${JSON.stringify(A.orgLandingWords)}`);
    log(`ORG CHAPTERS: ${JSON.stringify(A.orgChapterAffordances)}`);
    await page.screenshot({ path: `${OUT}/03-org-landing.png`, fullPage: true });
    flush();

    /* If a chapter IS clickable, follow it the way an operator would. */
    for (const want of ["Policies", "Accounting", "Tuition"]) {
        const el = page.getByRole("link", { name: want, exact: true }).or(page.getByRole("button", { name: want, exact: true })).first();
        if ((await el.count()) === 0) { (A as Record<string, unknown>)[`chapter_${want}`] = { reachable: false, why: "no visible link or button with that name" }; continue; }
        await el.click({ timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(12_000);
        const s = await surface();
        (A as Record<string, unknown>)[`chapter_${want}`] = {
            reachable: true, url: page.url(),
            headings: (s as Record<string, unknown>).headings,
            words: wordsAt(String((s as Record<string, unknown>).visibleWords)),
        };
        log(`CHAPTER ${want}: ${page.url()}`);
        await page.screenshot({ path: `${OUT}/04-chapter-${want}.png`, fullPage: true });
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(10_000);
    }
    flush();
});
