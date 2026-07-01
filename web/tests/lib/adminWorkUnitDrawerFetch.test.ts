import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchAdminWorkUnitDrawerJson } from "@/lib/admin/adminWorkUnitDrawerFetch";

describe("fetchAdminWorkUnitDrawerJson", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("dedupes concurrent in-flight fetches for the same work unit id", async () => {
        let callCount = 0;
        const json = vi.fn(async () => ({ department_id: "dept-1", queue_definition: {} }));
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => {
                callCount += 1;
                return { ok: true, json };
            })
        );

        const [a, b] = await Promise.all([
            fetchAdminWorkUnitDrawerJson("work-unit-alpha"),
            fetchAdminWorkUnitDrawerJson("work-unit-alpha"),
        ]);
        expect(callCount).toBe(1);
        expect(a).toEqual(b);
    });
});
