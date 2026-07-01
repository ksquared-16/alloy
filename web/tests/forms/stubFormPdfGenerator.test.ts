import { describe, expect, it } from "vitest";
import { buildStubFormPdfBuffer } from "@/lib/forms/pdf/stubFormPdfGenerator";

describe("StubFormPdfGenerator", () => {
    it("emits PDF magic header bytes", () => {
        const buf = buildStubFormPdfBuffer({
            title: "T",
            templateKey: "tk",
            slots: { a: "one", b: "two" },
        });
        expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
        expect(buf.includes(Buffer.from("%%EOF"))).toBe(true);
    });
});
