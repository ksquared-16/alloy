/**
 * enrollment_runtime_reset cleanup mode — scope + safety contracts.
 *
 * Covers:
 *  - dry-run opportunity selection scope (lead status / enrollment work units, golden-path exclusion)
 *  - shared-reference guard (persons/customers linked to non-target records are preserved)
 *  - FK-safe delete order invariants (children before parents; config preserved last)
 */

import { describe, expect, it } from "vitest";

import {
    DEMO_CLEANUP_TABLE_ORDER,
    ENROLLMENT_LEAD_STATUS_KEYS,
    GOLDEN_PATH_SEED_PACKAGE,
    PROTECTED_LOCATIONS_TABLE_KEY,
} from "@/scripts/lib/demoRuntimeCleanupScope";
import { buildEnrollmentResetSelection } from "@/scripts/lib/enrollmentRuntimeResetSelection";
import { partitionSharedReferences } from "@/scripts/lib/enrollmentRuntimeResetSharedGuard";

/** Minimal chainable Supabase mock supporting .select/.eq/.in/.order/.range + await. */
function makeMockSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
    return {
        from(table: string) {
            const builder: {
                _rows: Array<Record<string, unknown>>;
                select: () => typeof builder;
                eq: (col: string, val: unknown) => typeof builder;
                in: (col: string, vals: unknown[]) => typeof builder;
                order: () => typeof builder;
                range: () => typeof builder;
                then: (resolve: (r: { data: Array<Record<string, unknown>>; error: null }) => unknown) => Promise<unknown>;
            } = {
                _rows: [...(tables[table] ?? [])],
                select() {
                    return builder;
                },
                eq(col, val) {
                    builder._rows = builder._rows.filter((r) => r[col] === val);
                    return builder;
                },
                in(col, vals) {
                    const set = new Set(vals);
                    builder._rows = builder._rows.filter((r) => set.has(r[col]));
                    return builder;
                },
                order() {
                    return builder;
                },
                range() {
                    return builder;
                },
                then(resolve) {
                    return Promise.resolve({ data: builder._rows, error: null }).then(resolve);
                },
            };
            return builder;
        },
    } as unknown as Parameters<typeof buildEnrollmentResetSelection>[0];
}

const ORG = "org-1";

describe("enrollment_runtime_reset — opportunity selection scope (dry-run)", () => {
    it("selects opportunities by lead status and by enrollment work unit, excluding golden-path seeds", async () => {
        const supabase = makeMockSupabase({
            work_units: [
                { id: "wu-enroll", key: "enrollment_pipeline", org_id: ORG, is_active: true },
                { id: "wu-lead", key: "lifecycle_wu_lead", org_id: ORG, is_active: true },
                { id: "wu-billing", key: "billing", org_id: ORG, is_active: true },
            ],
            opportunities: [
                // Lead status, runtime-created (Create Lead) → selected
                { id: "opp-status", org_id: ORG, name: "Status Lead", status_key: "new_inquiry", work_unit_id: null, metadata: {} },
                // On enrollment work unit, non-lead status → selected
                { id: "opp-wu", org_id: ORG, name: "WU Lead", status_key: "enrolled", work_unit_id: "wu-enroll", metadata: {} },
                // Golden-path seed on lead status → excluded (protected)
                {
                    id: "opp-golden",
                    org_id: ORG,
                    name: "Golden",
                    status_key: "open",
                    work_unit_id: null,
                    metadata: { demo_seed_package: GOLDEN_PATH_SEED_PACKAGE },
                },
                // Unrelated billing opp, not lead status, not enrollment WU → not selected at all
                { id: "opp-billing", org_id: ORG, name: "Billing", status_key: "active", work_unit_id: "wu-billing", metadata: {} },
            ],
        });

        const selection = await buildEnrollmentResetSelection(supabase, ORG);

        expect(selection.enrollmentWorkUnitIds.sort()).toEqual(["wu-enroll", "wu-lead"]);
        expect(selection.opportunityIds.sort()).toEqual(["opp-status", "opp-wu"]);
        expect(selection.excludedGoldenPath.map((r) => r.id)).toEqual(["opp-golden"]);
        // Out-of-scope billing opp is never considered.
        expect(selection.selected.map((r) => r.id)).not.toContain("opp-billing");
    });

    it("uses the canonical lead status keys", () => {
        expect([...ENROLLMENT_LEAD_STATUS_KEYS]).toEqual(["new_inquiry", "needs_qualification", "open"]);
    });
});

describe("enrollment_runtime_reset — shared-reference guard", () => {
    const targetOpportunityIds = ["opp-A", "opp-B"];

    it("deletes persons/customers linked only to target opportunities", () => {
        const result = partitionSharedReferences({
            targetOpportunityIds,
            candidatePersonIds: ["p1", "p2"],
            candidateCustomerIds: ["c1"],
            opportunityRefs: [
                { id: "opp-A", customer_id: "c1", primary_person_id: "p1" },
                { id: "opp-B", customer_id: "c1", primary_person_id: "p2" },
            ],
            opportunityPersonRefs: [
                { opportunity_id: "opp-A", person_id: "p1" },
                { opportunity_id: "opp-B", person_id: "p2" },
            ],
            personCustomerLinks: [
                { customer_id: "c1", person_id: "p1" },
                { customer_id: "c1", person_id: "p2" },
            ],
        });

        expect(result.deletableCustomerIds).toEqual(["c1"]);
        expect(result.deletablePersonIds.sort()).toEqual(["p1", "p2"]);
        expect(result.sharedCustomerIds).toEqual([]);
        expect(result.sharedPersonIds).toEqual([]);
    });

    it("preserves a customer also referenced by a non-target opportunity", () => {
        const result = partitionSharedReferences({
            targetOpportunityIds,
            candidatePersonIds: ["p1"],
            candidateCustomerIds: ["c1"],
            opportunityRefs: [
                { id: "opp-A", customer_id: "c1", primary_person_id: "p1" },
                // Non-target opportunity also points at c1 → shared.
                { id: "opp-OTHER", customer_id: "c1", primary_person_id: null },
            ],
            opportunityPersonRefs: [{ opportunity_id: "opp-A", person_id: "p1" }],
            personCustomerLinks: [{ customer_id: "c1", person_id: "p1" }],
        });

        expect(result.sharedCustomerIds).toEqual(["c1"]);
        expect(result.deletableCustomerIds).toEqual([]);
        // p1 is linked to the preserved (non-deletable) customer c1 → also preserved.
        expect(result.sharedPersonIds).toEqual(["p1"]);
        expect(result.deletablePersonIds).toEqual([]);
    });

    it("preserves a person referenced by a non-target opportunity (via opportunity_persons)", () => {
        const result = partitionSharedReferences({
            targetOpportunityIds,
            candidatePersonIds: ["p1", "p2"],
            candidateCustomerIds: ["c1"],
            opportunityRefs: [{ id: "opp-A", customer_id: "c1", primary_person_id: "p1" }],
            opportunityPersonRefs: [
                { opportunity_id: "opp-A", person_id: "p1" },
                // p2 is a participant on a non-target opportunity → shared.
                { opportunity_id: "opp-OTHER", person_id: "p2" },
            ],
            personCustomerLinks: [
                { customer_id: "c1", person_id: "p1" },
                { customer_id: "c1", person_id: "p2" },
            ],
        });

        expect(result.deletableCustomerIds).toEqual(["c1"]);
        expect(result.sharedPersonIds).toEqual(["p2"]);
        expect(result.deletablePersonIds).toEqual(["p1"]);
    });

    it("preserves a person linked to a customer outside the candidate set", () => {
        const result = partitionSharedReferences({
            targetOpportunityIds,
            candidatePersonIds: ["p1"],
            candidateCustomerIds: ["c1"],
            opportunityRefs: [{ id: "opp-A", customer_id: "c1", primary_person_id: "p1" }],
            opportunityPersonRefs: [{ opportunity_id: "opp-A", person_id: "p1" }],
            personCustomerLinks: [
                { customer_id: "c1", person_id: "p1" },
                // p1 also belongs to a different family entirely → shared.
                { customer_id: "c-external", person_id: "p1" },
            ],
        });

        expect(result.sharedPersonIds).toEqual(["p1"]);
        expect(result.deletablePersonIds).toEqual([]);
    });

    it("returns empty partitions when there are no candidates", () => {
        const result = partitionSharedReferences({
            targetOpportunityIds,
            candidatePersonIds: [],
            candidateCustomerIds: [],
            opportunityRefs: [],
            opportunityPersonRefs: [],
            personCustomerLinks: [],
        });
        expect(result).toEqual({
            deletablePersonIds: [],
            deletableCustomerIds: [],
            sharedPersonIds: [],
            sharedCustomerIds: [],
        });
    });
});

describe("enrollment_runtime_reset — FK-safe delete order", () => {
    const index = (table: string) => DEMO_CLEANUP_TABLE_ORDER.indexOf(table as never);
    const before = (child: string, parent: string) => {
        expect(index(child)).toBeGreaterThanOrEqual(0);
        expect(index(parent)).toBeGreaterThanOrEqual(0);
        expect(index(child)).toBeLessThan(index(parent));
    };

    it("orders communications children before parents", () => {
        before("communication_message_reads", "communication_messages");
        before("communication_messages", "communication_threads");
    });

    it("orders opportunity join/child rows before opportunities", () => {
        before("opportunity_persons", "opportunities");
        before("opportunity_customer_members", "opportunities");
        before("quotes", "opportunities");
        before("placement_candidates", "opportunities");
    });

    it("orders job children before jobs", () => {
        before("schedules", "jobs");
        before("assignments", "jobs");
        before("payments", "jobs");
    });

    it("orders document + form children before their parents", () => {
        before("document_field_values", "documents");
        before("document_versions", "documents");
        before("form_submission_signatures", "form_submissions");
        before("form_packet_session_items", "form_packet_sessions");
    });

    it("orders customer/person children before customers and persons", () => {
        before("customer_member_contacts", "customer_members");
        before("customer_members", "customers");
        before("customer_persons", "customers");
        before("customer_persons", "persons");
        before("person_relationships", "persons");
        before("opportunities", "persons");
        before("opportunities", "customers");
    });

    it("deletes opportunities before the persons/customers they reference", () => {
        before("opportunities", "persons");
        before("opportunities", "customers");
    });

    it("keeps configuration (work_units, departments, locations) at the very end / protected", () => {
        const last = DEMO_CLEANUP_TABLE_ORDER[DEMO_CLEANUP_TABLE_ORDER.length - 1];
        expect(last).toBe(PROTECTED_LOCATIONS_TABLE_KEY);
        before("persons", "work_units");
        before("customers", "departments");
        before("work_units", PROTECTED_LOCATIONS_TABLE_KEY);
        before("departments", PROTECTED_LOCATIONS_TABLE_KEY);
    });
});
