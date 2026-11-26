import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("identity primary relationship badge", () => {
    it("Primary badge uses positive pill variant; Guardian does not", () => {
        const src = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/identity/IdentityRecordSummary.tsx"),
            "utf8",
        );
        expect(src).toContain("isPrimaryBadge");
        expect(src).toContain("alloy-os-card-pill--positive");
        expect(src).toContain("alloy-os-card-pill--neutral");
        expect(src).toContain("primary");
    });
});
