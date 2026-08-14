import { describe, expect, it } from "vitest";

import { resolveTargetedWorkViewMember } from "@/lib/runtime/provisioning/targetedWorkViewMember";
import { PROVISIONING_ROW_PAGE_CAP } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/**
 * MEMBERSHIP IS NOT PAGINATION.
 *
 * The selection guard resolved a named subject against the published PAGE, capped at
 * `PROVISIONING_ROW_PAGE_CAP`. That answers "is this record in the Work View?" with "is it in the
 * first 100 rows?" — so a truthful member sorted past the cap was refused as `subject_unavailable`,
 * and a Search destination backed by real membership was unreachable.
 *
 * These pin the separation: what the surface DISPLAYS and what the lens CONTAINS are different facts.
 */

const childRow = (participationId: string) => ({ participationId }) as never;
const familyRow = (id: string) => ({ id }) as never;

/** A lens holding more members than the page can show — the only case where the bug is visible. */
const OVERSIZED = PROVISIONING_ROW_PAGE_CAP + 37;

const childMembership = Array.from({ length: OVERSIZED }, (_, i) => childRow(`pi-${i}`));
const familyMembership = Array.from({ length: OVERSIZED }, (_, i) => familyRow(`opp-${i}`));

describe("a named member resolves against complete membership", () => {
    it("a CHILD member beyond the page cap still resolves", () => {
        // The reported shape: truthful membership, sorted past row 100.
        const target = `pi-${PROVISIONING_ROW_PAGE_CAP + 12}`;
        const resolved = resolveTargetedWorkViewMember({
            childRows: childMembership,
            familyMembership: [],
            subjectId: target,
        });

        expect(resolved).not.toBeNull();
        expect(resolved!.entityId).toBe(target);
        expect(resolved!.entityType).toBe("child");
        // Its TRUE position, so next/previous stay honest about where the operator is.
        expect(resolved!.sortIndex).toBe(PROVISIONING_ROW_PAGE_CAP + 12);
        expect(resolved!.sortIndex).toBeGreaterThanOrEqual(PROVISIONING_ROW_PAGE_CAP);
    });

    it("a FAMILY member beyond the page cap still resolves", () => {
        const target = `opp-${PROVISIONING_ROW_PAGE_CAP + 5}`;
        const resolved = resolveTargetedWorkViewMember({
            childRows: null,
            familyMembership,
            subjectId: target,
        });

        expect(resolved!.entityId).toBe(target);
        expect(resolved!.entityType).toBe("opportunity");
        expect(resolved!.sortIndex).toBe(PROVISIONING_ROW_PAGE_CAP + 5);
    });

    it("the LAST member of an oversized lens is reachable", () => {
        const target = `pi-${OVERSIZED - 1}`;
        expect(
            resolveTargetedWorkViewMember({
                childRows: childMembership,
                familyMembership: [],
                subjectId: target,
            })!.entityId,
        ).toBe(target);
    });
});

describe("the guard stays fail-closed", () => {
    it("a NON-MEMBER resolves to null — never to a nearby row", () => {
        // The whole point of the guard. Substituting "some related row" would hide the grain bug this
        // work exists to fix, and would hand the operator a different family under an operational
        // banner — the most consequential form the fabrication defect can take.
        expect(
            resolveTargetedWorkViewMember({
                childRows: childMembership,
                familyMembership: [],
                subjectId: "pi-not-a-member",
            }),
        ).toBeNull();
    });

    it("a FAMILY id is not a member of a CHILD lens", () => {
        // Exactly the reported defect: the case sent where a participation was required. It must stay
        // refused — the fix is that Search now sends the participation, NOT that the case is accepted.
        expect(
            resolveTargetedWorkViewMember({
                childRows: childMembership,
                familyMembership,
                subjectId: "opp-3",
            }),
        ).toBeNull();
    });

    it("a CHILD participation is not a member of a FAMILY lens", () => {
        expect(
            resolveTargetedWorkViewMember({
                childRows: null,
                familyMembership,
                subjectId: "pi-3",
            }),
        ).toBeNull();
    });

    it("an empty or blank id resolves nothing", () => {
        for (const subjectId of ["", "   "]) {
            expect(
                resolveTargetedWorkViewMember({
                    childRows: childMembership,
                    familyMembership,
                    subjectId,
                }),
            ).toBeNull();
        }
    });

    it("an EMPTY lens admits nobody", () => {
        expect(
            resolveTargetedWorkViewMember({
                childRows: [],
                familyMembership: [],
                subjectId: "pi-0",
            }),
        ).toBeNull();
    });
});

describe("grain decides which identity counts", () => {
    it("child grain reads participationId; family grain reads the row id", () => {
        // Stated once, as behaviour. A child row has no `id` field at all — reading `.id` off one
        // yielded the string "undefined" for every row, which is why the identity is grain-specific
        // rather than a single generic accessor.
        expect(
            resolveTargetedWorkViewMember({
                childRows: [childRow("pi-7")],
                familyMembership: [],
                subjectId: "pi-7",
            })!.entityType,
        ).toBe("child");

        expect(
            resolveTargetedWorkViewMember({
                childRows: null,
                familyMembership: [familyRow("opp-7")],
                subjectId: "opp-7",
            })!.entityType,
        ).toBe("opportunity");
    });

    it("an empty child membership is still CHILD grain — not a fallthrough to family", () => {
        // `childRows: []` means "a child lens containing nobody", which is not the same as "not a
        // child lens". Falling through to the family branch here would let a case id select inside a
        // child lens — the exact substitution the guard exists to prevent.
        expect(
            resolveTargetedWorkViewMember({
                childRows: [],
                familyMembership: [familyRow("opp-1")],
                subjectId: "opp-1",
            }),
        ).toBeNull();
    });
});
