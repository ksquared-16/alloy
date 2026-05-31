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
const sourceLabel = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../lib/agent/taskAssist/formatOperationalTaskSourceLabel.ts"
);
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
        expect(src).toContain("max-w-3xl");
        expect(src).toContain("max-w-[56rem]");
        expect(src).toContain("fetchOperationalTasksSummary");
        expect(src).toContain('data-adminv2-tasks-summary="true"');
    });

    it("task cards use friendly source labels not raw task_assist", () => {
        const cardSrc = readFileSync(taskCard, "utf8");
        expect(cardSrc).toContain("formatOperationalTaskSourceLabel");
        expect(cardSrc).not.toContain("{t.source}");
        expect(cardSrc).not.toContain("{task.source}");
        expect(cardSrc).toContain('data-adminv2-task-source-label="true"');
        expect(cardSrc).toContain('data-adminv2-task-reschedule="true"');
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
        expect(readFileSync(panel, "utf8")).toContain("saveReschedule");
        expect(readFileSync(panel, "utf8")).toContain('data-adminv2-tasks-loading="true"');
        expect(readFileSync(panel, "utf8")).toContain('data-adminv2-tasks-empty="true"');
    });

    it("work-unit QueueBlock still dispatches open_record on row click", () => {
        const src = readFileSync(queueBlock, "utf8");
        expect(src).toContain('actionId: "open_record"');
    });
});
