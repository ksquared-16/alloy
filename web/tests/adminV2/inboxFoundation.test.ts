import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Inbox foundation UI contracts", () => {
    it("sidebar Inbox opens modal without navigation", () => {
        const sidebar = read("app/adminV2/components/Sidebar.tsx");
        const items = read("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(sidebar).toContain("SidebarInboxNavItem");
        expect(items).toContain("dispatchAdminV2OpenInboxModal");
        expect(items).toContain('type="button"');
        expect(items).not.toContain('href="/admin/messages"');

        const nav = read("app/adminV2/components/TopNavBar.tsx");
        expect(nav).toContain("InboxModal");
        expect(nav).toContain("subscribeAdminV2WorkspaceModal");
        expect(nav).toContain("openWorkspaceModal(\"inbox\")");
        expect(nav).toContain("adminv2:open-inbox-modal");
    });

    it("sidebar Inbox polls unread-count API and renders badge", () => {
        const items = read("app/adminV2/components/SidebarModalNavItems.tsx");
        expect(read("lib/adminV2/useInboxUnreadNavCount.ts")).toContain("/api/admin/communications/unread-count");
        expect(items).toContain("data-adminv2-inbox-unread-badge");
        expect(items).toContain("Inbox");
        expect(read("lib/adminV2/inboxNavUnreadCache.ts")).toContain("alloy-comms-unread-refresh");
    });

    it("InboxModal uses BOS-rail workspace shell like entity drawers", () => {
        const modal = read("app/adminV2/components/InboxModal.tsx");
        const shell = read("app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx");
        expect(modal).toContain("AdminV2WorkspaceBosModalShell");
        expect(modal).toContain('data-adminv2-inbox-modal="true"');
        expect(modal).toContain("InboxPanel");
        expect(modal).not.toContain("useRouter");
        expect(modal).not.toContain("Open full inbox");
        expect(shell).toContain("adminv2-drawer-modal-panel--bos-rail");
        expect(shell).toContain("useOperationalWorkspaceGeometry");
        expect(shell).toContain("OPERATIONAL_WORKSPACE_SURFACE_CLASS");
        expect(shell).toContain('data-adminv2-drawer="true"');
    });

    it("header Inbox modal does not promote full inbox route", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).not.toContain("Open full inbox");
        expect(panel).not.toContain('href="/adminV2/messages"');
    });

    it("selected thread can open record drawer when entity resolves", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).toContain("resolveInboxEntityDrawerTarget");
        expect(panel).toContain("useAdminDrawerOptional");
        expect(panel).toContain("Open record");
        expect(panel).toContain("adminDrawer.openDrawer");
        expect(read("lib/communications/inboxEntityDrawerTarget.ts")).toContain("opportunities");
        expect(read("lib/communications/inboxEntityDrawerTarget.ts")).toContain("persons");
    });

    it("header modal uses compact inbox fetch", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).toContain("compact=1");
        expect(panel).toContain("MODAL_THREAD_LIMIT");
        expect(panel).toContain("inboxFoldersToPrefetch");
        expect(panel).toContain("folderCache");
    });

    it("prefetches folders and keeps side-by-side detail panel with thread history", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).toContain("mergeFolderCacheEntry");
        expect(panel).toContain("InboxThreadReplyBox");
        expect(panel).toContain("InboxThreadMessageHistory");
        expect(panel).toContain("context_display");
        expect(panel).toContain("preview_lead");
        expect(read("lib/communications/inboxFolderCache.ts")).toContain("inboxFoldersToPrefetch");
    });

    it("reply box uses shared composer frame and send API", () => {
        const reply = read("components/adminV2/messaging/InboxThreadReplyBox.tsx");
        expect(reply).toContain("MessagingComposerFrame");
        expect(reply).toContain("/api/admin/communications/send");
        expect(reply).toContain("data-adminv2-inbox-reply");
        expect(read("components/adminV2/messaging/ComposerChannelToggle.tsx")).toContain("(unavailable)");
        expect(read("components/adminV2/messaging/ComposerReplyActionCluster.tsx")).toContain("Send now");
        expect(read("components/adminV2/messaging/ComposerReplyActionCluster.tsx")).toContain("Send later");
        expect(read("components/adminV2/messaging/ComposerReplyActionCluster.tsx")).toContain('label="BOS"');
    });

    it("inbox panel avoids Family inquiry boilerplate and dark message bubbles", () => {
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).not.toContain("entity_chip.label");
        expect(panel).not.toContain("Family inquiry");
        expect(panel).not.toContain("bg-alloy-midnight/[0.9]");
        expect(read("lib/adminV2/messaging/messagingMessageBubbleClasses.ts")).toContain("#E8F6F2");
        expect(panel).toContain("Compose New");
        expect(panel).toContain("w-[min(18rem,52%)]");
        expect(panel).toContain("related_children_display");
        expect(panel).toContain("formatMessagingThreadMetadataLine");
    });

    it("AdminV2 shell schedules inbox warm load", () => {
        const shell = read("app/adminV2/components/AdminV2Shell.tsx");
        expect(shell).toContain("scheduleInboxWarmLoad");
        expect(read("lib/adminV2/inboxWarmLoadCache.ts")).toContain("warmInboxFolderCache");
    });

    it("full /adminV2/messages route still loads InboxClient", () => {
        const page = read("app/adminV2/messages/page.tsx");
        expect(page).toContain("InboxClient");
        const client = read("app/adminV2/messages/InboxClient.tsx");
        expect(client).toContain("InboxPanel");
        expect(client).toContain('layout="page"');
        const panel = read("app/adminV2/messages/InboxPanel.tsx");
        expect(panel).toContain("/api/admin/inbox/threads");
        expect(panel).toContain("Archive");
    });
});

describe("Drawer communications API unchanged", () => {
    it("entity threads route still requires entity_type and entity_id", () => {
        const route = read("app/api/admin/communications/threads/route.ts");
        expect(route).toContain("entity_type and valid entity_id");
        expect(route).toContain("attachLastPreviews");
        expect(route).toContain("fetchRelatedPersonIdsForCommunicationsDrawer");
    });

    it("inbox threads route is separate org-wide API", () => {
        const route = read("app/api/admin/inbox/threads/route.ts");
        expect(route).toContain("listInboxThreads");
        expect(route).toContain("parseInboxFolder");
    });
});
