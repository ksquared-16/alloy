import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const modal = readFileSync(
    resolve(__dirname, "../../../components/admin/opportunity/actions/CreateLeadModal.tsx"),
    "utf8",
);

describe("Create Lead success — Focus Panel opens only on Open Lead click, never auto", () => {
    it("renders the success state in the modal after create (does not navigate away)", () => {
        // After a successful create the modal shows the success state and waits for the operator.
        expect(modal).toMatch(/setStep\(["']success["']\)/);
        expect(modal).toContain("ActionWorkspaceSuccessState");
    });

    it("triggers the Focus Panel handoff ONLY from the Open Lead success action (no auto-open)", () => {
        // The focus-panel navigation funnels through handoffToCreatedLead. It must be invoked exactly
        // once — from the Open Lead button's onOpenLead handler — and never from the submit path or an
        // effect on success.
        const handoffCalls = modal.match(/handoffToCreatedLead\(/g) ?? [];
        expect(handoffCalls).toHaveLength(1);
        expect(modal).toMatch(/onOpenLead:\s*\(\)\s*=>/);
    });

    it("Open Lead closes/dismisses the modal as part of the handoff", () => {
        // queueActionWorkspaceLeadHandoff(id, openLead, closeWorkspace) — onClose is passed as the
        // closeWorkspace arg, and the handoff closes before navigating (see actionWorkspaceDrawerHandoff).
        expect(modal).toMatch(/queueActionWorkspaceLeadHandoff\(\s*opportunityId\s*,[\s\S]*?onClose\s*\)/);
    });
});
