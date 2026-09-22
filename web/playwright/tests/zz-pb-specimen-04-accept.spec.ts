/**
 * §5–§7 final: place the specimen, resolve tuition, and accept a WEEKLY term.
 *
 * Weekly is chosen for a reason: accepted today it anchors its periods on today, so exactly one
 * canonical period exists and it is fully covered. A monthly term accepted mid-month would be a
 * partial period, and Firefly has no proration policy — the domain would refuse it rather than
 * bill it, which would certify nothing.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const AGREEMENT = "9134bf85-e00f-4bc6-8917-a02cda58395f";
const SITE = "1a5644a7-45c4-413b-9021-5f556118b6e2";
const PROGRAM_CATEGORY = "5e9e715a-eb8f-4534-bcfe-a8a74ed883d9"; // School Age at this site
const OPP = "ebe6cb44-957b-48f0-9a6d-603670443ec2";
const OCM = "e9965c7c-608e-4f68-a15b-2475374e2ecf";

test("accept specimen tuition", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);

    const r = await page.evaluate(async (c) => {
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; } };
        const post = async (u: string, b: unknown) => {
            const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) });
            const t = await x.text(); try { return { s: x.status, j: JSON.parse(t) }; } catch { return { s: x.status, j: t }; }
        };
        const steps: Array<Record<string, unknown>> = [];

        // A classroom under this site.
        const locs = await get("/api/admin/locations?hierarchy=1");
        const all = ((locs.j as { locations?: Array<Record<string, unknown>> })?.locations ?? []);
        const room = all.find((l) => l.parent_location_id === c.site
            && (l.metadata as { semantic_kind?: string } | null)?.semantic_kind === "classroom") ?? null;
        steps.push({ step: "room", id: room?.id ?? null, label: room?.label ?? null });

        // The placement, which supplies program and location to the tuition facts.
        const placement = await post("/api/admin/child-placements", {
            enrollment_agreement_id: c.agreement,
            start_date: "2026-09-01",
            program_category_id: c.programCategory,
            room_location_id: room?.id ?? null,
            source_key: "periodic_billing_certification",
        });
        steps.push({ step: "placement", status: placement.s, body: JSON.stringify(placement.j).slice(0, 400) });

        // What tuition applies now.
        const resolved = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const mine = ((resolved.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        steps.push({ step: "resolve", state: mine?.state, resolutionKey: mine?.resolutionKey,
            recommended: JSON.stringify(mine?.recommended ?? null).slice(0, 300),
            applicable: JSON.stringify(mine?.applicable ?? []).slice(0, 900),
            noMatchReason: mine?.noMatchReason ?? null });

        // Accept the WEEKLY option if the organisation offers one.
        type Opt = { sourceId?: string; id?: string; cadenceKey?: string; amountLabel?: string; amount?: { amountCents?: number } };
        const options: Opt[] = [
            ...(mine?.recommended ? [mine.recommended as Opt] : []),
            ...((mine?.applicable as Opt[] | undefined) ?? []),
        ];
        const weekly = options.find((o) => o.cadenceKey === "weekly") ?? null;
        let accepted: unknown = null;
        if (weekly && mine?.resolutionKey) {
            accepted = await post("/api/admin/actions/execute", {
                action_key: "enrollment.pricing.accept",
                entity_type: "opportunity_customer_member",
                entity_id: c.ocm,
                mode: "execute",
                confirmation: { confirmed: true },
                payload: {
                    opportunity_customer_member_id: c.ocm,
                    resolution_key: mine.resolutionKey,
                    selected_source_id: weekly.sourceId ?? weekly.id,
                    cadence_key: "weekly",
                },
            });
        }
        steps.push({ step: "accept", weeklyOption: JSON.stringify(weekly).slice(0, 300), result: JSON.stringify(accepted).slice(0, 700) });

        const after = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const mineAfter = ((after.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        steps.push({ step: "accepted_term", accepted: JSON.stringify(mineAfter?.accepted ?? null).slice(0, 500) });
        return steps;
    }, { agreement: AGREEMENT, site: SITE, programCategory: PROGRAM_CATEGORY, opp: OPP, ocm: OCM });

    log(JSON.stringify(r, null, 1).slice(0, 6000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-accept.json`, JSON.stringify(r, null, 2));
});
