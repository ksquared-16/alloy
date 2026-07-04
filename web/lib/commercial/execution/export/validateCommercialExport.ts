/**
 * Commercial Execution — Export validation.
 *
 * Validates the composed export's object graph and surfaces every finding. Pure:
 * takes the assembled export plus the set of valid GL account ids and returns
 * structured issues. Nothing is silently ignored.
 *
 *   error   — a broken graph edge that would make evaluation incorrect
 *             (offering→program, variant→offering, rate→variant, *→revenueCategory,
 *              revenueCategory→glAccount when the reference is present but dangling)
 *   warning — incomplete-but-expected config (unmapped accounting, unseeded cadence)
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7 (validation).
 */

import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { ExportValidation, ExportValidationIssue } from "@/lib/commercial/execution/export/readerTypes";

export function validateCommercialExport(
    exp: CommercialExport,
    glAccountIds: Set<string>,
): ExportValidation {
    const issues: ExportValidationIssue[] = [];
    const add = (i: ExportValidationIssue) => issues.push(i);

    const programKeys = new Set(exp.programs.map((p) => p.programKey));
    const offeringIds = new Set(exp.offerings.map((o) => o.id));
    const variantIds = new Set(exp.variants.map((v) => v.id));
    const cadenceKeys = new Set(exp.cadences.map((c) => c.cadenceKey));
    const revenueCategoryIds = new Set(exp.revenueCategories.map((rc) => rc.id));

    // Offering → Program
    for (const o of exp.offerings) {
        if (o.programKey && !programKeys.has(o.programKey)) {
            add({
                code: "offering_unknown_program",
                severity: "error",
                message: `Offering "${o.label}" references program_key "${o.programKey}" with no matching Program.`,
                entity: "offering",
                id: o.id,
                ref: { entity: "program", id: o.programKey },
            });
        }
    }

    // Variant → Offering
    for (const v of exp.variants) {
        if (!offeringIds.has(v.offeringId)) {
            add({
                code: "variant_unknown_offering",
                severity: "error",
                message: `Variant "${v.label}" references an Offering that is not in the export.`,
                entity: "variant",
                id: v.id,
                ref: { entity: "offering", id: v.offeringId },
            });
        }
    }

    // Tuition rate → Variant, cadence, revenue category
    for (const r of exp.tuitionRates) {
        if (!variantIds.has(r.variantId)) {
            add({
                code: "rate_unknown_variant",
                severity: "error",
                message: `Tuition rate references a Variant that is not in the export.`,
                entity: "tuitionRate",
                id: r.id,
                ref: { entity: "variant", id: r.variantId },
            });
        }
        if (r.cadenceKey && cadenceKeys.size > 0 && !cadenceKeys.has(r.cadenceKey)) {
            add({
                code: "rate_unknown_cadence",
                severity: "warning",
                message: `Tuition rate uses cadence "${r.cadenceKey}" not present in the billing-cadence option set.`,
                entity: "tuitionRate",
                id: r.id,
            });
        }
        if (r.revenueCategoryId && !revenueCategoryIds.has(r.revenueCategoryId)) {
            add({
                code: "rate_unknown_revenue_category",
                severity: "error",
                message: `Tuition rate references a Revenue Category that is not in the export.`,
                entity: "tuitionRate",
                id: r.id,
                ref: { entity: "revenueCategory", id: r.revenueCategoryId },
            });
        }
    }

    // Product → cadence, revenue category, program scope
    for (const p of exp.products) {
        if (p.cadenceKey && cadenceKeys.size > 0 && !cadenceKeys.has(p.cadenceKey)) {
            add({
                code: "product_unknown_cadence",
                severity: "warning",
                message: `Product "${p.name}" uses cadence "${p.cadenceKey}" not present in the option set.`,
                entity: "product",
                id: p.id,
            });
        }
        if (p.revenueCategoryId && !revenueCategoryIds.has(p.revenueCategoryId)) {
            add({
                code: "product_unknown_revenue_category",
                severity: "error",
                message: `Product "${p.name}" references a Revenue Category that is not in the export.`,
                entity: "product",
                id: p.id,
                ref: { entity: "revenueCategory", id: p.revenueCategoryId },
            });
        } else if (!p.revenueCategoryId) {
            add({
                code: "product_unmapped_revenue_category",
                severity: "warning",
                message: `Product "${p.name}" has no Revenue Category — accounting destination is unresolved.`,
                entity: "product",
                id: p.id,
            });
        }
        if (p.scope.programKey && !programKeys.has(p.scope.programKey)) {
            add({
                code: "product_unknown_program",
                severity: "error",
                message: `Product "${p.name}" is scoped to program "${p.scope.programKey}" with no matching Program.`,
                entity: "product",
                id: p.id,
                ref: { entity: "program", id: p.scope.programKey },
            });
        }
    }

    // Revenue category → GL account
    for (const rc of exp.revenueCategories) {
        if (rc.glAccountId && !glAccountIds.has(rc.glAccountId)) {
            add({
                code: "revenue_category_unknown_gl",
                severity: "error",
                message: `Revenue Category "${rc.label}" maps to a GL account that does not exist.`,
                entity: "revenueCategory",
                id: rc.id,
                ref: { entity: "glAccount", id: rc.glAccountId },
            });
        } else if (!rc.glAccountId) {
            add({
                code: "revenue_category_unmapped_gl",
                severity: "warning",
                message: `Revenue Category "${rc.label}" is not mapped to a GL account ("Needs accounting mapping").`,
                entity: "revenueCategory",
                id: rc.id,
            });
        }
    }

    // Cadence option set unseeded
    if (exp.cadences.length === 0) {
        add({
            code: "cadences_unseeded",
            severity: "warning",
            message: `No billing cadences found — the "commercial_billing_cadence" option set is not seeded for this org.`,
            entity: "cadenceSet",
            id: exp.orgId,
        });
    }

    return { ok: !issues.some((i) => i.severity === "error"), issues };
}
