/**
 * 11B — the DEPLOYED human-path smoke, run against the merged repair on staging.
 *
 * Every path begins from ordinary visible navigation. Absence of the retired card is measured by
 * the RENDERED identity (`assignment_tuition`), never by the registry key `billing_preview` — that
 * selector is the one that let a false absence claim into the certification record.
 *
 * Nothing here writes. The discount fixture is read, never mutated.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-deployed-qa";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2));

const composition = (page: import("@playwright/test").Page) =>
    page.evaluate(() => ({
        cards: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
        standaloneTuitionByRenderedIdentity: Boolean(document.querySelector("[data-universal-card-key='assignment_tuition']")),
        registryKeyPresent: Boolean(document.querySelector("[data-universal-card-key='billing_preview']")),
    }));

test("§4 §5 §10 §11 — entry composition, the child's Assignment, prepaid, fixture", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const R: Record<string, unknown> = {};

    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

    R.buildInfo = await page.evaluate(async () => (await fetch("/api/build-info", { credentials: "include" })).json());
    log(`BUILD: ${JSON.stringify(R.buildInfo)}`);

    R.entry = await composition(page);
    R.prepaidOnSummary = await page.evaluate(() => {
        const c = document.querySelector("[data-universal-card-key='financials']") as HTMLElement | null;
        const t = c?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            cardPresent: Boolean(c),
            availablePrepaidNamed: /available prepaid/i.test(t),
            bareAvailableStillShown: /available(?!\s+prepaid)/i.test(t),
            prepaidAmount: (/available prepaid\s*\$?([\d,]+\.\d{2})/i.exec(t) || [null, null])[1],
            balance: (/balance\s*\$?([\d,]+\.\d{2})/i.exec(t) || [null, null])[1],
            heldPreserved: /held/i.test(t) ? "held-named" : "held-not-on-summary",
            depositPreserved: /deposit/i.test(t) ? "deposit-named" : "deposit-not-on-summary",
            text: t.slice(0, 600),
        };
    });
    log(`ENTRY: ${JSON.stringify(R.entry)}`);
    log(`PREPAID/SUMMARY: ${JSON.stringify(R.prepaidOnSummary)}`);
    await page.screenshot({ path: `${OUT}/d01-entry.png`, fullPage: true });
    save("deployed-entry", R);

    /* ── CHILDREN → the child's own panel, by clicking what the Children card offers ─────── */
    const childBtn = page.getByRole("button", { name: /^custom/ }).first();
    R.childAffordance = {
        present: (await childBtn.count()) > 0,
        accessibleName: (await childBtn.count()) ? (await childBtn.textContent())?.replace(/\s+/g, " ").trim().slice(0, 90) : null,
    };
    if ((await childBtn.count()) > 0) { await childBtn.click({ timeout: 20_000 }); await page.waitForTimeout(13_000); }

    R.childPanel = await composition(page);
    R.assignment = await page.evaluate(() => {
        const s = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
        const t = s?.innerText?.replace(/\s+/g, " ") ?? "";
        return {
            assignmentCardPresent: Boolean(s),
            tuition: /tuition/i.test(t),
            acceptedAmount: (/\$[\d,]+\.\d{2}\/(weekly|monthly|biweekly)/i.exec(t) || [null])[0],
            billingFrequency: (/billing frequency[^|]{0,120}/i.exec(t) || [null])[0],
            currentPeriod: /current period/i.test(t),
            nextPeriod: /next\s+[A-Z][a-z]{2}\s+\d/i.test(t) || /next period/i.test(t),
            responsibility: /who owes|responsib/i.test(t),
            discountsBlock: /discount/i.test(t),
            discountForecast: (/\$[\d,]+\.\d{2}\s*expected to apply/i.exec(t) || [null])[0],
            addExceptionAffordance: Boolean(document.querySelector("[data-add-policy-exception]")),
            diagnostics: /did not apply|no authored|no match/i.test(t),
            /* the fixture must not speak certification language in its ACTIVE answer */
            activeResidue: /A-K|§12|H\/I|duplicate pair|promotion proof/i.test(t),
            liveExceptions: document.querySelectorAll("[data-exception-live]").length,
            endedExceptions: document.querySelectorAll("[data-exception-ended]").length,
            text: t.slice(0, 1400),
        };
    });
    log(`CHILD PANEL: ${JSON.stringify(R.childPanel)}`);
    log(`ASSIGNMENT: ${JSON.stringify(R.assignment)}`);
    await page.screenshot({ path: `${OUT}/d02-assignment.png`, fullPage: true });
    save("deployed-entry", R);
});

test("§6 §7 §8 — Tuition, Policies and Accounting from their tiles", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");

    /* The landing page is a set of TILES. Read each tile's cue BEFORE opening it. */
    R.tiles = await page.evaluate(() =>
        Array.from(document.querySelectorAll("h3")).map((h) => {
            const tile = h.closest("div,section,article") as HTMLElement | null;
            const t = tile?.innerText?.replace(/\s+/g, " ") ?? "";
            const btn = Array.from(tile?.querySelectorAll("button") ?? []).find((b) => /^open /i.test(b.textContent ?? ""));
            return { heading: h.textContent?.trim(), openControl: btn?.textContent?.trim() ?? null, tag: btn?.tagName ?? null, namesDiscount: /discount/i.test(t), summary: t.slice(0, 220) };
        }),
    );
    log(`TILES: ${JSON.stringify(R.tiles, null, 1)}`);

    const openAndRead = async (label: RegExp, shot: string) => {
        await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(10_000);
        const btn = page.getByRole("button", { name: label }).first();
        const present = (await btn.count()) > 0;
        if (present) { await btn.click({ timeout: 20_000 }); await page.waitForTimeout(12_000); }
        await page.screenshot({ path: `${OUT}/${shot}.png`, fullPage: true });
        return {
            controlPresent: present,
            urlAfter: page.url(),
            usedQueryString: false,
            heading: await page.locator("h1,h2").first().innerText().catch(() => null),
            body: (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).slice(0, 2600),
        };
    };

    R.tuition = await openAndRead(/open tuition/i, "d03-tuition");
    const tb = String((R.tuition as { body: string }).body);
    R.tuitionProof = { tuitionPlans: /tuition plan/i.test(tb), billingFrequencies: /billing frequenc/i.test(tb), frequencyWords: (tb.match(/\b(weekly|biweekly|monthly)\b/gi) || []).slice(0, 8) };
    log(`TUITION: ${JSON.stringify(R.tuitionProof)} url=${(R.tuition as { urlAfter: string }).urlAfter}`);

    R.policies = await openAndRead(/open policies/i, "d04-policies");
    const pb = String((R.policies as { body: string }).body);
    R.policiesProof = { destinationHeading: /discounts? (&|and) commercial polic/i.test(pb), policyVisible: /10\s*%|ten percent/i.test(pb), discountWord: /discount/i.test(pb) };
    log(`POLICIES: ${JSON.stringify(R.policiesProof)} url=${(R.policies as { urlAfter: string }).urlAfter}`);

    R.accounting = await openAndRead(/open accounting/i, "d05-accounting");
    const ab = String((R.accounting as { body: string }).body);
    R.accountingProof = {
        calendarPanel: /accounting calendar|calendar/i.test(ab),
        fiscal2026: /fiscal\s*2026/i.test(ab),
        calendarMonth: /calendar month/i.test(ab),
        currentPeriod: /current/i.test(ab),
        periodStates: (ab.match(/\b(open|closed|future|current)\b/gi) || []).slice(0, 10),
        closeControls: await page.getByRole("button", { name: /^close/i }).count(),
        finalityCopy: /closing a period is final/i.test(ab),
        reopenCopy: /reopening one is not an action in alloy/i.test(ab),
    };
    log(`ACCOUNTING: ${JSON.stringify(R.accountingProof)}`);
    save("deployed-org-financials", R);
});

/*
 * §9 / §10 / §12 previously lived here and used `[data-account-row]` / `[data-account-lens]`,
 * which do not exist in the product: Accounts read zero rows and the responsibility check decayed
 * into whole-page substring matches that looked green. Replaced by
 * zz-11b-deployed-responsibility-add.spec.ts and zz-11b-deployed-add.spec.ts, which use the real
 * selectors and scope every read to the surface being measured.
 */
test("§14 — responsive sanity at the authored QA widths", async ({ page }) => {
    const R: Record<string, unknown> = {};
    for (const width of [1280, 1440, 1680]) {
        await page.setViewportSize({ width, height: 1050 });
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(12_000);
        R[`w${width}`] = await page.evaluate(() => ({
            cards: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
            standaloneTuition: Boolean(document.querySelector("[data-universal-card-key='assignment_tuition']")),
            prepaidNamed: /available prepaid/i.test(document.body.innerText),
            horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
            overflowBy: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        log(`${width}: ${JSON.stringify(R[`w${width}`])}`);
        await page.screenshot({ path: `${OUT}/d10-responsive-${width}.png`, fullPage: true });
    }
    save("deployed-responsive", R);
});
