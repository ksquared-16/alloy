import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const popover = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../../components/admin/opportunity/OperationalTaskDetailPopover.tsx"
);

describe("OperationalTaskDetailPopover", () => {
    it("renders urgency badges and edit task flow", () => {
        const src = readFileSync(popover, "utf8");
        expect(src).toContain("operationalTaskUrgencyBadge");
        expect(src).toContain("Edit task");
        expect(src).toContain("patchOperationalTaskFields");
        expect(src).toContain('data-operational-task-edit="true"');
        expect(src).toContain("formatOperationalTaskSourceLabel");
        expect(src).not.toContain("{task.source}");
        expect(src).toContain('data-operational-task-source-label="true"');
    });
});
