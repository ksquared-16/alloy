import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(webRoot, rel), "utf8");
}

describe("fetchWorkUnitsForSlugResolution", () => {
    it("slug route uses bounded fetch helper before resolveWorkUnitByRouteSlug", () => {
        const route = read("app/api/admin/work-units/by-slug/[workUnitSlug]/route.ts");
        expect(route).toContain("fetchWorkUnitsForSlugResolution");
        expect(route).not.toMatch(/\.eq\("org_id", gate\.orgId\)[\s\S]*?await wuQuery/);
    });

    it("helper tries direct key and lifecycle keys before org scan", () => {
        const helper = read("lib/admin/fetchWorkUnitsForSlugResolution.ts");
        expect(helper).toContain('.eq("key", platformKey)');
        expect(helper).toContain("lifecycleStageWorkUnitKey");
        expect(helper).toContain('strategy: "org_scan"');
    });
});

describe("work unit page atomic OIP bootstrap", () => {
    it("applies bootstrap oip_snapshot and skips placement round-trip for lifecycle shells", () => {
        const page = read("app/adminV2/workspace/dept/[departmentId]/work-unit/[workUnitId]/page.tsx");
        expect(page).toContain("bootstrapOipSnapshotToClientState");
        expect(page).toContain("oipBootstrapHydratedRef");
        expect(page).toMatch(/else if \(b\.oip_snapshot\)[\s\S]{0,200}setWuPlacementRows\(\[\]\)/);
        expect(page).toMatch(
            /kpi_metrics_pending: showOipOnlyKpiStrip[\s\S]{0,120}workUnitOipKpiPending/
        );
    });
});
