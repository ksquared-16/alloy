/** §5–§7: the operational assignment (which carries schedule type), then accept a weekly term. */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const C = {
    agreement: "9134bf85-e00f-4bc6-8917-a02cda58395f",
    customerMemberId: "7ebf342f-b43d-4547-9c8a-43c0a96391ae",
    site: "1a5644a7-45c4-413b-9021-5f556118b6e2",
    pattern: "07a0ac51-82de-467a-8a26-1378884eaadd",
    room: "16b9ec76-d1e6-41b2-b76c-44853543dc18",
    opp: "ebe6cb44-957b-48f0-9a6d-603670443ec2",
    ocm: "e9965c7c-608e-4f68-a15b-2475374e2ecf",
};

test("assign and accept", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const steps = await page.evaluate(async (c) => {
        const out: Array<Record<string, unknown>> = [];
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; } };
        const post = async (u: string, b: unknown) => {
            const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) });
            const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; }
        };

        const sched = await post("/api/admin/scheduling", {
            customer_member_id: c.customerMemberId,
            site_location_id: c.site,
            enrollment_agreement_id: c.agreement,
            schedule_pattern_id: c.pattern,
            room_location_id: c.room,
            opportunity_id: c.opp,
            start_date: "2026-09-01",
            weekdays: [1, 2, 3, 4, 5],
            times: [{ weekday: 1, start_time: "08:30", end_time: "15:30" }],
        });
        out.push({ step: "scheduling", status: sched.s, body: JSON.stringify(sched.j).slice(0, 600) });

        const resolved = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const mine = ((resolved.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        out.push({ step: "resolve", state: mine?.state, facts: mine?.facts, resolutionKey: mine?.resolutionKey,
            recommended: JSON.stringify(mine?.recommended ?? null).slice(0, 400),
            applicable: JSON.stringify(mine?.applicable ?? []).slice(0, 800),
            reason: mine?.noMatchReason ?? null });

        type Opt = { sourceId?: string; id?: string; cadenceKey?: string; amountLabel?: string };
        const opts: Opt[] = [...(mine?.recommended ? [mine.recommended as Opt] : []), ...((mine?.applicable as Opt[]) ?? [])];
        const weekly = opts.find((o) => o.cadenceKey === "weekly") ?? null;
        let accepted: unknown = null;
        if (weekly && mine?.resolutionKey) {
            accepted = await post("/api/admin/actions/execute", {
                action_key: "enrollment.pricing.accept",
                entity_type: "opportunity_customer_member",
                entity_id: c.ocm, mode: "execute", confirmation: { confirmed: true },
                payload: {
                    opportunity_customer_member_id: c.ocm,
                    resolution_key: mine.resolutionKey,
                    selected_source_id: weekly.sourceId ?? weekly.id,
                    cadence_key: "weekly",
                },
            });
        }
        out.push({ step: "accept", weekly: JSON.stringify(weekly).slice(0, 300), result: JSON.stringify(accepted).slice(0, 700) });

        const after = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const m2 = ((after.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        out.push({ step: "accepted_term", accepted: JSON.stringify(m2?.accepted ?? null).slice(0, 600) });
        return out;
    }, C);
    log(JSON.stringify(steps, null, 1).slice(0, 6000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-assign-accept.json`, JSON.stringify(steps, null, 2));
});
