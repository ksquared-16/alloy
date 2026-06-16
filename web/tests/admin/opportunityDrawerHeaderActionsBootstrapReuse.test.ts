import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("opportunityDrawerHeaderActionsPrefetch", () => {
    it("reuses bootstrap record_header_actions without a separate GET", () => {
        const src = readFileSync(
            join(process.cwd(), "lib/admin/opportunityDrawerHeaderActionsPrefetch.ts"),
            "utf8"
        );
        expect(src).toMatch(/bootstrap\.record_header_actions/);
        expect(src).toMatch(/if \(bundled != null/);
    });
});
