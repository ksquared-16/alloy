import { test } from "@playwright/test";

/**
 * PRODUCTION-QUESTION PARITY, THEN KPI AND WORK VIEW VALUE PARITY.
 *
 * Two prior probes produced correct-but-meaningless states: synthetic KPI keys yielded UNKNOWN
 * because they are not known metric keys, and absent caller inputs yielded UNAVAILABLE for every
 * Work View. Both would have sampled green while certifying nothing. So identities and values are
 * read from the OPERATOR'S OWN FRAME and compared field by field before anything is measured.
 */
test("p076 value parity", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads",
        { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });
    await page.waitForTimeout(8000);

    const frame = await page.evaluate(() => {
        let dec = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        const html = document.documentElement.outerHTML;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(html)) !== null) { try { dec += JSON.parse(m[1]); } catch { /* skip */ } }
        const uuid = (k: string) => [...new Set([...dec.matchAll(
            new RegExp(`"${k}":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"`, "g"))].map((x) => x[1]))];
        return {
            ids: {
                m: uuid("customer_member_id")[0] ?? uuid("customerMemberId")[0] ?? null,
                c: uuid("customer_id")[0] ?? uuid("customerId")[0] ?? null,
                w: uuid("work_unit_id")[0] ?? uuid("hostWorkUnitId")[0] ?? null,
            },
            // IDENTITIES the product configured.
            cards: [...new Set([...document.querySelectorAll("article.alloy-os-ucard[data-universal-card-key]")]
                .map((e) => e.getAttribute("data-universal-card-key") || "").filter(Boolean))],
            kpiKeys: [...new Set([...dec.matchAll(/"sourceKey":"([a-z0-9_.]{3,60})"/g)].map((x) => x[1]))],
            viewIds: [...new Set([...document.querySelectorAll("[data-work-view-id]")]
                .map((e) => e.getAttribute("data-work-view-id") || "").filter(Boolean))],
            activeView: document.querySelector("[data-active-work-view]")?.getAttribute("data-active-work-view") ?? "",
            // THE ORACLE: what the operator actually sees.
            kpiStripText: [...document.querySelectorAll("[data-work-unit-header-kpis], [data-workspace-header-kpis], [data-kpi-strip]")]
                .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim()).join(" || "),
            viewPillText: [...document.querySelectorAll("[data-work-view-id]")]
                .map((e) => ({ id: e.getAttribute("data-work-view-id"), text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 60) })),
        };
    });

    const shadow = await page.evaluate(async ([m, c, w, cards, kpis, views, active]) => {
        const r = await fetch(
            `/api/admin/p076-first-order-prototype?member_id=${m}&customer_id=${c}&work_unit_id=${w}`
            + `&cards=${encodeURIComponent(cards as string)}`
            + `&kpi_keys=${encodeURIComponent(kpis as string)}`
            + `&view_ids=${encodeURIComponent(views as string)}`
            + `&active_view=${encodeURIComponent(active as string)}`, { credentials: "include" });
        return r.json();
        // The argument array is evaluated in NODE, not the browser. Reading `document` here threw
        // `ReferenceError: document is not defined`; the card list is captured in the page above.
    }, [frame.ids.m, frame.ids.c, frame.ids.w,
        frame.cards.join(","), frame.kpiKeys.join(","), frame.viewIds.join(","), frame.activeView]);

    console.log(`[parity] ${JSON.stringify({
        frame,
        identity: shadow?.shadow?.configurationIdentity ?? null,
        kpiValues: shadow?.shadow?.kpiValues ?? null,
        workViewValues: shadow?.shadow?.workViewValues ?? null,
        timing: shadow?.shadow?.timing ?? null,
    })}`);
});
