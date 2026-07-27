/**
 * Shared identity field layout — no overlapping cells / phantom pair holes.
 * Builder and runtime pack through the same resolveIdentityFieldRows contract.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveIdentityFieldRows } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";
import type { IdentityFieldRowInput } from "@/lib/adminV2/runtime/focusPanel/identity/resolveIdentityFieldRows";

function cell(
    fieldRef: string,
    opts: Partial<IdentityFieldRowInput> & { value?: string | null; width?: "full" | "half" | "third"; labelMode?: "visible" | "hidden" | "eyebrow"; hideWhenEmpty?: boolean } = {},
): IdentityFieldRowInput {
    const {
        value = "x",
        width = "full",
        labelMode = "visible",
        hideWhenEmpty = false,
        ...rest
    } = opts;
    return {
        placement: {
            fieldRef,
            tier: "context",
            row: 1,
            column: 1,
            width,
            labelMode,
            hideWhenEmpty,
        },
        label: fieldRef,
        value,
        policy: "read-only",
        editable: false,
        ...rest,
    };
}

describe("identity field layout collision contract", () => {
    it("packs two half-width fields onto one row", () => {
        const rows = resolveIdentityFieldRows([
            cell("a", { width: "half", value: "First" }),
            cell("b", { width: "half", value: "Last" }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells.map((c) => c.fieldRef)).toEqual(["a", "b"]);
    });

    it("packs three third-width fields onto one row", () => {
        const rows = resolveIdentityFieldRows([
            cell("a", { width: "third", value: "1" }),
            cell("b", { width: "third", value: "2" }),
            cell("c", { width: "third", value: "3" }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells).toHaveLength(3);
    });

    it("keeps wrapping values as distinct cells (content-aware height is CSS; packing stays one cell each)", () => {
        const long = "A very long wrapping value that must still occupy exactly one grid cell";
        const rows = resolveIdentityFieldRows([
            cell("a", { width: "half", value: long }),
            cell("b", { width: "half", value: long }),
        ]);
        expect(rows[0]?.cells).toHaveLength(2);
        expect(rows[0]?.cells.every((c) => (c.value?.length ?? 0) > 40)).toBe(true);
    });

    it("filters missing hideWhenEmpty values before pack — no phantom pair hole", () => {
        const rows = resolveIdentityFieldRows([
            cell("a", { width: "half", value: "Present" }),
            cell("b", { width: "half", value: "", hideWhenEmpty: true }),
            cell("c", { width: "half", value: "Also" }),
        ]);
        // a alone then c — no empty slot reserved for b
        expect(rows.flatMap((r) => r.cells.map((c) => c.fieldRef))).toEqual(["a", "c"]);
        expect(rows.every((r) => r.cells.every((c) => Boolean(c.value?.trim())))).toBe(true);
    });

    it("filters empty hidden-label compact lines before pack", () => {
        const rows = resolveIdentityFieldRows([
            cell("phone", { width: "full", value: "555", labelMode: "hidden" }),
            cell("email", { width: "full", value: "", labelMode: "hidden" }),
            cell("city", { width: "full", value: "Austin", labelMode: "hidden" }),
        ]);
        expect(rows.map((r) => r.cells[0]?.fieldRef)).toEqual(["phone", "city"]);
    });

    it("avatar is outside field packing — field rows still pack independently", () => {
        // Avatar lives on IdentityRecordSummary header; field packing must not invent avatar cells.
        const rows = resolveIdentityFieldRows([
            cell("dob", { width: "half", value: "2019-01-01" }),
            cell("age", { width: "half", value: "6y" }),
        ]);
        expect(rows.flatMap((r) => r.cells.map((c) => c.fieldRef))).not.toContain("avatar");
        expect(rows[0]?.cells).toHaveLength(2);
    });

    it("linked and standard fields share the same packing rules", () => {
        const rows = resolveIdentityFieldRows([
            cell("a", { width: "half", value: "1", linked: true, linkLabel: "Open" }),
            cell("b", { width: "half", value: "2" }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells[0]?.linked).toBe(true);
        expect(rows[0]?.cells[1]?.linked).toBe(false);
    });

    it("editable (dynamic edit) fields remain in the packed grid", () => {
        const rows = resolveIdentityFieldRows([
            cell("gender", { width: "half", value: "Male", editable: true, policy: "editable" }),
            cell("grade", { width: "half", value: "", editable: true, policy: "editable" }),
        ]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells).toHaveLength(2);
        expect(rows[0]?.cells.every((c) => c.editable)).toBe(true);
    });

    it("composing chrome must be in-flow (no absolute toolbar overlap)", () => {
        const css = readFileSync(
            join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        const chromeIdx = css.indexOf(".fp-field-instance__chrome {");
        expect(chromeIdx).toBeGreaterThan(-1);
        const chromeBlock = css.slice(chromeIdx, chromeIdx + 280);
        expect(chromeBlock).toContain("position: relative");
        expect(chromeBlock).not.toMatch(/position:\s*absolute/);
    });

    it("builder row wrappers share identity-field-grid row classes with runtime", () => {
        const surface = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/drillIn/NestedSurfaceFieldLayoutSurface.tsx"),
            "utf8",
        );
        expect(surface).toContain("identity-field-grid__row");
        expect(surface).toContain("identity-field-grid__row--pair");
        expect(surface).toContain("identity-field-grid__row--triple");
    });

    it("IdentityFieldValue never late-nulls empty cells (avoids grid holes)", () => {
        const field = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityFieldValue.tsx"),
            "utf8",
        );
        expect(field).not.toContain("if (hideEmpty) return null");
        expect(field).toContain("resolveIdentityFieldRows");
    });
});
