import { describe, expect, it } from "vitest";

import { resolveFocusPanelSubjectReveal } from "@/lib/admin/drawer/focusPanelSubjectReveal";

describe("resolveFocusPanelSubjectReveal", () => {
    it("initial open (no payload yet) is subject-pending → seed header owns the identity", () => {
        const r = resolveFocusPanelSubjectReveal({
            shellOpen: true,
            hasDisplayVm: false,
            selectedSubjectId: "opp-1",
            displayedSubjectId: null,
        });
        expect(r.subjectResolved).toBe(false);
        expect(r.subjectPending).toBe(true);
    });

    it("resolved once the displayed payload matches the selected subject", () => {
        const r = resolveFocusPanelSubjectReveal({
            shellOpen: true,
            hasDisplayVm: true,
            selectedSubjectId: "opp-1",
            displayedSubjectId: "opp-1",
        });
        expect(r.subjectResolved).toBe(true);
        expect(r.subjectPending).toBe(false);
    });

    it("row→row switch: prior payload held but identity differs → subject-pending immediately (seed header switches)", () => {
        // drawer.id already switched to opp-2; the held payload still renders opp-1.
        const r = resolveFocusPanelSubjectReveal({
            shellOpen: true,
            hasDisplayVm: true,
            selectedSubjectId: "opp-2",
            displayedSubjectId: "opp-1",
        });
        expect(r.subjectResolved).toBe(false);
        expect(r.subjectPending).toBe(true);
    });

    it("latest click wins: changing the selected subject flips a resolved subject back to pending", () => {
        const settled = resolveFocusPanelSubjectReveal({
            shellOpen: true,
            hasDisplayVm: true,
            selectedSubjectId: "opp-1",
            displayedSubjectId: "opp-1",
        });
        expect(settled.subjectResolved).toBe(true);

        const afterClick = resolveFocusPanelSubjectReveal({
            shellOpen: true,
            hasDisplayVm: true,
            selectedSubjectId: "opp-9", // newest click
            displayedSubjectId: "opp-1", // stale payload still on screen
        });
        expect(afterClick.subjectResolved).toBe(false);
        expect(afterClick.subjectPending).toBe(true);
    });

    it("shell closed (flag off / no focus panel) is never pending — legacy behavior preserved", () => {
        const r = resolveFocusPanelSubjectReveal({
            shellOpen: false,
            hasDisplayVm: false,
            selectedSubjectId: "opp-1",
            displayedSubjectId: null,
        });
        expect(r.subjectPending).toBe(false);
        expect(r.subjectResolved).toBe(false);
    });

    it("no selected subject → not resolved (guards against matching null===null)", () => {
        const r = resolveFocusPanelSubjectReveal({
            shellOpen: true,
            hasDisplayVm: true,
            selectedSubjectId: null,
            displayedSubjectId: null,
        });
        expect(r.subjectResolved).toBe(false);
        expect(r.subjectPending).toBe(true);
    });
});
