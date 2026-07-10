import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const createModal = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/workItems/WorkItemCreateModal.tsx",
);
const panel = join(dirname(fileURLToPath(import.meta.url)), "../../app/adminV2/components/MyTasksPanel.tsx");
const preview = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/workItems/WorkItemCreatePreviewPanel.tsx",
);

describe("Work Item creation runtime UI contract", () => {
    it("WorkItemCreateModal uses conversation + live preview", () => {
        const src = readFileSync(createModal, "utf8");
        expect(src).toContain("data-work-item-create-conversation");
        expect(src).toContain("WorkItemCreatePreviewPanel");
        expect(src).toContain("data-work-item-create-composer");
        expect(src).toContain("data-work-item-create-enabled");
        expect(src).not.toContain("What is the task?");
    });

    it("preview panel is read-only representation", () => {
        const src = readFileSync(preview, "utf8");
        expect(src).toContain("data-work-item-create-preview");
        expect(src).toContain("BOS summary");
        expect(src).not.toContain("onChange");
    });

    it("MyTasksPanel commits through canonical draft adapter", () => {
        const src = readFileSync(panel, "utf8");
        expect(src).toContain("draftToOperationalTaskBody");
        expect(src).toContain("WorkItemCreateModal");
        expect(src).not.toContain("MyTasksCreateTaskCard");
        expect(src).not.toContain("buildOperationalTaskBody");
    });
});
