import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
    DEPRECATED_LIFECYCLE_FIELD_RULE_IDS,
} from "@/lib/lifecycle/lifecycleConfiguration";
import { lifecycleFieldPaletteForStage } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle configuration correction", () => {
    it("does not expose composite fields in lead palette", () => {
        const palette = lifecycleFieldPaletteForStage("lead");
        expect(palette.some((f) => f.rule_id === "person:email_or_phone")).toBe(false);
        expect(palette.some((f) => f.field_label === "Email")).toBe(true);
        expect(palette.some((f) => f.field_label === "Phone")).toBe(true);
        expect(palette.some((f) => f.field_label === "Date of Birth")).toBe(true);
        expect(palette.some((f) => f.field_label === "Age Group")).toBe(true);
    });

    it("marks deprecated composite rule ids", () => {
        expect(DEPRECATED_LIFECYCLE_FIELD_RULE_IDS.has("person:email_or_phone")).toBe(true);
    });

    it("business processes hub is canonical at /business-processes", () => {
        expect(read("app/adminV2/settings/business-processes/page.tsx")).toContain("LifecycleSettingsShell");
        expect(read("app/adminV2/settings/lifecycle/page.tsx")).toContain("redirect");
        expect(read("app/adminV2/settings/enrollment-process/page.tsx")).toContain("redirect");
        expect(read("app/adminV2/settings/page.tsx")).toContain('title="Business Processes"');
        expect(read("app/adminV2/settings/page.tsx")).not.toContain('title="Enrollment Process"');
    });

    it("field editor uses scroll area for field list", () => {
        expect(read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx")).toContain(
            "lifecycle-field-requirements-scroll"
        );
    });

    it("statuses card shows opportunity-only context", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx");
        expect(card).toContain("Add or remove opportunity statuses for this stage");
        expect(card).not.toContain("lifecycle-status-entity-select");
        expect(card).toContain("Create or edit status definitions");
    });

    it("lifecycle hub shell uses scratch workbench not duplicate selectors", () => {
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        const createForm = read("components/adminV2/settings/lifecycle/LifecycleCreateForm.tsx");
        expect(hub).not.toContain("lifecycle-department-select");
        expect(hub).not.toContain("LifecycleBuilderToolbar");
        expect(createForm).toContain("lifecycle-create-lifecycle");
        expect(createForm).toContain("lifecycle-create-primary-entity");
    });
});
