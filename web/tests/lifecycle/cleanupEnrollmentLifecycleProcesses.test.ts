import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "crypto";
import {
    isStrayEnrollmentProcessName,
    planClearAllEnrollmentLifecycleProcesses,
    planEnrollmentLifecycleProcessCleanup,
    summarizeEnrollmentLifecycleBuilder,
} from "@/lib/lifecycle/cleanupEnrollmentLifecycleProcesses";
import { emptyLifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { LifecycleBuilderV1 } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { ENROLLMENT_PROCESS_KEY } from "@/lib/lifecycle/lifecycleProcessTypes";

const root = resolve(__dirname, "../..");

function read(rel: string): string {
    return readFileSync(resolve(root, rel), "utf8");
}

function stage(key: string, label: string) {
    return { id: randomUUID(), key, label, sort_order: 0, is_active: true };
}

function enrollmentProcess(name: string, key: string, stages = [stage("lead", "Lead")]) {
    return {
        id: randomUUID(),
        key,
        name,
        primary_entity: "opportunity" as const,
        sort_order: 0,
        is_active: true,
        stages,
    };
}

describe("cleanupEnrollmentLifecycleProcesses", () => {
    it("flags stray process names", () => {
        expect(isStrayEnrollmentProcessName("Enrollment(s)")).toBe(true);
        expect(isStrayEnrollmentProcessName("Lead Management")).toBe(true);
        expect(isStrayEnrollmentProcessName("Enrollment")).toBe(false);
    });

    it("dry-run plan lists duplicate Enrollment(s) and Lead Management for removal", () => {
        const canonical = enrollmentProcess("Enrollment", ENROLLMENT_PROCESS_KEY, [
            stage("lead", "Lead"),
            stage("qualification", "Qualification"),
        ]);
        const dup1 = enrollmentProcess("Enrollment(s)", "enrollment_s_1");
        const dup2 = enrollmentProcess("Enrollment(s)", "enrollment_s_2");
        const leadMgmt = enrollmentProcess("Lead Management", "lead_management");

        const config: LifecycleBuilderV1 = {
            version: 1,
            active_process_id: canonical.id,
            processes: [canonical, dup1, dup2, leadMgmt],
        };

        const plan = planEnrollmentLifecycleProcessCleanup("dept-enrollment", config);
        expect(plan).not.toBeNull();
        expect(plan!.keep.id).toBe(canonical.id);
        expect(plan!.remove.map((p) => p.name).sort()).toEqual(["Enrollment(s)", "Enrollment(s)", "Lead Management"]);
        expect(plan!.after).toHaveLength(1);
        expect(plan!.after[0]!.name).toBe("Enrollment");
    });

    it("keeps canonical Enrollment when duplicate Enrollment-named processes exist", () => {
        const canonical = enrollmentProcess("Enrollment", ENROLLMENT_PROCESS_KEY);
        const extra = enrollmentProcess("Enrollment", "enrollment_copy");
        const config: LifecycleBuilderV1 = {
            version: 1,
            active_process_id: canonical.id,
            processes: [canonical, extra],
        };
        const plan = planEnrollmentLifecycleProcessCleanup("dept-1", config);
        expect(plan!.keep.id).toBe(canonical.id);
        expect(plan!.remove).toHaveLength(1);
        expect(plan!.remove[0]!.name).toBe("Enrollment");
    });

    it("returns null when only canonical process remains", () => {
        const canonical = enrollmentProcess("Enrollment", ENROLLMENT_PROCESS_KEY);
        const config: LifecycleBuilderV1 = {
            version: 1,
            active_process_id: canonical.id,
            processes: [canonical],
        };
        expect(planEnrollmentLifecycleProcessCleanup("dept-1", config)).toBeNull();
    });

    it("clear-all plan empties processes and active_process_id", () => {
        const canonical = enrollmentProcess("Enrollment", ENROLLMENT_PROCESS_KEY);
        const config = {
            version: 1 as const,
            active_process_id: canonical.id,
            processes: [canonical],
        };
        const plan = planClearAllEnrollmentLifecycleProcesses("dept-enrollment", config);
        expect(plan).not.toBeNull();
        expect(plan!.mode).toBe("clear_all");
        expect(plan!.before.process_count).toBe(1);
        expect(plan!.after.process_count).toBe(0);
        expect(plan!.after.active_process_id).toBeNull();
        expect(plan!.next_config).toEqual(emptyLifecycleBuilderV1());
    });

    it("clear-all returns null when lifecycle_builder_v1 already empty", () => {
        expect(planClearAllEnrollmentLifecycleProcesses("dept-1", emptyLifecycleBuilderV1())).toBeNull();
        expect(summarizeEnrollmentLifecycleBuilder(emptyLifecycleBuilderV1()).process_count).toBe(0);
    });

    it("cleanup script supports dry run, confirm, and clear-all env", () => {
        const script = read("scripts/cleanupEnrollmentLifecycleProcesses.ts");
        expect(script).toContain("CONFIRM_ENROLLMENT_LIFECYCLE_PROCESS_CLEANUP=1");
        expect(script).toContain("CLEAR_ALL_ENROLLMENT_LIFECYCLES=1");
        expect(script).toContain("DRY RUN");
        expect(script).toContain("lifecycle_builder_v1 BEFORE");
        expect(script).toContain("lifecycle_builder_v1 AFTER");
    });
});

describe("Lifecycle Builder UI — enrollment cleanup pass", () => {
    it("primary UI has no visible legacy wording", () => {
        const page = read("app/adminV2/settings/lifecycle/page.tsx");
        const shell = read("components/adminV2/settings/LifecycleSettingsShell.tsx");
        const select = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        for (const src of [page, shell, select, board]) {
            expect(src).not.toMatch(/Advanced legacy/i);
            expect(src).not.toMatch(/legacy editor/i);
            expect(src).not.toMatch(/legacy setup/i);
        }
        expect(shell).toContain("Advanced configuration");
    });

    it("protected Enrollment gates delete via canDeleteLifecycle", () => {
        const board = read("components/adminV2/settings/lifecycle/LifecycleActivationBoard.tsx");
        expect(board).toContain("lifecycle-board-more-menu");
        expect(board).toContain("canDeleteLifecycle");
        expect(board).toContain('data-testid="lifecycle-activation-delete"');
        expect(read("lib/lifecycle/lifecycleCatalog.ts")).toContain("isProtectedSharedLifecycleDepartment");
    });

    it("lifecycle selector shows empty state when catalog has no items", () => {
        const select = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        expect(select).toContain("lifecycle-catalog-empty");
        expect(select).toContain("BUSINESS_PROCESS_CATALOG_EMPTY");
    });

    it("lifecycle selector uses process cards not horizontal lifecycle tabs", () => {
        const primary = read("components/adminV2/settings/lifecycle/LifecycleBuilderPrimary.tsx");
        const cards = read("components/adminV2/settings/lifecycle/LifecycleProcessCatalogCards.tsx");
        expect(primary).toContain("LifecycleProcessCatalogCards");
        expect(primary).not.toContain("LifecycleCatalogRail");
        expect(cards).toContain("lifecycle-process-catalog");
        expect(cards).not.toContain("lifecycle-catalog-rail");
    });
});
