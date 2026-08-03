import { describe, expect, it } from "vitest";
import type { OperationalSubjectRef } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FocusPanelWorkModeModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelWorkModeModel";

/**
 * SC-1 — Subject contract generalization (PoC, EEC-free / typecheck-certifiable).
 *
 * `FocusPanelWorkModeModel.subject` was `{ type: "opportunity"; … }` (a domain literal baked into the
 * PLATFORM model contract). It is now the generic `OperationalSubjectRef` (`type: string`) — the same
 * grain-agnostic shape cards already consume via `context.subject`. Domain producers still supply their
 * concrete type (the opportunity composers supply `"opportunity"`); a second surface supplies its own
 * (`SECOND-SURFACE-CERTIFICATION-DESIGN.md` → a `child` subject) with NO platform-layer change.
 *
 * This PoC proves the contract composes for a second, meaningfully-different subject grain (the whole
 * point of SC-1) — it does not exercise the live opportunity runtime (unchanged, behavior-preserving).
 */

// Compile-time proof: the model's subject field IS the generic ref (not the "opportunity" literal).
type SubjectField = FocusPanelWorkModeModel["subject"];
type AssertGeneric = SubjectField extends OperationalSubjectRef
    ? OperationalSubjectRef extends SubjectField
        ? true
        : never
    : never;
const _subjectIsGeneric: AssertGeneric = true;

describe("SC-1 — subject contract is grain-agnostic (second-surface enabler)", () => {
    it("accepts the opportunity subject (Work Unit — unchanged, behavior-preserving)", () => {
        const opportunity: OperationalSubjectRef = {
            type: "opportunity",
            id: "opp-1",
            label: "Kurzman family",
        };
        expect(opportunity.type).toBe("opportunity");
    });

    it("accepts a CHILD subject without any platform-layer change (the proving second grain)", () => {
        // Would not have type-checked while `subject.type` was the `"opportunity"` literal.
        const child: OperationalSubjectRef = { type: "child", id: "child-1", label: "Ada K." };
        expect(child.type).toBe("child");
    });

    it("accepts arbitrary future subject grains (person, candidate, scheduling_assignment)", () => {
        const grains: OperationalSubjectRef["type"][] = [
            "opportunity",
            "child",
            "person",
            "candidate",
            "scheduling_assignment",
        ];
        for (const type of grains) {
            const subject: OperationalSubjectRef = { type, id: `${type}-1`, label: type };
            expect(subject.type).toBe(type);
        }
    });

    it("the compile-time assertion holds (SubjectField === OperationalSubjectRef)", () => {
        expect(_subjectIsGeneric).toBe(true);
    });
});
