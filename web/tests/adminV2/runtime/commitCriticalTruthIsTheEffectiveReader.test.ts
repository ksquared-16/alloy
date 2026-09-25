/**
 * OX J5 — THE RESERVED CELLS READ THE COMMIT-CRITICAL TRUTH BAG, NOT THE DRAWER RECORD.
 *
 * Measured on deployed 96f37f1a, n=22 COLD switches: the children and household cells are reserved
 * from P50 126ms and do not clear until P50 3,194ms, 46ms after the full VM lands. A cold switch has
 * no prior subject, and in the panel `visible = resolved ?? heldPrior` where `resolved` requires
 * `displayVm != null` and `record = displayVm.above_fold.record` — so `visible.record` cannot exist
 * at 126ms. Those reserved cells are therefore not evaluating the drawer record at all.
 *
 * What they evaluate is this: `focusPanelWorkModeModelFromProvisioningAnswer` builds
 * `context.truth` by spreading `input.subjectIdentityTruth`, and admits a commit-critical card only
 * when its `isKnowable` is satisfied. That bag reaches the surface as a PROP on
 * `OperationalSubjectProvider` (`factsOp.subjectIdentityTruth`) and nothing updates it after commit.
 *
 * This test pins that seam. A progressive `_inquiry_children` patch merged HERE must flip children
 * and household from reserved to ready with no drawer view model anywhere in sight. A patch routed
 * only into the drawer-record lifecycle cannot make these assertions pass, which is precisely the
 * wrong-consumer defect this guards against.
 */
import { describe, expect, it } from "vitest";
import { focusPanelWorkModeModelFromProvisioningAnswer } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModelFromProvisioningAnswer";
import type { SubjectIdentityTruth } from "@/lib/adminV2/runtime/operationalContext/types";

const baseInput = (truth: SubjectIdentityTruth | null) =>
    ({
        mode: "work" as const,
        subjectId: "opp-1",
        title: "Test Family",
        statusLabel: "Inquiry",
        statusKey: "inquiry",
        canMutate: true,
        perspective: null,
        stageWorkRuntime: null,
        situation: { stageKey: "inquiry", stageLabel: "Inquiry", purpose: null },
        primaryAction: null,
        subjectIdentityTruth: truth,
        subjectGrain: { grain: "case" as const, subjectType: "opportunity" as const },
    }) as Parameters<typeof focusPanelWorkModeModelFromProvisioningAnswer>[0];

const readiness = (truth: SubjectIdentityTruth | null) => {
    const model = focusPanelWorkModeModelFromProvisioningAnswer(baseInput(truth));
    return model.cardReadiness;
};

describe("commit-critical truth is the effective reader for the reserved cells", () => {
    it("children and household are NOT ready when the identity bag carries no roster", () => {
        const r = readiness(null);
        expect(r.get("children"), "children reserves without its own truth").not.toBe("ready");
        expect(r.get("household"), "household reserves too").not.toBe("ready");
    });

    /*
     * customer.id is not identity truth for either card. This is the "UNKNOWN is not absence" rule:
     * knowing WHICH household this is says nothing about its roster or its contact.
     */
    it("customer.id alone does not admit either card", () => {
        const r = readiness({ "customer.id": "cust-1" } as unknown as SubjectIdentityTruth);
        expect(r.get("children")).not.toBe("ready");
        expect(r.get("household")).not.toBe("ready");
    });

    it("a populated canonical roster merged into THIS bag admits children — with no drawer VM", () => {
        const r = readiness({ _inquiry_children: [{ id: "child-1" }] } as unknown as SubjectIdentityTruth);
        expect(r.get("children"), "children clears from its own canonical fact").toBe("ready");
    });

    /*
     * Under CURRENT opportunity semantics household clears from the same fact, because its predicate
     * reads `person.primary_contact_name` OR `_inquiry_children`, and the dotted key is never present
     * on an opportunity record (verified on deployed records: 92 keys, zero beginning "person.").
     * That is recorded as HOUSEHOLD_CONTACT_PREDICATE_SEMANTICS debt, not changed here.
     */
    it("household clears from the same roster fact under current semantics", () => {
        const r = readiness({ _inquiry_children: [{ id: "child-1" }] } as unknown as SubjectIdentityTruth);
        expect(r.get("household")).toBe("ready");
    });

    it("an explicit EMPTY roster is known truth and admits children", () => {
        const r = readiness({ _inquiry_children: [] } as unknown as SubjectIdentityTruth);
        expect(r.get("children"), "explicit [] is a canonical answer, not absence").toBe("ready");
    });

    it("an absent roster key is UNKNOWN and must never be coerced to empty", () => {
        const r = readiness({ "customer.id": "cust-1" } as unknown as SubjectIdentityTruth);
        expect(r.get("children")).not.toBe("ready");
    });
});
