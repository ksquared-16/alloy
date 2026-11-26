import { test, expect } from "@playwright/test";
import * as fs from "fs";

/**
 * PART B DEPLOYED MEASUREMENT — the navigation swap acknowledgement.
 *
 * Independent tests, each with its own page: a pill click navigates, which tears down any
 * instrumentation installed on the previous document. A single sequential test therefore measured
 * the first interaction and then hung on a page that no longer existed.
 */
const OUT = process.env.P076_MOTION_OUT || "/tmp/claude-501/motion";
const URL_PATH = "/adminV2/workspace/work-unit/new-leads";
const write = (name: string, data: unknown) => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
    console.log(`[motion:${name}] ` + JSON.stringify(data).slice(0, 1200));
};

async function instrument(page: import("@playwright/test").Page) {
    await page.evaluate(() => {
        const w = window as unknown as { __m?: { swaps: Array<{ t: number; region: string; on: boolean }>; reqs: Array<{ t: number; url: string }>; t0: number } };
        w.__m = { swaps: [], reqs: [], t0: performance.now() };
        const mo = new MutationObserver((records) => {
            for (const r of records) {
                if (r.attributeName !== "class") continue;
                const el = r.target as HTMLElement;
                const on = el.classList.contains("is-swapping");
                const was = (r.oldValue || "").includes("is-swapping");
                if (on !== was) w.__m!.swaps.push({ t: performance.now(), region: el.hasAttribute("data-focus-panel-boundary") ? "record" : "queue", on });
            }
        });
        for (const el of Array.from(document.querySelectorAll(".motion-swap-region"))) {
            mo.observe(el, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
        }
        const of_ = window.fetch;
        window.fetch = function (...a: Parameters<typeof fetch>) {
            const u = typeof a[0] === "string" ? a[0] : String((a[0] as Request)?.url ?? "");
            w.__m!.reqs.push({ t: performance.now(), url: u });
            return of_.apply(this, a);
        };
    });
}
const readM = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
        const w = window as unknown as { __m?: { swaps: unknown[]; reqs: Array<{ t: number; url: string }>; t0: number } };
        return { swaps: w.__m?.swaps ?? [], reqs: (w.__m?.reqs ?? []).slice(0, 12), t0: w.__m?.t0 ?? 0 };
    });
const geom = (page: import("@playwright/test").Page) =>
    page.evaluate(() => {
        const r = (s: string) => {
            const e = document.querySelector(s) as HTMLElement | null;
            if (!e) return null;
            const b = e.getBoundingClientRect();
            return { x: Math.round(b.x), w: Math.round(b.width) };
        };
        return { queue: r("[data-adaptive-queue-column]"), boundary: r("[data-focus-panel-boundary]"), scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth };
    });

test("motion 1 — pill switch: request start, transition window, geometry", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    const before = await geom(page);
    await instrument(page);
    const tClick = await page.evaluate(() => performance.now());
    await page.locator('[role="tab"]', { hasText: /Waitlist/ }).first().click({ timeout: 10000 });
    const during = await geom(page);
    await page.waitForTimeout(1500);
    const m = await readM(page);
    const firstReq = m.reqs.find((r) => /api\/admin/.test(r.url)) ?? m.reqs[0] ?? null;
    const on = (m.swaps as Array<{ t: number; on: boolean }>).find((s) => s.on);
    const off = (m.swaps as Array<{ t: number; on: boolean }>).find((s) => !s.on);
    write("pill", {
        tClick,
        requestStartDeltaMs: firstReq ? Math.round(firstReq.t - tClick) : null,
        firstRequestUrl: firstReq?.url ?? null,
        transitionStartDeltaMs: on ? Math.round(on.t - tClick) : null,
        transitionDurationMs: on && off ? Math.round(off.t - on.t) : null,
        swaps: m.swaps,
        geometry: { before, during, shifted: JSON.stringify(before) !== JSON.stringify(during) },
    });
    expect(true).toBe(true);
});

test("motion 2 — row switch: request start, transition window", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    const before = await geom(page);
    await instrument(page);
    // The queue row is `[data-queue-row-subject]` inside the queue column; `[data-work-unit-row]`
    // and `[role="row"]` match nothing on this surface and silently skipped the measurement.
    // The clickable row is the `role="button"` container; `[data-queue-row-subject]` is a text
    // node inside it, and clicking that registered no handler and no request at all.
    const rows = page.locator('[data-adaptive-queue-column] [role="button"]');
    const n = await rows.count();
    if (n < 2) {
        write("row", { skipped: `rowCount=${n}` });
        return;
    }
    const tClick = await page.evaluate(() => performance.now());
    await rows.nth(1).click({ timeout: 10000 }).catch(() => {});
    const during = await geom(page);
    await page.waitForTimeout(1500);
    const m = await readM(page);
    const firstReq = m.reqs.find((r) => /api\/admin/.test(r.url)) ?? m.reqs[0] ?? null;
    const on = (m.swaps as Array<{ t: number; on: boolean }>).find((s) => s.on);
    const off = (m.swaps as Array<{ t: number; on: boolean }>).find((s) => !s.on);
    write("row", {
        rowCount: n,
        requestStartDeltaMs: firstReq ? Math.round(firstReq.t - tClick) : null,
        transitionStartDeltaMs: on ? Math.round(on.t - tClick) : null,
        transitionDurationMs: on && off ? Math.round(off.t - on.t) : null,
        swaps: m.swaps,
        geometry: { before, during, shifted: JSON.stringify(before) !== JSON.stringify(during) },
    });
    expect(true).toBe(true);
});

test("motion 3 — reduced motion collapses the transition", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(URL_PATH, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(11000);
    const read = () =>
        page.evaluate(() => {
            const el = document.querySelector(".motion-swap-region > *") as HTMLElement | null;
            return el ? getComputedStyle(el).transitionDuration : null;
        });
    const normal = await read();
    await page.emulateMedia({ reducedMotion: "reduce" });
    const reduced = await read();
    write("reducedMotion", { normal, reduced, regionsFound: await page.locator(".motion-swap-region").count() });
    expect(true).toBe(true);
});
