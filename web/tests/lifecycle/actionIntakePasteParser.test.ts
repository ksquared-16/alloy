import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { applyActionIntakePasteExtraction } from "@/lib/lifecycle/applyActionIntakePasteExtraction";
import { parseCreateLeadIntakeText } from "@/lib/lifecycle/parseCreateLeadIntakeText";
import { resolveCreateLeadActionIntakeSpec } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { validateActionIntakePayload } from "@/lib/lifecycle/resolveActionIntakeSpec";
import { CreateLeadModal } from "@/components/admin/opportunity/actions/CreateLeadModal";

const spec = resolveCreateLeadActionIntakeSpec({
    department_id: "dept-1",
    operator_stage: "lead",
});

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
        expect(byKey.phone).toBe("(555) 123-4567");
        expect(byKey.child_first_name).toBe("Riley");
        expect(byKey.child_last_name).toBe("Lee");
        expect(byKey.source).toBe("Website form");
        expect(byKey.intake_notes).toContain("toddler program");
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

    it("overwrites prior paste-tagged fields on re-parse", () => {
        const first = parseCreateLeadIntakeText({
            text: "Parent: Ada Lovelace\nEmail: old@example.com",
            spec,
        });
        const second = parseCreateLeadIntakeText({
            text: "Parent: Grace Hopper\nEmail: grace@example.com",
            spec,
        });
        let state = applyActionIntakePasteExtraction({
            current_values: { first_name: "", last_name: "", email: "", phone: "" },
            current_meta: {},
            extraction: first,
        });
        state = applyActionIntakePasteExtraction({
            current_values: state.values,
            current_meta: state.field_meta,
            extraction: second,
            overwrite: true,
        });
        expect(state.values.first_name).toBe("Grace");
        expect(state.values.last_name).toBe("Hopper");
        expect(state.values.email).toBe("grace@example.com");
    });
});

describe("create lead manual validation", () => {
    it("blocks review when required person fields are missing", () => {
        const invalid = validateActionIntakePayload(spec, {
            first_name: "Ada",
            last_name: "",
            email: "",
            phone: "",
        });
        expect(invalid.ok).toBe(false);
    });

    it("allows review when platform minimum is satisfied", () => {
        const valid = validateActionIntakePayload(spec, {
            first_name: "Ada",
            last_name: "Lovelace",
            email: "ada@example.com",
            phone: "",
        });
        expect(valid.ok).toBe(true);
    });
});

describe("CreateLeadModal premium intake", () => {
    it("renders paste-assisted intake step and review flow markers", () => {
        const html = renderToStaticMarkup(
            createElement(CreateLeadModal, {
                open: true,
                departmentId: "dept-1",
                onClose: () => {},
                onSubmit: vi.fn(),
            })
        );

        expect(html).toContain('data-testid="create-lead-modal"');
        expect(html).toContain('data-testid="create-lead-intake-step"');
        expect(html).toContain('data-testid="action-intake-paste-panel"');
        expect(html).toContain('data-testid="action-intake-parse-button"');
        expect(html).toContain('data-testid="create-lead-enter-manually-button"');
        expect(html).toContain("Parse with BOS");
        expect(html).toContain("nothing is created until you confirm");
    });
});
