/**
 * The facts now resolve; what refuses is the RATE SCOPE. `no_rate_for_scope` is a different
 * answer from `missing_required_input` — the resolver has everything it needs and is telling us
 * the organisation authored no rate for school_age + full_time at this site. Certa is priced on
 * school_age + `custom`, so the specimen is aligned to an attendance the organisation actually
 * prices rather than inventing a rate for it.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OPP = "7aa18e83-eea7-432c-af4b-684a1cef9386";
const OCM = "ef10654a-e4cf-494d-b38e-82900af1163e";

test("match an authored attendance", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async (c) => {
        const out: Array<Record<string, unknown>> = [];
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };
        const patch = async (u: string, b: unknown) => { const x = await fetch(u, { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };

        const opts = await get("/api/admin/option-sets/childcare_schedule_type");
        const items = ((opts.j as { items?: Array<{ item_key: string }> })?.items ?? []).map((i) => i.item_key);
        out.push({ step: "schedule_type_options", items });

        for (const attendance of ["custom", "part_time", "full_time"]) {
            if (!items.includes(attendance)) { out.push({ step: "skip", attendance, why: "not an authored option" }); continue; }
            await patch(`/api/admin/opportunity-customer-members/${c.ocm}`, { schedule_type: attendance });
            const priced = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
            const mine = ((priced.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
                .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
            out.push({
                step: "try", attendance, state: mine?.state, reason: mine?.noMatchReason ?? null,
                resolutionKey: mine?.resolutionKey,
                recommended: JSON.stringify(mine?.recommended ?? null).slice(0, 500),
                applicable: JSON.stringify(mine?.applicable ?? []).slice(0, 700),
            });
            if (mine?.state === "recommended") break;
        }
        return out;
    }, { opp: OPP, ocm: OCM });
    log(JSON.stringify(r, null, 1).slice(0, 6000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-attendance-match.json`, JSON.stringify(r, null, 2));
});
