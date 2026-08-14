import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("Template Studio UX polish — containment, density, Filters, list scroll", () => {
    it("hides advanced filters behind a Filters toggle with active badge (queue pattern)", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toContain('data-template-filters-toggle="true"');
        expect(ws).toContain('data-template-filters-advanced="true"');
        expect(ws).toContain("filtersOpen");
        expect(ws).toContain("advancedFilterCount");
        expect(ws).toContain('data-template-filters-badge="true"');
        expect(ws).toContain("COMMS_FILTERS_TOGGLE");
        // Selects still exist for category/channel/status — only visibility is toggled
        expect(ws).toContain('data-template-filter-category="true"');
        expect(ws).toContain('data-template-filter-channel="true"');
        expect(ws).toContain('data-template-filter-status="true"');
        expect(ws).toContain("aria-expanded={filtersOpen}");
    });

    it("gives the template list an independent scroll owner under a shrink-0 header", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toContain('data-template-list-scroll="true"');
        expect(ws).toContain('data-template-library-header="true"');
        expect(ws).toContain('bodyClassName="min-h-0 flex-1 gap-0 overflow-hidden"');
        expect(ws).toMatch(/data-template-list-scroll="true"[\s\S]*min-h-0 flex-1 overflow-y-auto/);
        expect(ws).toContain("COMMS_LIBRARY_RAIL_HEADER_CLASS");
    });

    it("condenses Template details and elevates message content with internal body scroll", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toContain('data-template-details="true"');
        expect(ws).toContain("dense");
        expect(ws).toContain("COMMS_FIELD_STACK_CLASS");
        expect(ws).toContain("sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.85fr)_7rem_6.25rem]");
        expect(ws).toContain('data-template-body-region="true"');
        expect(ws).toMatch(/data-template-editor="true"[\s\S]*overflow-hidden/);
        expect(ws).toMatch(/data-template-message="true"[\s\S]*flex-1/);
        expect(ws).toMatch(/data-template-body="true"[\s\S]*flex-1[\s\S]*overflow-y-auto/);
    });

    it("uses column dividers and shared Alloy Stone border primitives (no new tokens)", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        const ui = read("app/adminV2/communications/commsWorkspaceUi.tsx");
        expect(ws).toContain("divide-x divide-alloy-stone/28");
        expect(ui).toContain("border-alloy-stone/28");
        expect(ui).toContain("border-alloy-stone/35");
        expect(ui).toContain("COMMS_FILTERS_TOGGLE_CLASS");
        expect(ui).toContain("bodyClassName");
        expect(ui).not.toMatch(/#[0-9a-fA-F]{6}.*comms.*border/i);
    });

    it("keeps Bend Pine selected-row treatment on library rows", () => {
        const ui = read("app/adminV2/communications/commsWorkspaceUi.tsx");
        expect(ui).toContain("COMMS_LIBRARY_ROW_SELECTED_CLASS");
        expect(ui).toContain("border-l-alloy-juniper");
        expect(ui).toContain("bg-alloy-juniper/");
    });

    it("shows proper-case channel labels (Email / SMS / In App), not raw keys", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        const schema = read("lib/communications/v2/templateSchema.ts");
        expect(schema).toContain('email: "Email"');
        expect(schema).toContain('sms: "SMS"');
        expect(schema).toContain('in_app: "In App"');
        expect(schema).toContain("templateChannelLabel");
        expect(ws).toContain("templateChannelLabel");
        expect(ws).toMatch(/templateChannelLabel\(c\)/);
        expect(ws).toMatch(/templateChannelLabel\(t\.channel\)/);
    });

    it("shows proper-case status labels (Draft / Active / Archived)", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        const schema = read("lib/communications/v2/templateSchema.ts");
        expect(schema).toContain('draft: "Draft"');
        expect(schema).toContain('active: "Active"');
        expect(schema).toContain('archived: "Archived"');
        expect(schema).toContain("templateStatusLabel");
        expect(ws).toContain("templateStatusLabel");
        expect(ws).toMatch(/templateStatusLabel\(s\)/);
    });
});
