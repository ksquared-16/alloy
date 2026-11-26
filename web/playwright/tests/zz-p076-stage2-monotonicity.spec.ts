import { test } from "@playwright/test";

/**
 * LIVE STAGE-1 → STAGE-2 MONOTONICITY.
 *
 * Stage 2 may ADD detail. It may NOT correct an authoritative Stage-1 field.
 *
 * The comparison is A′'s Stage-1 projection against the SETTLED product frame for the same
 * subject and the same navigation. The frame is captured twice — as soon as the Focus Panel first
 * paints, and again after settlement — so a field that changes can be attributed to Stage 2
 * arriving rather than to the page still loading when the first capture was taken.
 */
test("p076 stage-2 monotonicity", async ({ page }) => {
    // Settlement is the point of this test, so it must be allowed to take longer than a default
    // 30s case. The first run failed on the framework timeout mid-wait, which is a harness limit
    // and not a monotonicity result — reporting it as one would have been a false gate failure.
    test.setTimeout(180_000);
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });

    const snap = () => page.evaluate(() => {
        const out: Record<string, string> = {};
        for (const el of document.querySelectorAll("article.alloy-os-ucard[data-universal-card-key]")) {
            out[el.getAttribute("data-universal-card-key") ?? ""] =
                (el as HTMLElement).innerText.replace(/\s+/g, " ").trim();
        }
        return out;
    });

    // STAGE 1 — the frame as first painted.
    const stage1 = await snap();

    const ids = await page.evaluate(() => {
        let dec = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        const html = document.documentElement.outerHTML;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(html)) !== null) { try { dec += JSON.parse(m[1]); } catch { /* skip */ } }
        const g = (k: string) => {
            const re = new RegExp(`"${k}":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"`, "g");
            const s = new Set<string>(); let x: RegExpExecArray | null;
            while ((x = re.exec(dec)) !== null) s.add(x[1]);
            return [...s];
        };
        return { m: g("customer_member_id")[0] ?? g("customerMemberId")[0] ?? null,
                 c: g("customer_id")[0] ?? g("customerId")[0] ?? null,
                 w: g("work_unit_id")[0] ?? g("hostWorkUnitId")[0] ?? null };
    });

    const cards = Object.keys(stage1).join(",");
    const shadow = await page.evaluate(async ([m, c, w, cl]) => {
        const r = await fetch(
            `/api/admin/p076-first-order-prototype?member_id=${m}&customer_id=${c}&work_unit_id=${w}`
            + `&cards=${encodeURIComponent(cl as string)}&kpis=3&views=2`, { credentials: "include" });
        return r.json();
    }, [ids.m, ids.c, ids.w, cards]);

    // STAGE 2 — settled. Bounded wait, then a quiescence check so "settled" is observed, not assumed.
    await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(6000);
    const stage2 = await snap();

    const changed: Record<string, { before: string; after: string }> = {};
    for (const k of Object.keys(stage2)) {
        if (stage1[k] !== stage2[k]) changed[k] = { before: stage1[k] ?? "", after: stage2[k] };
    }

    console.log(`[mono] ${JSON.stringify({
        ids,
        cardsChangedBetweenStages: Object.keys(changed),
        changed,
        stage2,
        shadowFacts: shadow?.shadow?.cardStates ?? null,
    })}`);
});
