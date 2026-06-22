import { describe, expect, it } from "vitest";
import {
    buildDuplicatedLayoutName,
    formatLayoutDraftTitleWithVersion,
    formatLayoutPublishedTitleWithVersion,
    formatLayoutTitleWithVersion,
    resolveLayoutStableTitle,
} from "@/lib/layout/layoutVersionNaming";

describe("layoutVersionNaming", () => {
    it("strips chained copy and version suffixes from stored names", () => {
        expect(resolveLayoutStableTitle("Lead Drawer (V1) (copy) (copy) (copy)")).toBe("Lead Drawer");
        expect(resolveLayoutStableTitle("Lead Drawer — Draft V28")).toBe("Lead Drawer");
        expect(resolveLayoutStableTitle("Lead Drawer copy V28")).toBe("Lead Drawer");
    });

    it("duplicate uses stable title without appending copy", () => {
        expect(buildDuplicatedLayoutName("Lead Drawer (V1) (copy) (copy)")).toBe("Lead Drawer");
        expect(buildDuplicatedLayoutName("Lead Drawer", "Custom Name (copy)")).toBe("Custom Name");
    });

    it("formats gallery and toolbar title with version separately", () => {
        expect(formatLayoutTitleWithVersion("Lead Drawer", 27)).toBe("Lead Drawer · V27");
        expect(formatLayoutDraftTitleWithVersion("Lead Drawer", 28)).toBe("Lead Drawer · Draft V28");
        expect(formatLayoutPublishedTitleWithVersion("Lead Drawer", 27)).toBe("Lead Drawer · Published V27");
    });
});
