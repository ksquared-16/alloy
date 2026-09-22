/**
 * §7 — accept, with the resolution read and spent in one breath.
 *
 * The first attempt was refused `stale_resolution`, which is the domain protecting the price: the
 * key was resolved before the attendance patch settled, and accepting it would have priced the
 * assignment as it was rather than as it is. The refusal is correct behaviour, so the fix is to
 * re-resolve immediately and pin `as_of` so both sides compute the same facts.
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
const AS_OF = "2026-09-22";

test("accept with fresh resolution", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    const r = await page.evaluate(async (c) => {
        const out: Array<Record<string, unknown>> = [];
        const j = async (x: Response) => { const t = await x.text(); try { return JSON.parse(t); } catch { return t; } };
        const get = async (u: string) => { const x = await fetch(u, { credentials: "include" }); return { s: x.status, j: await j(x) }; };
        const post = async (u: string, b: unknown) => { const x = await fetch(u, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(b) }); return { s: x.status, j: await j(x) }; };

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const priced = await get(`/api/admin/financial-config/opportunity/${c.opp}?as_of=${c.asOf}`);
            const mine = ((priced.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
                .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
            type Opt = { sourceId?: string; cadenceKey?: string; amountCents?: number };
            const opts: Opt[] = [...(mine?.recommended ? [mine.recommended as Opt] : []), ...((mine?.applicable as Opt[]) ?? [])];
            const weekly = opts.find((o) => o.cadenceKey === "weekly") ?? null;
            if (!weekly?.sourceId || !mine?.resolutionKey) { out.push({ attempt, stopped: "no weekly option", state: mine?.state }); break; }

            const res = await post("/api/admin/actions/execute", {
                action_key: "enrollment.pricing.accept",
                entity_type: "opportunity_customer_member", entity_id: c.ocm,
                mode: "execute", confirmation: { confirmed: true },
                payload: {
                    opportunity_customer_member_id: c.ocm,
                    resolution_key: mine.resolutionKey,
                    selected_source_id: weekly.sourceId,
                    /*
                     * NO cadence_key. `commitArgsFrom` feeds it into the server's own
                     * re-resolution, so sending "weekly" made the accept resolve different facts
                     * from the view that produced this key — and the mismatch surfaced as
                     * `stale_resolution` on a stable key three times running. The selected rate
                     * already carries its cadence; naming it again was me re-deciding a fact the
                     * option owns.
                     */
                    as_of: c.asOf,
                },
            });
            out.push({ attempt, resolutionKey: mine.resolutionKey, sourceId: weekly.sourceId,
                amountCents: weekly.amountCents, status: res.s, body: JSON.stringify(res.j).slice(0, 500) });
            if (res.s === 200) break;
        }

        const after = await get(`/api/admin/financial-config/opportunity/${c.opp}`);
        const m2 = ((after.j as { assignments?: Array<Record<string, unknown>> })?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === c.ocm) ?? null;
        out.push({ step: "accepted_term", accepted: m2?.accepted ?? null });
        return out;
    }, { opp: OPP, ocm: OCM, asOf: AS_OF });
    log(JSON.stringify(r, null, 1).slice(0, 5000));
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-accepted-final.json`, JSON.stringify(r, null, 2));
});
