import { describe, expect, it } from "vitest";
import { settingsSurfacePrefix } from "@/lib/adminV2/settingsSurfaceModes";

describe("settingsSurfaceModes", () => {
    it("prefixes descriptions by surface mode", () => {
        expect(settingsSurfacePrefix("editable")).toBe("Editable · ");
        expect(settingsSurfacePrefix("read_only")).toBe("Read-only · ");
        expect(settingsSurfacePrefix("partial")).toBe("Partial · ");
        expect(settingsSurfacePrefix("related_hub")).toBe("Related hub · ");
    });
});
