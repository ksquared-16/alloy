import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    LIFECYCLE_STAGE_LABELS,
    LIFECYCLE_STAGE_ORDER,
    lifecycleProgressionRequirementsForStage,
} from "@/lib/completion/lifecycleProgressionRequirementsCatalog";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("lifecycle Settings IA", () => {
    it("Settings index includes lifecycle tile under Enrollment operations", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain("Enrollment Operations");
        expect(page).toContain('title="Lifecycle"');
        expect(page).toContain("/adminV2/settings/lifecycle");
        expect(page).toContain('mode="editable"');
    });

    it("lifecycle hub page renders with operator title and test id", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain(">Lifecycle</h1>");
        expect(page).toContain("settings-lifecycle-page");
        expect(page).toContain("LifecycleSettingsHubClient");
    });

    it("hub component uses stage-first navigation and shared requirements editor", () => {
        const hub = read("components/adminV2/settings/LifecycleStagesRequirementsHub.tsx");
        const editor = read("components/adminV2/settings/LifecycleStageRequirementsEditor.tsx");
        expect(hub).toContain("lifecycle-stages-requirements-hub");
        expect(hub).toContain("LifecycleStageRequirementsEditor");
        expect(hub).toContain("enrollmentProcessSettingsPaths");
        expect(editor).toContain("Required Information");
        expect(editor).toContain("Recommended Information");
        expect(editor).toContain('type="checkbox"');
        expect(editor).toContain("lifecycleRequirementFieldDetailForLabel");
        expect(hub).toContain("LifecycleStageWhereAppears");
        expect(hub).toContain("LifecycleRelatedSettingsLinks");
        expect(editor).toContain("lifecycle-req-field-detail");
        expect(editor).not.toContain("field_key");
        expect(editor).not.toContain("requirement_policy");
        expect(editor).not.toContain("condition_config");
    });

    it("all six stage names are defined in catalog", () => {
        const labels = LIFECYCLE_STAGE_ORDER.map((s) => LIFECYCLE_STAGE_LABELS[s]);
        expect(labels).toEqual([
            "Lead",
            "Qualification",
            "Tour",
            "Waitlist",
            "Enrollment",
            "Enrolled",
        ]);
    });

    it("qualification doctrine uses Child and Program not field keys", () => {
        const q = lifecycleProgressionRequirementsForStage("qualification");
        const requiredLabels = q.required.map((r) => r.label);
        expect(requiredLabels).toContain("Child");
        expect(requiredLabels).toContain("Program");
        expect(requiredLabels.some((l) => l.includes("_"))).toBe(false);
    });

    it("Record layouts links to lifecycle hub instead of owning the panel", () => {
        const layoutsPage = read("app/adminV2/settings/layouts/page.tsx");
        const workspace = read("components/adminV2/settings/RecordDrawerCompositionWorkspace.tsx");
        expect(layoutsPage).toContain("LifecycleSettingsCrossLinkBanner");
        expect(layoutsPage).toContain('variant="layouts"');
        expect(workspace).not.toContain("LifecycleProgressionRequirementsSettingsPanel");
        expect(workspace).not.toContain("LifecycleStagesRequirementsHub");
    });

    it("related Settings pages cross-link to enrollment process hub", () => {
        const banner = read("components/adminV2/settings/LifecycleSettingsCrossLinkBanner.tsx");
        expect(banner).toContain("enrollmentProcessSettingsPaths");
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain('variant="actions"');
        expect(read("app/adminV2/settings/statuses/page.tsx")).toContain('variant="statuses"');
        expect(read("app/adminV2/settings/attention-sla-rules/page.tsx")).toContain('variant="attention"');
    });
});
