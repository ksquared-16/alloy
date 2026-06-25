/**
 * Phase 6 source contract — no broad select("*") on canonical CRM entities
 * in admin/runtime/data loader paths.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CANONICAL_CRM_ENTITY_TABLES } from "@/lib/fields/canonicalEntitySelectColumns";
import { selectStringReferencesLegacyEntityStatus } from "@/lib/fields/canonicalLegacyStatusMaintenance";

const PHASE6_CANONICAL_LOADER_SOURCES = [
    "lib/workflowRun.ts",
    "lib/opportunityIdentity.ts",
    "lib/actionLinkDisplayDetails.ts",
    "lib/forms/prefill/resolveFormPrefillValues.ts",
    "lib/admin/loadOpportunityDrawerOperationalBootstrap.ts",
    "lib/adminV2/viewModel/drawer/opportunity/composeOpportunityDrawerViewModel.ts",
    "lib/admin/operationalTasksWorkspaceEnrichment.ts",
    "app/api/book-v2/quote-start/route.ts",
    "app/api/book-v2/specialty-quote-start/route.ts",
    "app/api/book-v2/confirm/route.ts",
    "app/api/action-links/consume-accept-job/route.ts",
] as const;

function read(rel: string): string {
    const p = join(process.cwd(), rel);
    expect(existsSync(p), `exists: ${rel}`).toBe(true);
    return readFileSync(p, "utf8");
}

function broadSelectOnTable(src: string, table: string): boolean {
    const re = new RegExp(`from\\("${table}"\\)\\.select\\("\\*"\\)`, "i");
    return re.test(src);
}

describe("canonical Phase 6 — no broad CRM select(*)", () => {
    for (const rel of PHASE6_CANONICAL_LOADER_SOURCES) {
        it(`${rel} avoids select("*") on canonical CRM tables`, () => {
            const src = read(rel);
            for (const table of CANONICAL_CRM_ENTITY_TABLES) {
                expect(broadSelectOnTable(src, table), `broad select on ${table}`).toBe(false);
            }
        });
    }

    it("operationalTasksWorkspaceEnrichment does not SELECT legacy opportunities.status", () => {
        const src = read("lib/admin/operationalTasksWorkspaceEnrichment.ts");
        expect(selectStringReferencesLegacyEntityStatus(src)).toBe(false);
    });

    it("layout refKey migration module exists", () => {
        expect(existsSync(join(process.cwd(), "lib/layout/migrateStoredLayoutRefKeys.ts"))).toBe(true);
    });
});
