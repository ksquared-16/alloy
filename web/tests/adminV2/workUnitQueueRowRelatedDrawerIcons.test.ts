import { describe, expect, it } from "vitest";

import { extractQueueRowRelatedDrawerTargets } from "@/lib/workspace/viewModels/queueRowRelatedDrawerTargets";

describe("queueRowRelatedDrawerTargets", () => {
    it("extracts primary person and first inquiry child person ids", () => {
        const targets = extractQueueRowRelatedDrawerTargets(
            {
                id: "opp-1",
                primary_person_id: "person-parent",
                metadata: {
                    inquiry_children: [{ person_id: "child-1", display_name: "Sam" }],
                },
            },
            "opp-1"
        );
        expect(targets.personId).toBe("person-parent");
        expect(targets.childPersonId).toBe("child-1");
    });
});

describe("QueueBlock row/icon propagation wiring", () => {
    it("fires distinct actions for row vs person vs child icons with stopPropagation", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
        const queueBlock = readFileSync(
            join(webRoot, "app/adminV2/components/workspace/blocks/QueueBlock.tsx"),
            "utf8"
        );
        expect(queueBlock).toContain('actionId: "open_record"');
        expect(queueBlock).toContain('actionId: "open_person_drawer"');
        expect(queueBlock).toContain('actionId: "open_child_drawer"');
        expect(queueBlock).toContain("e.stopPropagation()");
        expect(queueBlock).toContain('data-queue-row-person-icon="true"');
        expect(queueBlock).toContain('data-queue-row-child-icon="true"');
    });

    it("handles person/child drawer actions on work unit page", async () => {
        const { readFileSync } = await import("node:fs");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
        const page = readFileSync(
            join(
                webRoot,
                "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx"
            ),
            "utf8"
        );
        expect(page).toContain('action.actionId === "open_person_drawer"');
        expect(page).toContain('action.actionId === "open_child_drawer"');
        expect(page).toContain("openWorkUnitQueuePersonDrawer");
        expect(page).toContain("openWorkUnitQueueChildDrawer");
    });
});
