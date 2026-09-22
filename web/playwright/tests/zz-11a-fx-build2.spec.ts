/**
 * The placement guard refused program-without-site, which is correct: a program category is
 * location-scoped, so naming one without naming the site is an incoherent assignment. The site is
 * supplied with the program in one patch, as the guard asks.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11a-fx";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012" });
test.setTimeout(300_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const FX = {
    opportunity: "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a",
    site: "1a5644a7-45c4-413b-9021-5f556118b6e2",
    ocmA: "79f8011d-a236-4054-bee7-af10f1dbc632",
    ocmB: "cf044308-3ee4-47ab-a8fb-205eb172aa48",
    programA: "5e9e715a-eb8f-4534-bcfe-a8a74ed883d9", // school_age @ site
    programB: "2147d374-8112-4e88-8342-b49c9b95fc7b", // preschool @ site
    start: "2026-09-01",
};

test("patch the assignments and read back", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const out = await page.evaluate(async (fx) => {
        const call = async (u: string, init?: RequestInit) => {
            const r = await fetch(u, { credentials: "include", cache: "no-store", ...init });
            return { url: u, status: r.status, body: await r.json().catch(() => null) };
        };
        const patch = (u: string, body: unknown) =>
            call(u, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

        const pA = await patch(`/api/admin/opportunity-customer-members/${fx.ocmA}`, {
            location_id: fx.site, program_category_id: fx.programA, schedule_type: "custom", start_date: fx.start,
        });
        const pB = await patch(`/api/admin/opportunity-customer-members/${fx.ocmB}`, {
            location_id: fx.site, program_category_id: fx.programB, schedule_type: "full_time", start_date: fx.start,
        });

        const cfg = await call(`/api/admin/financial-config/opportunity/${fx.opportunity}?t=${Date.now()}`);
        const body = cfg.body as { assignments?: Array<Record<string, unknown>>; enrollments?: unknown[] } | null;
        return {
            patchA: { status: pA.status, body: pA.status >= 400 ? pA.body : { ok: true } },
            patchB: { status: pB.status, body: pB.status >= 400 ? pB.body : { ok: true } },
            cfgStatus: cfg.status,
            enrollments: (body?.enrollments ?? []).length,
            assignmentCount: (body?.assignments ?? []).length,
            assignments: (body?.assignments ?? []).map((a) => ({
                ocm: a.opportunityCustomerMemberId,
                member: a.customerMemberId,
                child: a.childLabel,
                agreement: a.enrollmentAgreementId,
                state: a.state,
                resolutionKey: a.resolutionKey,
                configVersion: a.configVersion,
                facts: a.facts,
                sources: a.factSources,
                recommended: a.recommended,
                tied: Array.isArray(a.tied) ? (a.tied as Array<Record<string, unknown>>).map((o) => ({ s: o.sourceId, a: o.amountLabel, c: o.cadenceKey })) : [],
                applicable: Array.isArray(a.applicable) ? (a.applicable as Array<Record<string, unknown>>).map((o) => ({ s: o.sourceId, a: o.amountLabel, c: o.cadenceKey, v: o.variantLabel })) : [],
                noMatchReason: a.noMatchReason,
                rejected: Array.isArray(a.rejected) ? (a.rejected as Array<Record<string, unknown>>).slice(0, 8) : [],
                accepted: a.accepted,
            })),
        };
    }, FX);

    writeFileSync(`${OUT}/fixture-build2.json`, JSON.stringify(out, null, 2));
    log(`patch A ${out.patchA.status} ${JSON.stringify(out.patchA.body).slice(0, 300)}`);
    log(`patch B ${out.patchB.status} ${JSON.stringify(out.patchB.body).slice(0, 300)}`);
    log(`financial-config ${out.cfgStatus} enrollments=${out.enrollments} assignments=${out.assignmentCount}`);
    log(JSON.stringify(out.assignments, null, 1).slice(0, 5000));
});
