import { describe, expect, it } from "vitest";
import { resolveWorkspaceNavWorkUnitLabel } from "@/lib/adminV2/navigation/workspaceNavWorkUnitLabel";

describe("resolveWorkspaceNavWorkUnitLabel", () => {
    it("uses metadata nav_label when present", () => {
        expect(
            resolveWorkspaceNavWorkUnitLabel({
                name: "Enrollment Pipeline",
                key: "enrollment_pipeline",
                metadata: { nav_label: "Intake queue" },
            })
        ).toBe("Intake queue");
    });

    it("maps enrollment_pipeline to Active inquiries (not pipeline product name)", () => {
        expect(
            resolveWorkspaceNavWorkUnitLabel({
                name: "Enrollment Pipeline",
                key: "enrollment_pipeline",
            })
        ).toBe("Active inquiries");
    });

    it("falls back to trimmed name for generic work units", () => {
        expect(
            resolveWorkspaceNavWorkUnitLabel({
                name: "  Billing ops  ",
                key: "billing_ops",
            })
        ).toBe("Billing ops");
    });
});
