import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("Lifecycle UX coherence pass 2", () => {
    it("statuses card references automatic queue filter", () => {
        const statuses = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessStageStatusesCard.tsx");
        const workUnit = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(statuses).toContain("Work Unit Queue filter");
        expect(workUnit).not.toContain("Statuses in this stage");
    });

    it("work unit queue copy only", () => {
        const card = read("components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard.tsx");
        expect(card).toContain("lifecycle-work-unit-queue-copy");
        expect(card).not.toContain("lifecycle-sync-queue-helper");
    });

    it("work unit queue in setup wizard", () => {
        const hub = read("components/adminV2/settings/LifecycleHubClient.tsx");
        expect(hub).toContain("Work Unit Queue");
    });

    it("actions card uses base action flow", () => {
        const actions = read("components/adminV2/settings/enrollmentProcess/EnrollmentProcessActionsCard.tsx");
        expect(actions).toContain("lifecycle-add-action-base");
        expect(actions).toContain("lifecycle-add-action-label");
    });

    it("needs attention card explains signals", () => {
        const card = read("components/adminV2/settings/lifecycle/LifecycleNeedsAttentionCard.tsx");
        expect(card).toContain("Attention signals tell operators when work is overdue");
    });

    it("setup wizard steps scroll internally", () => {
        const wizard = read("components/adminV2/settings/lifecycle/LifecycleStageSetupWizard.tsx");
        expect(wizard).toContain("max-h-[320px]");
        expect(wizard).toContain("overflow-y-auto");
    });

    it("field requirements use compact rows", () => {
        const editor = read("components/adminV2/settings/LifecycleStageFieldRequirementsEditor.tsx");
        expect(editor).toContain('Req"');
        expect(editor).toContain("divide-y");
    });

    it("lifecycle builder persists in department metadata", () => {
        expect(read("lib/lifecycle/lifecycleBuilderConfig.ts")).toContain("lifecycle_builder_v1");
    });
});
