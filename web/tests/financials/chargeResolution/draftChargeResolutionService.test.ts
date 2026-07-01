import { describe, expect, it } from "vitest";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    type OperationalEnrollmentMockStore,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import { resolveDraftChargeForAgreementPeriod } from "@/lib/financials/chargeResolution/draftChargeResolutionService";

const ORG = "org-1";
const SITE = "site-1";
const ROOM = "unit-1";
const PROGRAM = "program-1";
const MEMBER = "member-1";
const AGREEMENT = "agr-1";
const PERIOD = { key: "2026-03", start: "2026-03-01", end: "2026-03-31" };

type SeedOpts = {
    weekdays?: number[];
    scheduleTypeKey?: string;
    rules?: Array<{ id: string; schedule_basis: string; rate_basis: string; amount_cents: number }>;
    calculationStrategy?: string;
};

function seed(opts: SeedOpts = {}): OperationalEnrollmentMockStore {
    const weekdays = opts.weekdays ?? [1, 2, 3, 4, 5];
    const scheduleTypeKey = opts.scheduleTypeKey ?? "full_time";
    const rules = opts.rules ?? [
        { id: "rule-full-day", schedule_basis: "full_day", rate_basis: "monthly", amount_cents: 120000 },
    ];
    return createOperationalEnrollmentMockStore({
        child_enrollment_agreements: [
            {
                id: AGREEMENT,
                org_id: ORG,
                customer_member_id: MEMBER,
                customer_id: "cust-1",
                person_id: "person-1",
                site_location_id: SITE,
                status: "active",
                start_date: "2026-01-01",
                end_date: null,
                metadata: {},
            },
        ],
        child_placements: [
            {
                org_id: ORG,
                enrollment_agreement_id: AGREEMENT,
                customer_member_id: MEMBER,
                site_location_id: SITE,
                program_category_id: PROGRAM,
                room_location_id: ROOM,
                start_date: "2026-01-01",
                end_date: null,
                status: "active",
            },
        ],
        schedule_assignments: [
            {
                org_id: ORG,
                enrollment_agreement_id: AGREEMENT,
                schedule_pattern_id: "pattern-1",
                customer_member_id: MEMBER,
                start_date: "2026-01-01",
                end_date: null,
                status: "active",
            },
        ],
        schedule_patterns: [
            {
                id: "pattern-1",
                org_id: ORG,
                site_location_id: SITE,
                key: "pat",
                label: "Pattern",
                schedule_type_key: scheduleTypeKey,
                weekdays,
                sort_order: 10,
                is_active: true,
                metadata: {},
            },
        ],
        location_program_categories: [
            { id: PROGRAM, org_id: ORG, location_id: SITE, key: "infant", label: "Infant", is_active: true },
        ],
        childcare_rate_plans: [
            {
                id: "plan-1",
                org_id: ORG,
                scope_type: "site",
                site_location_id: SITE,
                program_category_id: null,
                room_location_id: null,
                age_group_key: null,
                plan_key: "standard",
                label: "Standard",
                currency_code: "USD",
                billing_basis: "monthly",
                calculation_strategy: opts.calculationStrategy ?? "scheduled",
                proration_method: null,
                billing_cadence: null,
                is_active: true,
                effective_start: "2026-01-01",
                effective_end: null,
                source_key: "config",
                metadata: {},
            },
        ],
        childcare_rate_rules: rules.map((r) => ({
            org_id: ORG,
            rate_plan_id: "plan-1",
            age_group_key: null,
            effective_start: "2026-01-01",
            effective_end: null,
            source_key: "config",
            metadata: {},
            ...r,
        })),
    });
}

describe("Draft Charge Resolution service (P3.3)", () => {
    it("generates a scheduled monthly tuition draft (draft status, tuition, enrollment source)", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const out = await resolveDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(out.status).toBe("created");
        if (out.status !== "created") return;
        expect(out.charge.status).toBe("draft");
        expect(out.charge.charge_category).toBe("tuition");
        expect(out.charge.billable_source_type).toBe("enrollment_agreement");
        expect(out.charge.billable_source_id).toBe(AGREEMENT);
        expect(out.charge.amount_cents).toBe(120000);
        expect(out.charge.currency_code).toBe("USD");
        expect(store.charges).toHaveLength(1);
    });

    it("selects the rate rule by schedule basis: 3-day vs 4-day vs 5-day", async () => {
        const rules = [
            { id: "r3", schedule_basis: "three_day", rate_basis: "monthly", amount_cents: 90000 },
            { id: "r4", schedule_basis: "four_day", rate_basis: "monthly", amount_cents: 100000 },
            { id: "r5", schedule_basis: "five_day", rate_basis: "monthly", amount_cents: 110000 },
        ];
        for (const [weekdays, expected] of [
            [[1, 2, 3], 90000],
            [[1, 2, 3, 4], 100000],
            [[1, 2, 3, 4, 5], 110000],
        ] as Array<[number[], number]>) {
            const store = seed({ weekdays, scheduleTypeKey: "custom", rules });
            const supabase = createOperationalEnrollmentMockSupabase(store);
            const out = await resolveDraftChargeForAgreementPeriod(supabase, {
                orgId: ORG,
                enrollmentAgreementId: AGREEMENT,
                period: PERIOD,
            });
            expect(out.status).toBe("created");
            if (out.status !== "created") return;
            expect(out.charge.amount_cents).toBe(expected);
        }
    });

    it("selects the rate rule by schedule basis: full-day vs half-day", async () => {
        const rules = [
            { id: "rf", schedule_basis: "full_day", rate_basis: "monthly", amount_cents: 120000 },
            { id: "rh", schedule_basis: "half_day", rate_basis: "monthly", amount_cents: 70000 },
        ];
        const full = seed({ scheduleTypeKey: "full_time", rules });
        const half = seed({ scheduleTypeKey: "half_day", weekdays: [1, 2, 3, 4, 5], rules });
        const fullOut = await resolveDraftChargeForAgreementPeriod(createOperationalEnrollmentMockSupabase(full), {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        const halfOut = await resolveDraftChargeForAgreementPeriod(createOperationalEnrollmentMockSupabase(half), {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(fullOut.status === "created" && fullOut.charge.amount_cents).toBe(120000);
        expect(halfOut.status === "created" && halfOut.charge.amount_cents).toBe(70000);
    });

    it("daily scheduled basis multiplies the unit rate by scheduled days in the period", async () => {
        // Mon-Fri pattern across March 2026 (22 weekdays). Daily $50 unit.
        const store = seed({
            scheduleTypeKey: "custom",
            rules: [{ id: "rd", schedule_basis: "five_day", rate_basis: "daily", amount_cents: 5000 }],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const out = await resolveDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(out.status).toBe("created");
        if (out.status !== "created") return;
        expect(out.charge.amount_cents).toBe(22 * 5000);
        expect((out.charge.metadata as Record<string, unknown>).quantity).toBe(22);
    });

    it("is idempotent: a second resolution with identical inputs is unchanged", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const args = { orgId: ORG, enrollmentAgreementId: AGREEMENT, period: PERIOD };
        const first = await resolveDraftChargeForAgreementPeriod(supabase, args);
        const second = await resolveDraftChargeForAgreementPeriod(supabase, args);
        expect(first.status).toBe("created");
        expect(second.status).toBe("unchanged");
        expect(store.charges).toHaveLength(1);
    });

    it("recalculates the existing draft in place when the resolved amount changes", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const args = { orgId: ORG, enrollmentAgreementId: AGREEMENT, period: PERIOD };
        const first = await resolveDraftChargeForAgreementPeriod(supabase, args);
        expect(first.status).toBe("created");

        (store.childcare_rate_rules[0] as Record<string, unknown>).amount_cents = 150000;
        const second = await resolveDraftChargeForAgreementPeriod(supabase, args);
        expect(second.status).toBe("recalculated");
        if (second.status !== "recalculated") return;
        expect(second.charge.amount_cents).toBe(150000);
        expect(store.charges).toHaveLength(1);
    });

    it("never modifies a posted charge (skips and reports)", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const args = { orgId: ORG, enrollmentAgreementId: AGREEMENT, period: PERIOD };
        const first = await resolveDraftChargeForAgreementPeriod(supabase, args);
        expect(first.status).toBe("created");

        // Post the draft, then change the rate and re-resolve.
        (store.charges[0] as Record<string, unknown>).status = "posted";
        (store.charges[0] as Record<string, unknown>).posted_at = "2026-03-05T00:00:00Z";
        (store.childcare_rate_rules[0] as Record<string, unknown>).amount_cents = 999999;

        const second = await resolveDraftChargeForAgreementPeriod(supabase, args);
        expect(second.status).toBe("skipped_posted");
        expect(store.charges).toHaveLength(1);
        expect(store.charges[0].amount_cents).toBe(120000);
    });

    it("attendance_actual strategy bills attended days from P2 attendance facts", async () => {
        const store = seed({
            scheduleTypeKey: "custom",
            calculationStrategy: "attendance_actual",
            rules: [{ id: "ra", schedule_basis: "five_day", rate_basis: "daily", amount_cents: 5000 }],
        });
        store.child_attendance_events = [
            {
                id: "ev-1",
                org_id: ORG,
                enrollment_agreement_id: AGREEMENT,
                customer_member_id: MEMBER,
                site_location_id: SITE,
                room_location_id: ROOM,
                to_room_location_id: null,
                event_kind: "check_in",
                entry_type: "original",
                corrects_event_id: null,
                event_at: "2026-03-02T13:00:00Z",
                service_date: "2026-03-02",
                metadata: {},
            },
            {
                id: "ev-2",
                org_id: ORG,
                enrollment_agreement_id: AGREEMENT,
                customer_member_id: MEMBER,
                site_location_id: SITE,
                room_location_id: ROOM,
                to_room_location_id: null,
                event_kind: "check_in",
                entry_type: "original",
                corrects_event_id: null,
                event_at: "2026-03-03T13:00:00Z",
                service_date: "2026-03-03",
                metadata: {},
            },
        ];
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const out = await resolveDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(out.status).toBe("created");
        if (out.status !== "created") return;
        expect(out.charge.amount_cents).toBe(2 * 5000);
        expect((out.charge.metadata as Record<string, unknown>).calculation_strategy).toBe("attendance_actual");
    });

    it("attributes responsibility to the household/account and leaks no job coupling", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const out = await resolveDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(out.status).toBe("created");
        if (out.status !== "created") return;
        const meta = out.charge.metadata as Record<string, unknown>;
        expect(meta.responsibility).toEqual({
            party_type: "customer",
            party_id: "cust-1",
            basis: "household_account_default",
        });
        // No job coupling: job_id null and no job reference in metadata.
        expect(out.charge.job_id).toBeNull();
        expect(JSON.stringify(meta)).not.toContain("job_id");
        expect(JSON.stringify(meta)).not.toContain("job_");
    });

    it("returns a structured unresolved result when no rate is configured", async () => {
        const store = seed({ rules: [] });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const out = await resolveDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(out.status).toBe("unresolved");
        if (out.status !== "unresolved") return;
        expect(out.reason).toContain("no_rate");
        expect(store.charges).toHaveLength(0);
    });
});
