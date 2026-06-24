import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

describe("work unit queue row actions hydration", () => {
    it("hydrates row actions before deferred supplement idle window", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("hydrateWorkUnitQueueRowActions");
        expect(page).toContain("queueRowActionsHydratedRef");
        expect(page).toMatch(/useEffect\([\s\S]{0,400}hydrateWorkUnitQueueRowActions/);
    });

    it("re-hydrates row actions on lifecycle pill switch", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("queueRowActionsHydratedRef.current = false");
        expect(page).toContain("void hydrateWorkUnitQueueRowActions()");
    });

    it("does not rely on deferred supplement alone for initial row actions", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("if (!queueRowActionsHydratedRef.current)");
    });

    it("reserves row action slots while registry actions hydrate", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("rowActionsPending");
        expect(page).toContain("queueRowActionsReady");
        const queueBlock = read("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queueBlock).toContain("data-queue-row-actions-pending");
    });

    it("awaits row action hydration before first queue row paint", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toMatch(
            /!options\?\.prefetchOnly[\s\S]{0,200}await hydrateWorkUnitQueueRowActions/
        );
        expect(page).toMatch(
            /Array\.isArray\(pl\.items\)[\s\S]{0,200}earlyActionsHydrationPRef|await hydrateWorkUnitQueueRowActions/
        );
        expect(page).toContain("earlyActionsHydrationPRef");
    });

    it("suppresses row action skeletons while lifecycle lane retains prior rows", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("rowsHeld:");
        expect(page).toContain("rowActionsPending");
    });
});
