import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import OperationalEnrollmentEditActions from "@/components/childcareOperational/OperationalEnrollmentEditActions";
import type { OperationalEnrollmentReadModel } from "@/lib/childcareOperational/operationalEnrollmentReadModel";

vi.mock("@/components/childcareOperational/ChangeOperationalPlacementModal", () => ({
    default: () => null,
}));
vi.mock("@/components/childcareOperational/ChangeOperationalScheduleModal", () => ({
    default: () => null,
}));
vi.mock("@/components/childcareOperational/AgreementScheduleWithdrawalModal", () => ({
    default: () => null,
}));
vi.mock("@/components/childcareOperational/AgreementLifecycleConfirmModal", () => ({
    default: () => null,
}));

function activeSummary(): OperationalEnrollmentReadModel {
    return {
        agreement: {
            id: "agr-1",
            org_id: "org-1",
            opportunity_id: null,
            opportunity_customer_member_id: null,
            customer_member_id: "cm-1",
            customer_id: null,
            person_id: null,
            site_location_id: "11111111-1111-4111-8111-111111111111",
            status: "active",
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
        labels: { site: "Site A", program: null, room: null, schedule: null },
        warnings: [],
    };
}

describe("OperationalEnrollmentEditActions", () => {
    it("renders edit action buttons for active agreement", () => {
        const html = renderToStaticMarkup(
            <OperationalEnrollmentEditActions summary={activeSummary()} onRefresh={() => {}} />
        );
        expect(html).toContain("data-operational-enrollment-edit-actions");
        expect(html).toContain("Change placement");
        expect(html).toContain("Change schedule");
        expect(html).toContain("Schedule withdrawal");
        expect(html).toContain("Mark ended");
        expect(html).not.toContain("Cancel agreement");
    });

    it("renders cancel for pending_start only", () => {
        const summary = activeSummary();
        summary.agreement!.status = "pending_start";
        const html = renderToStaticMarkup(
            <OperationalEnrollmentEditActions summary={summary} onRefresh={() => {}} />
        );
        expect(html).toContain("Cancel agreement");
        expect(html).not.toContain("Schedule withdrawal");
    });

    it("renders nothing for ended agreement", () => {
        const summary = activeSummary();
        summary.agreement!.status = "ended";
        const html = renderToStaticMarkup(
            <OperationalEnrollmentEditActions summary={summary} onRefresh={() => {}} />
        );
        expect(html).toBe("");
    });
});
