/**
 * @vitest-environment jsdom
 */
/**
 * LAW 22 — an operational workspace reopens to its LAST STABLE INTERNAL POSITION, and transient
 * interaction state is never restored.
 *
 * The exclusion of transient state is STRUCTURAL: a stable position is a flat `Record<string,
 * string>` of declared navigation keys, so an open editor, a confirmation dialog, a popover, a
 * half-completed form or a selected record has no representation in it. These guards freeze that,
 * freeze the "hint, never authority" fallback, and freeze the fact that the three workspaces share
 * ONE owner rather than three parallel resume stores.
 */
import { beforeEach, describe, expect, it } from "vitest";

import {
    clearWorkspaceResume,
    readWorkspaceResume,
    resolveWorkspaceOpenPosition,
    writeWorkspaceResume,
} from "@/lib/runtime/workspaceResume";
import {
    OPERATIONS_DEFAULT_POSITION,
    OPERATIONS_WORKSPACE_KEY,
    isValidOperationsPosition,
} from "@/app/adminV2/operations/operationsResume";
import {
    PROCESSING_DEFAULT_POSITION,
    PROCESSING_WORKSPACE_KEY,
    isValidProcessingPosition,
} from "@/app/adminV2/processing/processingResume";
import {
    WORK_ITEMS_DEFAULT_POSITION,
    WORK_ITEMS_WORKSPACE_KEY,
    isValidWorkItemsPosition,
    positionFromScope,
    scopeFromPosition,
} from "@/app/adminV2/tasks/workItemsResume";

beforeEach(() => {
    window.sessionStorage.clear();
});

describe("shared workspace resume", () => {
    it("first open with nothing remembered lands on the workspace default", () => {
        expect(
            resolveWorkspaceOpenPosition(OPERATIONS_WORKSPACE_KEY, OPERATIONS_DEFAULT_POSITION, isValidOperationsPosition),
        ).toEqual(OPERATIONS_DEFAULT_POSITION);
    });

    it("close then reopen restores the remembered stable section", () => {
        writeWorkspaceResume(OPERATIONS_WORKSPACE_KEY, { ...OPERATIONS_DEFAULT_POSITION, section: "children" });
        const opened = resolveWorkspaceOpenPosition(
            OPERATIONS_WORKSPACE_KEY, OPERATIONS_DEFAULT_POSITION, isValidOperationsPosition);
        expect(opened.section).toBe("children");
    });

    it("an explicit move back to the default becomes the remembered position", () => {
        writeWorkspaceResume(OPERATIONS_WORKSPACE_KEY, { ...OPERATIONS_DEFAULT_POSITION, section: "children" });
        writeWorkspaceResume(OPERATIONS_WORKSPACE_KEY, { ...OPERATIONS_DEFAULT_POSITION, section: "roster" });
        expect(
            resolveWorkspaceOpenPosition(OPERATIONS_WORKSPACE_KEY, OPERATIONS_DEFAULT_POSITION, isValidOperationsPosition).section,
        ).toBe("roster");
    });

    it("an invalid remembered position falls back to the default rather than opening broken", () => {
        writeWorkspaceResume(OPERATIONS_WORKSPACE_KEY, { ...OPERATIONS_DEFAULT_POSITION, section: "a-section-that-was-removed" });
        expect(
            resolveWorkspaceOpenPosition(OPERATIONS_WORKSPACE_KEY, OPERATIONS_DEFAULT_POSITION, isValidOperationsPosition),
        ).toEqual(OPERATIONS_DEFAULT_POSITION);
    });

    it("only string navigation values survive — no record payload can be persisted", () => {
        window.sessionStorage.setItem(
            "alloy.workspace.resume.operations",
            JSON.stringify({ section: "children", child: { id: "abc", name: "Lennon" }, rows: [1, 2] }),
        );
        expect(readWorkspaceResume(OPERATIONS_WORKSPACE_KEY)).toEqual({ section: "children" });
    });

    it("unreadable storage yields no position instead of throwing", () => {
        window.sessionStorage.setItem("alloy.workspace.resume.operations", "{not json");
        expect(readWorkspaceResume(OPERATIONS_WORKSPACE_KEY)).toBeNull();
    });

    it("writes MERGE, so two owners of one workspace do not erase each other", () => {
        writeWorkspaceResume(WORK_ITEMS_WORKSPACE_KEY, { workView: "queue" });
        writeWorkspaceResume(WORK_ITEMS_WORKSPACE_KEY, positionFromScope({
            folder: "enrollment", view: "overdue", source: "manual", sort: "title",
        } as never));
        const stored = readWorkspaceResume(WORK_ITEMS_WORKSPACE_KEY);
        expect(stored?.workView).toBe("queue");
        expect(stored?.scopeFolder).toBe("enrollment");
    });

    it("workspaces are isolated from one another", () => {
        writeWorkspaceResume(OPERATIONS_WORKSPACE_KEY, { section: "children" });
        expect(readWorkspaceResume(PROCESSING_WORKSPACE_KEY)).toBeNull();
    });

    it("clearing forgets the position", () => {
        writeWorkspaceResume(OPERATIONS_WORKSPACE_KEY, { section: "children" });
        clearWorkspaceResume(OPERATIONS_WORKSPACE_KEY);
        expect(readWorkspaceResume(OPERATIONS_WORKSPACE_KEY)).toBeNull();
    });
});

describe("per-workspace position declarations", () => {
    it("Processing refuses to resume the case-detail view, which needs a transient selection", () => {
        writeWorkspaceResume(PROCESSING_WORKSPACE_KEY, { ...PROCESSING_DEFAULT_POSITION, workView: "work" });
        expect(
            resolveWorkspaceOpenPosition(PROCESSING_WORKSPACE_KEY, PROCESSING_DEFAULT_POSITION, isValidProcessingPosition),
        ).toEqual(PROCESSING_DEFAULT_POSITION);
    });

    it("Processing resumes Studio and its tab", () => {
        writeWorkspaceResume(PROCESSING_WORKSPACE_KEY, { ...PROCESSING_DEFAULT_POSITION, mode: "studio", studioTab: "packets" });
        const opened = resolveWorkspaceOpenPosition(
            PROCESSING_WORKSPACE_KEY, PROCESSING_DEFAULT_POSITION, isValidProcessingPosition);
        expect(opened.mode).toBe("studio");
        expect(opened.studioTab).toBe("packets");
    });

    it("Work Items round-trips a queue scope through the position", () => {
        const scope = { folder: "compliance", view: "overdue", source: "bos", sort: "title" } as never;
        writeWorkspaceResume(WORK_ITEMS_WORKSPACE_KEY, { ...WORK_ITEMS_DEFAULT_POSITION, ...positionFromScope(scope) });
        const opened = resolveWorkspaceOpenPosition(
            WORK_ITEMS_WORKSPACE_KEY, WORK_ITEMS_DEFAULT_POSITION, isValidWorkItemsPosition);
        expect(scopeFromPosition(opened)).toEqual(scope);
    });

    it("Work Items rejects a scope value that is no longer a real lane", () => {
        writeWorkspaceResume(WORK_ITEMS_WORKSPACE_KEY, { ...WORK_ITEMS_DEFAULT_POSITION, scopeFolder: "retired_folder" });
        expect(
            resolveWorkspaceOpenPosition(WORK_ITEMS_WORKSPACE_KEY, WORK_ITEMS_DEFAULT_POSITION, isValidWorkItemsPosition),
        ).toEqual(WORK_ITEMS_DEFAULT_POSITION);
    });

    it("Operations accepts every one of its real work sections — POSITIVE CONTROL", () => {
        for (const section of ["roster", "attendance", "staff", "children"]) {
            expect(isValidOperationsPosition({ ...OPERATIONS_DEFAULT_POSITION, section })).toBe(true);
        }
    });
});
