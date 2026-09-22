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
    test.setTimeout(180_000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

    /*
     * WAIT BEFORE READING ANYTHING — ids AND cards.
     *
     * This wait was originally placed after the id extraction, so on a slower load the flight
     * payload had not arrived, `ids_not_found` fired, and the spec RETURNED EARLY while still
     * reporting "1 passed". Twenty-three sampling runs produced nothing that way. The Focus Panel
     * selector is the one signal that the operator's frame actually exists, so everything is read
     * after it, and every absence below throws rather than returning.
     */
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });

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
        // FATAL. A silent return here is how a sampling run reports success over no samples.
        throw new Error(`p076: subject ids not found in the rendered frame — ${JSON.stringify(ids)}`);
    }

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
        /*
         * The tenant's REAL KPI source keys and Work View ids, read off the same rendered frame
         * the card keys come from. Synthetic identities made the diagnostic ask a question the
         * product never asks.
         */
        /*
         * DECODE THE FLIGHT PAYLOAD FIRST.
         *
         * This matched `"sourceKey":"..."` against raw `outerHTML`, where the payload is
         * JSON-ESCAPED as \"sourceKey\":\"...\" — so it never matched, the sampler passed no
         * KPI keys, and 23 cold samples measured 36 capabilities while reporting themselves as
         * the complete frame. The parity probe decodes before matching, which is the only reason
         * it found the keys and this did not.
         */
        kpiKeys: (() => {
            let dec = "";
            const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
            const html = document.documentElement.outerHTML;
            let mm: RegExpExecArray | null;
            while ((mm = lit.exec(html)) !== null) { try { dec += JSON.parse(mm[1]); } catch { /* skip */ } }
            return [...new Set([...dec.matchAll(/"sourceKey":"([a-z0-9_.]{3,60})"/g)].map((x) => x[1]))];
        })(),
        viewIds: [...new Set([...document.querySelectorAll("[data-work-view-id]")]
            .map((el) => el.getAttribute("data-work-view-id") || "").filter(Boolean))],
        cards: [...document.querySelectorAll("article.alloy-os-ucard")]
            .map((el) => el.getAttribute("data-universal-card-key")
                || el.closest("[data-universal-card-key]")?.getAttribute("data-universal-card-key") || "")
            .filter(Boolean),
    }));
    if (process.env.P076_SHADOW === "1" && (rendered.kpiKeys.length === 0 || rendered.viewIds.length === 0)) {
        // An under-configured sample is fatal. Silently measuring 36 of 39 capabilities and
        // calling the result a complete frame is the failure this guard exists to stop.
        throw new Error(`p076: incomplete configuration — kpi=${rendered.kpiKeys.length} views=${rendered.viewIds.length}`);
    }
    if (process.env.P076_SHADOW === "1" && rendered.cards.length === 0) {
        throw new Error("p076: shadow measurement requested but the rendered frame exposed no "
            + "configured cards — refusing to measure a projection with no configuration");
    }
    const cardParam = rendered.cards.length ? `&cards=${encodeURIComponent([...new Set(rendered.cards)].join(","))}` : "";
    console.log(`[proto-config] ${JSON.stringify({ cards: [...new Set(rendered.cards)] })}`);
    const kpiParam = rendered.kpiKeys.length ? `&kpi_keys=${encodeURIComponent(rendered.kpiKeys.join(","))}` : "";
    const viewParam = rendered.viewIds.length ? `&view_ids=${encodeURIComponent(rendered.viewIds.join(","))}` : "";
    console.log(`[proto-identities] ${JSON.stringify({ kpiKeys: rendered.kpiKeys, viewIds: rendered.viewIds })}`);
    const extra = (process.env.P076_DISCOVER === "1" ? "&discover=1" : "")
        + (process.env.P076_SHADOW === "1" ? `${cardParam}${kpiParam}${viewParam}` : "")
        + (process.env.P076_MONEY === "1" ? "&discover_money=1" : "")
        + (workUnitId ? `&work_unit_id=${workUnitId}` : "");
    await page.evaluate((d) => { (window as unknown as { __p076extra?: string }).__p076extra = d; }, extra);
    /*
     * PAIRED A/B, IN ONE PAGE SESSION.
     *
     * The two child-lens acquisition arms differ by perhaps a few hundred milliseconds against a
     * shared staging database whose own load this lane does not control. Sampling them in two
     * separate sessions would compare arm A's afternoon with arm B's, and any ordering or
     * warm-cache asymmetry would read as the result. So each iteration fires BOTH arms against the
     * same subject in the same page, and ALTERNATES which goes first, so a first-call penalty
     * falls equally on each.
     */
    const ab = process.env.P076_AB === "1";
    const fire = async (arm: "A" | "B") =>
        page.evaluate(async ([mid, cid, suffix]) => {
            const t0 = performance.now();
            const res = await fetch(
                `/api/admin/p076-first-order-prototype?member_id=${mid}&customer_id=${cid}${(window as unknown as { __p076extra?: string }).__p076extra ?? ""}${suffix}`,
                { credentials: "include" },
            );
            const wall = Math.round(performance.now() - t0);
            const body = await res.json().catch(() => null);
            return { status: res.status, clientWallMs: wall, body };
        }, [memberId, customerId, arm === "B" ? "&child_batch=1" : ""]);

    for (let i = 0; i < n; i++) {
        if (!ab) {
            const out = await fire(process.env.P076_CHILD_BATCH === "1" ? "B" : "A");
            console.log(`[proto] ${JSON.stringify({ i, memberId, customerId, ...out })}`);
            continue;
        }
        const order: ("A" | "B")[] = i % 2 === 0 ? ["A", "B"] : ["B", "A"];
        for (const arm of order) {
            const out = await fire(arm);
            console.log(`[proto] ${JSON.stringify({ i, arm, order: order.join(""), memberId, customerId, ...out })}`);
        }
    }
});
