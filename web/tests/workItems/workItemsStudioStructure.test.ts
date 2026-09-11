import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
    WORK_ITEMS_MODES,
    WORK_ITEMS_STUDIO_TABS,
    WORK_ITEMS_WORK_TABS,
    defaultWorkItemsView,
    isWorkItemsWorkView,
    modeForWorkItemsView,
    workItemsTabsForMode,
} from "@/app/adminV2/tasks/workItemsSections";
import { isValidWorkItemsPosition, WORK_ITEMS_DEFAULT_POSITION } from "@/app/adminV2/tasks/workItemsResume";

const here = dirname(fileURLToPath(import.meta.url));
const studio = join(here, "../../app/adminV2/tasks/WorkItemsRecurringStudio.tsx");

describe("Work Items adopts the canonical Work | Studio structure", () => {
    it("exposes both modes in the doctrine order", () => {
        expect(WORK_ITEMS_MODES.map((m) => m.key)).toEqual(["work", "studio"]);
    });

    it("keeps Overview and Queue in Work, and Recurring Work in Studio", () => {
        expect(WORK_ITEMS_WORK_TABS.map((t) => t.key)).toEqual(["overview", "queue"]);
        expect(WORK_ITEMS_STUDIO_TABS.map((t) => t.key)).toEqual(["recurring"]);
        expect(workItemsTabsForMode("studio")).toBe(WORK_ITEMS_STUDIO_TABS);
    });

    it("each mode lands on its own default section", () => {
        expect(defaultWorkItemsView("work")).toBe("overview");
        expect(defaultWorkItemsView("studio")).toBe("recurring");
        expect(modeForWorkItemsView("queue")).toBe("work");
        expect(modeForWorkItemsView("recurring")).toBe("studio");
        expect(isWorkItemsWorkView("recurring")).toBe(false);
    });

    it("Studio is a resumable position, like every other stable lane", () => {
        expect(isValidWorkItemsPosition({ ...WORK_ITEMS_DEFAULT_POSITION, workView: "recurring" })).toBe(true);
        expect(isValidWorkItemsPosition({ ...WORK_ITEMS_DEFAULT_POSITION, workView: "nonsense" })).toBe(false);
    });

    /**
     * Regression: the default position was itself invalid because scopeSource "all" is a real
     * WorkItemSourceKey but is absent from WORK_ITEM_SOURCE_DEFS (the rail's selectable list). Every
     * saved position failed the gate and resume silently fell back to the default.
     */
    it("the default position validates", () => {
        expect(isValidWorkItemsPosition(WORK_ITEMS_DEFAULT_POSITION)).toBe(true);
    });
});

describe("Recurring Work does not overclaim", () => {
    /**
     * The generation runtime is not built. A surface that rendered an empty definition table would
     * imply a saved definition produces work, and the operator cost of that is missed work.
     */
    it("states plainly that it is not yet generating work", () => {
        const src = readFileSync(studio, "utf8");
        expect(src).toContain('data-work-items-recurring-status="specified"');
        expect(src).toContain("Not yet generating work");
    });

    it("offers no create/save affordance while generation is absent", () => {
        const src = readFileSync(studio, "utf8");
        expect(src).not.toMatch(/onSubmit|onSave|Create definition|New definition/);
    });
});
