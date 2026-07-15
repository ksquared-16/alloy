import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { identityDisclosureCoordinationLevel } from "@/lib/adminV2/runtime/focusPanel/identity/identityDisclosureState";

const ROOT = join(process.cwd());

describe("identity collection centered focus", () => {
    it("collection depth elevates like details/evidence", () => {
        expect(identityDisclosureCoordinationLevel({ depth: "summary" })).toBe("base");
        expect(identityDisclosureCoordinationLevel({ depth: "context" })).toBe("focused");
        expect(identityDisclosureCoordinationLevel({ depth: "details" })).toBe("focused");
        expect(identityDisclosureCoordinationLevel({ depth: "evidence" })).toBe("focused");
        expect(identityDisclosureCoordinationLevel({ depth: "context", editing: true })).toBe("edit");
    });

    it("Household and Children report the shared coordination helper", () => {
        const household = readFileSync(join(ROOT, "components/admin/focusPanel/cards/HouseholdCard.tsx"), "utf8");
        const children = readFileSync(join(ROOT, "components/admin/focusPanel/cards/ChildrenCard.tsx"), "utf8");
        expect(household).toContain("identityDisclosureCoordinationLevel");
        expect(children).toContain("identityDisclosureCoordinationLevel");
        expect(household).toContain('perspective = "focused"');
        expect(children).toContain('lifecycle = "focus"');
    });

    it("elevated focus surface uses shared max-width token (not narrow card column)", () => {
        const css = readFileSync(join(ROOT, "app/adminV2/components/alloyOsRuntime.css"), "utf8");
        expect(css).toContain("--alloy-os-focus-panel-max-width");
        expect(css).toMatch(
            /\[data-fp-elevated="true"\][\s\S]*?width:\s*min\(var\(--alloy-os-focus-panel-max-width/,
        );
    });

    it("elevated cell stacks above depth scrim (opaque household focus)", () => {
        const css = readFileSync(join(ROOT, "app/adminV2/components/alloyOsRuntime.css"), "utf8");
        const scrimMatch = css.match(/\.alloy-os-fp-depth-scrim\s*\{[\s\S]*?z-index:\s*(\d+)/);
        const cellMatch = css.match(
            /\.alloy-os-focus-panel-grid\[data-fp-depth="active"\]\s+\.alloy-os-focus-panel-grid__cell\[data-fp-elevated="true"\]\s*\{\s*isolation:\s*isolate;[\s\S]*?z-index:\s*(\d+)/,
        );
        expect(scrimMatch?.[1]).toBe("55");
        expect(cellMatch?.[1]).toBe("56");
        expect(Number(cellMatch![1])).toBeGreaterThan(Number(scrimMatch![1]));
    });
});
