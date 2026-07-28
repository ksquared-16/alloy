import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    buildOiMeasurementRows,
    buildOiOverviewStats,
    filterOiMeasurements,
} from "@/lib/adminV2/settings/operationalIntelligence/oiMeasurementCollection";
import type { OipSettingsSnapshot } from "@/lib/metrics/fetchOipSettingsSnapshot";
import { CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF } from "@/lib/admin/canonicalAdminRoutes";
import { DATA_MODEL_CALCULATIONS_HREF } from "@/lib/dataModel/dataModelChapterRoutes";
import { organizationConfigurationDomain } from "@/lib/configRuntime/organizationRuntime";

const WEB_ROOT = join(process.cwd());

function read(rel: string): string {
    return readFileSync(join(WEB_ROOT, rel), "utf8");
}

function sampleSnapshot(): OipSettingsSnapshot {
    return {
        indicator_count: 2,
        active_pack_count: 1,
        off_track_count: 1,
        last_updated: "2026-07-26T00:00:00.000Z",
        kpi_rows: [
            {
                kpi_key: "ops.needs_attention_count",
                label: "Needs attention",
                pack: "operational_health",
                metric_key: "ops.needs_attention_count",
                target_display: "≤ 3",
                current_display: "5",
                status: "warning",
                has_org_override: true,
            },
            {
                kpi_key: "comms.delivery_rate",
                label: "Delivery rate",
                pack: "communications",
                metric_key: "comms.delivery_rate",
                target_display: "≥ 95%",
                current_display: "—",
                status: "unknown",
                has_org_override: false,
            },
        ],
        targets: [],
        resolved: {},
        pack_status: {},
    };
}

describe("Operational Intelligence Organization product", () => {
    it("exposes the canonical Organization route constant", () => {
        expect(CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF).toBe(
            "/organization/operational-intelligence",
        );
        expect(DATA_MODEL_CALCULATIONS_HREF).toBe(CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF);
    });

    it("points the organization domain at the canonical OI route", () => {
        const domain = organizationConfigurationDomain("operational-intelligence");
        expect(domain?.href).toBe("/organization/operational-intelligence");
        expect(domain?.ownedConfiguration).toContain("Measurements");
    });

    it("mounts the OI page and measurements-first product shell", () => {
        const page = read("app/adminV2/settings/organization/operational-intelligence/page.tsx");
        expect(page).toContain("OperationalIntelligenceWorkspace");
        const workspace = read(
            "components/adminV2/settings/operationalIntelligence/OperationalIntelligenceWorkspace.tsx",
        );
        expect(workspace).toContain('title="Operational Intelligence"');
        expect(workspace).toContain("data-testid=\"operational-intelligence-organization-product\"");
        expect(workspace).toContain("data-oi-v2-measurements-first=\"true\"");
        expect(workspace).toContain("What do you want to know?");
        expect(workspace).toContain("oi-home-add-measurement");
        expect(workspace).toContain("Manage presentation in Surfaces");
        expect(workspace).not.toContain('title="Operational Calculations"');
        expect(workspace).not.toContain("SourcesWorkspace");
        expect(workspace).not.toContain("enablement");
        expect(workspace).toContain("OiOrgCalcAddWizard");
    });

    it("rewrites and redirects legacy routes to Operational Intelligence", () => {
        const nextConfig = read("next.config.ts");
        expect(nextConfig).toContain(
            'source: "/organization/operational-intelligence"',
        );
        expect(nextConfig).toContain(
            'destination: "/organization/operational-intelligence"',
        );
        expect(nextConfig).toContain('source: "/settings/calculations"');
        expect(nextConfig).toContain('source: "/settings/analytics"');
        expect(nextConfig).toContain('source: "/settings/kpis"');
    });

    it("redirects Data Model calculations mode to OI and does not remount AnalyticsSettingsClient", () => {
        const page = read("app/adminV2/settings/organization/data-model/page.tsx");
        expect(page).toContain("CANONICAL_ORGANIZATION_OPERATIONAL_INTELLIGENCE_HREF");
        expect(page).toContain('route.mode === "calculations"');
        expect(page).toContain("redirect(");

        const surface = read("components/adminV2/settings/dataModel/DataModelWorkspaceSurface.tsx");
        expect(surface).not.toContain("AnalyticsSettingsClient");
        expect(surface).not.toContain("data-model-calculations-pane");
    });

    it("builds one collection row per KPI measurement without peer Sources sections", () => {
        const rows = buildOiMeasurementRows(sampleSnapshot());
        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.id)).toEqual([
            "ops.needs_attention_count",
            "comms.delivery_rate",
        ]);
        expect(rows[0]?.ownership).toBe("customized");
        expect(rows[1]?.ownership).toBe("platform");

        const stats = buildOiOverviewStats(sampleSnapshot());
        expect(stats.offTargetCount).toBe(1);
        expect(stats.insufficientDataCount).toBe(1);
        expect(stats.customizedCount).toBe(1);

        const filtered = filterOiMeasurements(rows, { ownership: "platform", health: "insufficient" });
        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.id).toBe("comms.delivery_rate");
    });
});
