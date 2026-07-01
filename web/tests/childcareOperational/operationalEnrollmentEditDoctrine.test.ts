import { describe, expect, it } from "vitest";
import {
    resolveOperationalEnrollmentEditActions,
    canEditOperationalEnrollment,
} from "@/lib/childcareOperational/operationalEnrollmentEditDoctrine";
import type { OperationalEnrollmentReadModel } from "@/lib/childcareOperational/operationalEnrollmentReadModel";

function summaryWithStatus(status: string): OperationalEnrollmentReadModel {
    return {
        agreement: {
            id: "agr-1",
            org_id: "org-1",
            opportunity_id: null,
            opportunity_customer_member_id: null,
            customer_member_id: "cm-1",
            customer_id: null,
            person_id: null,
            site_location_id: "site-1",
            status: status as OperationalEnrollmentReadModel["agreement"] extends null ? never : NonNullable<OperationalEnrollmentReadModel["agreement"]>["status"],
            start_date: "2026-06-01",
            end_date: null,
            activation_policy_key: null,
            source_key: "handoff",
            metadata: {},
            created_by: null,
            updated_by: null,
            created_at: "",
            updated_at: "",
        },
        placement: null,
        scheduleAssignment: null,
        schedulePattern: null,
        labels: { site: "Site", program: null, room: null, schedule: null },
        warnings: [],
    };
}

describe("operationalEnrollmentEditDoctrine", () => {
    it("exposes placement and schedule edits for operational agreement statuses", () => {
        expect(resolveOperationalEnrollmentEditActions(summaryWithStatus("active"))).toEqual([
            "change_placement",
            "change_schedule",
            "schedule_withdrawal",
            "mark_ended",
        ]);
        expect(resolveOperationalEnrollmentEditActions(summaryWithStatus("pending_start"))).toEqual([
            "change_placement",
            "change_schedule",
            "mark_ended",
            "cancel_agreement",
        ]);
        expect(resolveOperationalEnrollmentEditActions(summaryWithStatus("ending"))).toEqual([
            "change_placement",
            "change_schedule",
            "mark_ended",
        ]);
    });

    it("returns no actions for terminal agreements", () => {
        expect(resolveOperationalEnrollmentEditActions(summaryWithStatus("ended"))).toEqual([]);
        expect(resolveOperationalEnrollmentEditActions(summaryWithStatus("canceled"))).toEqual([]);
        expect(canEditOperationalEnrollment(summaryWithStatus("ended"))).toBe(false);
    });

    it("returns no actions when agreement missing", () => {
        expect(resolveOperationalEnrollmentEditActions(null)).toEqual([]);
    });
});
