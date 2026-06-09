import { afterEach, describe, expect, it, vi } from "vitest";
import {
    clearDrawerOperatingEditSectionsForTests,
    drawerOperatingIsDirty,
    drawerOperatingSaveAll,
    registerDrawerOperatingEditSection,
} from "@/lib/admin/drawer/drawerOperatingSaveCoordinator";
import { perfSave } from "@/lib/perf/perfNamespaceLog";

vi.mock("@/lib/perf/perfNamespaceLog", () => ({
    perfSave: vi.fn(),
}));

describe("drawerOperatingSaveCoordinator", () => {
    afterEach(() => {
        clearDrawerOperatingEditSectionsForTests();
        vi.mocked(perfSave).mockClear();
    });

    it("applies optimistic state before parallel section saves", async () => {
        const order: string[] = [];
        registerDrawerOperatingEditSection("person", {
            isDirty: () => true,
            applyOptimistic: () => {
                order.push("person:optimistic");
            },
            save: async () => {
                order.push("person:save");
            },
        });
        registerDrawerOperatingEditSection("contact", {
            isDirty: () => true,
            applyOptimistic: () => {
                order.push("contact:optimistic");
            },
            save: async () => {
                await new Promise((r) => setTimeout(r, 5));
                order.push("contact:save");
            },
        });

        await drawerOperatingSaveAll();

        expect(order.indexOf("person:optimistic")).toBeLessThan(order.indexOf("person:save"));
        expect(order.indexOf("contact:optimistic")).toBeLessThan(order.indexOf("contact:save"));
        expect(order.filter((step) => step.endsWith(":save")).length).toBe(2);
        expect(vi.mocked(perfSave).mock.calls.some(([phase]) => phase === "mutation_confirm")).toBe(true);
    });

    it("rolls back failed sections and keeps successful server confirms", async () => {
        const rolledBack: string[] = [];
        registerDrawerOperatingEditSection("ok_section", {
            isDirty: () => true,
            applyOptimistic: () => undefined,
            save: async () => undefined,
        });
        registerDrawerOperatingEditSection("bad_section", {
            isDirty: () => true,
            applyOptimistic: () => undefined,
            rollbackOptimistic: () => {
                rolledBack.push("bad_section");
            },
            save: async () => {
                throw new Error("network");
            },
        });

        await expect(drawerOperatingSaveAll()).rejects.toThrow("network");
        expect(rolledBack).toEqual(["bad_section"]);
    });

    it("emits perf save phases for optimistic Save All", async () => {
        registerDrawerOperatingEditSection("layout_runtime_person_contact", {
            isDirty: () => true,
            applyOptimistic: () => undefined,
            save: async () => undefined,
        });

        await drawerOperatingSaveAll();

        expect(vi.mocked(perfSave).mock.calls.map(([phase]) => phase)).toEqual(
            expect.arrayContaining([
                "mutation_start",
                "optimistic_applied",
                "section_start",
                "section_confirm",
                "mutation_confirm",
            ]),
        );
    });
});
