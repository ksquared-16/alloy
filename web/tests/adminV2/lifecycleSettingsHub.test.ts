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
    it("Settings index includes lifecycle tile under Operations", () => {
        const page = read("app/adminV2/settings/page.tsx");
        expect(page).toContain('label="Operations"');
        expect(page).toContain('title="Business Processes"');
        expect(page).toContain("/admin/settings/lifecycle");
    });

    it("lifecycle hub page renders with operator title and test id", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        expect(page).toContain("BUSINESS_PROCESS_SETTINGS_PAGE_TITLE");
        expect(page).toContain("settings-lifecycle-page");
        expect(page).toContain("LifecycleSettingsShell");
    });

    it("primary hub uses stage-first navigation and field requirements editor", () => {
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(hub).toContain("lifecycle-hub");
        expect(hub).toContain("LifecycleStageFieldRequirementsEditor");
        expect(editor).toContain("Required Information");
        expect(editor).toContain("lifecycle-field-entity-select");
        expect(editor).toContain("lifecycle-field-requirements-list");
        expect(editor).not.toContain("field_key");
        expect(editor).not.toContain("requirement_policy");
        expect(editor).not.toContain("condition_config");
    });

    it("legacy requirements-only hub cross-links to lifecycle", () => {
        const legacy = read("components/adminV2/settings/LifecycleStagesRequirementsHub.tsx");
        expect(legacy).toContain("lifecycle-stages-requirements-hub");
        expect(legacy).toContain("ADMIN_V2_SETTINGS_LIFECYCLE_PATH");
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

    it("layouts page owns drawer and queue presentation", () => {
        const layoutsPage = read("app/adminV2/settings/layouts/page.tsx");
        expect(layoutsPage).toContain("settings-layouts-page");
        expect(layoutsPage).toContain("LayoutConfigClient");
        expect(layoutsPage).toContain("queue presentation");
    });

    it("related Settings pages cross-link to lifecycle hub", () => {
        const banner = read("components/adminV2/settings/LifecycleSettingsCrossLinkBanner.tsx");
        expect(banner).toContain("ADMIN_V2_SETTINGS_LIFECYCLE_PATH");
        expect(read("app/adminV2/settings/actions/page.tsx")).toContain('variant="actions"');
        expect(read("app/adminV2/settings/statuses/page.tsx")).toContain('variant="statuses"');
        expect(read("app/adminV2/settings/attention-sla-rules/page.tsx")).toContain('variant="attention"');
    });
});
