import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

function read(rel: string): string {
    return readFileSync(join(repoRoot, rel), "utf8");
}

describe("opportunity drawer operational bootstrap", () => {
    it("route uses single loadAdminRouteGate", () => {
        const src = read("app/api/admin/opportunities/[id]/drawer-operational-bootstrap/route.ts");
        expect(src).toContain("loadAdminRouteGate");
        expect(src).not.toContain("getAdminContextCached");
    });

    it("loader forbids attention resolver work (v1 client-hint only)", () => {
        const loader = read("lib/admin/loadOpportunityDrawerOperationalBootstrap.ts");
        const forbidden = [
            "loadOpportunityNeedsAttentionRows",
            "attachOpportunityAttentionSuggestionBundle",
            "computeOperationalAttentionAttachment",
            "loadOpportunityActivitySignal",
            "buildOpportunityAttentionQueueItems",
            "resolveActionsForContext",
        ];
        for (const sym of forbidden) {
            expect(loader).not.toContain(sym);
        }
        expect(loader).toContain("sanitizeDrawerOperTrustPreviewFromHints");
        expect(loader).not.toContain("buildOperationalSummaryDeterministic");
    });

    it("loader skips work_units DB when workspace context seeds dept and wu", () => {
        const loader = read("lib/admin/loadOpportunityDrawerOperationalBootstrap.ts");
        expect(loader).toContain("skipWorkUnitDbLookup");
        expect(loader).toContain("hintDepartmentId");
    });

    it("timing always reports attention_resolver_passes 0", () => {
        const perf = read("lib/admin/opportunityDrawerOperationalBootstrapPerf.ts");
        expect(perf).toContain("attention_resolver_passes: 0");
    });

    it("drawer_visible builder does not attach attention on entity path", () => {
        const vis = read("lib/admin/opportunityEntityRecord.ts");
        const fn = vis.slice(
            vis.indexOf("export async function buildOpportunityDrawerVisiblePayload"),
            vis.indexOf("export async function respondOpportunityEntityGet")
        );
        expect(fn).not.toContain("attachOpportunityAttentionSuggestionBundle");
    });
});
