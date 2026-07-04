/**
 * Commercial Execution — Export composition.
 *
 * Assembles the seven readers into a single canonical CommercialExport, stamps a
 * deterministic config-version fingerprint (for resolution reproducibility), holds
 * the Commercial Policy PLACEHOLDER (evaluated later — Phase 5), and validates the
 * assembled graph. This is the single entry point evaluation (Phase 4) will consume.
 *
 * Pure orchestration: reads only, no evaluation, no writes. Consumers receive an
 * already-connected graph and never perform their own joins.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §2, §4, §7.
 */

import type { CommercialExport, CommercialPolicyDef } from "@/lib/commercial/execution/commercialExport";
import type { ConfigSnapshotRef } from "@/lib/commercial/execution/executionTypes";
import {
    readCadences,
    readGlAccountIds,
    readOfferings,
    readPricing,
    readProducts,
    readPrograms,
    readRevenueCategories,
    readVariants,
} from "@/lib/commercial/execution/export/readCommercialConfig";
import type { ExportReadContext, ExportValidation } from "@/lib/commercial/execution/export/readerTypes";
import { validateCommercialExport } from "@/lib/commercial/execution/export/validateCommercialExport";

/**
 * Commercial Policy placeholder. Commercial owns policy definitions; the Phase-5
 * policy stage lifts the existing financial_policies engine and re-sources it to
 * Commercial scope keys. Until then the export carries an empty policy set so
 * `CommercialExport.policies` is the obvious, typed attach-point — with no
 * evaluation happening here.
 */
async function readPolicies(_ctx: ExportReadContext): Promise<CommercialPolicyDef[]> {
    return [];
}

/** Deterministic, content-sensitive fingerprint (djb2 over sorted entity ids). No clock/random. */
function fingerprint(ids: string[]): string {
    let h = 5381;
    for (const id of [...ids].sort()) {
        for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
    }
    return (h >>> 0).toString(16);
}

export type ComposedCommercialExport = {
    export: CommercialExport;
    validation: ExportValidation;
};

/**
 * Read frozen Commercial V1 and project it into a validated CommercialExport.
 * Readers run concurrently (independent reads); the graph is assembled and
 * validated afterward.
 */
export async function composeCommercialExport(ctx: ExportReadContext): Promise<ComposedCommercialExport> {
    const [programs, offerings, variants, tuitionRates, products, cadences, revenueCategories, policies, glAccountIds] =
        await Promise.all([
            readPrograms(ctx),
            readOfferings(ctx),
            readVariants(ctx),
            readPricing(ctx),
            readProducts(ctx),
            readCadences(ctx),
            readRevenueCategories(ctx),
            readPolicies(ctx),
            readGlAccountIds(ctx),
        ]);

    const versionIds = [
        ...programs.map((p) => `pg:${p.programKey}`),
        ...offerings.map((o) => `of:${o.id}`),
        ...variants.map((v) => `vr:${v.id}`),
        ...tuitionRates.map((r) => `tr:${r.id}`),
        ...products.map((p) => `pr:${p.id}`),
        ...cadences.map((c) => `cd:${c.cadenceKey}`),
        ...revenueCategories.map((rc) => `rc:${rc.id}`),
    ];
    const version: ConfigSnapshotRef = { version: fingerprint(versionIds), effectiveOn: ctx.asOf };

    const exp: CommercialExport = {
        orgId: ctx.orgId,
        version,
        programs,
        offerings,
        variants,
        tuitionRates,
        products,
        cadences,
        revenueCategories,
        policies,
    };

    const validation = validateCommercialExport(exp, glAccountIds);
    return { export: exp, validation };
}
