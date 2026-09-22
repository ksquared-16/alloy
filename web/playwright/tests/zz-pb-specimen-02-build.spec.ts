/**
 * §5–§7: build the certification specimen through governed product routes only.
 *
 * Specimen: Pathb Certopp — NOT the Certhouse family. Every step is the product's own authority:
 * the enrollment-agreement route, the schedule-assignment route, and the registered
 * `enrollment.pricing.accept` action. No SQL, no hand-written charge.
 *
 * Each step logs its own result, so if the governed path stops somewhere this says exactly where
 * rather than leaving a half-built specimen to be discovered later.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/periodic-billing";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

const SPEC = {
    ocm: "e9965c7c-608e-4f68-a15b-2475374e2ecf",
    customerMemberId: "7ebf342f-b43d-4547-9c8a-43c0a96391ae",
    customerId: "fcaa839f-6960-4b09-b663-b247b99ea9d9",
    opportunityId: "ebe6cb44-957b-48f0-9a6d-603670443ec2",
    /* The site Certhouse's own agreements use, reused rather than configured anew. */
    siteLocationId: "1a5644a7-45c4-413b-9021-5f556118b6e2",
    childLabel: "Pathb Certopp",
};

test("build specimen", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);

    const steps = await page.evaluate(async (s) => {
        const out: Array<Record<string, unknown>> = [];
        const post = async (url: string, body: unknown) => {
            const r = await fetch(url, {
                method: "POST", headers: { "content-type": "application/json" },
                credentials: "include", body: JSON.stringify(body),
            });
            const text = await r.text();
            let json: unknown = null; try { json = JSON.parse(text); } catch { /* text */ }
            return { status: r.status, json, text: text.slice(0, 500) };
        };
        const get = async (url: string) => {
            const r = await fetch(url, { credentials: "include" });
            const text = await r.text();
            let json: unknown = null; try { json = JSON.parse(text); } catch { /* text */ }
            return { status: r.status, json, text: text.slice(0, 700) };
        };

        // 1 — the patterns the organisation already offers.
        const patterns = await get("/api/admin/schedule-patterns");
        out.push({ step: "schedule_patterns", status: patterns.status, sample: JSON.stringify(patterns.json).slice(0, 700) });

        // 2 — the enrollment agreement.
        const agreement = await post("/api/admin/child-enrollment-agreements", {
            customer_member_id: s.customerMemberId,
            site_location_id: s.siteLocationId,
            opportunity_id: s.opportunityId,
            opportunity_customer_member_id: s.ocm,
            customer_id: s.customerId,
            start_date: "2026-09-01",
            source_key: "periodic_billing_certification",
            metadata: { certification: "periodic_billing_activation", not_human_qa_fixture: true },
        });
        out.push({ step: "create_agreement", status: agreement.status, body: agreement.text });
        const agreementId = (agreement.json as { agreement?: { id?: string } } | null)?.agreement?.id ?? null;

        // 3 — a schedule assignment, which is what gives tuition its facts.
        let scheduleAssignment: unknown = null;
        const patternList = (patterns.json as { patterns?: Array<{ id: string; name?: string; days_per_week?: number }> } | null)?.patterns
            ?? (Array.isArray(patterns.json) ? patterns.json as Array<{ id: string }> : []);
        const patternId = patternList[0]?.id ?? null;
        if (agreementId && patternId) {
            scheduleAssignment = await post("/api/admin/schedule-assignments", {
                enrollment_agreement_id: agreementId,
                schedule_pattern_id: patternId,
                start_date: "2026-09-01",
                source_key: "periodic_billing_certification",
            });
        }
        out.push({ step: "schedule_assignment", patternId, result: JSON.stringify(scheduleAssignment).slice(0, 600) });

        // 4 — re-resolve tuition now that the assignment exists.
        const resolved = await get(`/api/admin/financial-config/opportunity/${s.opportunityId}`);
        const mine = ((resolved.json as { assignments?: Array<Record<string, unknown>> } | null)?.assignments ?? [])
            .find((a) => a.opportunityCustomerMemberId === s.ocm) ?? null;
        out.push({ step: "resolve_tuition", status: resolved.status, assignment: JSON.stringify(mine).slice(0, 1400) });

        return { out, agreementId, mine };
    }, SPEC);

    log(JSON.stringify(steps.out, null, 1).slice(0, 6000));
    log(`\nAGREEMENT: ${steps.agreementId}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/specimen-build.json`, JSON.stringify(steps, null, 2));
});
