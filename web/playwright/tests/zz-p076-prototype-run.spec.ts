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

    const extra = (process.env.P076_DISCOVER === "1" ? "&discover=1" : "")
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
