/**
 * §6–§7 — align the specimen to the attendance the organisation actually prices, then accept.
 *
 * The authored matrix says school_age is priced only on the `custom` attendance (offering
 * "Before & After", weekly $195 at site scope and $185 as the organisation default). `custom` is
 * absent from the `childcare_schedule_type` option set, which is why an earlier pass skipped it —
 * but Certa Certhouse carries exactly that value, so the option set is a UI vocabulary and not the
 * column's constraint. The skip was my guard being wrong, not the data.
 *
 * Weekly, accepted with the assignment starting today, anchors its periods on today — so exactly
 * one canonical period exists and it is fully covered. That is the shape §9 needs.
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

test("accept specimen tuition", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async (c) => {
        const out: Array<Record<string, unknown>> = [];
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };
        const patch = async (u: string, b: unknown) => { const x = await fetch(u, { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };
        const post = async (u: string, b: unknown) => { const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };

        const setAttendance = await patch(`/api/admin/opportunity-customer-members/${c.ocm}`, { schedule_type: "custom" });
        out.push({ step: "attendance_custom", status: setAttendance.s });

        const priced = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const mine = ((priced.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        out.push({ step: "pricing", state: mine?.state, reason: mine?.noMatchReason ?? null,
            facts: mine?.facts, resolutionKey: mine?.resolutionKey,
            recommended: JSON.stringify(mine?.recommended ?? null).slice(0, 500),
            applicable: JSON.stringify(mine?.applicable ?? []).slice(0, 800) });

        type Opt = { sourceId?: string; cadenceKey?: string; amountCents?: number; amountLabel?: string };
        const opts: Opt[] = [...(mine?.recommended ? [mine.recommended as Opt] : []), ...((mine?.applicable as Opt[]) ?? [])];
        const weekly = opts.find((o) => o.cadenceKey === "weekly") ?? null;
        let accepted: unknown = null;
        if (weekly?.sourceId && mine?.resolutionKey) {
            accepted = await post("/api/admin/actions/execute", {
                action_key: "enrollment.pricing.accept",
                entity_type: "opportunity_customer_member", entity_id: c.ocm,
                mode: "execute", confirmation: { confirmed: true },
                payload: {
                    opportunity_customer_member_id: c.ocm,
                    resolution_key: mine.resolutionKey,
                    selected_source_id: weekly.sourceId,
                    cadence_key: "weekly",
                },
            });
        }
        out.push({ step: "accept", chosen: JSON.stringify(weekly).slice(0, 300), result: JSON.stringify(accepted).slice(0, 800) });

        const after = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const m2 = ((after.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        out.push({ step: "accepted_term", accepted: JSON.stringify(m2?.accepted ?? null).slice(0, 700) });
        return out;
    }, { opp: OPP, ocm: OCM });
    log(JSON.stringify(r, null, 1).slice(0, 6000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-accepted-term.json`, JSON.stringify(r, null, 2));
});
