import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

describe("Template category management UX", () => {
    it("TemplateCategoryField defaults to dropdown with explicit create action", () => {
        const field = read("app/adminV2/communications/TemplateCategoryField.tsx");
        expect(field).toContain('data-template-category-mode="dropdown"');
        expect(field).toContain("+ Create new category");
        expect(field).toContain('data-template-category-mode="create"');
        expect(field).toContain('data-template-category-cancel="true"');
        expect(field).not.toContain("Pick existing");
        expect(field).toContain("text-alloy-midnight");
    });

    it("create mode uses draft-only input and Add/Cancel controls", () => {
        const field = read("app/adminV2/communications/TemplateCategoryField.tsx");
        expect(field).toContain('data-template-category-new="true"');
        expect(field).toContain('data-template-category-add="true"');
        expect(field).toMatch(/value=\{draft\}/);
        expect(field).not.toMatch(/options\.length === 0/);
    });

    it("TemplatesWorkspace shares category option source for editor and left filter", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toContain("mergeTemplateCategoryOptions");
        expect(ws).toContain("collectTemplateCategories");
        expect(ws).toContain('data-template-filter-category="true"');
        expect(ws).toContain("{categoryOptions.map");
        expect(ws).toContain("existingCategories={categoryOptions}");
        expect(ws).toContain("addSessionCategory");
    });

    it("TemplatesWorkspace exposes manage categories settings entry and modal", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toContain('data-template-categories-settings="true"');
        expect(ws).toContain("TemplateCategoriesManageModal");
        expect(ws).toContain("renameCategory");
        expect(ws).toContain("removeCategory");
    });

    it("Manage categories modal supports edit and remove affordances", () => {
        const modal = read("app/adminV2/communications/TemplateCategoriesManageModal.tsx");
        expect(modal).toContain("Manage Categories");
        expect(modal).toContain('data-template-category-rename="true"');
        expect(modal).toContain('data-template-category-remove="true"');
        expect(modal).toContain("canRemoveTemplateCategory");
    });

    it("rename persists via existing template PATCH API", () => {
        const ws = read("app/adminV2/communications/TemplatesWorkspace.tsx");
        expect(ws).toMatch(/method:\s*"PATCH"/);
        expect(ws).toContain("JSON.stringify({ category: next })");
        expect(ws).not.toMatch(/twilio|sendgrid|executeCommunicationsSend|fanout|scheduled-sends/i);
    });
});
