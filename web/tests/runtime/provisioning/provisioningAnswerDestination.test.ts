import { describe, expect, it } from "vitest";
import { destinationIdFromAnswer } from "@/lib/runtime/provisioning/provisioningAnswerDestination";
import type { ProvisioningAnswer } from "@/lib/runtime/provisioning/workUnitProvisioningAnswer";

/** The deriver reads only terminal + workUnit.id + activeWorkView.id + recordOfAttention.id. */
function operational(overrides: Partial<Record<string, unknown>> = {}): ProvisioningAnswer {
    return {
        terminal: "operational",
        workUnit: { id: "wu-1", key: "new-leads", name: "New Leads" },
        activeWorkView: { id: "new_leads", label: "New Leads" },
        recordOfAttention: { id: "subj-7", strategy: "first_visible", strategySource: "configured" },
        ...overrides,
    } as unknown as ProvisioningAnswer;
}

describe("destinationIdFromAnswer (B2)", () => {
    it("derives the full destination (workUnit, workView, pinned subject) from an operational answer", () => {
        expect(destinationIdFromAnswer(operational())).toEqual({
            workUnitId: "wu-1",
            workViewId: "new_leads",
            subjectId: "subj-7",
            focusMode: null,
        });
    });

    it("derives a node destination (subject null) from an empty terminal", () => {
        const empty = {
            terminal: "empty",
            workUnit: { id: "wu-2", key: "waitlist", name: "Waitlist" },
            activeWorkView: { id: "waitlist", label: "Waitlist" },
            recordOfAttention: null,
        } as unknown as ProvisioningAnswer;
        expect(destinationIdFromAnswer(empty)).toEqual({
            workUnitId: "wu-2",
            workViewId: "waitlist",
            subjectId: null,
            focusMode: null,
        });
    });

    it("resolves no destination for an error terminal", () => {
        const err = { terminal: "error", code: "records_unavailable", workUnit: null } as unknown as ProvisioningAnswer;
        expect(destinationIdFromAnswer(err)).toBeNull();
    });
});
