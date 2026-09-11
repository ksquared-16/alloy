/**
 * PROCESSING → WORK ITEMS — THE ACTIONABLE WORK COHORT.
 *
 * Hosted evidence that opened this: 6 Processing cases at `needs_resolution`, ZERO of them projected
 * into Work Items, and all 19 projected rows at `received`. That reads like a product decision
 * ("only `received` is actionable") and is not one.
 *
 * The projection consumed `getProcessingQueueWarmSnapshot()`, which resolved to
 * `/api/admin/processing/queue` with NO parameters — `buildProcessingQueueRequest` then yields
 * `statuses: undefined` and `limit: DEFAULT_QUEUE_LIMIT` (25), sorted `created_at desc`. So the
 * cohort was "the newest 25 cases", and the six `needs_resolution` cases were simply older than that
 * window. 19 + 6 = 25 is not a coincidence; it is the page size.
 *
 * The adapter's own judgement was never wrong: `deriveProcessingLane` has always routed
 * `needs_resolution` into the `needs_review` lane and therefore always intended to project it. It
 * never saw one. These tests pin the cohort to a STATUS predicate so the page size stops being load
 * bearing, and pin the adapter behaviour that made the truncation invisible.
 */

import { describe, expect, it } from "vitest";

import {
    PROCESSING_ACTIONABLE_LIMIT,
    PROCESSING_ACTIONABLE_STATUSES,
    isProcessingActionableStatus,
    isProcessingTerminalStatus,
    processingActionableQueryString,
} from "@/lib/pos/processingActionableWork";
import {
    mapProcessingCaseToWorkItemRow,
    mapProcessingQueueToWorkItemRows,
} from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
import { buildProcessingQueueRequest, DEFAULT_QUEUE_LIMIT } from "@/lib/pos/processingCase/readModel/buildProcessingQueueRequest";
import type { ProcessingCaseQueueRow, ProcessingCaseStatus } from "@/lib/pos/processingCase/readModel/types";

function caseRow(id: string, status: ProcessingCaseStatus): ProcessingCaseQueueRow {
    return {
        id,
        status,
        caseType: "intake",
        createdAt: "2026-06-01T10:00:00.000Z",
        statusChangedAt: "2026-06-01T10:00:00.000Z",
        primarySource: { kind: "form_submission", id: `src-${id}`, role: "primary", linkedAt: null },
        relatedSourceCount: 0,
        sourceDisplay: { label: `Case ${id}` },
        caseTitle: null,
        adminCategory: null,
        formDraftSummary: null,
    } as ProcessingCaseQueueRow;
}

describe("the actionable-work cohort is a status predicate, not a page window", () => {
    it("counts needs_resolution as actionable — it is a case BLOCKED pending an operator decision", () => {
        /*
         * `needs_resolution` is where identity resolution parks a case it cannot finish without a
         * human (`canonicalResolutionEngine`, `formIntakeAdapter`). `decisionOutcomes` records it as
         * NON-TERMINAL — "keep it for further review" — and `POS_STATUS_LABELS` calls it "Needs a
         * decision". A case holding up a canonical record commit pending a human decision is the
         * strongest form of actionable cross-record work there is.
         */
        expect(isProcessingActionableStatus("needs_resolution")).toBe(true);
        expect(PROCESSING_ACTIONABLE_STATUSES).toContain("needs_resolution");
    });

    it("keeps received actionable — a case is OPENED there and nothing advances it on its own", () => {
        // `openProcessingCaseFromSource` creates at `received`. No automation moves it along, so it
        // sits until an operator opens it. Dropping it would have removed 19 real rows from Work
        // Items to satisfy a symptom, which is the opposite of the fix.
        expect(isProcessingActionableStatus("received")).toBe(true);
    });

    it("excludes terminal states", () => {
        expect(isProcessingActionableStatus("completed")).toBe(false);
        expect(isProcessingActionableStatus("archived")).toBe(false);
        expect(isProcessingTerminalStatus("completed")).toBe(true);
        expect(isProcessingTerminalStatus("archived")).toBe(true);
    });

    it("excludes `ready` — ready to GENERATE a form is a Studio step, not cross-record work", () => {
        expect(isProcessingActionableStatus("ready")).toBe(false);
        // And the adapter independently agrees, which is why this module does not change its mind.
        expect(mapProcessingCaseToWorkItemRow(caseRow("r1", "ready"))).toBeNull();
    });

    it("asks the queue endpoint for the cohort explicitly rather than accepting the default page", () => {
        const qs = processingActionableQueryString();
        const params = new URLSearchParams(qs);
        expect(params.get("status")?.split(",")).toEqual(PROCESSING_ACTIONABLE_STATUSES);
        expect(Number(params.get("limit"))).toBe(PROCESSING_ACTIONABLE_LIMIT);
        // The whole defect in one assertion: the cohort read must not inherit the 25-row page.
        expect(Number(params.get("limit"))).toBeGreaterThan(DEFAULT_QUEUE_LIMIT);
    });

    it("round-trips through the request builder as a status filter, not a recency page", () => {
        const { query } = buildProcessingQueueRequest(
            new URLSearchParams(processingActionableQueryString()),
            "org-1",
        );
        expect(query.statuses).toEqual(PROCESSING_ACTIONABLE_STATUSES);
        expect(query.statuses).toContain("needs_resolution");
        expect(query.limit).toBe(PROCESSING_ACTIONABLE_LIMIT);
    });
});

describe("the canonical adapter projects the cohort without inventing rows", () => {
    it("projects a needs_resolution case — the lane judgement always intended to, and never saw one", () => {
        const row = mapProcessingCaseToWorkItemRow(caseRow("c-needs-resolution", "needs_resolution"));
        expect(row).not.toBeNull();
        expect(row?.id).toBe("processing:c-needs-resolution");
        expect(row?.processing_case_id).toBe("c-needs-resolution");
        expect(row?.processing_lane).toBe("needs_review");
        expect(row?.status).toBe("open");
    });

    it("projects the whole hosted shape: 6 needs_resolution alongside 19 received", () => {
        const rows = [
            ...Array.from({ length: 19 }, (_, i) => caseRow(`recv-${i}`, "received")),
            ...Array.from({ length: 6 }, (_, i) => caseRow(`needsres-${i}`, "needs_resolution")),
        ];
        const projected = mapProcessingQueueToWorkItemRows(rows);
        expect(projected).toHaveLength(25);
        expect(projected.filter((r) => r.id.startsWith("processing:needsres-"))).toHaveLength(6);
    });

    it("is a READ projection — a synthetic row, never an operational_tasks insert", () => {
        /*
         * The certification requirement is "zero operational_tasks duplicate". That holds by
         * construction: the adapter is a pure function returning a row shape whose id is derived
         * from the case id, marked `is_processing_projection`. There is no persistence seam here to
         * write through, and the id is deterministic so a merge dedupes rather than doubles.
         */
        const row = mapProcessingCaseToWorkItemRow(caseRow("c1", "needs_resolution"));
        expect(row?.is_processing_projection).toBe(true);
        expect(row?.id).toBe("processing:c1");
        expect(mapProcessingCaseToWorkItemRow(caseRow("c1", "needs_resolution"))?.id).toBe(row?.id);
    });

    it("drops a case once it reaches a terminal state — this is what convergence after Archive is", () => {
        expect(mapProcessingCaseToWorkItemRow(caseRow("c1", "archived"))).toBeNull();
        expect(mapProcessingCaseToWorkItemRow(caseRow("c1", "completed"))).toBeNull();
    });
});

describe("queue requests can name their cases", () => {
    it("parses case_ids and restricts the query to them", () => {
        const { query } = buildProcessingQueueRequest(
            new URLSearchParams("case_ids=case-a,case-b"),
            "org-1",
        );
        expect(query.caseIds).toEqual(["case-a", "case-b"]);
    });

    it("never truncates a named ask below the number of ids requested", () => {
        const ids = Array.from({ length: 40 }, (_, i) => `case-${i}`);
        const { query } = buildProcessingQueueRequest(
            new URLSearchParams(`case_ids=${ids.join(",")}`),
            "org-1",
        );
        // The default page of 25 would have silently dropped 15 of the cases that were named.
        expect(query.caseIds).toHaveLength(40);
        expect(query.limit).toBe(40);
    });

    it("leaves caseIds undefined when the caller did not name any", () => {
        const { query } = buildProcessingQueueRequest(new URLSearchParams(""), "org-1");
        expect(query.caseIds).toBeUndefined();
        expect(query.limit).toBe(DEFAULT_QUEUE_LIMIT);
    });
});
