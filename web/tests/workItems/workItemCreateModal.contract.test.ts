import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const createModal = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/workItems/WorkItemCreateModal.tsx",
);
const panel = join(dirname(fileURLToPath(import.meta.url)), "../../app/adminV2/components/MyTasksPanel.tsx");
const detail = join(
    dirname(fileURLToPath(import.meta.url)),
    "../../components/workItems/WorkItemDetailPanel.tsx",
);

describe("Create Work Item is a centered dialog", () => {
    it("renders as an overlay dialog, not an inline pane", () => {
        const src = readFileSync(createModal, "utf8");
        expect(src).toContain("data-work-item-create-overlay");
        expect(src).toContain('role="dialog"');
        expect(src).toContain('aria-modal="true"');
        // Centered card inside the overlay, capped so it always fits the viewport.
        expect(src).toContain("items-center justify-center");
        expect(src).toContain("max-h-full");
        expect(src).toContain("data-work-item-create-enabled");
    });

    it("offers only fields the commit adapter actually persists", () => {
        const src = readFileSync(createModal, "utf8");
        for (const field of ["title", "entity", "assigned_to_user_id", "due_at", "description"]) {
            expect(src).toContain(`data-work-item-create-field="${field}"`);
        }
        // Draft-only fields are never persisted by draftToOperationalTaskBody; offering them would
        // promise the operator state the platform silently drops.
        expect(src).not.toContain('data-work-item-create-field="priority"');
        expect(src).not.toContain('data-work-item-create-field="checklist_items"');
        expect(src).not.toContain('data-work-item-create-field="recurrence"');
    });

    it("links a record by canonical identity, never a display string", () => {
        const src = readFileSync(createModal, "utf8");
        expect(src).toContain("candidate.entity_id");
        expect(src).toContain('type: "opportunities"');
    });

    it("creation does not replace the selected work item's detail", () => {
        const detailSrc = readFileSync(detail, "utf8");
        expect(detailSrc).not.toContain("WorkItemCreateModal");
        expect(detailSrc).not.toContain("createOpen");

        // The overlay is owned by the workspace, which must be its positioning context.
        const panelSrc = readFileSync(panel, "utf8");
        expect(panelSrc).toContain("WorkItemCreateModal");
        expect(panelSrc).toMatch(/className="relative flex min-h-0 flex-1 overflow-hidden bg-white"/);
    });

    it("MyTasksPanel commits through the canonical draft adapter", () => {
        const src = readFileSync(panel, "utf8");
        expect(src).toContain("draftToOperationalTaskBody");
        expect(src).not.toContain("MyTasksCreateTaskCard");
        expect(src).not.toContain("buildOperationalTaskBody");
    });
});
