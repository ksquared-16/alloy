import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const createTaskCard = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../app/adminV2/components/MyTasksCreateTaskCard.tsx",
);
const panel = join(dirname(fileURLToPath(import.meta.url)), "../../../app/adminV2/components/MyTasksPanel.tsx");

describe("MyTasksCreateTaskCard compatibility", () => {
    it("legacy card remains available for compatibility but is not the commit path", () => {
        const cardSrc = readFileSync(createTaskCard, "utf8");
        expect(cardSrc).toContain("data-adminv2-create-task-form");
        const panelSrc = readFileSync(panel, "utf8");
        expect(panelSrc).not.toContain("MyTasksCreateTaskCard");
        expect(panelSrc).toContain("WorkItemCreateModal");
    });
});
