import { describe, expect, it } from "vitest";
import { parseAssistantCommand } from "@/lib/admin/agentLab/parseAssistantCommand";
import { resolveFieldDefinitionByQuery } from "@/lib/admin/agentLab/resolveFieldDefinitionByQuery";

describe("parseAssistantCommand", () => {
    it("parses hide field from table", () => {
        const r = parseAssistantCommand('hide field "Display total" from table');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.parsed.kind).toBe("field_table");
            if (r.parsed.kind === "field_table") {
                expect(r.parsed.action).toBe("hide");
                expect(r.parsed.labelQuery).toContain("Display");
            }
        }
    });

    it("parses show field in drawer", () => {
        const r = parseAssistantCommand("show field notes in drawer");
        expect(r.ok).toBe(true);
        if (r.ok && r.parsed.kind === "field_drawer") {
            expect(r.parsed.action).toBe("show");
            expect(r.parsed.labelQuery).toBe("notes");
        }
    });

    it("parses financial band overview", () => {
        const r = parseAssistantCommand("hide financial band on job overview");
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.parsed.kind).toBe("overview_financial");
            if (r.parsed.kind === "overview_financial") expect(r.parsed.action).toBe("hide");
        }
    });

    it("rejects unknown", () => {
        const r = parseAssistantCommand("delete everything");
        expect(r.ok).toBe(false);
    });
});

describe("resolveFieldDefinitionByQuery", () => {
    const items = [
        { id: "a", field_key: "display_total_cents", label: "Total" },
        { id: "b", field_key: "notes", label: "Notes" },
    ];

    it("resolves by field_key", () => {
        const r = resolveFieldDefinitionByQuery(items, "notes");
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.match.id).toBe("b");
    });

    it("resolves by label substring", () => {
        const r = resolveFieldDefinitionByQuery(items, "Total");
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.match.id).toBe("a");
    });
});
