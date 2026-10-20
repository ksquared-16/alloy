/**
 * A pending offer is recorded from the family's Decision card, per child, in Alloy's dialog, through
 * the canonical outcome runtime — never an Enrollment-only mutation path, never a browser dialog.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const WEB = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(WEB, rel), "utf8");
const PANEL = read("components/admin/focusPanel/cards/CurrentWorkParticipantDecisionsPanel.tsx");
const DIALOG = read("components/admin/focusPanel/cards/ChildWorkOutcomeDialog.tsx");

describe("Record outcome on the Decision card", () => {
    it("is offered per child when that child has its own open work", () => {
        expect(PANEL).toMatch(/row\.open_work[\s\S]{0,400}data-decision-record-outcome/);
        expect(PANEL).toContain("<ChildWorkOutcomeDialog");
    });

    it("resolves outcomes and the child server-side and records through complete-stage-work", () => {
        expect(DIALOG).toContain("fetchStageWorkOutcomeResolution");
        expect(DIALOG).toContain("completeStageWorkWithSelectedOutcome");
        expect(DIALOG).toContain("subject: resolution.subject");
        expect(DIALOG).not.toMatch(/supabase|update_enrollment_status|window\.confirm/);
    });

    it("uses Alloy's dialog for both the path confirmation and the outcome", () => {
        expect(DIALOG).toContain('from "@/components/ui/AlloyDialog"');
        expect(PANEL).toContain('from "@/components/ui/AlloyDialog"');
        expect(PANEL).not.toMatch(/window\.confirm|window\.alert/);
    });
});
