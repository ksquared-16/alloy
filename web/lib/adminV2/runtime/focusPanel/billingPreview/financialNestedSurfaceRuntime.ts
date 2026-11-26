/**
 * Financial Configuration nested-surface runtime adapter.
 *
 * Consumes the published `metadata.nestedSurfaces["financial_configuration_surface"]`
 * config (same shape as Children) and projects selected field keys into labeled values
 * the Billing Preview expanded overlay can render. Absent config → null → card keeps
 * its default expanded sections (back-compat).
 */

import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import type { FinancialConfigEnrollment } from "@/lib/adminV2/runtime/focusPanel/financialConfig/financialConfigTypes";
import {
    FINANCIAL_CONFIG_SURFACE_ID,
    groupDefsFor,
    type NestedSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/nestedSurfaceEditorModel";
import { ensureRuntimeSurfacesRegistered } from "@/lib/platform/surfaceComposition/registerRuntimeSurfaces";
import { getSurface } from "@/lib/platform/surfaceComposition/surfaceRegistry";
import { surfaceComponents } from "@/lib/platform/surfaceComposition/universalSurfaceModel";
import { readNestedSurfaceConfigFromDoc } from "@/lib/adminV2/runtime/focusPanel/nestedSurfaceConfigReader";
import type { LayoutDoc } from "@/lib/layout/layoutV2";

export type FinancialNestedSurfaceFieldRow = {
    key: string;
    label: string;
    value: string | null;
};

export type FinancialNestedSurfaceGroupView = {
    key: string;
    label: string;
    fields: FinancialNestedSurfaceFieldRow[];
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

function fieldLabelFromRegistry(surfaceId: string, fieldKey: string): string {
    ensureRuntimeSurfacesRegistered();
    const surface = getSurface(surfaceId);
    if (!surface) return fieldKey;
    for (const component of surfaceComponents(surface)) {
        for (const group of component.evidenceGroups) {
            const item = group.items.find((i) => i.key === fieldKey);
            if (item) return item.label;
        }
    }
    return fieldKey.replace(/^[a-z_]+\./, "").replace(/[._]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Resolve a configured field key to an operator-facing value from operational truth. */
function resolveFinancialFieldValue(
    fieldKey: string,
    context: OperationalContext,
    enrollments: FinancialConfigEnrollment[] | null,
): string | null {
    const { billingConfigured, billingContactName, billingContactEmail, tuitionRateLabel, feeBalanceCents } =
        context.signals.billing;

    switch (fieldKey) {
        case "billing.tuition_rate":
            return tuitionRateLabel;
        case "billing.resolved_total":
            return tuitionRateLabel ?? (typeof feeBalanceCents === "number" && feeBalanceCents > 0
                ? `$${(feeBalanceCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : null);
        case "billing.discounts":
            return null; // no fabricated discounts
        case "opportunity.referred_by":
            return trimOrNull(context.truth["referred_by"]);
        default:
            if (fieldKey.startsWith("opportunity.")) {
                const path = fieldKey.slice("opportunity.".length);
                return trimOrNull(context.truth[path]);
            }
            if (enrollments?.length === 1 && fieldKey === "billing.resolved_total") {
                return enrollments[0]?.resolvedRate?.rateLabel ?? null;
            }
            return billingConfigured ? "Configured" : null;
    }
}

/** Build group views from a reconciled nested-surface config + live context. */
export function buildFinancialNestedSurfaceGroups(
    config: NestedSurfaceConfig,
    context: OperationalContext,
    enrollments: FinancialConfigEnrollment[] | null,
): FinancialNestedSurfaceGroupView[] {
    const groupLabels = new Map(groupDefsFor(FINANCIAL_CONFIG_SURFACE_ID).map((g) => [g.key, g.label]));

    return config.groups
        .filter((g) => g.selectedFieldKeys.length > 0)
        .map((g) => ({
            key: g.key,
            label: groupLabels.get(g.key) ?? g.key,
            fields: g.selectedFieldKeys
                .map((key) => ({
                    key,
                    label: fieldLabelFromRegistry(FINANCIAL_CONFIG_SURFACE_ID, key),
                    value: resolveFinancialFieldValue(key, context, enrollments),
                }))
                .filter((row) => row.value != null),
        }))
        .filter((g) => g.fields.length > 0);
}

export function readFinancialNestedSurfaceGroupsFromDoc(
    doc: LayoutDoc | null,
    context: OperationalContext,
    enrollments: FinancialConfigEnrollment[] | null,
): FinancialNestedSurfaceGroupView[] | null {
    const config = readNestedSurfaceConfigFromDoc(doc, FINANCIAL_CONFIG_SURFACE_ID);
    if (!config) return null;
    const groups = buildFinancialNestedSurfaceGroups(config, context, enrollments);
    return groups.length > 0 ? groups : null;
}
