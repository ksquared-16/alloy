/**
 * §2/§4 — build the smallest legitimate recurring commercial fixture, through governed authorities.
 *
 * ── WHY THESE FACTS AND NOT OTHERS ───────────────────────────────────────────────────────────
 *
 * `resolveAssignmentPricingOptions` keeps ONE survivor per cadence and calls two survivors
 * AMBIGUOUS, and `acceptEnrollmentPricingTerm` refuses anything that is not `recommended`. Every
 * infant/full_time variant in this catalog carries BOTH a weekly and a monthly rate, so an
 * assignment there can never be accepted — only overridden. The no-quantity variants are the ones
 * that resolve cleanly: a variant with no quantity applies whatever the schedule is, and it is the
 * only variant kept when the assignment states no days-per-week.
 *
 * So each child gets a no-quantity variant carrying exactly one authored rate:
 *   Child A — school_age / custom (Before & After), WEEKLY
 *   Child B — preschool / full_time, MONTHLY
 *
 * The monthly rate is dated 2026-07-01, EARLIER than the existing 5-day preschool rate
 * (2026-07-28), so a preschool assignment that does state its days is untouched: within a cadence
 * the later effective start supersedes, and the day rate keeps winning. Nothing existing changes
 * price.
 *
 * Every write goes through a registered route: OCM creation is idempotent (existing row returned),
 * and rate authoring is find-then-update-or-insert on (variant, cadence, payer, location). Nothing
 * is inserted directly.
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
    childA: { member: "e408fa51-7261-43c4-8e60-555d17fc9888", label: "Certa Certhouse", program: "5e9e715a-eb8f-4534-bcfe-a8a74ed883d9", scheduleType: "custom" },
    childB: { member: "46105cd4-6030-417d-a7cb-faf409071c0d", label: "Certb Certhouse", program: "2147d374-8112-4e88-8342-b49c9b95fc7b", scheduleType: "full_time" },
    start: "2026-09-01",
    weeklyVariant: "ee157cff-3546-4172-b591-984b96fbec10",
    monthlyVariant: "d484dcc8-87e3-4e83-b02c-48e2846161d4",
};

test("build the fixture", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4000);

    const out = await page.evaluate(async (fx) => {
        const call = async (u: string, init?: RequestInit) => {
            const r = await fetch(u, { credentials: "include", ...init });
            return { url: u, status: r.status, body: await r.json().catch(() => null) };
        };
        const post = (u: string, body: unknown) =>
            call(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const patch = (u: string, body: unknown) =>
            call(u, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

        const scheduleOptions = await call("/api/admin/option-sets/childcare_schedule_type");

        // ── The assignments ──────────────────────────────────────────────────────────────────
        const linkA = await post("/api/admin/opportunity-customer-members", {
            opportunity_id: fx.opportunity, customer_member_id: fx.childA.member,
        });
        const linkB = await post("/api/admin/opportunity-customer-members", {
            opportunity_id: fx.opportunity, customer_member_id: fx.childB.member,
        });
        const ocmA = (linkA.body as { id?: string } | null)?.id ?? null;
        const ocmB = (linkB.body as { id?: string } | null)?.id ?? null;

        const patchA = ocmA ? await patch(`/api/admin/opportunity-customer-members/${ocmA}`, {
            program_category_id: fx.childA.program, schedule_type: fx.childA.scheduleType, start_date: fx.start,
        }) : null;
        const patchB = ocmB ? await patch(`/api/admin/opportunity-customer-members/${ocmB}`, {
            program_category_id: fx.childB.program, schedule_type: fx.childB.scheduleType, start_date: fx.start,
        }) : null;

        // ── The two authored rates ───────────────────────────────────────────────────────────
        const weekly = await post("/api/admin/commercial/tuition-rates", {
            variant_id: fx.weeklyVariant, cadence_key: "weekly", payer_type: "private_pay",
            rate_cents: 18_500, is_active: true, effective_start: "2026-09-01",
        });
        const monthly = await post("/api/admin/commercial/tuition-rates", {
            variant_id: fx.monthlyVariant, cadence_key: "monthly", payer_type: "private_pay",
            rate_cents: 145_000, is_active: true, effective_start: "2026-07-01",
        });

        // ── What the pricing surface now reads ───────────────────────────────────────────────
        const cfg = await call(`/api/admin/financial-config/opportunity/${fx.opportunity}`);
        const body = cfg.body as { assignments?: Array<Record<string, unknown>>; enrollments?: unknown[] } | null;
        return {
            scheduleOptions: scheduleOptions.status === 200 ? scheduleOptions.body : { status: scheduleOptions.status },
            linkA, linkB, ocmA, ocmB,
            patchAStatus: patchA?.status ?? null, patchAError: patchA && patchA.status >= 400 ? patchA.body : null,
            patchBStatus: patchB?.status ?? null, patchBError: patchB && patchB.status >= 400 ? patchB.body : null,
            weekly: { status: weekly.status, body: weekly.body },
            monthly: { status: monthly.status, body: monthly.body },
            cfgStatus: cfg.status,
            enrollmentCount: (body?.enrollments ?? []).length,
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
                recommended: a.recommended,
                tiedCount: Array.isArray(a.tied) ? a.tied.length : 0,
                applicable: Array.isArray(a.applicable) ? (a.applicable as Array<Record<string, unknown>>).map((o) => ({ source: o.sourceId, amount: o.amountLabel, cadence: o.cadenceKey, variant: o.variantLabel })) : [],
                noMatchReason: a.noMatchReason,
                rejected: Array.isArray(a.rejected) ? (a.rejected as Array<Record<string, unknown>>).slice(0, 6) : [],
                accepted: a.accepted,
            })),
        };
    }, FX);

    writeFileSync(`${OUT}/fixture-build.json`, JSON.stringify(out, null, 2));
    log(`link A: ${out.linkA.status} -> ${out.ocmA}`);
    log(`link B: ${out.linkB.status} -> ${out.ocmB}`);
    log(`patch A: ${out.patchAStatus} ${JSON.stringify(out.patchAError ?? "")}`);
    log(`patch B: ${out.patchBStatus} ${JSON.stringify(out.patchBError ?? "")}`);
    log(`weekly rate: ${out.weekly.status} ${JSON.stringify(out.weekly.body).slice(0, 300)}`);
    log(`monthly rate: ${out.monthly.status} ${JSON.stringify(out.monthly.body).slice(0, 300)}`);
    log(`financial-config: ${out.cfgStatus} enrollments=${out.enrollmentCount} assignments=${out.assignmentCount}`);
    log(JSON.stringify(out.assignments, null, 1).slice(0, 4000));
});
