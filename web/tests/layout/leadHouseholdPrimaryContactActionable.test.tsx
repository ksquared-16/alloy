/**
 * Lead drawer household section — primary contact is actionable by default.
 *
 * Multi-adult households must expose "Make primary contact" for non-primary members
 * without requiring an explicit household_contacts widget in the layout.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DrawerHouseholdProfileSection from "@/components/layout/DrawerHouseholdProfileSection";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

function leadRecordWithAdults(adultCount: number): ProofRuntimeRecord {
    const people = Array.from({ length: adultCount }, (_, index) => ({
        id: `op-${index}`,
        person_id: `person-${index}`,
        role_type: index === 0 ? "primary_contact" : "guardian",
        name: index === 0 ? "Justin Wright" : `Molly Wright ${index}`,
        phone: `555-000-000${index}`,
        email: `contact${index}@example.com`,
    }));
    return {
        id: "opp-1",
        customer_id: "cust-1",
        "opportunity.primary_person_id": "person-0",
        "person.primary_contact_name": "Justin Wright",
        "person.primary_phone": "555-000-0000",
        "person.primary_email": "contact0@example.com",
        _opportunity_persons: people,
    } as unknown as ProofRuntimeRecord;
}

describe("DrawerHouseholdProfileSection — actionable primary contact", () => {
    it("exposes Make primary contact for non-primary members in a multi-adult household", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdProfileSection
                record={leadRecordWithAdults(2)}
                variant="lead"
                canMutate
            />,
        );
        expect(html).toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).toContain('data-drawer-household-make-primary-contact="true"');
    });

    it("does not render the make-primary action for a single-adult household", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdProfileSection
                record={leadRecordWithAdults(1)}
                variant="lead"
                canMutate
            />,
        );
        expect(html).not.toContain('data-drawer-household-contacts-actionable="true"');
        expect(html).not.toContain('data-drawer-household-make-primary-contact="true"');
        expect(html).toContain('data-drawer-household-primary-contact="true"');
    });

    it("hides the make-primary action when the operator cannot mutate", () => {
        const html = renderToStaticMarkup(
            <DrawerHouseholdProfileSection
                record={leadRecordWithAdults(2)}
                variant="lead"
                canMutate={false}
            />,
        );
        // List still renders, but no actionable reassignment affordance.
        expect(html).not.toContain('data-drawer-household-make-primary-contact="true"');
    });
});
