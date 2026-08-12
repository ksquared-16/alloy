import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = join(process.cwd());

function readSrc(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("Workspace Enrollment Operational Surface implementation guards", () => {

    it("load client invalidates stale cache missing enrollment hydration", () => {
        const client = readSrc("lib/admin/loadOperatorLifecycleLandingClient.ts");
        expect(client).toContain("enrollmentOperationalSurfaceNeedsHydration");
    });

    it("operational surface work lines compose from configured work views", () => {
        const landing = readSrc("lib/admin/enrollmentOperationalSurfaceLanding.ts");
        expect(landing).toContain("buildWorkLinesFromConfiguredWorkViews");
        expect(landing).toContain("resolveOperationalSurfaceWorkViews");
        expect(landing).not.toContain("ENROLLMENT_TODAYS_WORK_TEMPLATES");
    });
});
