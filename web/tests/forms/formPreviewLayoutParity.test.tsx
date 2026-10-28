// @vitest-environment jsdom
/**
 * Tours & Public Forms — Post-release polish P1-C: Edit / Preview / runtime layout parity.
 *
 * The Director saw Forms Studio's editor put Parent First name | Last name side by side while Preview
 * stacked them. Preview had its own row interpreter: `fieldLayoutFlexClass` (whose min-widths assume
 * a 0.625rem gap) inside a `gap-3` (0.75rem) row, so every half / third / quarter row overflowed by a
 * fraction of a rem and wrapped — one field per line at any width.
 *
 * Preview now renders with the public runtime's own row composition and grid classes
 * (`composeRuntimeRows` / `runtimeRowClass` / `runtimeCellSpanClass`). These tests render Preview and
 * the runtime renderer from ONE schema and require the same rows, the same cell spans, in the same order.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { FormPreview } from "@/app/adminV2/pos/ProcessingFormBuilder";
import { FormEngineRenderer, emptyPayload } from "@/components/forms/engine/FormEngineRenderer";
import { DEFAULT_FORM_ACCENT } from "@/lib/forms/processingFormBranding";
import { fieldLayoutFlexClass } from "@/lib/forms/formRowComposition";
import { formSchemaV1Schema, type FormSchemaV1 } from "@/lib/forms/schema";

const schema = formSchemaV1Schema.parse({
    schema_version: 1,
    title: "Tour inquiry",
    sections: [
        { id: "parent", title: "Parent information", field_ids: ["first", "last", "email", "phone", "city", "state", "zip"] },
        { id: "child", title: "Child", field_ids: ["child_name"] },
    ],
    fields: [
        { id: "first", type: "text", label: "First name", required: true, layout_width: "half" },
        { id: "last", type: "text", label: "Last name", required: true, layout_width: "half" },
        { id: "email", type: "text", label: "Email", required: true },
        { id: "phone", type: "text", label: "Phone", layout_width: "half" },
        { id: "city", type: "text", label: "City", layout_width: "half" },
        { id: "state", type: "text", label: "State", layout_width: "quarter" },
        { id: "zip", type: "text", label: "ZIP", layout_width: "quarter" },
        { id: "child_name", type: "text", label: "Child's name", required: true },
    ],
}) as FormSchemaV1;

const branding = { brand_name: "", accent_color: DEFAULT_FORM_ACCENT, logo_url: null, description: "", brand_source: null };

/** Each multi-cell row: its class and its cells' span classes, in DOM order. */
function rowsOf(html: string): { rowClass: string; spans: string[] }[] {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return [...doc.querySelectorAll("div")]
        .filter((el) => el.className.includes("@md:grid-cols-12"))
        .map((row) => ({
            rowClass: row.className,
            spans: [...row.children].map((c) => (c.className.match(/@md:col-span-\d+/) ?? [""])[0]!),
        }));
}

describe("P1-C — Preview lays a form out exactly as the public runtime does", () => {
    const preview = renderToStaticMarkup(<FormPreview schema={schema} branding={branding} runtime={false} />);
    const runtime = renderToStaticMarkup(
        <FormEngineRenderer schema={schema} payload={emptyPayload()} onChange={() => {}} mode="readonly" variant="embed" />
    );

    it("half-width parent fields share a row in Preview (they used to wrap one per line)", () => {
        const rows = rowsOf(preview);
        expect(rows.length).toBeGreaterThanOrEqual(2);
        expect(rows[0]!.spans).toEqual(["@md:col-span-6", "@md:col-span-6"]);
    });

    it("Preview and runtime compose the same rows with the same cell spans, in the same order", () => {
        expect(rowsOf(preview).map((r) => r.spans)).toEqual(rowsOf(runtime).map((r) => r.spans));
        expect(rowsOf(preview).map((r) => r.rowClass)).toEqual(rowsOf(runtime).map((r) => r.rowClass));
    });

    it("rows collapse to one column below md — deliberate responsive behaviour, not lost layout", () => {
        for (const r of rowsOf(preview)) expect(r.rowClass).toContain("grid-cols-1");
    });

    it("field order and required markers match the runtime", () => {
        const labels = (html: string) =>
            [...new DOMParser().parseFromString(html, "text/html").querySelectorAll("label")]
                .map((l) => l.textContent?.replace(/\s+/g, " ").trim() ?? "")
                .filter((t) => /name|Email|Phone|City|State|ZIP/.test(t));
        const p = labels(preview);
        expect(p).toEqual(["First name *", "Last name *", "Email *", "Phone", "City", "State", "ZIP", "Child's name *"]);
        expect(labels(runtime).map((t) => t.replace(/\s*\(optional\)$/i, ""))).toEqual(p);
    });

    it("Preview uses the runtime's available width (ParentIntakeShell main is max-w-2xl)", () => {
        expect(preview).toContain('class="@container mx-auto max-w-2xl space-y-5" data-testid="form-builder-preview"');
    });

    it("rows follow the FORM's width, not the window's — so a framed form keeps its columns", () => {
        // Both roots are the query container; the rows switch at @md (28rem of form width). A viewport
        // breakpoint (md = 768px) collapsed a 542px-wide form inside a 760px iframe while the same
        // 542px form standalone on a laptop kept two columns.
        expect(preview).toMatch(/class="@container [^"]*" data-testid="form-builder-preview"/);
        expect(runtime).toMatch(/^<div class="@container /);
        expect(`${preview}${runtime}`).not.toMatch(/[\s"]md:(grid-cols|col-span)-/);
    });
});

describe("the editor's flex row widths fit their own gap", () => {
    // fieldLayoutFlexClass subtracts a share of a 0.625rem gap (gap-2.5) per cell. Inside a wider gap
    // the cells no longer fit and wrap; this pins the arithmetic the editor canvas relies on.
    const minRem = (cls: string): [number, number] => {
        const m = /min-w-\[calc\(([\d.]+)%-([\d.]+)rem\)\]/.exec(cls)!;
        return [Number(m[1]), Number(m[2])];
    };
    it.each([
        ["half", 2],
        ["third", 3],
        ["quarter", 4],
    ] as const)("%s × %i fits in a gap-2.5 row", (width, n) => {
        const [pct, rem] = minRem(fieldLayoutFlexClass(width));
        expect(n * pct).toBeLessThanOrEqual(100);
        expect(n * -rem + (n - 1) * 0.625).toBeLessThanOrEqual(0.0001);
    });
    it("…and two halves overflow the old Preview's gap-3 row by 0.125rem — the stacking bug", () => {
        const [, rem] = minRem(fieldLayoutFlexClass("half"));
        expect(2 * -rem + 0.75).toBeCloseTo(0.125);
    });
});
