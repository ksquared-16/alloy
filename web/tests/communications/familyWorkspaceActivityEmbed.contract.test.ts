import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(rel: string): string {
    return readFileSync(join(root, rel), "utf8");
}

describe("familyWorkspace activity_embed contract", () => {
    it("prop chain passes surfaceVariant from Activity cockpit to workspace view", () => {
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        const drawer = read("components/admin/communications/CommunicationsDrawerSection.tsx");
        const tab = read("app/adminV2/communications/recordTab/RecordCommunicationsTab.tsx");
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");

        expect(embedded).toMatch(/surfaceVariant="activity_embed"/);
        expect(drawer).toMatch(/surfaceVariant\?: FamilyWorkspaceSurfaceVariant/);
        expect(drawer).toMatch(/surfaceVariant=\{props\.surfaceVariant\}/);
        expect(tab).toMatch(/surfaceVariant=\{props\.surfaceVariant\}/);
        expect(workspace).toMatch(/onNewMessage=\{startNewMessage\}/);
        expect(workspace).toMatch(/threads=\{vm\.threads\}/);
    });

    it("activity_embed view renders a two-pane conversation workspace (thread list | conversation)", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        // Thread rollup list (repurposed data-cc-thread-strip) with per-thread chips.
        expect(view).toMatch(/data-cc-thread-strip/);
        expect(view).toMatch(/data-cc-ws-column="threadlist"/);
        expect(view).toMatch(/data-cc-thread-chip/);
        // Selected conversation + pinned composer on the right pane.
        expect(view).toMatch(/data-cc-ws-column="conversation"/);
        expect(view).toMatch(/data-cc-new-message/);
        expect(view).toMatch(/data-cc-recipient-compact/);
        expect(view).toMatch(/onNewMessage\?\.\(\)/);
    });

    it("Activity cockpit uses fill-height grid body and stretchable embed chain", () => {
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(embedded).toMatch(/data-activity-cockpit-embed="true"/);
        expect(css).toMatch(/\.alloy-os-activity-cockpit__body[\s\S]*grid-template-columns/);
        expect(css).toMatch(/grid-template-rows: minmax\(0, 1fr\)/);
        expect(css).toMatch(/\.alloy-os-activity-cockpit__stack[\s\S]*height: 100%/);
        // Split-mode override must NOT cap cockpit to content height (breaks grid 1fr fill).
        expect(css).not.toMatch(
            /html\[data-alloy-os-runtime-split="true"\] \.alloy-os-activity-cockpit[\s\S]*height: auto/
        );
        expect(css).toMatch(
            /html\[data-alloy-os-runtime-split="true"\][\s\S]*\.alloy-os-activity-cockpit[\s\S]*height: 100%/
        );
    });

    it("Recent Activity ribbon uses compact event count", () => {
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        expect(embedded).toMatch(/RIBBON_EVENT_COUNT = 3/);
    });

    it("activity embed record tab and workspace wrappers participate in flex height chain", () => {
        const tab = read("app/adminV2/communications/recordTab/RecordCommunicationsTab.tsx");
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(tab).toMatch(/activity_embed[\s\S]*flex-1/);
        expect(workspace).toMatch(/isActivityEmbed[\s\S]*flex-1/);
    });
});

describe("startNewMessage clears thread context", () => {
    it("FamilyCommunicationWorkspace resets selectedThreadId in startNewMessage", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(workspace).toMatch(/const startNewMessage = useCallback\(\(\) => \{/);
        expect(workspace).toMatch(/setSelectedThreadId\(null\)/);
        expect(workspace).toMatch(/void load\(null, false\)/);
    });
});
