import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const css = readFileSync(join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"), "utf8");

describe("identity summary presentation + elevated containment", () => {
    it("long values truncate instead of wrapping one character per line", () => {
        expect(css).toContain(".identity-field-value__value");
        expect(css).toContain("text-overflow: ellipsis");
        expect(css).toContain("white-space: nowrap");
        expect(css).not.toMatch(/\.identity-field-value__value\s*\{[^}]*overflow-wrap:\s*anywhere/);
    });

    it("parent summary columns have min-width 0 and collapse responsively", () => {
        expect(css).toContain(".identity-summary-columns__cell");
        expect(css).toMatch(/\.identity-summary-columns__cell\s*\{[^}]*min-width:\s*0/);
        expect(css).toContain("@media (max-width: 640px)");
    });

    it("elevated compose surface paints opaque Alloy surface tokens", () => {
        expect(css).toContain('data-fp-elevated="true"');
        expect(css).toContain("background: #ffffff !important");
        expect(css).toContain(".fp-evidence-section");
        expect(css).toMatch(/\.fp-evidence-section\s*\{[^}]*background:\s*var\(--alloy-os-surface/);
    });

    it("field values expose full-value title affordance", () => {
        const field = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        expect(field).toContain("title={cell.value ? String(cell.value) : undefined}");
    });
});
