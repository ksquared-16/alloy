import { test } from "@playwright/test";

/** What KPI and Work View identities does the deployed frame actually expose? Diagnostic only. */
test("p076 kpi identity probe", async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto(process.env.P076_URL || "/adminV2/workspace/work-unit/new-leads",
        { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("article.alloy-os-ucard[data-universal-card-key]", { timeout: 60_000 });
    await page.waitForTimeout(6000);
    const out = await page.evaluate(() => {
        const kpiItems = [...document.querySelectorAll("[data-kpi-item]")]
            .map((e) => ({ key: e.getAttribute("data-kpi-item"), text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim() }));
        // Work View identities: whatever the queue/view chrome exposes.
        const viewAttrs: Record<string, string[]> = {};
        for (const el of document.querySelectorAll("*")) {
            for (const a of el.attributes) {
                if (/work-?view|data-view-id|data-queue-view/i.test(a.name)) {
                    (viewAttrs[a.name] ??= []).push(a.value.slice(0, 60));
                }
            }
        }
        // And the flight payload's own configured identities.
        let dec = "";
        const lit = /self\.__next_f\.push\(\[\d+,("(?:[^"\\]|\\.)*")\]\)/g;
        const html = document.documentElement.outerHTML;
        let m: RegExpExecArray | null;
        while ((m = lit.exec(html)) !== null) { try { dec += JSON.parse(m[1]); } catch { /* skip */ } }
        const grab = (k: string) => [...new Set([...dec.matchAll(new RegExp(`"${k}":"([^"]{1,60})"`, "g"))].map((x) => x[1]))].slice(0, 10);
        return {
            kpiItems,
            viewAttrs: Object.fromEntries(Object.entries(viewAttrs).map(([k, v]) => [k, [...new Set(v)].slice(0, 8)])),
            payloadSourceKeys: grab("sourceKey"),
            payloadViewIds: grab("work_view_id"),
            payloadViewKeys: grab("viewId"),
        };
    });
    console.log(`[kpiprobe] ${JSON.stringify(out)}`);
});
