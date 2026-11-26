/**
 * Before changing the card: what does the panel's own truth bag actually carry on this lane?
 * `resolveFocusPanelMutationOpportunityId` reads `child.family_opportunity_id`, and whether that
 * key is present decides whether the tuition card can name an opportunity at all — or whether
 * "No assignment on this record to price." is the honest answer rather than a false one.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-v161";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(240_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const OPP = "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
const ATTN = "b5b62172-8b27-44ff-a852-b11b8888a6cd";

test("truth + financial config", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);
    const out = await page.evaluate(async ({ opp, attn }) => {
        const j = async (u: string) => {
            const r = await fetch(u, { credentials: "include" });
            return { status: r.status, body: await r.json().catch(() => null) };
        };
        const vm = await j(`/api/admin/view-models/drawer/opportunity/${opp}?attention_subject_id=${attn}`);
        const txt = JSON.stringify(vm.body ?? {});
        const cfg = await j(`/api/admin/financial-config/opportunity/${opp}`);
        const cfgBody = cfg.body as { assignments?: Array<Record<string, unknown>> } | null;
        return {
            vmStatus: vm.status,
            entityType: (vm.body as { entity?: { type?: string } } | null)?.entity?.type ?? null,
            hasFamilyOpportunityId: txt.includes("family_opportunity_id"),
            familyOppMatches: Array.from(new Set(txt.match(/"[a-z_]*family_opportunity_id"\s*:\s*"[^"]*"/g) ?? [])).slice(0, 5),
            recordKeys: Object.keys(((vm.body as { record?: Record<string, unknown> } | null)?.record) ?? {}).filter((k) => /child\.|opportunity|family/.test(k)).slice(0, 60),
            cfgStatus: cfg.status,
            cfgKeys: cfgBody ? Object.keys(cfgBody) : null,
            assignmentCount: cfgBody?.assignments?.length ?? null,
            assignments: (cfgBody?.assignments ?? []).map((a) => ({
                ocm: a.opportunityCustomerMemberId ?? a.opportunity_customer_member_id,
                child: a.childLabel ?? a.child_label,
                member: a.customerMemberId ?? a.customer_member_id,
                state: a.state,
                accepted: a.accepted ? "yes" : "no",
                resolutionKey: a.resolutionKey ?? a.resolution_key,
                applicable: Array.isArray(a.applicable) ? a.applicable.length : null,
                facts: a.facts,
            })),
        };
    }, { opp: OPP, attn: ATTN });
    writeFileSync(`${OUT}/v161-truth.json`, JSON.stringify(out, null, 2));
    log(JSON.stringify(out, null, 2).slice(0, 5000));
});
