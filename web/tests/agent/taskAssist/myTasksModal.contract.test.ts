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
const taskCard = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksTaskCard.tsx");
const createTaskCard = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/MyTasksCreateTaskCard.tsx"
);
const sourceLabel = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/agent/taskAssist/formatOperationalTaskSourceLabel.ts"
);
const queueBlock = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/workspace/blocks/QueueBlock.tsx"
);
const adminV2Layout = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/layout.tsx");
const rootAuthProvider = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/AdminV2RootAuthProvider.tsx");
const sidebar = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/Sidebar.tsx");
const sidebarModalItems = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/SidebarModalNavItems.tsx"
);

describe("My tasks modal UX", () => {
    it("shell layout provides AdminAuthProvider for top-nav Tasks modal", () => {
        const layoutSrc = readFileSync(adminV2Layout, "utf8");
        const providerSrc = readFileSync(rootAuthProvider, "utf8");
        expect(layoutSrc).toContain("AdminV2RootAuthProvider");
        expect(layoutSrc).toContain("AdminV2Shell");
        expect(providerSrc).toContain("AdminAuthProvider");
        expect(readFileSync(panel, "utf8")).toContain("useAdminAuth");
    });

    it("opens modal from sidebar button not page navigation", () => {
        expect(readFileSync(sidebarModalItems, "utf8")).toContain('type="button"');
        expect(readFileSync(sidebarModalItems, "utf8")).toContain("dispatchAdminV2OpenTasksPanel");
        expect(readFileSync(sidebar, "utf8")).toContain("SidebarTasksNavItem");
        expect(readFileSync(topNav, "utf8")).toContain("MyTasksModal");
        expect(readFileSync(topNav, "utf8")).toContain("setTasksModalOpen");
        expect(readFileSync(navBadge, "utf8")).toContain("<button");
        expect(readFileSync(navBadge, "utf8")).not.toContain('href="/adminV2/tasks"');
    });

    it("modal uses BOS-rail workspace shell like entity drawers", () => {
        const src = readFileSync(modal, "utf8");
        const shell = readFileSync(
            join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/AdminV2WorkspaceBosModalShell.tsx"),
            "utf8"
        );
        expect(src).toContain("AdminV2WorkspaceBosModalShell");
        expect(src).toContain("MyTasksPanel");
        expect(src).toContain('data-adminv2-tasks-modal="true"');
        expect(src).toContain("fetchOperationalTasksSummary");
        expect(src).toContain('data-adminv2-tasks-summary="true"');
        expect(shell).toContain("adminv2-drawer-modal-panel--bos-rail");
        expect(shell).toContain("measureAndApplyDrawerWorkspaceGeometry");
    });

    it("task cards use friendly source labels not raw task_assist", () => {
        const cardSrc = readFileSync(taskCard, "utf8");
        expect(cardSrc).toContain("formatOperationalTaskSourceLabel");
        expect(cardSrc).not.toContain("{t.source}");
        expect(cardSrc).not.toContain("{task.source}");
        expect(cardSrc).toContain('data-adminv2-task-source-label="true"');
        expect(cardSrc).toContain('data-adminv2-task-reschedule="true"');
        expect(cardSrc).toContain('data-adminv2-task-context="true"');
        expect(cardSrc).toContain("buildMyTasksRecordContextLines");
        expect(cardSrc).toContain("normalizeOperationalTaskTitleDisplay");
        expect(cardSrc).toContain('data-adminv2-task-children="true"');
        expect(cardSrc).not.toContain("Related to ·");
        expect(cardSrc).not.toContain("Contact ·");
        expect(readFileSync(sourceLabel, "utf8")).not.toMatch(/return\s+['"]task_assist['"]/);
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
        expect(readFileSync(panel, "utf8")).toContain("MyTasksTaskCard");
        expect(readFileSync(panel, "utf8")).toContain("MyTasksCreateTaskCard");
        expect(readFileSync(panel, "utf8")).toContain("myTasksRowMatchesSearch");
        expect(readFileSync(panel, "utf8")).toContain('data-adminv2-tasks-search="true');
        expect(readFileSync(createTaskCard, "utf8")).toContain("What is the task?");
        expect(readFileSync(createTaskCard, "utf8")).toContain('data-adminv2-create-task-mode="general"');
        expect(readFileSync(createTaskCard, "utf8")).not.toContain("Open a lead first");
        expect(readFileSync(panel, "utf8")).toContain("useEntityLabelsOptional");
        expect(readFileSync(panel, "utf8")).not.toMatch(/Related to ·/);
        expect(readFileSync(panel, "utf8")).not.toContain("inquiries appear here");
    });

    it("work-unit QueueBlock still dispatches open_record on row click", () => {
        const src = readFileSync(queueBlock, "utf8");
        expect(src).toContain('actionId: "open_record"');
    });
});
