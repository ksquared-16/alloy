import { describe, expect, it } from "vitest";
import {
    createOperationalEnrollmentMockStore,
    createOperationalEnrollmentMockSupabase,
    type OperationalEnrollmentMockStore,
} from "@/tests/childcareOperational/mockOperationalEnrollmentSupabase";
import { previewDraftChargeForAgreementPeriod } from "@/lib/financials/chargeResolution/draftChargeResolutionService";
import { buildDraftChargePreviewDto } from "@/lib/financials/chargeResolution/previewDraftChargePresentation";

const ORG = "org-1";
const SITE = "site-1";
const ROOM = "unit-1";
const PROGRAM = "program-1";
const MEMBER = "member-1";
const AGREEMENT = "agr-1";
const PERIOD = { key: "2026-03", start: "2026-03-01", end: "2026-03-31" };

function seed(opts: { rules?: Array<Record<string, unknown>> } = {}): OperationalEnrollmentMockStore {
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
                schedule_type_key: "full_time",
                weekdays: [1, 2, 3, 4, 5],
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
                calculation_strategy: "scheduled",
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

describe("Draft charge PREVIEW (P3.3.1) — no-write resolution", () => {
    it("returns a resolved preview with rate, basis, quantity, amount, currency, responsibility, key", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const preview = await previewDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(preview.status).toBe("resolved");
        if (preview.status !== "resolved") return;

        const dto = buildDraftChargePreviewDto(preview, PERIOD);
        expect(dto.status).toBe("resolved");
        if (dto.status !== "resolved") return;
        expect(dto.scheduleBasis).toBe("full_day");
        expect(dto.rate.calculationStrategy).toBe("scheduled");
        expect(dto.rate.unitAmountCents).toBe(120000);
        expect(dto.quantity).toMatchObject({ value: 1, unit: "period" });
        expect(dto.amountCents).toBe(120000);
        expect(dto.currencyCode).toBe("USD");
        expect(dto.chargeCategory).toBe("tuition");
        expect(dto.billableSource).toEqual({ type: "enrollment_agreement", id: AGREEMENT });
        expect(dto.responsibility).toEqual({
            partyType: "customer",
            partyId: "cust-1",
            basis: "household_account_default",
        });
        expect(dto.resolutionKey).toBe("tuition:agr-1:2026-03:full_day:rule-full-day");
        expect(dto.wouldWrite).toBe("create");
        expect(dto.existing).toBeNull();
    });

    it("writes NOTHING during preview (charges store stays empty)", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        await previewDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        await previewDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(store.charges).toHaveLength(0);
    });

    it("returns a structured unresolved preview when no rate is configured", async () => {
        const store = seed({ rules: [] });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const preview = await previewDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        expect(preview.status).toBe("unresolved");
        const dto = buildDraftChargePreviewDto(preview, PERIOD);
        expect(dto.status).toBe("unresolved");
        if (dto.status !== "unresolved") return;
        expect(dto.reason).toContain("no_rate");
        expect(store.charges).toHaveLength(0);
    });

    it("preview DTO carries no job coupling", async () => {
        const store = seed();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const preview = await previewDraftChargeForAgreementPeriod(supabase, {
            orgId: ORG,
            enrollmentAgreementId: AGREEMENT,
            period: PERIOD,
        });
        const dto = buildDraftChargePreviewDto(preview, PERIOD);
        const serialized = JSON.stringify(dto);
        expect(serialized).not.toContain("job_id");
        expect(serialized).not.toContain("job_");
    });
});
