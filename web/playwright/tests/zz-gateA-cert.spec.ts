import { test } from "@playwright/test";

/**
 * GATE A — DEPLOYED CERTIFICATION: HOVER MAY WARM, ONLY A CLICK MAY NAVIGATE.
 *
 * The repair is served. This proves it on the mounted product rather than on the kernel plants.
 *
 * Hover is driven with a REAL pointer (page.mouse.move), because the defect was that speculative
 * preparation reached the commit path — a synthetic pointerenter would not exercise the prewarm the
 * way the operator's pointer does.
 *
 * The queue is the honest signal for a work view, not the pill: before the earlier repair every
 * failing click still lit the pill within ~150ms while the URL and rows stayed put. So a click
 * counts as committed only when the URL work_view_id AND the queue agree with the intent.
 *
 * GA_MODE=hover runs the hover population, GA_MODE=click the click population; they are split
 * because the host watchdog kills runs longer than about two minutes.
 */
const MODE = process.env.GA_MODE ?? "hover";
const N = Number(process.env.GA_N ?? "16");

test("gate A deployed certification", async ({ page }) => {
    test.setTimeout(1_800_000);
    await page.goto("/adminV2/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(14_000);

    const pills = await page.evaluate(`(() => [...document.querySelectorAll('button[role="tab"][data-work-view-id]')]
        .map((e) => ({ id: e.getAttribute('data-work-view-id'), label: (e.textContent || '').trim().slice(0, 22) })))()`);
    const list = pills as Array<{ id: string; label: string }>;
    if (list.length < 3) { console.log(`[GA] ${JSON.stringify({ skipped: "too_few_pills", n: list.length })}`); return; }

    const snap = async () => page.evaluate(`(() => {
        const sel = [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e) => e.getAttribute('aria-selected') === 'true');
        return {
            url: new URLSearchParams(location.search).get('work_view_id'),
            pill: sel ? sel.getAttribute('data-work-view-id') : null,
            queue: [...document.querySelectorAll('.alloy-os-queue-row-card')].map((e) => e.getAttribute('data-entity-id')).join(','),
            n: document.querySelectorAll('.alloy-os-queue-row-card').length,
        };
    })()`) as Promise<{ url: string | null; pill: string | null; queue: string; n: number }>;

    const box = async (id: string) => page.evaluate(`(() => {
        const p = [...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e) => e.getAttribute('data-work-view-id') === '${id}');
        if (!p) return null;
        const r = p.getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`) as Promise<{ x: number; y: number } | null>;

    // Establish a known committed view first, so every observation has a baseline to violate.
    const home = list[0];
    await page.evaluate(`(() => { const p=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')==='${home.id}'); if(p) p.click(); })()`);
    await page.waitForTimeout(6000);

    const results: unknown[] = [];

    if (MODE === "hover") {
        const visited: Record<string, boolean> = { [home.id]: true };
        /*
         * MAKE THE LENSES VISITED FIRST.
         *
         * The defect lived in the CACHE REUSE path, so hovering a never-visited lens is the weakest
         * case available: it exercises the miss path only. A first pass reported 32 hovers with zero
         * commits and, in the same breath, zero hovers over a visited lens — it had proved the easy
         * half. So the population now clicks through the strip, returns home, and hovers views whose
         * answers are already in the completed cache.
         */
        if (process.env.GA_PREVISIT !== "0") {
            for (const p of list.slice(1, 4)) {
                await page.evaluate(`(() => { const b=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')==='${'$'}{p.id}'); if(b) b.click(); })()`.replace("${'$'}{p.id}", p.id));
                await page.waitForTimeout(4500);
                visited[p.id] = true;
            }
            await page.evaluate(`(() => { const b=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')==='${home.id}'); if(b) b.click(); })()`);
            await page.waitForTimeout(5000);
        }
        for (let i = 0; i < N; i += 1) {
            const target = list[1 + (i % (list.length - 1))];
            const before = await snap();
            const b = await box(target.id);
            if (!b) continue;
            await page.mouse.move(b.x, b.y);
            // Long enough for the prewarm to finish — the case that could commit.
            await page.waitForTimeout(i % 3 === 2 ? 3500 : 1400);
            const during = await snap();
            if (i % 4 === 3) { await page.mouse.move(5, 5); await page.waitForTimeout(900); }   // hover then leave
            if (i % 5 === 4) {                                                                   // hover B then hover C
                const other = list[1 + ((i + 1) % (list.length - 1))];
                const ob = await box(other.id);
                if (ob) { await page.mouse.move(ob.x, ob.y); await page.waitForTimeout(1400); }
            }
            const after = await snap();
            results.push({
                i, hovered: target.id, alreadyVisited: !!visited[target.id],
                urlChanged: during.url !== before.url || after.url !== before.url,
                queueChanged: during.queue !== before.queue || after.queue !== before.queue,
                pillChanged: during.pill !== before.pill || after.pill !== before.pill,
                before: before.url, after: after.url, rows: after.n,
            });
        }
        const bad = results.filter((r) => (r as Record<string, boolean>).urlChanged || (r as Record<string, boolean>).queueChanged || (r as Record<string, boolean>).pillChanged);
        console.log(`[GA] ${JSON.stringify({ mode: "hover", n: results.length, HOVER_INDUCED_COMMITS: bad.length, offenders: bad.slice(0, 4), results })}`);
        return;
    }

    // CLICK population — every one a DIFFERENT view, so none may be a legitimate noop.
    const visited: Record<string, boolean> = { [home.id]: true };
    let current = home.id;
    for (let i = 0; i < N; i += 1) {
        const candidates = list.filter((p) => p.id !== current);
        const target = candidates[i % candidates.length];
        // Alternate: some clicks preceded by a real hover on the destination, some on a decoy.
        const style = i % 3;
        if (style === 0) { const b = await box(target.id); if (b) { await page.mouse.move(b.x, b.y); await page.waitForTimeout(1200); } }
        if (style === 1) { const d = candidates[(i + 1) % candidates.length]; const b = await box(d.id); if (b) { await page.mouse.move(b.x, b.y); await page.waitForTimeout(1500); } }
        const before = await snap();
        const t0 = Date.now();
        await page.evaluate(`(() => { const p=[...document.querySelectorAll('button[role="tab"][data-work-view-id]')].find((e)=>e.getAttribute('data-work-view-id')==='${target.id}'); if(p) p.click(); })()`);
        let ackAt: number | null = null, commitAt: number | null = null;
        for (let k = 0; k < 90; k += 1) {
            await page.waitForTimeout(120);
            const s = await snap();
            const t = Date.now() - t0;
            if (ackAt == null && s.pill === target.id) ackAt = t;
            if (commitAt == null && s.url === target.id && s.queue !== before.queue) commitAt = t;
            if (commitAt != null) break;
        }
        await page.waitForTimeout(1800);
        const after = await snap();
        results.push({
            i, want: target.id, from: current, style,
            returning: !!visited[target.id],
            ackAt, commitAt,
            COMMITTED: after.url === target.id,
            rows: after.n,
        });
        visited[target.id] = true;
        if (after.url === target.id) current = target.id;
    }
    const fails = results.filter((r) => !(r as Record<string, boolean>).COMMITTED);
    console.log(`[GA] ${JSON.stringify({ mode: "click", n: results.length, CLICK_FAILURES: fails.length, returnFailures: results.filter((r) => (r as Record<string, unknown>).returning && !(r as Record<string, boolean>).COMMITTED).length, failures: fails.slice(0, 4), results })}`);
});
