import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
    buildOperationalSubjectRowsFromPreview,
    findOperationalSubjectRowByEntityId,
    resolveDefaultOperationalSubject,
    resolveDefaultOperationalSubjectStrategyForWorkUnit,
    resolveDefaultOperationalSubjectWithFallbackChain,
} from "@/lib/adminV2/runtime/operationalSubject/resolveDefaultOperationalSubject";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

function row(
    partial: Partial<{
        id: string;
        entityId: string;
        sortIndex: number;
        priorityScore: number | null;
        dueAtIso: string | null;
        assignedToUserId: string | null;
        needsOperationalAttention: boolean;
    }>,
) {
    return {
        id: partial.id ?? "row-1",
        entityId: partial.entityId ?? partial.id ?? "row-1",
        entityType: "opportunity" as const,
        sortIndex: partial.sortIndex ?? 0,
        priorityScore: partial.priorityScore ?? null,
        dueAtIso: partial.dueAtIso ?? null,
        assignedToUserId: partial.assignedToUserId ?? null,
        needsOperationalAttention: partial.needsOperationalAttention ?? false,
    };
}

describe("resolveDefaultOperationalSubject", () => {
    it("selects highest priority when strategy is highest_priority", () => {
        const rows = [
            row({ id: "a", entityId: "a", sortIndex: 0, priorityScore: 10 }),
            row({ id: "b", entityId: "b", sortIndex: 1, priorityScore: 90 }),
        ];
        expect(resolveDefaultOperationalSubject(rows, "highest_priority")?.entityId).toBe("b");
    });

    it("falls back to earliest due when strategy is earliest_due", () => {
        const rows = [
            row({ id: "a", entityId: "a", sortIndex: 0, dueAtIso: "2026-06-10T00:00:00.000Z" }),
            row({ id: "b", entityId: "b", sortIndex: 1, dueAtIso: "2026-06-01T00:00:00.000Z" }),
        ];
        expect(resolveDefaultOperationalSubject(rows, "earliest_due")?.entityId).toBe("b");
    });

    it("falls back to first row when earliest due is unavailable", () => {
        const rows = [
            row({ id: "a", entityId: "a", sortIndex: 0 }),
            row({ id: "b", entityId: "b", sortIndex: 1 }),
        ];
        expect(resolveDefaultOperationalSubject(rows, "earliest_due")?.entityId).toBe("a");
    });

    it("uses fallback chain for highest_sort_order — priority then due then order", () => {
        const rows = [
            row({ id: "first", entityId: "first", sortIndex: 0, priorityScore: 0 }),
            row({ id: "prio", entityId: "prio", sortIndex: 2, priorityScore: 55 }),
            row({ id: "due", entityId: "due", sortIndex: 1, dueAtIso: "2026-06-01T00:00:00.000Z" }),
        ];
        expect(resolveDefaultOperationalSubjectWithFallbackChain(rows)?.entityId).toBe("prio");
    });

    it("falls back to queue order when no priority or due metadata", () => {
        const rows = [
            row({ id: "first", entityId: "first", sortIndex: 0 }),
            row({ id: "second", entityId: "second", sortIndex: 1 }),
        ];
        expect(resolveDefaultOperationalSubject(rows, "highest_sort_order")?.entityId).toBe("first");
    });

    it("first_row strategy selects first visible row", () => {
        const rows = [
            row({ id: "first", entityId: "first", sortIndex: 0 }),
            row({ id: "second", entityId: "second", sortIndex: 1, priorityScore: 99 }),
        ];
        expect(resolveDefaultOperationalSubject(rows, "first_row")?.entityId).toBe("first");
    });

    it("assigned_to_me prefers current operator when available", () => {
        const rows = [
            row({ id: "a", entityId: "a", sortIndex: 0, assignedToUserId: "other" }),
            row({ id: "b", entityId: "b", sortIndex: 1, assignedToUserId: "user-1" }),
        ];
        expect(
            resolveDefaultOperationalSubject(rows, "assigned_to_me", { currentUserId: "user-1" })?.entityId,
        ).toBe("b");
    });

    it("returns null for empty queue", () => {
        expect(resolveDefaultOperationalSubject([], "first_row")).toBeNull();
    });

    it("maps preview items with raw attention priority metadata", () => {
        const mapped = buildOperationalSubjectRowsFromPreview(
            [{ id: "list-1", opportunityId: "opp-1" }],
            [{ id: "list-1", _attention_priority_score: 77, opportunity_id: "opp-1" }],
        );
        expect(mapped[0]?.priorityScore).toBe(77);
        expect(mapped[0]?.entityId).toBe("opp-1");
    });

    it("finds row by entity id for URL-respect checks", () => {
        const rows = buildOperationalSubjectRowsFromPreview([{ id: "list-1", opportunityId: "opp-9" }], [
            { id: "list-1", opportunity_id: "opp-9" },
        ]);
        expect(findOperationalSubjectRowByEntityId(rows, "opp-9")?.entityId).toBe("opp-9");
    });

    it("defaults enrollment work units to highest_sort_order strategy", () => {
        expect(resolveDefaultOperationalSubjectStrategyForWorkUnit("enrollment_pipeline")).toBe(
            "highest_sort_order",
        );
    });
});

describe("Operational Mode default runtime integration guards", () => {
    it("work unit page wires default operational subject auto-open when runtime flag enabled", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain("useWorkUnitDefaultOperationalSubjectAutoOpen");
        expect(page).toContain("DEFAULT_OPERATIONAL_SUBJECT_OPEN_SOURCE");
        expect(page).toContain("markManualOperationalSubjectSelection");
        expect(page).toContain("queueRawRowsBufferRef");
    });

    it("manual queue open marks manual operational subject selection", () => {
        const page = readSrc(
            "app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx",
        );
        expect(page).toContain('source !== DEFAULT_OPERATIONAL_SUBJECT_OPEN_SOURCE');
        expect(page).toContain("markManualOperationalSubjectSelection()");
    });

    it("auto-open respects URL route record id", () => {
        const hook = readSrc(
            "lib/adminV2/runtime/operationalSubject/useWorkUnitDefaultOperationalSubjectAutoOpen.ts",
        );
        expect(hook).toContain("routeRecordId");
        expect(hook).toContain("if (urlRecordId) return");
    });

    it("split activates when drawer opens on work unit surface (operational state)", () => {
        const flag = readSrc("lib/adminV2/runtime/alloyOsRuntimeFlag.ts");
        expect(flag).toContain("alloyOsRuntimeSplitActive");
        expect(flag).toContain("drawerOpen");
    });

    it("compressed queue renders when split is active", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toContain("splitActive && crm");
        expect(queue).toContain("CompressedQueueRow");
    });

    it("BOS rail remains wired in admin shell", () => {
        const shell = readSrc("app/adminV2/components/AdminV2ShellDrawerScope.tsx");
        expect(shell).toContain("AlloyOsRuntimeSplitController");
        expect(readSrc("contexts/GlobalAssistantContext.tsx")).toContain("GlobalAssistant");
    });

    it("does not remove expanded queue implementation (dormant infrastructure)", () => {
        const queue = readSrc("app/adminV2/components/workspace/blocks/QueueBlock.tsx");
        expect(queue).toContain("OperationalQueueRecordRow");
    });
});
