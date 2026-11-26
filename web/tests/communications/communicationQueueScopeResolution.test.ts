import { describe, expect, it } from "vitest";
import { resolveCommunicationQueueScope } from "@/lib/communications/v2/communicationQueueScopeResolution";

const ORG = "11111111-1111-1111-1111-111111111111";
const CUSTOMER_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CUSTOMER_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const OPP = "22222222-2222-2222-2222-222222222222";
const PERSON = "33333333-3333-3333-3333-333333333333";
const THREAD = "44444444-4444-4444-4444-444444444444";

describe("resolveCommunicationQueueScope", () => {
    it("resolves direct customer anchor", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            customerId: CUSTOMER_A,
            primaryEntityType: "customers",
            primaryEntityId: CUSTOMER_A,
            threadId: THREAD,
            customerExists: true,
        });
        expect(res).toEqual({
            status: "resolved",
            customerId: CUSTOMER_A,
            threadId: THREAD,
            reason: "direct_customer",
        });
    });

    it("resolves opportunity-linked customer", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            primaryEntityType: "opportunities",
            primaryEntityId: OPP,
            opportunityCustomerId: CUSTOMER_A,
            threadId: THREAD,
            customerExists: true,
        });
        expect(res.status).toBe("resolved");
        if (res.status === "resolved") {
            expect(res.customerId).toBe(CUSTOMER_A);
            expect(res.reason).toBe("opportunity_customer");
        }
    });

    it("resolves person-linked customer", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            primaryEntityType: "persons",
            primaryEntityId: PERSON,
            personCustomerId: CUSTOMER_A,
            threadId: THREAD,
            customerExists: true,
        });
        expect(res.status).toBe("resolved");
        if (res.status === "resolved") {
            expect(res.customerId).toBe(CUSTOMER_A);
            expect(res.reason).toBe("person_customer");
        }
    });

    it("falls back to thread metadata customer when unique", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            metadataCustomerId: CUSTOMER_A,
            threadId: THREAD,
            customerExists: true,
        });
        expect(res.status).toBe("resolved");
        if (res.status === "resolved") {
            expect(res.customerId).toBe(CUSTOMER_A);
            expect(res.reason).toBe("metadata_customer");
        }
    });

    it("resolves unique participant-derived customer", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            participantIds: [CUSTOMER_A],
            threadId: THREAD,
            customerExists: true,
        });
        expect(res.status).toBe("resolved");
        if (res.status === "resolved") {
            expect(res.customerId).toBe(CUSTOMER_A);
            expect(res.reason).toBe("participant_customer");
        }
    });

    it("marks ambiguous when multiple customer candidates exist", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            customerId: CUSTOMER_A,
            metadataCustomerId: CUSTOMER_B,
            threadId: THREAD,
        });
        expect(res).toEqual({
            status: "ambiguous",
            candidateCustomerIds: [CUSTOMER_A, CUSTOMER_B],
            reason: "multiple_customer_candidates",
        });
    });

    it("marks unresolved when person has no household link", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            primaryEntityType: "persons",
            primaryEntityId: PERSON,
            threadId: THREAD,
        });
        expect(res).toEqual({ status: "unresolved", reason: "person_without_household" });
    });

    it("marks unresolved when customer record is inactive or missing", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            primaryEntityType: "customers",
            primaryEntityId: CUSTOMER_A,
            customerExists: false,
            threadId: THREAD,
        });
        expect(res).toEqual({ status: "unresolved", reason: "inactive_or_missing_customer" });
    });

    it("marks unresolved for orphaned thread without entity anchors", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            threadId: THREAD,
        });
        expect(res).toEqual({ status: "unresolved", reason: "orphaned_thread_without_entity" });
    });

    it("rejects invalid customer entity id", () => {
        const res = resolveCommunicationQueueScope({
            orgId: ORG,
            primaryEntityType: "customers",
            primaryEntityId: "not-a-uuid",
            threadId: THREAD,
        });
        expect(res).toEqual({ status: "unresolved", reason: "invalid_customer_entity" });
    });
});
