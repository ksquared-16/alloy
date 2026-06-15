import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("template builder dark", () => {
    const src = readFileSync(join(process.cwd(), "app", "adminV2", "communications", "templates", "TemplateBuilder.tsx"), "utf8");
    it("self-gates behind comms_v2_templates", () => {
        expect(src).toMatch(/isCommsV2FlagEnabled\(["']comms_v2_templates["']\)/);
        expect(src).toMatch(/return null/);
    });
    it("is visual-first (renders a preview, not token editing only)", () => {
        expect(src).toMatch(/data-cc-template-preview/);
        expect(src).toMatch(/data-cc-template-variables/);
    });
});
