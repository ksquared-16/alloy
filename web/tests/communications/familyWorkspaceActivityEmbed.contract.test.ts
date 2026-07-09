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
        expect(workspace).toMatch(/timelineMessages=\{isActivityEmbed \? timelineMessages : undefined\}/);
    });

    it("activity_embed view renders topic rail + read/compose pane", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/data-cc-topic-rail/);
        expect(view).toMatch(/data-cc-thread-strip/);
        expect(view).toMatch(/data-cc-ws-column="threadlist"/);
        expect(view).toMatch(/data-cc-thread-chip/);
        expect(view).toMatch(/data-cc-thread-topic/);
        expect(view).toMatch(/data-cc-thread-header/);
        expect(view).toMatch(/data-cc-thread-avatars/);
        expect(view).toMatch(/threadsForActivityTopicRail\(threads\)/);
        expect(view).toMatch(/deriveThreadLastPreview/);
        expect(view).toMatch(/formatThreadParticipantNames/);
        expect(view).toMatch(/deriveThreadChannelLabel/);
        expect(view).toMatch(/onOpenThread\(thread\.id\)/);
        expect(view).toMatch(/data-cc-ws-column="conversation"/);
        expect(view).toMatch(/data-cc-new-message/);
        expect(view).toMatch(/data-cc-recipient-compact/);
        expect(view).toMatch(/onNewMessage\?\.\(\)/);
        expect(view).toMatch(/isNewMessageMode/);
    });

    it("Activity cockpit uses fill-height grid body and stretchable embed chain", () => {
        const embedded = read("components/admin/focusPanel/OpportunityFocusPanelEmbeddedWorkspace.tsx");
        const css = read("app/adminV2/components/alloyOsRuntime.css");
        expect(embedded).toMatch(/data-activity-cockpit-embed="true"/);
        expect(css).toMatch(/\.alloy-os-activity-cockpit__body[\s\S]*grid-template-columns/);
        expect(css).toMatch(/grid-template-rows: minmax\(0, 1fr\)/);
        expect(css).toMatch(/\.alloy-os-activity-cockpit__stack[\s\S]*height: 100%/);
        expect(css).toMatch(/\.alloy-os-activity-cockpit__work[\s\S]*flex: 1\.6 1 0/);
        expect(css).toMatch(/\.alloy-os-activity-cockpit__docs[\s\S]*flex: 1\.2 1 0/);
        expect(css).toMatch(
            /html\[data-alloy-os-runtime-split="true"\][\s\S]*\.alloy-os-activity-cockpit[\s\S]*flex: 1 1 0%/
        );
        expect(css).toMatch(
            /html\[data-alloy-os-runtime-split="true"\][\s\S]*\.alloy-os-activity-cockpit__body[\s\S]*flex: 1 1 0%/
        );
        expect(css).toMatch(/\[data-cc-topic-rail\]/);
    });

    it("activity_embed hides zero-message threads via topic rail helper", () => {
        const helper = read("lib/communications/v2/familyWorkspace/threadTopicPresentation.ts");
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(helper).toMatch(/threadsForActivityTopicRail/);
        expect(helper).toMatch(/thread\.messageCount > 0/);
        expect(view).toMatch(/threadsForActivityTopicRail\(threads\)/);
    });

    it("activity_embed thread title uses General fallback and channel icon", () => {
        const helper = read("lib/communications/v2/familyWorkspace/threadTopicPresentation.ts");
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(helper).toMatch(/deriveThreadTopicFallback/);
        expect(helper).toMatch(/return "General"/);
        expect(view).toMatch(/ThreadChannelIcon/);
        expect(view).toMatch(/data-cc-thread-channel/);
        expect(view).not.toMatch(/SMS Conversation/);
    });

    it("activity_embed resolves thread participants from transport thread not household", () => {
        const helper = read("lib/communications/v2/familyWorkspace/threadTopicPresentation.ts");
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(helper).toMatch(/resolveThreadRecipients/);
        expect(helper).toMatch(/deriveThreadParticipantPersonIds/);
        expect(view).toMatch(/resolveThreadRecipients\(thread, timelineMessages, allLiveRecipients\)/);
        expect(workspace).toMatch(/deriveThreadReplyRecipientIds/);
        expect(workspace).toMatch(/syncActivityThreadContext/);
        expect(workspace).toMatch(/threadChannelToWorkspaceMode/);
    });

    it("activity_embed message sender uses Sent from Alloy not Unassigned", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        const helper = read("lib/communications/v2/familyWorkspace/threadTopicPresentation.ts");
        expect(helper).toMatch(/deriveMessageSenderLabel/);
        expect(helper).toMatch(/Sent from Alloy/);
        expect(view).toMatch(/deriveMessageSenderLabel/);
        expect(view).toMatch(/viewerUserId/);
    });

    it("activity_embed new-message mode shows compact compose pane without dashed empty panel", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/isNewMessageMode \? \(\n\s*composerColumn/);
        expect(view).not.toMatch(/Start a new message/);
        expect(view).not.toMatch(/border-dashed border-alloy-stone\/25 bg-white\/70/);
        expect(view).toMatch(/New Message/);
        expect(view).toMatch(/isNewMessageMode \? "Send"/);
    });

    it("activity_embed selected thread shows history with collapsed reply affordance", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/data-cc-ws-section="timeline"/);
        expect(view).toMatch(/data-cc-reply-collapsed/);
        expect(view).toMatch(/data-cc-reply-expand/);
        expect(view).toMatch(/replyComposerExpanded/);
        expect(view).toMatch(/Send reply/);
    });

    it("activity_embed post-send stays in thread and collapses composer", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(workspace).toMatch(/sendCompleteToken/);
        expect(workspace).toMatch(/threadToOpen = priorThreadId \?\? createdThreadId/);
        expect(workspace).toMatch(/setSendCompleteToken/);
        expect(view).toMatch(/sendCompleteToken/);
    });

    it("activity_embed scope reset does not clear selectedThreadId on thread switch", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(workspace).toMatch(/familyScopeKey/);
        expect(workspace).toMatch(/loadRef\.current\(null, true\)/);
        expect(workspace).not.toMatch(/void load\(null, true\);\n    \}, \[load, props\.initialPreviewVm\]/);
    });

    it("activity_embed load ignores stale family-workspace responses", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(workspace).toMatch(/loadRequestSeqRef/);
        expect(workspace).toMatch(/selectedThreadIdRef/);
        expect(workspace).toMatch(/applyIfCurrent/);
        expect(workspace).toMatch(/hasUserThreadSelectionRef/);
    });

    it("activity_embed selected thread header shows topic, participants, channel, delivery", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/data-cc-thread-header-summary/);
        expect(view).toMatch(/deriveThreadHeaderSummary/);
    });

    it("activity_embed composer uses unified activity buttons and formatting toolbar", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        const ui = read("app/adminV2/communications/commsWorkspaceUi.tsx");
        expect(view).toMatch(/COMMS_ACTIVITY_PRIMARY_BTN_CLASS/);
        expect(view).toMatch(/COMMS_ACTIVITY_SECONDARY_BTN_CLASS/);
        expect(view).toMatch(/data-bos-assist-button="true"/);
        expect(view).toMatch(/applyBodyFormat\("bold"\)/);
        expect(view).toMatch(/applyBodyFormat\("link"\)/);
        expect(ui).toMatch(/COMMS_ACTIVITY_PRIMARY_BTN_CLASS/);
        expect(ui).toMatch(/COMMS_ACTIVITY_SECONDARY_BTN_CLASS/);
    });

    it("activity embed bootstraps first thread and isolates new-message timeline", () => {
        const workspace = read("app/adminV2/communications/FamilyCommunicationWorkspace.tsx");
        expect(workspace).toMatch(/activityEmbedBootstrappedRef/);
        expect(workspace).toMatch(/isActivityEmbed[\s\S]*selectedThreadId[\s\S]*vm\.messages/);
        expect(workspace).toMatch(/selectedThread=\{/);
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

    it("Command Center default modal layout remains unchanged", () => {
        const view = read("app/adminV2/communications/FamilyCommunicationWorkspaceView.tsx");
        expect(view).toMatch(/grid-cols-\[minmax\(0,1fr\)_minmax\(380px,1\.35fr\)\]/);
        expect(view).toMatch(/data-cc-ws-column="timeline"/);
        expect(view).toMatch(/snapshotBand/);
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
