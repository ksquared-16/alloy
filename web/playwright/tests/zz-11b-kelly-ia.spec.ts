import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("is the organization Financials landing navigable, and is the child panel legible", async ({ page }) => {
    const R: Record<string, unknown> = {};

    /* ── THE ORG LANDING: what can be CLICKED, not what is printed ────────────────────────── */
    await page.goto("/organization/financials", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(15_000);
    expect(page.url()).not.toContain("/login");
    R.landing = await page.evaluate(() => {
        const names = ["Tuition", "Catalog", "Policies", "Payments", "Accounting", "Simulator", "Funding"];
        /* Every element whose text is a chapter name — ANY element, then ask if it is operable. */
        const found = names.map((n) => {
            const all = Array.from(document.querySelectorAll("*")).filter((e) => {
                const own = Array.from(e.childNodes).filter((c) => c.nodeType === 3).map((c) => c.textContent?.trim()).join("");
                return own === n;
            });
            const e = all[0] as HTMLElement | undefined;
            if (!e) return { name: n, present: false };
            /* Walk up looking for anything an operator could click. */
            let p: HTMLElement | null = e, clickable: HTMLElement | null = null, depth = 0;
            while (p && depth < 6) {
                const tag = p.tagName.toLowerCase();
                const role = p.getAttribute("role") ?? "";
                if (tag === "a" || tag === "button" || role === "button" || role === "link" || role === "tab" || p.hasAttribute("onclick")) { clickable = p; break; }
                p = p.parentElement; depth += 1;
            }
            return {
                name: n, present: true, tag: e.tagName,
                clickableAncestor: clickable ? { tag: clickable.tagName, role: clickable.getAttribute("role"), href: clickable.getAttribute("href") } : null,
                cursor: getComputedStyle(e).cursor,
            };
        });
        return {
            chapters: found,
            totalLinks: document.querySelectorAll("a[href]").length,
            hrefsMentioningChapter: Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href")).filter((h) => h && /chapter=/.test(h)),
            fullText: (document.body.innerText || "").replace(/\s+/g, " "),
        };
    });
    const L = R.landing as Record<string, unknown>;
    log(`LANDING chapters: ${JSON.stringify(L.chapters)}`);
    log(`LANDING links with ?chapter=: ${JSON.stringify(L.hrefsMentioningChapter)} (of ${L.totalLinks} links)`);

    /* ── THE CHILD PANEL: full text, not a truncated sample ──────────────────────────────── */
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(17_000);
    await page.getByRole("button", { name: /^custom/ }).first().click({ timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(14_000);
    R.child = await page.evaluate(() => {
        const t = (document.body.innerText || "").replace(/\s+/g, " ");
        const sched = document.querySelector("[data-universal-card-key='scheduling']") as HTMLElement | null;
        return {
            fullTextLength: t.length,
            words: {
                responsibility: /responsib/i.test(t),
                discount: /discount/i.test(t),
                prepaid: /prepaid/i.test(t),
                available: /available/i.test(t),
                billingFrequency: /billing frequency/i.test(t),
                billingPeriod: /billing period|current period/i.test(t),
            },
            schedulingCardPresent: Boolean(sched),
            schedulingText: sched ? sched.innerText.replace(/\s+/g, " ").slice(0, 700) : null,
            discountForecastPresent: Boolean(document.querySelector("[data-assignment-discount-forecast]")),
            manageResponsibilityPresent: Boolean(document.querySelector("[data-financials-manage-responsibility]")),
            financialsCardText: (document.querySelector("[data-financials-card='true']") as HTMLElement | null)?.innerText?.replace(/\s+/g, " ").slice(0, 600) ?? null,
        };
    });
    log(`CHILD: ${JSON.stringify(R.child, null, 1).slice(0, 1800)}`);
    writeFileSync("../certification/financials/11b-audit/kelly-ia.json", JSON.stringify(R, null, 2));
});
