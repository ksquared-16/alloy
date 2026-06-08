import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const createTaskCard = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/MyTasksCreateTaskCard.tsx"
);
const panel = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksPanel.tsx");

describe("MyTasksCreateTaskCard", () => {
    it("renders structured create form for general and linked tasks", () => {
        const src = readFileSync(createTaskCard, "utf8");
        expect(src).toContain("What is the task?");
        expect(src).toContain('data-adminv2-create-task-mode="general"');
        expect(src).toContain('data-adminv2-create-task-mode="linked"');
        expect(src).toContain("fetchTaskAssistEntitySearch");
        expect(src).not.toContain("Open a lead first");
        expect(src).not.toContain('data-adminv2-create-task-gated="true"');
        expect(src).toContain('data-adminv2-create-task-record-search="true"');
    });

    it("MyTasksPanel supports general create and context prefill", () => {
        const src = readFileSync(panel, "utf8");
        expect(src).toContain("createLinkMode");
        expect(src).toContain("contextPrefill");
        expect(src).toContain("buildOperationalTaskBody");
        expect(src).not.toContain("linkedOpportunityId || !newTitle");
    });
});
