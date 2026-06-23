import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(rel: string): string {
    return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("metric snapshot writer", () => {
    it("exposes cron-protected write route", () => {
        const route = read("app/api/admin/metrics/snapshots/write/route.ts");
        expect(route).toContain("isInternalCronAuthorized");
        expect(route).toContain("writeAllOrgMetricSnapshots");
        expect(route).toContain("writeOrgMetricSnapshots");
    });

    it("writer resolves live metrics before insert", () => {
        const writer = read("lib/metrics/snapshots/writeOrgMetricSnapshots.ts");
        expect(writer).toContain('mode: "live"');
        expect(writer).toContain("writeMetricSnapshot");
        expect(writer).toContain("rolling_7d");
        expect(writer).toContain("rolling_30d");
    });
});
