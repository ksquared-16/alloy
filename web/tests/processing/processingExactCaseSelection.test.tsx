/** @vitest-environment jsdom */

/**
 * PROCESSING — EXACT CASE DEEP SELECTION.
 *
 * The contract under test: open Processing with `caseId=X` and X becomes the selected case, whether
 * or not X happens to sit on the queue's default recency page.
 *
 * What this replaces: `/api/admin/processing/queue` with no parameters returns the newest
 * `DEFAULT_QUEUE_LIMIT` (25) cases, `created_at desc`. `ProcessingQueueList` rendered exactly those
 * rows, so a requested case older than the page appeared NOWHERE on the surface that had just been
 * opened to show it — the rail painted its default lane with nothing selected. Membership in the
 * default lane was, in effect, a precondition for being selectable. It is not one.
 *
 * These drive the REAL `ProcessingQueueList` with only its data collaborators stubbed, because the
 * defect lived in the rendering decision (which rows exist, which folder is open, which row survives
 * duplicate collapse) and a test of the pure helpers alone would have passed throughout.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { act } from "react";

import type {
    ProcessingCaseQueueRow,
    ProcessingCaseSourceKind,
    SourceDisplayDescriptor,
} from "@/lib/pos/processingCase/readModel/types";

const { warmRows } = vi.hoisted(() => ({ warmRows: { current: [] as ProcessingCaseQueueRow[] } }));

vi.mock("@/lib/pos/useProcessingQueueWarm", () => ({
    useProcessingQueueWarm: () => ({
        data: { rows: warmRows.current, counts: {}, recommendations: {} },
        loading: false,
        error: null,
        refresh: () => {},
    }),
}));

vi.mock("@/lib/pos/processingCasePrefetch", () => ({
    prefetchProcessingCase: vi.fn(),
    prefetchProcessingCases: vi.fn(),
}));

const WORK_FOLDERS = [
    { id: "incoming", label: "Incoming", accent: "pine" },
    { id: "completed", label: "Completed", accent: "stone" },
];

vi.mock("@/lib/pos/useProcessingFolders", () => ({
    useProcessingFolders: () => ({ workFolders: WORK_FOLDERS }),
}));

const { default: ProcessingQueueList } = await import("@/app/adminV2/processing/ProcessingQueueList");
const {
    setProcessingRequestedCase,
    clearProcessingRequestedCase,
    getProcessingRequestedCase,
    mergeRequestedCaseIntoRows,
} = await import("@/lib/pos/processingRequestedCase");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function display(label: string, kind: ProcessingCaseSourceKind = "form_submission"): SourceDisplayDescriptor {
    return { kind, id: `src-${label}`, label, receivedAt: null, channel: null, resolved: true };
}

function caseRow(id: string, over: Partial<ProcessingCaseQueueRow> = {}): ProcessingCaseQueueRow {
    return {
        id,
        status: "needs_review",
        caseType: "intake",
        createdAt: "2026-09-01T10:00:00.000Z",
        statusChangedAt: "2026-09-01T10:00:00.000Z",
        primarySource: { kind: "form_submission", id: `src-${id}`, role: "primary", linkedAt: null },
        relatedSourceCount: 0,
        sourceDisplay: display(`Case ${id}`),
        caseTitle: null,
        adminCategory: null,
        formDraftSummary: null,
        ...over,
    } as ProcessingCaseQueueRow;
}

let container: HTMLDivElement | null = null;

beforeEach(() => {
    clearProcessingRequestedCase();
    warmRows.current = [];
    vi.restoreAllMocks();
});

afterEach(() => {
    container?.remove();
    container = null;
    clearProcessingRequestedCase();
});

async function renderRail(selectedCaseId: string | null) {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
        root.render(
            <ProcessingQueueList
                selectedCaseId={selectedCaseId}
                onSelectCase={() => {}}
                showFolders
                panelMode
            />,
        );
    });
    // Let the by-id resolution promise and its re-render settle.
    await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
    return container;
}

function rowIdsOnScreen(el: HTMLElement): string[] {
    return [...el.querySelectorAll("[data-processing-case-id]")].map(
        (n) => n.getAttribute("data-processing-case-id") ?? "",
    );
}

describe("Processing — the requested case outranks default-lane membership", () => {
    it("resolves a case that is OFF the default page, renders it, and shows it selected", async () => {
        // The default recency page. `case-off-page` is deliberately absent: it is older than the
        // newest 25, which is the entire reason the old rail could not show it.
        warmRows.current = [caseRow("case-on-page-1"), caseRow("case-on-page-2")];

        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                data: { rows: [caseRow("case-off-page", { sourceDisplay: display("Older subsidy packet") })] },
            }),
        });
        vi.stubGlobal("fetch", fetchMock);

        setProcessingRequestedCase("case-off-page");
        const el = await renderRail("case-off-page");

        // It was resolved BY ID — not hunted for inside a page that never contained it.
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("case_ids=case-off-page");

        // It is on the rail, and it is the selected row.
        const ids = rowIdsOnScreen(el);
        expect(ids).toContain("case-off-page");
        const requestedNode = el.querySelector('[data-processing-case-id="case-off-page"]');
        expect(requestedNode?.getAttribute("aria-current")).toBe("true");

        // And no OTHER row is presented as the selection — the old failure showed a default case.
        const selected = [...el.querySelectorAll('[aria-current="true"]')].map((n) =>
            n.getAttribute("data-processing-case-id"),
        );
        expect(selected).toEqual(["case-off-page"]);
    });

    it("opens the folder holding the requested case — a collapsed folder hides it just as well", async () => {
        warmRows.current = [caseRow("case-on-page-1")];
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: { rows: [caseRow("case-off-page")] } }),
            }),
        );

        setProcessingRequestedCase("case-off-page");
        const el = await renderRail("case-off-page");

        // Every folder starts collapsed by design. If that rule were left to stand unconditionally,
        // the resolved row would exist in state and render nowhere.
        expect(rowIdsOnScreen(el)).toContain("case-off-page");
    });

    it("never collapses the requested case into a same-titled duplicate", async () => {
        // Two scans of the same document. The grouping rule keeps the first and drops the rest, so
        // asking for the second used to put a DIFFERENT case's row on screen in its place.
        const shared = { kind: "document", id: "doc-1", role: "primary", linkedAt: null } as const;
        warmRows.current = [
            caseRow("case-dupe-first", {
                primarySource: shared,
                sourceDisplay: display("Enrollment Packet.pdf", "document"),
            }),
            caseRow("case-dupe-second", {
                primarySource: shared,
                sourceDisplay: display("Enrollment Packet.pdf", "document"),
            }),
        ];
        vi.stubGlobal("fetch", vi.fn());

        setProcessingRequestedCase("case-dupe-second");
        const el = await renderRail("case-dupe-second");

        const ids = rowIdsOnScreen(el);
        expect(ids).toContain("case-dupe-second");
        const requestedNode = el.querySelector('[data-processing-case-id="case-dupe-second"]');
        expect(requestedNode?.getAttribute("aria-current")).toBe("true");
    });

    it("costs no extra request when the requested case is already on the page", async () => {
        warmRows.current = [caseRow("case-on-page-1"), caseRow("case-on-page-2")];
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        setProcessingRequestedCase("case-on-page-2");
        const el = await renderRail("case-on-page-2");

        expect(fetchMock).not.toHaveBeenCalled();
        expect(rowIdsOnScreen(el)).toContain("case-on-page-2");
    });
});

describe("mergeRequestedCaseIntoRows", () => {
    it("leads with the requested case when the page does not contain it", () => {
        const rows = [caseRow("a"), caseRow("b")];
        const merged = mergeRequestedCaseIntoRows(rows, {
            caseId: "z",
            row: caseRow("z"),
            resolving: false,
        });
        expect(merged.map((r) => r.id)).toEqual(["z", "a", "b"]);
    });

    it("does not duplicate a requested case already on the page", () => {
        const rows = [caseRow("a"), caseRow("b")];
        const merged = mergeRequestedCaseIntoRows(rows, { caseId: "b", row: caseRow("b"), resolving: false });
        expect(merged.map((r) => r.id)).toEqual(["a", "b"]);
    });

    it("leaves the page untouched when nothing was requested", () => {
        const rows = [caseRow("a")];
        expect(mergeRequestedCaseIntoRows(rows, { caseId: null, row: null, resolving: false })).toBe(rows);
    });

    it("tracks the requested case id through the store", () => {
        setProcessingRequestedCase("  case-7  ");
        expect(getProcessingRequestedCase().caseId).toBe("case-7");
        clearProcessingRequestedCase();
        expect(getProcessingRequestedCase().caseId).toBeNull();
    });
});
