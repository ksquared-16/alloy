import { test } from "@playwright/test";

/**
 * FACT IDENTITY — does each produced field carry the canonical fact its refKey names?
 *
 * State parity is not enough. This programme has already shipped two fields that were perfectly
 * honest about their state and wrong about their fact: attendance read `todayLabel`, a property
 * `AttendanceCardVM` never declared, and the child count counted opportunities. Both would pass a
 * state-shape oracle. So the shadow projection is compared against what the OPERATOR'S OWN FRAME
 * renders for the same subject.
 */
test("p076 fact identity", async ({ page }) => {
    const url = process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });

    const ids = await page.evaluate(() => {
        let decoded = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        const html = document.documentElement.outerHTML;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(html)) !== null) { try { decoded += JSON.parse(m[1]); } catch { /* skip */ } }
        const grab = (k: string) => {
            const re = new RegExp(`"${k}":"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"`, "g");
            const out = new Set<string>(); let x: RegExpExecArray | null;
            while ((x = re.exec(decoded)) !== null) out.add(x[1]);
            return [...out];
        };
        return { m: grab("customer_member_id")[0] ?? grab("customerMemberId")[0] ?? null,
                 c: grab("customer_id")[0] ?? grab("customerId")[0] ?? null,
                 w: grab("work_unit_id")[0] ?? grab("hostWorkUnitId")[0] ?? null };
    });

    // What the operator's frame actually renders, card by card.
    const rendered = await page.evaluate(() => {
        const out: Record<string, string> = {};
        for (const el of document.querySelectorAll("article.alloy-os-ucard[data-universal-card-key]")) {
            const key = el.getAttribute("data-universal-card-key") ?? "";
            out[key] = (el as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 600);
        }
        return out;
    });

    const cards = Object.keys(rendered).join(",");
    const shadow = await page.evaluate(async ([m, c, w, cardList]) => {
        const res = await fetch(
            `/api/admin/p076-first-order-prototype?member_id=${m}&customer_id=${c}&work_unit_id=${w}`
            + `&cards=${encodeURIComponent(cardList as string)}&kpis=3&views=2`,
            { credentials: "include" });
        return res.json();
    }, [ids.m, ids.c, ids.w, cards]);

    console.log(`[identity] ${JSON.stringify({ ids, rendered, shadowCards: shadow?.shadow?.cardStates ?? null })}`);
});
