import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logAdminV2LegacyFanOut } from "@/lib/adminV2/runtime/adminV2LegacyFanOutDiagnostics";

describe("adminV2LegacyFanOutDiagnostics", () => {
    beforeEach(() => {
        vi.stubGlobal("window", {
            dispatchEvent: vi.fn(),
        } as unknown as Window);
        vi.stubGlobal("performance", { now: () => 0 });
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it("logs structured legacy fan-out payload", () => {
        logAdminV2LegacyFanOut({
            surface: "department",
            reason: "bootstrap_unavailable",
            departmentId: "dept-1",
            status: 503,
        });
        expect(console.warn).toHaveBeenCalledWith(
            "[adminv2-legacy-fan-out]",
            expect.objectContaining({
                tag: "adminv2_legacy_fan_out",
                surface: "department",
                reason: "bootstrap_unavailable",
                department_id: "dept-1",
                http_status: 503,
            })
        );
    });
});
