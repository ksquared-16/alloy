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
    });
});
