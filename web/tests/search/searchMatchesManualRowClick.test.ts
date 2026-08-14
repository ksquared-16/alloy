import { describe, expect, it } from "vitest";

import { resolveSearchDestinations } from "@/lib/search/searchDestinations";
import { resolveTargetedWorkViewMember } from "@/lib/runtime/provisioning/targetedWorkViewMember";
import type { SearchContext, SearchSubject } from "@/lib/search/searchContracts";

/**
 * SEARCH MUST PRODUCE WHAT A MANUAL ROW CLICK PRODUCES.
 *
 * Manual selection is the authority. Clicking Lennon's row in Waitlist runs
 *
 *     openRecord(row) → attention.move({ scope: SUBJECT, subject: row.entityId })
 *
 * and `row.entityId` is the same field the membership guard matches on. Search is a second doorway to
 * the same place, so a Search destination for a member and a click on that member's row must resolve
 * to the same operational selection. When they diverged — Search sending the host, the row carrying a
 * participation — the runtime refused with "That record isn't in this Work View".
 *
 * The equivalence is asserted against the RUNTIME's own resolver rather than a copy of its rule, so
 * these fail if either side moves.
 */

const CASE = "opp-kurzman";
const PARTICIPATION = "pi-lennon-enrollment";
const DURABLE_CHILD = "cm-lennon";
const UNIT = "enrollment_pipeline";

/** The lens's rows as the runtime holds them — child grain rows carry `participationId`. */
const childMembership = [
    { participationId: "pi-someone-else" },
    { participationId: PARTICIPATION },
] as never;

const enrollment = (over: Partial<SearchContext> = {}): SearchContext => ({
    kind: "process",
    key: "enrollment",
    label: "Enrollment",
    detail: "Waitlist",
    destination_entity_type: "opportunity",
    destination_entity_id: CASE,
    destination_work_unit_key: UNIT,
    destination_work_view_id: "new_leads",
    operational_memberships: [
        {
            work_view_id: "waitlist_children",
            label: "Waitlist Children",
            row_grain: "child",
            host_work_unit_key: UNIT,
            host_entity_id: CASE,
            operational_member_id: PARTICIPATION,
        },
    ],
    ...over,
});

const lennon: SearchSubject = {
    kind: "child",
    id: DURABLE_CHILD,
    display_name: "Lennon Kurzman",
    person_id: null,
    household_id: "cust-kurzman",
};

const searchDestination = (contexts: SearchContext[] = [enrollment()]) =>
    resolveSearchDestinations({ subject: lennon, contexts, promotedKeys: [] }).find((d) =>
        d.key.startsWith("work_view:"),
    )!;

describe("a Search destination and a manual row click select the same member", () => {
    it("the destination's member id is the identity the runtime resolves", () => {
        const destination = searchDestination();

        // What a manual click would select, asked of the runtime's OWN resolver.
        const clicked = resolveTargetedWorkViewMember({
            childRows: childMembership,
            familyMembership: [],
            subjectId: destination.operational_member_id ?? "",
        });

        expect(clicked).not.toBeNull();
        expect(clicked!.entityId).toBe(destination.operational_member_id);
        expect(clicked!.entityType).toBe("child");
    });

    it("the SAME Work View, host and ASPECT ride along with it", () => {
        const destination = searchDestination();

        expect(destination.host_work_view_id).toBe("waitlist_children");
        expect(destination.host_work_unit_key).toBe(UNIT);
        // Host stays the CASE — the Focus Panel composes against it.
        expect(destination.host_entity_id).toBe(CASE);
        // …and the ASPECT item stays the DURABLE child, which is what the Children card focuses.
        expect(destination.item_id).toBe(DURABLE_CHILD);
    });

    it("HOST, MEMBER and ASPECT ITEM are three different objects for a child", () => {
        // The separation this sprint locks. Collapsing any two of them reintroduces the defect.
        const destination = searchDestination();

        expect(destination.host_entity_id).toBe(CASE);
        expect(destination.operational_member_id).toBe(PARTICIPATION);
        expect(destination.item_id).toBe(DURABLE_CHILD);

        expect(destination.operational_member_id).not.toBe(destination.host_entity_id);
        expect(destination.operational_member_id).not.toBe(destination.item_id);
        expect(destination.host_entity_id).not.toBe(destination.item_id);
    });

    it("the OLD behaviour — sending the host — would be refused by the runtime", () => {
        // A regression sentinel. If a future change collapses host and member again, the runtime's own
        // resolver says what happens next: nothing selects, and the operator sees the banner.
        expect(
            resolveTargetedWorkViewMember({
                childRows: childMembership,
                familyMembership: [],
                subjectId: CASE,
            }),
        ).toBeNull();
    });

    it("the DURABLE CHILD id would also be refused — it names no row", () => {
        // Why the fix carries the participation and not the child: one child can hold two
        // participations across two leads, so the durable id addresses no single row.
        expect(
            resolveTargetedWorkViewMember({
                childRows: childMembership,
                familyMembership: [],
                subjectId: DURABLE_CHILD,
            }),
        ).toBeNull();
    });
});

describe("family grain keeps its own addressing", () => {
    it("a family member id is the CASE, and host and member coincide there", () => {
        const household: SearchSubject = {
            kind: "household",
            id: "cust-kurzman",
            display_name: "Kurzman Family",
            household_id: "cust-kurzman",
            household_case_entity_id: CASE,
            household_case_work_unit_key: UNIT,
        };

        const destination = resolveSearchDestinations({
            subject: household,
            contexts: [
                enrollment({
                    operational_memberships: [
                        {
                            work_view_id: "tours",
                            label: "Tours",
                            row_grain: "family",
                            host_work_unit_key: UNIT,
                            host_entity_id: CASE,
                            operational_member_id: CASE,
                        },
                    ],
                }),
            ],
            promotedKeys: [],
        }).find((d) => d.key.startsWith("work_view:"))!;

        expect(destination.operational_member_id).toBe(CASE);
        expect(destination.host_entity_id).toBe(CASE);
        // A household is not an item inside a Children card.
        expect(destination.item_id ?? null).toBeNull();

        // And the runtime resolves it against the FAMILY membership, not a child lens.
        const clicked = resolveTargetedWorkViewMember({
            childRows: null,
            familyMembership: [{ id: CASE }] as never,
            subjectId: destination.operational_member_id ?? "",
        });
        expect(clicked!.entityType).toBe("opportunity");
    });
});
