import { describe, expect, it } from "vitest";
import {
    slugifyStatusKey,
    STATUS_KEY_REGEX,
    uniqueStatusKey,
} from "@/lib/admin/slugifyAdminKey";

describe("slugifyStatusKey", () => {
    it("auto-generates status_key from label", () => {
        expect(slugifyStatusKey("Future Start")).toBe("future_start");
        expect(slugifyStatusKey("Tour Scheduled!")).toBe("tour_scheduled");
    });

    it("validates allowed format", () => {
        expect(STATUS_KEY_REGEX.test(slugifyStatusKey("Future Start"))).toBe(true);
        expect(STATUS_KEY_REGEX.test("ab")).toBe(true);
        expect(STATUS_KEY_REGEX.test("A")).toBe(false);
    });

    it("ensures uniqueness against reserved keys", () => {
        const reserved = new Set(["future_start"]);
        expect(uniqueStatusKey("Future Start", reserved)).toBe("future_start_2");
    });
});
