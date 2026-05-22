import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const topNav = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/TopNavBar.tsx");
const navBadge = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/OperationalTasksNavBadge.tsx"
);
const modal = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksModal.tsx");
const panel = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksPanel.tsx");
const queueBlock = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/workspace/blocks/QueueBlock.tsx"
);

describe("My tasks modal UX", () => {
    it("opens modal from top nav button not page navigation", () => {
        expect(readFileSync(navBadge, "utf8")).toContain("<button");
        expect(readFileSync(navBadge, "utf8")).not.toContain('href="/adminV2/tasks"');
        expect(readFileSync(topNav, "utf8")).toContain("MyTasksModal");
        expect(readFileSync(topNav, "utf8")).toContain("setTasksModalOpen");
    });

    it("modal uses overlay pattern like quick message", () => {
        const src = readFileSync(modal, "utf8");
        expect(src).toContain("fixed inset-0");
        expect(src).toContain("MyTasksPanel");
        expect(src).toContain('data-adminv2-tasks-modal="true"');
        expect(src).toContain("if (!open) return null");
    });

    it("MyTasksPanel uses optional drawer context for top-nav modal and fallback page", () => {
        const src = readFileSync(panel, "utf8");
        expect(src).toContain("useAdminDrawerOptional");
        expect(src).not.toContain("useAdminDrawer()");
        expect(src).not.toContain("fetchCommunicationScheduledSends");
        expect(src).not.toContain("scheduledSends");
        expect(src).toContain("Array.isArray(json.tasks) ? json.tasks : []");
        expect(src).toContain("getCachedWorkspaceOperationalTasks");
        expect(readFileSync(topNav, "utf8")).toContain("prefetchWorkspaceOperationalTasks");
        expect(readFileSync(panel, "utf8")).toContain("data-adminv2-new-task");
        expect(readFileSync(panel, "utf8")).toContain("createOperationalTask");
    });

    it("work-unit QueueBlock still dispatches open_record on row click", () => {
        const src = readFileSync(queueBlock, "utf8");
        expect(src).toContain('actionId: "open_record"');
    });
});
