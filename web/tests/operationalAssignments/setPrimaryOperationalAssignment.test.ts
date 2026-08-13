import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("evt-test"),
}));

import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import { createOperationalAssignment } from "@/lib/operationalAssignments/operationalAssignmentService";
import {
    assignmentDateRangesOverlap,
    windowCoversDate,
} from "@/lib/operationalAssignments/primaryOverlap";
import { setPrimaryOperationalAssignment } from "@/lib/operationalAssignments/setPrimaryOperationalAssignment";
import {
    ASSIGNMENT_SET_PRIMARY_ACTION_KEY,
    buildAssignmentSetPrimaryEligibility,
    buildAssignmentSetPrimaryPreview,
    validateAssignmentSetPrimaryPayload,
} from "@/lib/operationalAssignments/commands/assignmentSetPrimaryInputs";
import {
    getRegisteredAction,
    hasRegisteredHandler,
} from "@/lib/adminV2/actions/actionRegistry";
import {
    createOperationalEnrollmentMockSupabase,
    createOperationalEnrollmentMockStore,
    MEMBER_ID,
    ORG_ID,
    PATTERN_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-07-24";

describe("primaryOverlap", () => {
    it("allows non-overlapping history and future windows", () => {
        expect(
            assignmentDateRangesOverlap(
                { start_date: "2026-01-01", end_date: "2026-06-30" },
                { start_date: "2026-07-01", end_date: null }
            )
        ).toBe(false);
        expect(
            assignmentDateRangesOverlap(
                { start_date: "2026-01-01", end_date: "2026-08-31" },
                { start_date: "2026-09-01", end_date: null }
            )
        ).toBe(false);
    });

    it("rejects overlapping open and bounded primaries", () => {
        expect(
            assignmentDateRangesOverlap(
                { start_date: "2026-01-01", end_date: null },
                { start_date: "2026-07-01", end_date: null }
            )
        ).toBe(true);
        expect(
            assignmentDateRangesOverlap(
                { start_date: "2026-07-01", end_date: "2026-07-31" },
                { start_date: "2026-07-15", end_date: null }
            )
        ).toBe(true);
    });

    it("covers inclusive effective dates", () => {
        expect(windowCoversDate({ start_date: "2026-01-01", end_date: "2026-06-30" }, "2026-06-30")).toBe(
            true
        );
        expect(windowCoversDate({ start_date: "2026-01-01", end_date: "2026-06-30" }, "2026-07-01")).toBe(
            false
        );
    });
});

describe("assignment.set_primary registration", () => {
    it("registers the executable action", () => {
        expect(ASSIGNMENT_SET_PRIMARY_ACTION_KEY).toBe("assignment.set_primary");
        expect(hasRegisteredHandler("assignment.set_primary")).toBe(true);
        const action = getRegisteredAction("assignment.set_primary");
        expect(action?.supportedEntityTypes).toEqual(expect.arrayContaining(["child", "person"]));
    });

    it("validates and previews payloads", () => {
        expect(
            validateAssignmentSetPrimaryPayload({
                subject_type: "child",
                effective_date: "2026-07-24",
                schedule_pattern_id: PATTERN_ID,
            }).ok
        ).toBe(true);
        const eligibility = buildAssignmentSetPrimaryEligibility({
            subject_type: "child",
            enrollment_agreement_id: "agr-1",
            effective_date: "2026-07-24",
            schedule_pattern_id: PATTERN_ID,
        });
        expect(eligibility.eligible).toBe(true);
        const preview = buildAssignmentSetPrimaryPreview({
            subject_type: "child",
            subject_label: "Ethan",
            effective_date: "2026-07-24",
            room_label: "Sunshine",
            pattern_label: "Mon–Fri",
        });
        expect(preview.summary).toContain("Ethan");
        expect(preview.summary).toContain("Sunshine");
    });
});

describe("setPrimaryOperationalAssignment", () => {
    async function childAgreement(
        supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>
    ) {
        return createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
    }

    it("creates the first primary assignment", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        const result = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID, roomLocationId: "unit-1" },
            todayYmd: TODAY,
        });

        expect(result.created).toBe(true);
        expect(result.primary.is_primary).toBe(true);
        expect(result.priorPrimaryId).toBeNull();
        expect(result.refreshTargets.enrollmentAgreementId).toBe(agreement.id);
    });

    it("changes primary today and retains historical primary", async () => {
        const store = seedOperationalEnrollmentFixtures();
        store.schedule_patterns.push({
            id: "pattern-2",
            org_id: ORG_ID,
            site_location_id: SITE_ID,
            key: "alt",
            label: "Alt",
            schedule_type_key: "full_time",
            weekdays: [1, 2, 3],
            sort_order: 20,
            is_active: true,
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: null,
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        const first = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            todayYmd: TODAY,
        });
        const second = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: TODAY,
            create: { schedulePatternId: "pattern-2" },
            todayYmd: TODAY,
        });

        expect(second.priorPrimaryId).toBe(first.primary.id);
        expect(second.priorPrimaryCloseDate).toBe("2026-07-23");
        const historical = store.schedule_assignments.find((r) => r.id === first.primary.id);
        expect(historical?.status).toBe("superseded");
        expect(historical?.end_date).toBe("2026-07-23");
        expect(historical?.is_primary).toBe(true);
        expect(second.primary.is_primary).toBe(true);
        expect(
            assignmentDateRangesOverlap(
                {
                    start_date: String(historical!.start_date),
                    end_date: String(historical!.end_date),
                },
                { start_date: second.primary.start_date, end_date: second.primary.end_date }
            )
        ).toBe(false);
    });

    it("schedules a future primary change without overlapping", async () => {
        const store = seedOperationalEnrollmentFixtures();
        store.schedule_patterns.push({
            id: "pattern-2",
            org_id: ORG_ID,
            site_location_id: SITE_ID,
            key: "alt",
            label: "Alt",
            schedule_type_key: "full_time",
            weekdays: [1, 2, 3],
            sort_order: 20,
            is_active: true,
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: null,
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            todayYmd: TODAY,
        });
        const future = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-09-01",
            create: { schedulePatternId: "pattern-2" },
            todayYmd: TODAY,
        });

        expect(future.primary.start_date).toBe("2026-09-01");
        expect(future.primary.status).toBe("planned");
        expect(future.priorPrimaryCloseDate).toBe("2026-08-31");
    });

    it("rejects an overlapping primary period that cannot be closed", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        // Seed a future primary directly (simulates an already-booked future home).
        store.schedule_assignments.push({
            id: "future-primary",
            org_id: ORG_ID,
            subject_type: "child",
            enrollment_agreement_id: agreement.id,
            customer_member_id: MEMBER_ID,
            subject_person_id: null,
            site_location_id: SITE_ID,
            room_location_id: null,
            program_category_id: null,
            operational_assignment_type_id: null,
            is_primary: true,
            schedule_pattern_id: PATTERN_ID,
            start_date: "2026-09-01",
            end_date: null,
            status: "planned",
            assignment_kind: "base",
            source_key: "operator",
            supersedes_assignment_id: null,
            metadata: {},
            created_by: null,
            updated_by: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
        });

        await expect(
            setPrimaryOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: { type: "child", enrollmentAgreementId: agreement.id },
                effectiveDate: "2026-08-01",
                create: { schedulePatternId: PATTERN_ID },
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "conflict" });
    });

    it("is idempotent on retry with the same idempotency key", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        const first = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            idempotencyKey: "set-primary-1",
            todayYmd: TODAY,
        });
        const retry = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            idempotencyKey: "set-primary-1",
            todayYmd: TODAY,
        });

        expect(retry.idempotent).toBe(true);
        expect(retry.primary.id).toBe(first.primary.id);
        expect(store.schedule_assignments.filter((r) => r.is_primary === true)).toHaveLength(1);
    });

    it("isolates child and staff primary namespaces", async () => {
        const store = createOperationalEnrollmentMockStore({
            ...seedOperationalEnrollmentFixtures(),
            persons: [{ id: "staff-1", org_id: ORG_ID, archived_at: null }],
            // Canonical employment — not persons.is_employee — is what admits
            // the staff subject.
            employments: [
                {
                    id: "emp-1",
                    org_id: ORG_ID,
                    person_id: "staff-1",
                    employment_status: "active",
                    start_date: "2026-01-01",
                    end_date: null,
                },
            ],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        const child = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            todayYmd: TODAY,
        });
        const staff = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "staff", personId: "staff-1", siteLocationId: SITE_ID },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            todayYmd: TODAY,
        });

        expect(child.primary.subject_type).toBe("child");
        expect(staff.primary.subject_type).toBe("staff");
        expect(child.primary.id).not.toBe(staff.primary.id);
    });

    it("rolls back the prior primary when a later write fails", async () => {
        const store = seedOperationalEnrollmentFixtures();
        store.schedule_patterns.push({
            id: "pattern-2",
            org_id: ORG_ID,
            site_location_id: SITE_ID,
            key: "alt",
            label: "Alt",
            schedule_type_key: "full_time",
            weekdays: [1, 2, 3],
            sort_order: 20,
            is_active: true,
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: null,
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        const first = await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            todayYmd: TODAY,
        });

        await expect(
            setPrimaryOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: { type: "child", enrollmentAgreementId: agreement.id },
                effectiveDate: TODAY,
                create: { schedulePatternId: "pattern-2" },
                todayYmd: TODAY,
                __faultAfter: "insert_primary",
            })
        ).rejects.toMatchObject({ message: "fault:insert_primary" });

        const restored = store.schedule_assignments.find((r) => r.id === first.primary.id);
        expect(restored?.status).toBe("active");
        expect(restored?.end_date).toBeNull();
        expect(store.schedule_assignments.filter((r) => r.is_primary === true)).toHaveLength(1);
    });

    it("allows a secondary assignment beside the primary", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await childAgreement(supabase);

        await setPrimaryOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            effectiveDate: "2026-01-01",
            create: { schedulePatternId: PATTERN_ID },
            todayYmd: TODAY,
        });
        const secondary = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            schedulePatternId: PATTERN_ID,
            startDate: "2026-01-01",
            isPrimary: false,
            todayYmd: TODAY,
        });
        expect(secondary.is_primary).toBe(false);
    });
});
