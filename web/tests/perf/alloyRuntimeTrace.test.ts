import { afterEach, describe, expect, it, vi } from "vitest";
import {
    alloyRuntimeTrace,
    hrefHasWorkViewOrQueueParam,
    workViewSlugFromHref,
} from "@/lib/perf/alloyRuntimeTrace";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("alloyRuntimeTrace", () => {
    it("emits a [alloy-runtime:SECTION] prefixed line with a JSON payload", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        alloyRuntimeTrace("WS.PROCESS_TILE_WORK_VIEWS", {
            source: "configured_work_views",
            work_view_slugs: ["active-pipeline"],
        });
        expect(spy).toHaveBeenCalledTimes(1);
        const [prefix, body] = spy.mock.calls[0]!;
        expect(prefix).toBe("[alloy-runtime:WS.PROCESS_TILE_WORK_VIEWS]");
        expect(JSON.parse(body as string)).toMatchObject({
            source: "configured_work_views",
            work_view_slugs: ["active-pipeline"],
        });
    });

    it("never emits forbidden PII-shaped keys (names, emails, phones, message bodies)", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        alloyRuntimeTrace("WU.QUEUE_REGION", {
            source: "configured_work_view_queue",
            first_row_record_id: "rec-123",
            // These must be stripped before emit.
            name: "Jane Doe",
            email: "jane@example.com",
            phone: "+15551234567",
            message: "hello there",
        });
        const body = JSON.parse(spy.mock.calls[0]![1] as string) as Record<string, unknown>;
        expect(body).toHaveProperty("first_row_record_id", "rec-123");
        for (const forbidden of ["name", "email", "phone", "message"]) {
            expect(body).not.toHaveProperty(forbidden);
        }
    });

    it("suppresses identical consecutive payloads for the same section", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => {});
        const payload = { source: "configured_work_units", incoming_slug: "x-unique-slug" };
        alloyRuntimeTrace("WU.ROUTE_RESOLVE", payload);
        alloyRuntimeTrace("WU.ROUTE_RESOLVE", { ...payload });
        expect(spy).toHaveBeenCalledTimes(1);
    });
});

describe("workViewSlugFromHref", () => {
    it("returns the clean last path segment", () => {
        expect(workViewSlugFromHref("/workspace/work-unit/active-pipeline")).toBe("active-pipeline");
    });
    it("strips query and hash", () => {
        expect(workViewSlugFromHref("/workspace/work-unit/new-leads?x=1#y")).toBe("new-leads");
    });
});

describe("hrefHasWorkViewOrQueueParam", () => {
    it("detects work_view= and queue= params", () => {
        expect(hrefHasWorkViewOrQueueParam("/workspace/work-unit/lifecycle-lead?work_view=x")).toBe(true);
        expect(hrefHasWorkViewOrQueueParam("/workspace/work-unit/x?queue=y")).toBe(true);
    });
    it("is false for clean slug hrefs", () => {
        expect(hrefHasWorkViewOrQueueParam("/workspace/work-unit/active-pipeline")).toBe(false);
    });
});
