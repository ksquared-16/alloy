import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("AdminV2 Forms sidebar nav FD-12", () => {
    it("includes Forms module link with active route prefix", () => {
        const src = readFileSync(join(webRoot, "app/adminV2/components/Sidebar.tsx"), "utf8");
        expect(src).toContain('FORMS_HREF = "/adminV2/forms"');
        expect(src).toContain("path.startsWith(FORMS_HREF)");
        expect(src).toContain("active={onForms}");
        expect(src).toContain("Forms");
    });
});
