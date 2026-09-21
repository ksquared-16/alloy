import { test } from "@playwright/test";

/**
 * Drive the first-order read-DAG prototype against the real specimen.
 *
 * The ids are read out of the SAME document the operator's frame is built from, rather than
 * hand-supplied: a prototype measured against a different subject than the oracle is not a
 * comparison. If either id cannot be found the run reports that instead of measuring nothing.
 */
test("p076 prototype run", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    const n = Number(process.env.P076_N || 1);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

    const ids = await page.evaluate(() => {
        let decoded = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        const html = document.documentElement.outerHTML;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(html)) !== null) {
            try { decoded += JSON.parse(m[1]); } catch { /* skip */ }
        }
        const grab = (key: string) => {
            const re = new RegExp(`"${key}":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"`, "g");
            const out = new Set<string>();
            let k: RegExpExecArray | null;
            while ((k = re.exec(decoded)) !== null) out.add(k[1]);
            return [...out];
        };
        return {
            customerMember: [...grab("customer_member_id"), ...grab("customerMemberId")],
            customer: [...grab("customer_id"), ...grab("customerId")],
            workUnit: [...grab("work_unit_id"), ...grab("workUnitId"), ...grab("hostWorkUnitId")],
        };
    });

    const memberId = ids.customerMember[0] ?? null;
    const customerId = ids.customer[0] ?? null;
    const workUnitId = ids.workUnit[0] ?? null;
    if (!memberId || !customerId) {
        console.log(`[proto] ${JSON.stringify({ error: "ids_not_found", ids })}`);
        return;
    }

    /*
     * WAIT FOR THE CARDS, AND REFUSE TO MEASURE WITHOUT THEM.
     *
     * The frame is read after `domcontentloaded`, which is BEFORE the Focus Panel paints. The
     * probe therefore found zero cards, sent no `cards` parameter, and the route answered
     * `shadow: null` — a run that passed in 8.9s having measured nothing. The selector was right;
     * the moment was wrong, which is the same green-and-vacuous failure the note below describes
     * arriving by a different route.
     *
     * So the wait is explicit AND the absence is fatal. A probe that cannot see the operator's
     * configuration must say so, not quietly measure a default.
     */
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });

    // Configuration read off the RENDERED frame, so the composer is exercised against the
    // operator's real configuration rather than one the probe invented.
    const rendered = await page.evaluate(() => ({
        /*
         * `data-universal-card-key` is the CARD key. An earlier version of this read
         * `data-alloy-section-id`, which is the metric REGION id (WU-00, WU-09, ...) — a different
         * vocabulary entirely. The composer then recognised none of them, ran no card resolver,
         * and produced a projection whose cards were all empty. It looked like a plausible result
         * and measured nothing, which is the failure mode worth naming: the run was green and
         * vacuous. The same selector the critical-path probe already uses is the canonical one.
         */
        cards: [...document.querySelectorAll("article.alloy-os-ucard")]
            .map((el) => el.getAttribute("data-universal-card-key")
                || el.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key") || "")
            .filter(Boolean),
    }));
    if (process.env.P076_SHADOW === "1" && rendered.cards.length === 0) {
        throw new Error("p076: shadow measurement requested but the rendered frame exposed no "
            + "configured cards — refusing to measure a projection with no configuration");
    }
    const cardParam = rendered.cards.length ? `&cards=${encodeURIComponent([...new Set(rendered.cards)].join(","))}` : "";
    console.log(`[proto-config] ${JSON.stringify({ cards: [...new Set(rendered.cards)] })}`);
    const extra = (process.env.P076_DISCOVER === "1" ? "&discover=1" : "")
        + (process.env.P076_SHADOW === "1" ? `${cardParam}&kpis=3&views=2` : "")
        + (process.env.P076_MONEY === "1" ? "&discover_money=1" : "")
        + (workUnitId ? `&work_unit_id=${workUnitId}` : "");
    await page.evaluate((d) => { (window as unknown as { __p076extra?: string }).__p076extra = d; }, extra);
    for (let i = 0; i < n; i++) {
        const out = await page.evaluate(async ([mid, cid]) => {
            const t0 = performance.now();
            const res = await fetch(`/api/admin/p076-first-order-prototype?member_id=${mid}&customer_id=${cid}${(window as unknown as {__p076extra?:string}).__p076extra ?? ""}`, { credentials: "include" });
            const wall = Math.round(performance.now() - t0);
            const body = await res.json().catch(() => null);
            return { status: res.status, clientWallMs: wall, body };
        }, [memberId, customerId]);
        console.log(`[proto] ${JSON.stringify({ i, memberId, customerId, ...out })}`);
    }
});
