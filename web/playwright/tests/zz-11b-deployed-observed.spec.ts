/**
 * §18 — the three deployed surfaces the previous smoke did NOT drive.
 *
 * The earlier run recorded them as unobserved rather than claiming them, which was right and is
 * why they are here. Each is driven as an operator act, not inferred from a route answering 200.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-final";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(880_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("accounting period, recurring generation preview, prepaid", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    const O: Record<string, unknown> = { build: "deployed" };
    const flush = () => writeFileSync(`${OUT}/deployed-observed.json`, JSON.stringify(O, null, 2));
    const tap = async (sel: string, label: string) => {
        const l = page.locator(sel).first();
        if ((await l.count()) === 0) { log(`  (absent: ${label})`); return false; }
        await l.click({ timeout: 20_000 }).catch((e) => log(`  (click failed ${label}: ${e}`));
        return true;
    };

    /* ── A · ACCOUNTING PERIOD, by opening the chapter rather than guessing a selector ─────── */
    /*
     * THE CHAPTER IS A QUERY PARAMETER, not a tab click. The bare path is a LANDING page whose
     * seven headings are the chapter names — which is why two earlier attempts measured those
     * headings, found no panel, and looked like the panel was missing. `?chapter=accounting` is
     * the section route the page itself documents.
     */
    await page.goto("/organization/financials?chapter=accounting", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    expect(page.url(), "an expired QA session redirects everything to /login").not.toContain("/login");

    /* Read AFTER navigating — a relative URL has no base while the page is still about:blank. */
    O.buildInfo = await page.evaluate(async () => (await (await fetch("/api/build-info")).json()));
    log(`BUILD: ${JSON.stringify(O.buildInfo)}`);

    /*
     * The chapter switcher names itself: `financials-workspace-chapter-<key>`, and the chapter
     * body is `financials-chapter-accounting`. An earlier attempt clicked a button matched by the
     * visible word "Accounting" and nothing opened, so this uses the testids the surface declares.
     */
    O.accountingChapterOpen = (await page.locator('[data-testid="financials-chapter-accounting"]').count()) > 0;
    O.accounting = await page.evaluate(() => {
        const body = document.body.innerText;
        return {
            /* The testids the panel declares, read from the component rather than guessed. */
            chapterBody: Boolean(document.querySelector('[data-testid="financials-chapter-accounting"]')),
            calendarPanel: Boolean(document.querySelector('[data-testid="accounting-calendar-panel"]')),
            glMappingPanel: Boolean(document.querySelector('[data-testid="gl-mapping-panel"]')),
            summary: (document.querySelector('[data-testid="accounting-calendar-summary"]') as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").slice(0, 220) ?? null,
            periodTable: Boolean(document.querySelector('[data-testid="accounting-period-table"]')),
            periodRowCount: document.querySelectorAll('[data-testid^="accounting-period-"]').length,
            /* CLOSE is the lifecycle half 11B built; the note is where "no reopen" is recorded. */
            closeControls: document.querySelectorAll('[data-testid^="accounting-period-close-"]').length,
            adoptOffered: Boolean(document.querySelector('[data-testid="accounting-calendar-adopt"]')),
            lifecycleNote: (document.querySelector('[data-testid="accounting-period-lifecycle-note"]') as HTMLElement | null)?.innerText?.slice(0, 200) ?? null,
            /* The semantics the panel must still carry, read as operator-visible words. */
            mentionsCurrent: /current/i.test(body),
            mentionsOpenClosed: /\bopen\b/i.test(body) && /\bclosed?\b/i.test(body),
            headings: Array.from(document.querySelectorAll("h2,h3,h4")).map((e) => e.textContent?.trim()).filter(Boolean).slice(0, 12),
        };
    });
    log(`ACCOUNTING: ${JSON.stringify(O.accounting)}`);
    await page.screenshot({ path: `${OUT}/deployed-accounting-chapter.png`, fullPage: true });
    flush();

    /* The canonical read behind it, so the panel's claim and the authority's answer agree. */
    O.accountingApi = await page.evaluate(async () => {
        const r = await fetch("/api/admin/financials/accounting-calendar", { credentials: "include" });
        const b = await r.json().catch(() => null);
        const periods = (b?.periods ?? []) as Array<Record<string, unknown>>;
        return {
            status: r.status,
            calendars: (b?.calendars ?? []).length,
            periods: periods.length,
            statuses: [...new Set(periods.map((p) => p.status))],
            today: b?.today ?? null,
            current: periods.filter((p) => p.is_current || p.isCurrent).length,
        };
    });
    log(`ACCOUNTING API: ${JSON.stringify(O.accountingApi)}`);
    flush();

    /* ── B · RECURRING GENERATION PREVIEW, as an operator act ──────────────────────────────── */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(16_000);
    await tap('button:has-text("custom")', "the enrolled child");
    await page.waitForTimeout(14_000);

    /* The preview is the generation action's own promise about the run that would follow. */
    O.generationPreview = await page.evaluate(async () => {
        const r = await fetch("/api/admin/actions/execute", {
            method: "POST", credentials: "include", headers: { "content-type": "application/json" },
            body: JSON.stringify({
                /*
                 * `billing.generate_tuition` declares opportunity_customer_member | opportunity |
                 * child | person, and NOT customer — an earlier attempt sent the household and was
                 * correctly refused with unsupported_entity_type. The subject is the PERIOD; an
                 * entity id only narrows the run.
                 */
                action_key: "billing.generate_tuition", entity_type: "opportunity_customer_member",
                entity_id: document.querySelector("[data-tuition-assignment]")?.getAttribute("data-tuition-assignment") ?? "",
                mode: "preview",
                payload: { period_key: new Date().toISOString().slice(0, 7), billing_frequency: "weekly" },
            }),
        });
        const b = await r.json().catch(() => null);
        return { status: r.status, ok: b?.ok ?? null, summary: b?.preview?.summary ?? b?.result?.summary ?? null, changes: b?.preview?.changes ?? null, error: b?.error ?? null };
    });
    log(`GENERATION PREVIEW: ${JSON.stringify(O.generationPreview).slice(0, 500)}`);
    flush();

    /* ── C · PREPAID, operator-visible, and separate from Balance ──────────────────────────── */
    O.prepaid = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        const text = card?.innerText ?? "";
        const pick = (label: string) => {
            const m = new RegExp(`${label}\\s*\\n?\\s*(\\$[\\d,\\.]+)`, "i").exec(text);
            return m ? m[1] : null;
        };
        return {
            cardPresent: Boolean(card),
            availableShown: /available/i.test(text),
            available: pick("Available"),
            balance: pick("Balance"),
            /* They must be two figures, not one netted into the other. */
            separateFigures: /available/i.test(text) && /balance/i.test(text),
        };
    });
    log(`PREPAID: ${JSON.stringify(O.prepaid)}`);
    await page.screenshot({ path: `${OUT}/deployed-prepaid.png`, fullPage: true });
    flush();
});
