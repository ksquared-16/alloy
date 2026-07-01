import { describe, expect, it } from "vitest";
import {
    extractVariables,
    renderTemplate,
    hasUnresolvedTokens,
    canSendTemplate,
    templatePreview,
} from "@/lib/communications/v2/templateRender";

describe("template variables", () => {
    it("extracts distinct variables (whitespace tolerant)", () => {
        expect(extractVariables("Hi {{first_name}} from {{ school_name }} ({{first_name}})")).toEqual([
            "first_name", "school_name",
        ]);
    });
    it("resolves provided values", () => {
        const r = renderTemplate("Hi {{first_name}}", { first_name: "Sam" });
        expect(r.rendered).toBe("Hi Sam");
        expect(r.missing).toEqual([]);
    });
    it("handles missing gracefully (empty) and reports them; no broken tokens", () => {
        const r = renderTemplate("Hi {{first_name}} at {{school_name}}", { first_name: "Sam" });
        expect(r.rendered).toBe("Hi Sam at ");
        expect(r.missing).toEqual(["school_name"]);
        expect(hasUnresolvedTokens(r.rendered)).toBe(false);
    });
    it("can keep tokens when requested (and detects unresolved)", () => {
        const r = renderTemplate("Hi {{x}}", {}, { keepMissingToken: true });
        expect(r.rendered).toBe("Hi {{x}}");
        expect(hasUnresolvedTokens(r.rendered)).toBe(true);
    });
});

describe("approval + preview", () => {
    it("only approved templates are sendable", () => {
        expect(canSendTemplate("approved")).toBe(true);
        expect(canSendTemplate("draft")).toBe(false);
        expect(canSendTemplate("pending")).toBe(false);
    });
    it("renders desktop + mobile preview with missing report", () => {
        const p = templatePreview("Welcome {{first_name}}", "Body {{x}}", { first_name: "Sam" }, "email");
        expect(p.desktop.subject).toBe("Welcome Sam");
        expect(p.mobile.body).toBe("Body ");
        expect(p.missing).toEqual(["x"]);
    });
});
