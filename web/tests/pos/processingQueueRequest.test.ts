import { describe, it, expect } from "vitest";
import {
    buildProcessingQueueRequest,
    DEFAULT_QUEUE_LIMIT,
    MAX_QUEUE_LIMIT,
} from "@/lib/pos/processingCase/readModel/buildProcessingQueueRequest";

function parse(qs: string) {
    return buildProcessingQueueRequest(new URLSearchParams(qs), "org-1");
}

describe("buildProcessingQueueRequest", () => {
    it("applies defaults with no params and always scopes to org", () => {
        const { query, countQuery } = parse("");
        expect(query.orgId).toBe("org-1");
        expect(query.sortKey).toBe("created_at");
        expect(query.sortDir).toBe("desc");
        expect(query.limit).toBe(DEFAULT_QUEUE_LIMIT);
        expect(query.statuses).toBeUndefined();
        expect(query.cursor).toBeNull();
        expect(countQuery.orgId).toBe("org-1");
    });

    it("parses status and source_kind csv and drops invalid values", () => {
        const { query } = parse("status=needs_review,bogus,ready&source_kind=document,nope");
        expect(query.statuses).toEqual(["needs_review", "ready"]);
        expect(query.sourceKinds).toEqual(["document"]);
    });

    it("clamps limit (max, invalid, negative)", () => {
        expect(parse("limit=9999").query.limit).toBe(MAX_QUEUE_LIMIT);
        expect(parse("limit=abc").query.limit).toBe(DEFAULT_QUEUE_LIMIT);
        expect(parse("limit=-5").query.limit).toBe(DEFAULT_QUEUE_LIMIT);
        expect(parse("limit=10").query.limit).toBe(10);
    });

    it("honors sort key + direction", () => {
        const { query } = parse("sort=status_changed_at&dir=asc");
        expect(query.sortKey).toBe("status_changed_at");
        expect(query.sortDir).toBe("asc");
    });

    it("ignores an invalid sort key", () => {
        expect(parse("sort=banana").query.sortKey).toBe("created_at");
    });

    it("parses a cursor only when both parts are present", () => {
        expect(parse("cursor_sort=2026-06-12&cursor_id=abc").query.cursor).toEqual({ sortValue: "2026-06-12", id: "abc" });
        expect(parse("cursor_sort=2026-06-12").query.cursor).toBeNull();
        expect(parse("cursor_id=abc").query.cursor).toBeNull();
    });

    it("mirrors filters into countQuery without sort/limit/cursor/status", () => {
        const { countQuery } = parse("status=ready&source_kind=document&case_type=subsidy&received_from=2026-06-01");
        expect(countQuery).toEqual({
            orgId: "org-1",
            sourceKinds: ["document"],
            caseTypes: ["subsidy"],
            receivedFrom: "2026-06-01",
            receivedTo: undefined,
        });
    });
});
