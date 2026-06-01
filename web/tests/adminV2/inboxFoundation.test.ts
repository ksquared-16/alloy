import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Inbox foundation UI contracts", () => {
    it("TopNavBar links to Inbox with badge component", () => {
        const nav = read("app/adminV2/components/TopNavBar.tsx");
        expect(nav).toContain("InboxNavLink");
        expect(nav).not.toContain(">Messages<");
        const link = read("app/adminV2/components/InboxNavLink.tsx");
        expect(link).toContain('href="/adminV2/messages"');
    });

    it("InboxNavLink polls unread-count API", () => {
        const link = read("app/adminV2/components/InboxNavLink.tsx");
        expect(link).toContain("/api/admin/communications/unread-count");
        expect(link).toContain("data-adminv2-inbox-unread-badge");
        expect(link).toContain("Inbox");
        expect(link).toContain("INBOX_UNREAD_REFRESH_EVENT");
        expect(read("lib/adminV2/inboxNavUnreadCache.ts")).toContain("alloy-comms-unread-refresh");
    });

    it("messages page renders InboxClient shell", () => {
        const page = read("app/adminV2/messages/page.tsx");
        expect(page).toContain("InboxClient");
        const client = read("app/adminV2/messages/InboxClient.tsx");
        expect(client).toContain("/api/admin/inbox/threads");
        expect(client).toContain("Archive");
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
        expect(route).toContain('parseInboxFolder');
    });
});
