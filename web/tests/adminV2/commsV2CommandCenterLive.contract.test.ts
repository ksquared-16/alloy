import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** ACT-1 — the Command Center shell is wired to live data (read-only + assignment, no send). */
describe("command center live wiring", () => {
    const shellSrc = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "CommandCenterShell.tsx"), "utf8");
    const workspaceSrc = readFileSync(
        join(process.cwd(), "app", "adminV2", "communications", "FamilyCommunicationWorkspaceView.tsx"),
        "utf8"
    );
    const kpiStripSrc = readFileSync(
        join(process.cwd(), "app", "adminV2", "communications", "CommunicationsWorkspaceKpiStrip.tsx"),
        "utf8"
    );
    const kpiContextSrc = readFileSync(
        join(process.cwd(), "app", "adminV2", "communications", "CommunicationsWorkspaceKpiContext.tsx"),
        "utf8"
    );
    const runtimeSrc = readFileSync(
        join(process.cwd(), "lib", "communications", "v2", "familyWorkspace", "useFamilyCommunicationRuntime.ts"),
        "utf8"
    );
    const src = `${shellSrc}\n${workspaceSrc}\n${kpiStripSrc}\n${kpiContextSrc}\n${runtimeSrc}`;
    it("fetches conversations from the dark API", () => {
        expect(src).toMatch(/\/api\/admin\/communications\/conversations/);
    });
    it("renders metrics, filters, queues, and a timeline", () => {
        expect(kpiStripSrc).toMatch(/WorkspaceOperationalHealth/);
        expect(kpiStripSrc).not.toMatch(/WorkspaceMetricTiles|CompactKpiStrip/);
        expect(shellSrc).toMatch(/setInboxKpis/);
        expect(src).toMatch(/data-cc-filters/);
        expect(src).toMatch(/visibleCommandCenterQueues/);
        expect(src).toMatch(/data-cc-timeline/);
        expect(src).toMatch(/computeCommandCenterMetrics/);
        expect(src).toMatch(/applyQueueFilters/);
        expect(src).toMatch(/groupConversationsByQueue/);
    });
    it("renders queue rows from visible sections and loads FamilyCommunicationWorkspace on selection", () => {
        expect(shellSrc).toMatch(/queueSections\.map/);
        expect(shellSrc).toMatch(/data-cc-conversation=/);
        expect(shellSrc).toMatch(/FamilyCommunicationWorkspaceView/);
        expect(shellSrc).toMatch(/selected \?/);
        expect(shellSrc).toMatch(/openConversation/);
    });
    it("auto-selects the first visible conversation on load", () => {
        expect(shellSrc).toMatch(/resolveCommandCenterSelection/);
        expect(shellSrc).toMatch(/flattenVisibleConversationIds/);
        expect(shellSrc).toMatch(/CommsQueueListReserve/);
        expect(shellSrc).not.toMatch(/data-cc-loading-overlay/);
        expect(shellSrc).not.toMatch(/Select a family from the queue/);
    });
    it("loads thread-scoped timeline via shared family runtime and hides assignment UI by default", () => {
        expect(shellSrc).toMatch(/useFamilyCommunicationRuntime/);
        expect(shellSrc).toMatch(/surfaceVariant:\s*"workspace_inbox"/);
        expect(runtimeSrc).toMatch(/prefetchDrawerFamilyWorkspace/);
        expect(shellSrc).toMatch(/showClaim=\{ASSIGNMENT_ENABLED\}/);
        expect(workspaceSrc).not.toMatch(/assignment_state \?\? "—"/);
        expect(shellSrc).not.toMatch(/FALLBACK_QUEUE_EXPLANATION/);
    });
    it("always shows communication preferences and workspace mode tabs", () => {
        expect(workspaceSrc).toMatch(/data-cc-ws-section="preferences"/);
        expect(workspaceSrc).toMatch(/CommunicationPreferencesEditor/);
        expect(workspaceSrc).toMatch(/data-cc-triage/);
        expect(workspaceSrc).toMatch(/data-cc-add-note/);
        expect(workspaceSrc).toMatch(/data-cc-workspace-mode/);
        expect(workspaceSrc).toMatch(/renderModeTab\("note", "Notes"\)/);
        expect(workspaceSrc).toMatch(/renderModeTab\("tasks", "Tasks"\)/);
    });
    it("supports linked record drawer navigation", () => {
        expect(shellSrc).toMatch(/buildCommandCenterRecordLinks/);
        expect(workspaceSrc).toMatch(/data-cc-record-link/);
        expect(shellSrc).toMatch(/openDrawer/);
    });
    it("uses conservative health labels and needs-review KPI", () => {
        expect(shellSrc).toMatch(/resolveCommandCenterHealthDisplay/);
        expect(kpiStripSrc).toMatch(/Needs Review/);
        expect(shellSrc).not.toMatch(/Unresponsive/);
    });
    it("resolves business process stage labels via shared drawer batch helper", () => {
        const enrichment = readFileSync(
            join(process.cwd(), "lib", "communications", "v2", "commandCenterConversationEnrichment.ts"),
            "utf8"
        );
        expect(enrichment).toMatch(/resolveOpportunityStatusLabelsBatch/);
        expect(enrichment).not.toMatch(/formatStageLabel|status_key\)\.replace\(/);
        const batch = readFileSync(
            join(process.cwd(), "lib", "admin", "drawer", "resolveOpportunityStatusLabelsBatch.ts"),
            "utf8"
        );
        expect(batch).toMatch(/resolveOpportunityStatusDisplay/);
    });
    it("prefetches conversations from shell mount and inbox open", () => {
        const preload = readFileSync(join(process.cwd(), "lib", "adminV2", "coreSurfacePreloadRegistry.ts"), "utf8");
        const nav = readFileSync(join(process.cwd(), "app", "adminV2", "components", "TopNavBar.tsx"), "utf8");
        const cache = readFileSync(join(process.cwd(), "lib", "communications", "v2", "commandCenterPrefetchCache.ts"), "utf8");
        expect(preload).toMatch(/scheduleCommunicationsWorkspaceWarm/);
        expect(nav).toMatch(/warmCommunicationsWorkspaceModal/);
        expect(shellSrc).toMatch(/commandCenterPrefetchCache/);
        expect(cache).toMatch(/warmFirstConversationWorkspace/);
        expect(cache).toMatch(/runWhenAdminV2PrimarySurfaceReady/);
    });
    it("wraps timeline message bodies inside bubble borders", () => {
        expect(workspaceSrc).toMatch(/data-cc-msg-bubble/);
        expect(workspaceSrc).toMatch(/\[overflow-wrap:anywhere\]/);
        expect(workspaceSrc).toMatch(/whitespace-pre-wrap/);
        expect(workspaceSrc).toMatch(/break-words/);
    });
    it("wires claim/assign via the dark assign route", () => {
        expect(src).toMatch(/data-cc-claim/);
        expect(src).toMatch(/\/assign/);
        expect(src).toMatch(/action:\s*"claim"/);
    });
    it("does not send or embed a BOS panel", () => {
        expect(src).not.toMatch(/executeCommunicationsSend|enqueueCanonicalOutboundMessage|\/communications\/send/);
        expect(src).not.toMatch(/aiCommandSurface\/[A-Za-z]*Panel/);
    });
    it("delegates send/thread/draft lifecycle to the shared runtime (no Command Center fork)", () => {
        // The shell must not own the send lifecycle — only the runtime hook calls family-send.
        expect(shellSrc).not.toMatch(/communications\/family-send/);
        expect(shellSrc).not.toMatch(/orchestrateFamilySend/);
        expect(shellSrc).toMatch(/useFamilyCommunicationRuntime/);
        expect(shellSrc).toMatch(/runtime\.send/);
        expect(runtimeSrc).toMatch(/communications\/family-send/);
        // Shell must not maintain its own thread/draft/recipient lifecycle state.
        expect(shellSrc).not.toMatch(/useState[^;]*bodyDraft/);
        expect(shellSrc).not.toMatch(/useState[^;]*selectedThreadId/);
    });
    it("resolves workspace from customer_id or primary entity and never renders a blank selected state", () => {
        expect(shellSrc).toMatch(/selectedEntity/);
        expect(shellSrc).toMatch(/selectedLoadable/);
        expect(shellSrc).toMatch(/isQueueRowLoadable/);
        expect(shellSrc).toMatch(/resolveQueueWorkspaceError/);
        expect(shellSrc).toMatch(/flattenLoadableConversationIds/);
        expect(shellSrc).toMatch(/conversationDisplayTopic/);
        expect(shellSrc).toMatch(/workspaceLoading/);
        expect(shellSrc).toMatch(/workspaceError/);
        expect(shellSrc).not.toMatch(/This conversation could not be loaded/);
        expect(shellSrc).not.toMatch(/\)\s*:\s*null\}\s*<\/section>/);
    });
    it("applies canonical queue scope resolution and review partitioning in enrichment and API", () => {
        const enrichment = readFileSync(
            join(process.cwd(), "lib", "communications", "v2", "commandCenterConversationEnrichment.ts"),
            "utf8"
        );
        const route = readFileSync(join(process.cwd(), "app", "api", "admin", "communications", "conversations", "route.ts"), "utf8");
        expect(enrichment).toMatch(/resolveCommunicationQueueScope/);
        expect(enrichment).not.toMatch(/"Family"/);
        expect(route).toMatch(/prepareCommandCenterQueue/);
    });
    it("compose new uses canonical runtime composer instead of legacy quick message modal", () => {
        const inbox = readFileSync(join(process.cwd(), "app", "adminV2", "components", "InboxModal.tsx"), "utf8");
        const compose = readFileSync(
            join(process.cwd(), "app", "adminV2", "communications", "ComposeNewCommunicationModal.tsx"),
            "utf8"
        );
        expect(inbox).toContain("ComposeNewCommunicationModal");
        expect(inbox).not.toContain("QuickMessageModal");
        expect(compose).toContain("useFamilyCommunicationRuntime");
        expect(compose).toContain("FamilyCommunicationWorkspaceView");
        expect(compose).toContain("startNewMessage");
        expect(compose).not.toContain("/api/admin/communications/send");
    });
});
