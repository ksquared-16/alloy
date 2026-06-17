import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyActionIntakePasteExtraction } from "@/lib/lifecycle/applyActionIntakePasteExtraction";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import {
    bosSuggestionsFromExtraction,
    createLeadParserSpec,
    validateCreateLeadPlatformMinimum,
} from "@/lib/admin/actions/createLeadPlatformGather";
import { CreateLeadModal } from "@/components/admin/opportunity/actions/CreateLeadModal";

const spec = createLeadParserSpec("dept-1");

describe("parseCreateLeadIntakeText", () => {
    it("extracts labeled parent, child, contact, source, and notes from paste", () => {
        const result = parseCreateLeadIntakeText({
            text: [
                "Parent: Jordan Lee",
                "Email: jordan@example.com",
                "Phone: (555) 123-4567",
                "Child: Riley Lee",
                "Source: Website form",
                "Notes: Interested in toddler program starting in September",
            ].join("\n"),
            spec,
        });

        const byKey = Object.fromEntries(result.fields.map((f) => [f.payload_key, f.value]));
        expect(byKey.first_name).toBe("Jordan");
        expect(byKey.last_name).toBe("Lee");
        expect(byKey.email).toBe("jordan@example.com");
        expect(byKey.phone).toBe("5551234567");
        expect(byKey.child_first_name).toBe("Riley");
        expect(byKey.child_last_name).toBe("Lee");
        expect(byKey.source).toBe("Website form");
        expect(byKey.intake_notes).toContain("toddler program");
    });

    it("extracts first and last name from single-line contact blob", () => {
        const result = parseCreateLeadIntakeText({
            text: "Kelly Kurzman kelly.kurzman@gmail.com 6022904816",
            spec,
        });
        const byKey = Object.fromEntries(result.fields.map((f) => [f.payload_key, f.value]));
        expect(byKey.first_name).toBe("Kelly");
        expect(byKey.last_name).toBe("Kurzman");
        expect(byKey.email).toBe("kelly.kurzman@gmail.com");
        expect(byKey.phone).toBe("6022904816");
    });

    it("does not treat call-note phrasing as a high-confidence parent name", () => {
        const result = parseCreateLeadIntakeText({
            text: "Johnson called today about toddler care",
            spec,
        });
        const nameFields = result.fields.filter((f) => f.payload_key === "first_name" || f.payload_key === "last_name");
        expect(nameFields.every((f) => f.confidence !== "high")).toBe(true);
    });

    it("applies extraction into draft values without overwriting manual edits", () => {
        const extraction = parseCreateLeadIntakeText({
            text: "Parent: Ada Lovelace\nEmail: ada@example.com",
            spec,
        });
        const applied = applyActionIntakePasteExtraction({
            current_values: { first_name: "Manual", last_name: "", email: "", phone: "" },
            current_meta: {},
            extraction,
        });
        expect(applied.values.first_name).toBe("Manual");
        expect(applied.values.email).toBe("ada@example.com");
        expect(applied.field_meta.email?.from_paste).toBe(true);
    });
});

describe("create lead platform minimum validation", () => {
    it("blocks review when platform minimum is missing", () => {
        const invalid = validateCreateLeadPlatformMinimum({
            first_name: "Ada",
            last_name: "",
            email: "",
            phone: "",
        });
        expect(invalid.ok).toBe(false);
    });

    it("allows review when platform minimum is satisfied", () => {
        const valid = validateCreateLeadPlatformMinimum({
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            phone: "",
            location_id: "site-1",
        });
        expect(valid.ok).toBe(true);
    });
});

describe("BOS suggestions from extraction", () => {
    it("maps parser output to labeled suggestions", () => {
        const extraction = parseCreateLeadIntakeText({
            text: "Parent: Ada Lovelace\nEmail: ada@example.com",
            spec,
        });
        const suggestions = bosSuggestionsFromExtraction(extraction);
        expect(suggestions.some((s) => s.field_label === "Parent/Guardian First Name")).toBe(true);
        expect(suggestions.some((s) => s.suggested_value === "ada@example.com")).toBe(true);
    });
});

describe("CreateLead Action Workspace", () => {
    it("renders action workspace gather step", () => {
        const html = renderToStaticMarkup(
            createElement(CreateLeadModal, {
                open: true,
                departmentId: "dept-1",
                onClose: () => {},
                onSubmit: vi.fn(),
            })
        );

        expect(html).toContain('data-testid="create-lead-action-workspace"');
        expect(html).toContain('data-testid="create-lead-gather-step"');
        expect(html).toContain('data-testid="create-lead-add-material-button"');
        expect(html).toContain("Paste information");
        expect(html).not.toContain('data-testid="create-lead-gather-fields"');
    });
});
