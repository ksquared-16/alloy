/**
 * Pure presentation mapper for the read-only draft charge preview API (P3.3.1).
 *
 * Shapes a `DraftChargePreview` (no-write resolution) into a stable API DTO for
 * Configuration / Focus Panel surfaces to render financial resolution BEFORE
 * posting. Pure — no DB, no IO, and (by construction) nothing here writes.
 */

import type {
    DraftChargePreview,
    DraftChargeWriteIntent,
} from "@/lib/financials/chargeResolution/draftChargeResolutionService";
import type { ServicePeriod } from "@/lib/financials/chargeResolution/resolveDraftCharges";

export type DraftChargePreviewDto =
    | {
          status: "resolved";
          resolutionKey: string;
          enrollmentAgreementId: string;
          servicePeriod: ServicePeriod;
          chargeCategory: "tuition";
          billableSource: { type: "enrollment_agreement"; id: string };
          scheduleBasis: string;
          rate: {
              planId: string;
              ruleId: string;
              rateBasis: string;
              calculationStrategy: string;
              unitAmountCents: number;
              currencyCode: string;
          };
          quantity: { value: number; unit: string; placeholder: string | null };
          amountCents: number;
          currencyCode: string;
          responsibility: {
              partyType: string;
              partyId: string;
              basis: string;
          };
          /** Advisory: what a write WOULD do. Preview writes nothing. */
          wouldWrite: DraftChargeWriteIntent;
          existing: { id: string; status: string } | null;
      }
    | { status: "unresolved"; reason: string };

function num(meta: Record<string, unknown>, key: string): number {
    const v = meta[key];
    return typeof v === "number" ? v : 0;
}

function str(meta: Record<string, unknown>, key: string): string {
    const v = meta[key];
    return typeof v === "string" ? v : "";
}

export function buildDraftChargePreviewDto(
    preview: DraftChargePreview,
    period: ServicePeriod
): DraftChargePreviewDto {
    if (preview.status === "unresolved") {
        return { status: "unresolved", reason: preview.reason };
    }

    const { intent, rate, scheduleBasis, existing, resolutionKey, wouldWrite } = preview;
    const meta = intent.metadata;
    const placeholder = str(meta, "calculation_placeholder") || null;

    return {
        status: "resolved",
        resolutionKey,
        enrollmentAgreementId: intent.enrollmentAgreementId,
        servicePeriod: period,
        chargeCategory: intent.chargeCategory,
        billableSource: { type: intent.billableSourceType, id: intent.billableSourceId },
        scheduleBasis,
        rate: {
            planId: rate.plan.id,
            ruleId: rate.rule.id,
            rateBasis: rate.rateBasis,
            calculationStrategy: rate.calculationStrategy,
            unitAmountCents: num(meta, "unit_amount_cents"),
            currencyCode: rate.currencyCode,
        },
        quantity: {
            value: num(meta, "quantity"),
            unit: str(meta, "quantity_unit"),
            placeholder,
        },
        amountCents: intent.amountCents,
        currencyCode: intent.currencyCode,
        responsibility: {
            partyType: intent.responsibility.partyType,
            partyId: intent.responsibility.partyId,
            basis: intent.responsibility.basis,
        },
        wouldWrite,
        existing: existing ? { id: existing.id, status: existing.status } : null,
    };
}
