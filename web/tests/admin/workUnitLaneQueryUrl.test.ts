import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
    buildWorkUnitLaneSearchParams,
    formatWorkUnitBrowserUrl,
    replaceWorkUnitBrowserSearch,
    scheduleWorkUnitLaneUrlSync,
} from "@/lib/adminV2/workUnitLaneQueryUrl";

describe("workUnitLaneQueryUrl", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {
            location: {
                pathname: "/adminV2/workspace/dept/d1/work-unit/w1",
                search: "?queue=new_inquiry",
                href: "http://localhost/adminV2/workspace/dept/d1/work-unit/w1?queue=new_inquiry",
            },
            history: { replaceState: vi.fn(), state: {} },
            dispatchEvent: vi.fn(),
        } as unknown as Window & typeof globalThis);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("skips replaceState when target URL is unchanged", () => {
        const sp = buildWorkUnitLaneSearchParams(new URLSearchParams("queue=new_inquiry"), {
            queueKey: "new_inquiry",
            unmappedActive: false,
        });
        const wrote = replaceWorkUnitBrowserSearch(sp, { caller: "test" });
        expect(wrote).toBe(false);
        expect(window.history.replaceState).not.toHaveBeenCalled();
    });

    it("writes replaceState only when lane query changes", () => {
        const sp = buildWorkUnitLaneSearchParams(new URLSearchParams("queue=new_inquiry"), {
            queueKey: "contact_attempted",
            unmappedActive: false,
        });
        const nextUrl = formatWorkUnitBrowserUrl(
            "/adminV2/workspace/dept/d1/work-unit/w1",
            sp
        );
        const wrote = replaceWorkUnitBrowserSearch(sp, { caller: "test" });
        expect(wrote).toBe(true);
        expect(window.history.replaceState).toHaveBeenCalledWith({}, "", nextUrl);
    });

    it("scheduleWorkUnitLaneUrlSync persists tour_scheduled alias in address bar", () => {
        vi.useFakeTimers();
        scheduleWorkUnitLaneUrlSync({
            queueKey: "tours",
            unmappedActive: false,
            caller: "test",
            workUnitId: "w1",
        });
        vi.runAllTimers();
        expect(window.history.replaceState).toHaveBeenCalledWith(
            {},
            "",
            "/adminV2/workspace/dept/d1/work-unit/w1?queue=tours"
        );
        vi.useRealTimers();
    });
});
