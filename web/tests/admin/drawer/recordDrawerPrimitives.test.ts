import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
    opportunityDrawerHeaderActionClassName,
    recordDrawerHeaderActionClassName,
} from "@/components/admin/drawer/record/RecordDrawerActionRail";

const webRoot = resolve(__dirname, "../../..");

function read(rel: string): string {
    return readFileSync(resolve(webRoot, rel), "utf8");
}

describe("record drawer premium primitives", () => {
    it("keeps Opportunity action class contract via re-export", () => {
        expect(recordDrawerHeaderActionClassName(true)).toBe(opportunityDrawerHeaderActionClassName(true));
        expect(recordDrawerHeaderActionClassName(true)).toContain("rounded-full");
        expect(recordDrawerHeaderActionClassName(true)).toContain("border-alloy-blue/30");
    });

    it("Opportunity modules still import re-export wrappers", () => {
        const oppBtn = read("components/admin/opportunity/OpportunityDrawerHeaderActionButton.tsx");
        const oppPanel = read("components/admin/opportunity/OpportunityDrawerHeaderActionsPanel.tsx");
        expect(oppBtn).toContain("RecordDrawerActionRail");
        expect(oppPanel).toContain("RecordDrawerActionRail");
    });

});
