import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PacketOrchestrationHubView } from "@/components/forms/workspace/PacketOrchestrationHubView";
import { PacketBuilderWorkspaceLayout } from "@/components/forms/workspace/PacketBuilderWorkspaceLayout";

describe("PacketOrchestrationHubView OW-4", () => {
    it("renders workflow rows with open builder action", () => {
        const html = renderToStaticMarkup(
            <PacketOrchestrationHubView
                rows={[
                    {
                        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                        key: "onboarding",
                        name: "Onboarding",
                        description: "New family intake",
                        is_active: true,
                        updated_at: "2026-05-01T10:00:00.000Z",
                        step_count: 3,
                        session_count: 2,
                        all_steps_published: true,
                    },
                ]}
            />
        );

        expect(html).toContain('data-testid="packet-orchestration-hub"');
        expect(html).toContain('data-testid="packet-orchestration-list"');
        expect(html).toContain("Open builder");
        expect(html).toContain("3 steps");
        expect(html).not.toContain("<table");
    });
});

describe("PacketBuilderWorkspaceLayout OW-4", () => {
    it("shows step composition, distribution, and sessions regions", () => {
        const html = renderToStaticMarkup(
            <PacketBuilderWorkspaceLayout
                packetDefId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
                defName="Onboarding"
                defDesc="Multi-step intake"
                defActive
                defKey="onboarding"
                stepCount={2}
                sessionCount={1}
                allStepsPublished
                savedItems={[
                    {
                        id: "step-1",
                        sequence_index: 0,
                        form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
                        step_has_published_version: true,
                        form_definitions: { name: "Waitlist" },
                    },
                ]}
                steps={[{ form_definition_id: "ffffffff-ffff-4fff-8fff-ffffffffffff", step_label: "" }]}
                forms={[{ id: "ffffffff-ffff-4fff-8fff-ffffffffffff", name: "Waitlist", key: "waitlist", has_published_version: true }]}
                recentPublishedForms={[]}
                links={[]}
                createdLink={null}
                busy={false}
                viewerTz="UTC"
                onDefNameChange={() => {}}
                onDefDescChange={() => {}}
                onDefActiveChange={() => {}}
                onSaveMeta={() => {}}
                onStepsChange={() => {}}
                onAddStep={() => {}}
                onSaveSteps={() => {}}
                onMoveStep={() => {}}
                onRemoveStep={() => {}}
                onMintLink={() => {}}
                onToggleLink={() => {}}
            />
        );

        expect(html).toContain('data-testid="packet-builder-workspace"');
        expect(html).toContain('data-testid="packet-region-steps"');
        expect(html).toContain('data-testid="packet-region-distribution"');
        expect(html).toContain('data-testid="packet-region-sessions"');
        expect(html).toContain('data-testid="packet-step-composition"');
        expect(html).toContain('data-testid="packet-distribution-launch-panel"');
        expect(html).toContain("Launch packet link");
        expect(html).toContain("Session inbox");
        expect(html).toContain("<details");
    });
});
