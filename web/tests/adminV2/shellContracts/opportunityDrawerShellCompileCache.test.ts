import { describe, expect, it, beforeEach } from "vitest";

import { compileOpportunityRecordDrawerShell } from "@/lib/adminV2/shellContracts/compileOpportunityRecordDrawerShell";
import {
    clearOpportunityDrawerShellCompileCache,
    getCachedOpportunityDrawerShell,
} from "@/lib/adminV2/shellContracts/opportunityDrawerShellCompileCache";
import type { RecordLayoutConfigJson } from "@/lib/recordChrome/types";

const layout: RecordLayoutConfigJson = {
    inquiry_drawer_mode: "workflow_v1",
    overview_section_order: ["inquiry_summary", "inquiry_children"],
    overview_hidden_sections: [],
};

describe("opportunityDrawerShellCompileCache", () => {
    beforeEach(() => {
        clearOpportunityDrawerShellCompileCache();
    });

    it("returns the same shell reference for identical layout + field registry input", () => {
        const input = {
            config_json: layout,
            field_definitions: [
                {
                    field_key: "status",
                    field_type: "text",
                    label: "Status",
                    section_key: "inquiry_summary",
                    sort_order: 0,
                    is_visible_in_drawer: true,
                },
            ],
            field_section_labels: { inquiry_summary: "Summary" },
        };
        expect(getCachedOpportunityDrawerShell(input)).toBeUndefined();
        const first = compileOpportunityRecordDrawerShell(input);
        const second = compileOpportunityRecordDrawerShell(input);
        expect(first).not.toBeNull();
        expect(second).toBe(first);
    });

    it("misses when field registry keys change", () => {
        const base = {
            config_json: layout,
            field_definitions: [
                {
                    field_key: "status",
                    field_type: "text",
                    label: "Status",
                    section_key: "inquiry_summary",
                    sort_order: 0,
                    is_visible_in_drawer: true,
                },
            ],
            field_section_labels: { inquiry_summary: "Summary" },
        };
        const first = compileOpportunityRecordDrawerShell(base);
        const otherInput = {
            ...base,
            field_definitions: [
                ...base.field_definitions,
                {
                    field_key: "notes",
                    field_type: "text",
                    label: "Notes",
                    section_key: "inquiry_summary",
                    sort_order: 1,
                    is_visible_in_drawer: true,
                },
            ],
        };
        expect(getCachedOpportunityDrawerShell(otherInput)).toBeUndefined();
        const second = compileOpportunityRecordDrawerShell(otherInput);
        expect(second).not.toBeNull();
        expect(second).not.toBe(first);
    });
});
