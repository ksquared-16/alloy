/**
 * §3/§4 — BILLING PREVIEW, MOUNTED ON v161.
 *
 * The one thing this must not do is report "the metadata contains the card" as if it were a mount.
 * So it measures the RENDERED panel: which `data-universal-card-key` elements exist, how many times
 * `billing_preview` appears, whether `AssignmentTuitionCard`'s own body marker
 * (`data-assignment-tuition`) is inside it, and what the card actually says about the child.
 *
 * It also times the card, because a card that mounts by serializing the panel is a different defect
 * from the one just fixed: `performance.getEntriesByType("resource")` gives the pricing read's own
 * start/end, against the panel's first card commit, so "did anything wait for it" is measured
 * rather than asserted.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("billing_preview mounts, once, with its own body", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });

    const layoutCalls: Array<Record<string, unknown>> = [];
    page.on("response", async (res) => {
        const u = res.url();
        if (!u.includes("/api/admin/entity-layouts/focus-panel-summary")) return;
        try {
            const b = await res.json() as { published?: { version?: number; id?: string } } | null;
            layoutCalls.push({ status: res.status(), version: b?.published?.version ?? null, id: b?.published?.id ?? null });
        } catch { layoutCalls.push({ status: res.status(), version: null, id: null }); }
    });

    // FIRST CARD COMMIT — the moment the panel first paints any card, for the serialization question.
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.addInitScript(() => undefined);
    const t0 = Date.now();
    let firstCardMs: number | null = null;
    try {
        await page.locator("[data-universal-card-key]").first().waitFor({ state: "attached", timeout: 60_000 });
        firstCardMs = Date.now() - t0;
    } catch { /* recorded as null */ }
    await page.waitForTimeout(18_000);

    const observed = await page.evaluate(() => {
        const keys = Array.from(document.querySelectorAll("[data-universal-card-key]"))
            .map((e) => e.getAttribute("data-universal-card-key") ?? "");
        const counts: Record<string, number> = {};
        for (const k of keys) counts[k] = (counts[k] ?? 0) + 1;
        const host = document.querySelector('[data-universal-card-key="billing_preview"]');
        const tuition = host?.querySelector("[data-assignment-tuition]") ?? document.querySelector("[data-assignment-tuition]");
        const assignments = Array.from(document.querySelectorAll("[data-tuition-assignment]")).map((e) => ({
            ocm: e.getAttribute("data-tuition-assignment"),
            member: e.getAttribute("data-tuition-member"),
            state: e.getAttribute("data-tuition-state"),
            accepted: e.getAttribute("data-tuition-accepted"),
            stale: e.getAttribute("data-tuition-stale"),
            resolution: e.getAttribute("data-tuition-resolution"),
            configVersion: e.getAttribute("data-tuition-config-version"),
            child: (e.querySelector(".alloy-os-tuition__child") as HTMLElement | null)?.innerText ?? null,
            facts: Array.from(e.querySelectorAll("[data-tuition-fact]")).map((f) => (f as HTMLElement).innerText),
            options: Array.from(e.querySelectorAll("[data-tuition-option]")).map((o) => ({
                source: o.getAttribute("data-tuition-option"),
                kind: o.getAttribute("data-tuition-option-kind"),
                amount: o.getAttribute("data-tuition-option-amount"),
                cadence: o.getAttribute("data-tuition-option-cadence"),
            })),
            controls: Array.from(e.querySelectorAll("button")).map((b) => (b as HTMLElement).innerText.trim()).filter(Boolean),
            noMatch: e.querySelector("[data-tuition-no-match]")?.getAttribute("data-tuition-no-match") ?? null,
        }));
        const pricingReads = performance.getEntriesByType("resource")
            .filter((r) => /financial-config|financial_config|pricing/i.test(r.name))
            .map((r) => ({ name: r.name.replace(/^https?:\/\/[^/]+/, ""), start: Math.round(r.startTime), end: Math.round(r.startTime + r.duration) }));
        return {
            mountedCardKeys: keys,
            duplicateCards: Object.entries(counts).filter(([, n]) => n > 1),
            billingPreviewCount: counts["billing_preview"] ?? 0,
            billingPreviewHasTuitionBody: !!(host && host.querySelector("[data-assignment-tuition]")),
            tuitionCount: tuition?.getAttribute("data-tuition-count") ?? null,
            tuitionError: (document.querySelector("[data-tuition-error]") as HTMLElement | null)?.innerText ?? null,
            emptyLine: Array.from(document.querySelectorAll(".alloy-os-tuition__empty")).map((e) => (e as HTMLElement).innerText),
            assignments,
            billingPreviewText: (host as HTMLElement | null)?.innerText?.slice(0, 1500) ?? null,
            financialsText: (document.querySelector('[data-universal-card-key="financials"]') as HTMLElement | null)?.innerText?.slice(0, 500) ?? null,
            processText: (document.querySelector('[data-universal-card-key="business_process"]') as HTMLElement | null)?.innerText?.slice(0, 400) ?? null,
            pricingReads,
            domContentLoaded: Math.round(performance.timing ? performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart : 0),
        };
    });

    const payload = { layoutCalls, firstCardMs, ...observed };
    writeFileSync(`${OUT}/v161-mount.json`, JSON.stringify(payload, null, 2));
    await page.screenshot({ path: `${OUT}/v161-mount.png`, fullPage: true });

    log(`\nlayout calls: ${JSON.stringify(layoutCalls)}`);
    log(`mounted: ${JSON.stringify(observed.mountedCardKeys)}`);
    log(`billing_preview count = ${observed.billingPreviewCount}  ownBody=${observed.billingPreviewHasTuitionBody}  tuitionCount=${observed.tuitionCount}`);
    log(`duplicates: ${JSON.stringify(observed.duplicateCards)}`);
    log(`error: ${observed.tuitionError}  empty: ${JSON.stringify(observed.emptyLine)}`);
    log(`assignments: ${JSON.stringify(observed.assignments, null, 1).slice(0, 3000)}`);
    log(`firstCardMs=${firstCardMs}  pricingReads=${JSON.stringify(observed.pricingReads)}`);
    log(`--- billing_preview text ---\n${observed.billingPreviewText}`);
});
